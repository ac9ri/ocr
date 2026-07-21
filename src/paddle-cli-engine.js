import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { WordscanError } from "./errors.js";
import { runProcess } from "./process-runner.js";

async function walkFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function localAssetReferences(markdown) {
  const references = new Set();
  const markdownImage = /!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  const htmlImage = /<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi;
  for (const match of markdown.matchAll(markdownImage)) {
    references.add(match[1]);
  }
  for (const match of markdown.matchAll(htmlImage)) {
    references.add(match[2]);
  }
  return [...references].filter(
    (reference) =>
      !/^(?:[a-z]+:|#|\/)/i.test(reference) &&
      !reference.startsWith("\\"),
  );
}

async function collectAssets(markdown, markdownPath, outputDirectory) {
  const assets = [];
  const outputRoot = path.resolve(outputDirectory);
  for (const reference of localAssetReferences(markdown)) {
    const decoded = decodeURIComponent(reference);
    const sourcePath = path.resolve(path.dirname(markdownPath), decoded);
    const relativeToRoot = path.relative(outputRoot, sourcePath);
    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      throw new WordscanError(
        "OCR_UNSAFE_ASSET_PATH",
        `OCR 결과가 output 밖의 asset을 참조합니다: ${reference}`,
      );
    }
    try {
      await access(sourcePath);
      assets.push({ reference, sourcePath });
    } catch {
      throw new WordscanError(
        "OCR_ASSET_MISSING",
        `OCR Markdown이 참조한 그림이 없습니다: ${reference}`,
      );
    }
  }
  return assets;
}

function textLines(ocr) {
  if (!Array.isArray(ocr?.rec_texts) || !Array.isArray(ocr?.rec_boxes)) return [];
  return ocr.rec_texts
    .map((text, index) => ({
      text,
      box: ocr.rec_boxes[index],
      score: ocr.rec_scores?.[index] ?? null,
    }))
    .filter(
      (line) =>
        typeof line.text === "string" &&
        Array.isArray(line.box) &&
        line.box.length === 4 &&
        line.box.every(Number.isFinite),
    );
}

async function readRawTextData(files) {
  const jsonFiles = files
    .filter((file) => path.extname(file).toLowerCase() === ".json")
    .sort((left, right) => {
      const leftRaw = path.basename(left).toLowerCase() === "raw_ocr.json";
      const rightRaw = path.basename(right).toLowerCase() === "raw_ocr.json";
      return Number(rightRaw) - Number(leftRaw);
    });
  for (const jsonFile of jsonFiles) {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(jsonFile, "utf8"));
    } catch {
      continue;
    }
    const result = parsed.res ?? parsed;
    const ocr = result.overall_ocr_res;
    const rawTextLines = textLines(ocr);
    if (rawTextLines.length === 0) continue;
    return {
      rawTextLines,
      fallbackTextLines: textLines(result.fallback_ocr_res),
    };
  }
  return { rawTextLines: [], fallbackTextLines: [] };
}

async function readStructureBlocks(files) {
  const structureFile = files.find(
    (file) => path.basename(file).toLowerCase() !== "raw_ocr.json" &&
      path.extname(file).toLowerCase() === ".json",
  );
  if (!structureFile) return [];
  try {
    const parsed = JSON.parse(await readFile(structureFile, "utf8"));
    const result = parsed.res ?? parsed;
    if (!Array.isArray(result.parsing_res_list)) return [];
    return result.parsing_res_list
      .map((block) => ({
        label: block.block_label,
        content: block.block_content,
        bbox: block.block_bbox,
      }))
      .filter(
        (block) =>
          typeof block.label === "string" &&
          typeof block.content === "string" &&
          Array.isArray(block.bbox) &&
          block.bbox.length === 4 &&
          block.bbox.every(Number.isFinite),
      );
  } catch {
    return [];
  }
}

export class PaddleCliEngine {
  constructor({
    command = "paddleocr",
    commandArguments = [],
    device = "cpu",
    recognitionModel = "korean_PP-OCRv5_mobile_rec",
    rawTextRecovery = false,
    timeoutMs = 30 * 60 * 1000,
    runner = runProcess,
  } = {}) {
    this.command = command;
    this.commandArguments = commandArguments;
    this.device = device;
    this.recognitionModel = recognitionModel;
    this.rawTextRecovery = rawTextRecovery;
    this.timeoutMs = timeoutMs;
    this.runner = runner;
  }

  buildArguments(inputPath, outputDirectory, rawInputPath = inputPath) {
    const args = [
      "pp_structurev3",
      "-i",
      inputPath,
      "--save_path",
      outputDirectory,
      "--device",
      this.device,
      "--text_recognition_model_name",
      this.recognitionModel,
      "--use_doc_orientation_classify",
      "True",
      "--use_doc_unwarping",
      "True",
      "--use_textline_orientation",
      "True",
      "--use_region_detection",
      "True",
      "--use_table_recognition",
      "True",
      "--use_formula_recognition",
      "False",
      "--use_seal_recognition",
      "False",
      "--use_chart_recognition",
      "False",
      "--save_raw_ocr",
      String(this.rawTextRecovery),
    ];
    if (this.rawTextRecovery) {
      args.push("--raw_ocr_input", rawInputPath);
    }
    return args;
  }

  async recognize(inputPath, outputDirectory, { rawInputPath = inputPath } = {}) {
    const args = [
      ...this.commandArguments,
      ...this.buildArguments(inputPath, outputDirectory, rawInputPath),
    ];
    const processResult = await this.runner(this.command, args, {
      cwd: outputDirectory,
      timeoutMs: this.timeoutMs,
    });

    const files = await walkFiles(outputDirectory);
    const markdownFiles = files.filter((file) => path.extname(file).toLowerCase() === ".md");
    if (markdownFiles.length !== 1) {
      throw new WordscanError(
        "OCR_MARKDOWN_NOT_FOUND",
        `OCR 결과 Markdown은 1개여야 합니다. found=${markdownFiles.length}`,
        { details: { outputDirectory, markdownFiles, stderr: processResult.stderr } },
      );
    }

    const markdownPath = markdownFiles[0];
    const markdown = await readFile(markdownPath, "utf8");
    const rawTextData = this.rawTextRecovery
      ? await readRawTextData(files)
      : { rawTextLines: [], fallbackTextLines: [] };
    return {
      markdown,
      assets: await collectAssets(markdown, markdownPath, outputDirectory),
      ...rawTextData,
      structureBlocks: this.rawTextRecovery ? await readStructureBlocks(files) : [],
      warnings: processResult.stderr?.trim() ? [processResult.stderr.trim()] : [],
      engine: {
        name: "PP-StructureV3",
        recognitionModel: this.recognitionModel,
        device: this.device,
      },
    };
  }
}
