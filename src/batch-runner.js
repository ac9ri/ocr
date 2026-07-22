import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { WordscanError, asWordscanError } from "./errors.js";
import { runPipeline } from "./pipeline.js";
import { IMAGE_EXTENSIONS } from "./source-loader.js";

function portablePath(value) {
  return value.split(path.sep).join("/");
}

function outputFolderNames(files) {
  const stemCounts = new Map();
  for (const file of files) {
    const stem = path.parse(file).name.toLowerCase();
    stemCounts.set(stem, (stemCounts.get(stem) ?? 0) + 1);
  }

  const used = new Set();
  return files.map((file) => {
    const parsed = path.parse(file);
    const duplicatedStem = (stemCounts.get(parsed.name.toLowerCase()) ?? 0) > 1;
    const extension = parsed.ext.slice(1).toLowerCase();
    const base = duplicatedStem ? `${parsed.name}-${extension}` : parsed.name;
    let candidate = base;
    let sequence = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base}-${sequence}`;
      sequence += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export async function discoverImageFiles(inputDirectory) {
  let entries;
  try {
    entries = await readdir(inputDirectory, { withFileTypes: true });
  } catch (error) {
    throw asWordscanError(
      error,
      "INPUT_READ_FAILED",
      `입력 폴더를 읽을 수 없습니다: ${inputDirectory}`,
    );
  }
  const files = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
    )
    .map((entry) => path.join(inputDirectory, entry.name))
    .sort((left, right) =>
      path.basename(left).localeCompare(path.basename(right), "en", {
        numeric: true,
        sensitivity: "base",
      }),
    );
  if (files.length === 0) {
    throw new WordscanError(
      "INPUT_NO_IMAGES",
      `입력 폴더에 지원하는 이미지 파일이 없습니다: ${inputDirectory}`,
    );
  }
  return files;
}

function errorSummary(error) {
  return {
    code: error instanceof WordscanError ? error.code : "UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

function escapeTableCell(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replace(/\r?\n/g, " ");
}

function summaryMarkdown(summary) {
  const lines = [
    "# OCR 일괄 처리 요약",
    "",
    `- 입력 폴더: \`${summary.inputDirectory}\``,
    `- 전체: ${summary.totals.discovered}`,
    `- 성공: ${summary.totals.succeeded}`,
    `- 실패: ${summary.totals.failed}`,
    "",
    "| # | 입력 이미지 | 상태 | Markdown | Manifest | 오류 |",
    "| ---: | --- | --- | --- | --- | --- |",
  ];
  for (const [index, result] of summary.results.entries()) {
    const markdown = result.markdown
      ? `[열기](<${encodeURI(result.markdown)}>)`
      : "-";
    const manifest = result.manifest
      ? `[열기](<${encodeURI(result.manifest)}>)`
      : "-";
    const error = result.error
      ? `${result.error.code}: ${result.error.message}`
      : "-";
    lines.push(
      `| ${index + 1} | ${escapeTableCell(result.input)} | ${result.status === "succeeded" ? "성공" : "실패"} | ${markdown} | ${manifest} | ${escapeTableCell(error)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export async function runBatch({
  inputPath,
  outputDirectory,
  onProgress,
  dependencies = {},
  ...pipelineOptions
}) {
  const pipeline = dependencies.pipeline ?? runPipeline;
  const absoluteInput = path.resolve(inputPath);
  const absoluteOutput = path.resolve(outputDirectory);
  const files = await discoverImageFiles(absoluteInput);
  const folderNames = outputFolderNames(files);
  const startedAt = new Date().toISOString();
  const results = [];

  await mkdir(absoluteOutput, { recursive: true });
  onProgress?.({ type: "batch:start", fileCount: files.length });

  for (let index = 0; index < files.length; index += 1) {
    const fileNumber = index + 1;
    const inputFile = files[index];
    const fileOutput = path.join(absoluteOutput, folderNames[index]);
    onProgress?.({
      type: "batch:file:start",
      fileNumber,
      fileCount: files.length,
      inputPath: inputFile,
    });
    try {
      const result = await pipeline({
        ...pipelineOptions,
        inputPath: inputFile,
        outputDirectory: fileOutput,
        onProgress(event) {
          onProgress?.({
            ...event,
            batchFileNumber: fileNumber,
            batchFileCount: files.length,
            batchInputPath: inputFile,
          });
        },
      });
      results.push({
        input: path.basename(inputFile),
        status: "succeeded",
        outputDirectory: portablePath(path.relative(absoluteOutput, fileOutput)),
        markdown: portablePath(path.relative(absoluteOutput, result.markdownPath)),
        manifest: portablePath(path.relative(absoluteOutput, result.manifestPath)),
      });
      onProgress?.({
        type: "batch:file:complete",
        fileNumber,
        fileCount: files.length,
        inputPath: inputFile,
      });
    } catch (error) {
      const summarized = errorSummary(error);
      results.push({
        input: path.basename(inputFile),
        status: "failed",
        outputDirectory: portablePath(path.relative(absoluteOutput, fileOutput)),
        markdown: null,
        manifest: null,
        error: summarized,
      });
      onProgress?.({
        type: "batch:file:error",
        fileNumber,
        fileCount: files.length,
        inputPath: inputFile,
        error: summarized,
      });
    }
  }

  const failed = results.filter((result) => result.status === "failed").length;
  const summary = {
    schemaVersion: 1,
    inputDirectory: absoluteInput,
    outputDirectory: absoluteOutput,
    startedAt,
    completedAt: new Date().toISOString(),
    totals: {
      discovered: files.length,
      succeeded: files.length - failed,
      failed,
    },
    results,
  };
  const summaryMarkdownPath = path.join(absoluteOutput, "batch-summary.md");
  const summaryJsonPath = path.join(absoluteOutput, "batch-summary.json");
  await writeFile(summaryMarkdownPath, summaryMarkdown(summary), "utf8");
  await writeFile(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  onProgress?.({ type: "batch:complete", summary });

  return {
    summaryMarkdownPath,
    summaryJsonPath,
    summary,
    hasFailures: failed > 0,
  };
}
