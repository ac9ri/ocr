#!/usr/bin/env node

import path from "node:path";
import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { runBatch } from "./batch-runner.js";
import { WordscanError, asWordscanError } from "./errors.js";
import { runPipeline } from "./pipeline.js";

const VERSION = "0.1.0";

const HELP = `wordscan-ocr - Word/PDF/이미지 스캔을 Markdown으로 변환

사용법:
  wordscan-ocr <input.docx|pdf|image|directory> [options]

  PDF는 각 페이지를 한 쪽으로 처리합니다.
  directory는 바로 아래의 지원 이미지 파일을 이름순으로 일괄 처리합니다.

옵션:
  -o, --output <directory>       출력 디렉터리 (기본값: ./output)
      --split-ratio <0..1>       수동 좌/우 분할 위치
      --page-layout <layout>     auto|single|two-up (기본값: auto)
      --watermark <mode>         off|conservative|strong|text-safe (기본값: text-safe)
      --device <device>          cpu|gpu:0 등 (기본값: cpu)
      --paddle-command <path>    PaddleOCR 실행 명령 (기본값: paddleocr)
      --paddle-python <path>     bundled bridge를 실행할 Python 경로
      --keep-work                전처리/OCR 임시 파일 보존
  -h, --help                     도움말
  -v, --version                  버전
`;

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new WordscanError("CLI_MISSING_VALUE", `${option} 값이 필요합니다.`);
  }
  return value;
}

export function parseCliArguments(argv) {
  const options = {
    inputPath: null,
    outputDirectory: path.resolve("output"),
    splitRatio: null,
    pageLayout: "auto",
    watermarkMode: "text-safe",
    device: "cpu",
    paddleCommand: "paddleocr",
    paddlePython: null,
    keepWork: false,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "-h" || argument === "--help") {
      options.help = true;
    } else if (argument === "-v" || argument === "--version") {
      options.version = true;
    } else if (argument === "-o" || argument === "--output") {
      options.outputDirectory = path.resolve(requiredValue(argv, index, argument));
      index += 1;
    } else if (argument === "--split-ratio") {
      const raw = requiredValue(argv, index, argument);
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) {
        throw new WordscanError(
          "CLI_INVALID_SPLIT_RATIO",
          "--split-ratio는 0과 1 사이 숫자여야 합니다.",
        );
      }
      options.splitRatio = parsed;
      index += 1;
    } else if (argument === "--watermark") {
      options.watermarkMode = requiredValue(argv, index, argument);
      if (!["off", "conservative", "strong", "text-safe"].includes(options.watermarkMode)) {
        throw new WordscanError(
          "CLI_INVALID_WATERMARK_MODE",
          "--watermark는 off, conservative, strong, text-safe 중 하나여야 합니다.",
        );
      }
      index += 1;
    } else if (argument === "--page-layout") {
      options.pageLayout = requiredValue(argv, index, argument);
      if (!["auto", "single", "two-up"].includes(options.pageLayout)) {
        throw new WordscanError(
          "CLI_INVALID_PAGE_LAYOUT",
          "--page-layout은 auto, single, two-up 중 하나여야 합니다.",
        );
      }
      index += 1;
    } else if (argument === "--device") {
      options.device = requiredValue(argv, index, argument);
      index += 1;
    } else if (argument === "--paddle-command") {
      options.paddleCommand = requiredValue(argv, index, argument);
      index += 1;
    } else if (argument === "--paddle-python") {
      options.paddlePython = path.resolve(requiredValue(argv, index, argument));
      index += 1;
    } else if (argument === "--keep-work") {
      options.keepWork = true;
    } else if (argument.startsWith("-")) {
      throw new WordscanError("CLI_UNKNOWN_OPTION", `알 수 없는 옵션입니다: ${argument}`);
    } else if (options.inputPath === null) {
      options.inputPath = path.resolve(argument);
    } else {
      throw new WordscanError(
        "CLI_TOO_MANY_INPUTS",
        "입력 파일 또는 폴더는 하나만 지정할 수 있습니다.",
      );
    }
  }
  if (options.pageLayout === "single" && options.splitRatio !== null) {
    throw new WordscanError(
      "CLI_INCOMPATIBLE_OPTIONS",
      "--page-layout single에서는 --split-ratio를 함께 사용할 수 없습니다.",
    );
  }
  return options;
}

function progressLine(event) {
  const prefix = event.batchFileNumber
    ? `[파일 ${event.batchFileNumber}/${event.batchFileCount}] `
    : "";
  switch (event.type) {
    case "batch:start":
      return `폴더 입력 확인: 이미지 ${event.fileCount}개`;
    case "batch:file:start":
      return `파일 ${event.fileNumber}/${event.fileCount} 처리 중: ${path.basename(event.inputPath)}`;
    case "batch:file:complete":
      return `파일 ${event.fileNumber}/${event.fileCount} 완료: ${path.basename(event.inputPath)}`;
    case "batch:file:error":
      return `파일 ${event.fileNumber}/${event.fileCount} 실패: ${path.basename(event.inputPath)} (${event.error.code})`;
    case "input:complete":
      return `${prefix}입력 확인: ${event.sheetCount}장`;
    case "page:start":
      return `${prefix}페이지 ${event.pageNumber} OCR 처리 중 (${event.side})`;
    case "page:complete":
      return `${prefix}페이지 ${event.pageNumber} 완료 (그림 ${event.assetCount}개)`;
    default:
      return null;
  }
}

export async function inspectInput(inputPath) {
  let inputStat;
  try {
    inputStat = await stat(inputPath);
  } catch (error) {
    throw asWordscanError(
      error,
      "INPUT_READ_FAILED",
      `입력 파일 또는 폴더를 읽을 수 없습니다: ${inputPath}`,
    );
  }
  if (inputStat.isDirectory()) return "directory";
  if (inputStat.isFile()) return "file";
  throw new WordscanError(
    "INPUT_UNSUPPORTED_TYPE",
    `일반 파일 또는 폴더만 입력할 수 있습니다: ${inputPath}`,
  );
}

function diagnosticTail(error, limit = 4_000) {
  if (!(error instanceof WordscanError) || typeof error.details.stderr !== "string") {
    return "";
  }
  return error.details.stderr.trim().slice(-limit);
}

export async function runCli(
  argv,
  {
    pipeline = runPipeline,
    batch = runBatch,
    inspectInput: inspect = inspectInput,
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  try {
    const options = parseCliArguments(argv);
    if (options.help) {
      stdout.write(HELP);
      return 0;
    }
    if (options.version) {
      stdout.write(`${VERSION}\n`);
      return 0;
    }
    if (!options.inputPath) {
      stderr.write(`입력 파일 또는 폴더가 필요합니다.\n\n${HELP}`);
      return 2;
    }

    const inputKind = await inspect(options.inputPath);
    if (inputKind === "directory") {
      const result = await batch({
        ...options,
        dependencies: { pipeline },
        onProgress(event) {
          const line = progressLine(event);
          if (!line) return;
          const writer = event.type === "batch:file:error" ? stderr : stdout;
          writer.write(`${line}\n`);
        },
      });
      const totals = result.summary.totals;
      stdout.write(
        `일괄 처리: 전체 ${totals.discovered}, 성공 ${totals.succeeded}, 실패 ${totals.failed}\n`,
      );
      stdout.write(`요약 Markdown: ${result.summaryMarkdownPath}\n`);
      stdout.write(`요약 JSON: ${result.summaryJsonPath}\n`);
      if (result.hasFailures) {
        stderr.write("[BATCH_PARTIAL_FAILURE] 일부 이미지 처리에 실패했습니다.\n");
        return 1;
      }
      return 0;
    }

    const result = await pipeline({
      ...options,
      onProgress(event) {
        const line = progressLine(event);
        if (line) stdout.write(`${line}\n`);
      },
    });
    stdout.write(`Markdown: ${result.markdownPath}\n`);
    stdout.write(`Manifest: ${result.manifestPath}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof WordscanError ? error.code : "UNEXPECTED_ERROR";
    stderr.write(`[${code}] ${error.message}\n`);
    const diagnostic = diagnosticTail(error);
    if (diagnostic) stderr.write(`${diagnostic}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  process.exitCode = await runCli(process.argv.slice(2));
}
