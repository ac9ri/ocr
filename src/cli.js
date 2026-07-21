#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import { WordscanError } from "./errors.js";
import { runPipeline } from "./pipeline.js";

const VERSION = "0.1.0";

const HELP = `wordscan-ocr - 2-up Word 스캔 문서를 Markdown으로 변환

사용법:
  wordscan-ocr <input.docx|image> [options]

옵션:
  -o, --output <directory>       출력 디렉터리 (기본값: ./output)
      --split-ratio <0..1>       수동 좌/우 분할 위치
      --watermark <mode>         off|conservative|strong|text-safe (기본값: conservative)
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
    watermarkMode: "conservative",
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
      throw new WordscanError("CLI_TOO_MANY_INPUTS", "입력 파일은 하나만 지정할 수 있습니다.");
    }
  }
  return options;
}

function progressLine(event) {
  switch (event.type) {
    case "input:complete":
      return `입력 확인: ${event.sheetCount}장`;
    case "page:start":
      return `페이지 ${event.pageNumber} OCR 처리 중 (${event.side})`;
    case "page:complete":
      return `페이지 ${event.pageNumber} 완료 (그림 ${event.assetCount}개)`;
    default:
      return null;
  }
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
      stderr.write(`입력 파일이 필요합니다.\n\n${HELP}`);
      return 2;
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
