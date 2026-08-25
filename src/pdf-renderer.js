import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WordscanError } from "./errors.js";
import { runProcess } from "./process-runner.js";

const PDF_RENDER_SCRIPT = fileURLToPath(
  new URL("../scripts/pdf-render-bridge.py", import.meta.url),
);

function renderError(error, inputPath) {
  const codeByProcessError = new Map([
    ["OCR_ENGINE_NOT_FOUND", "PDF_RENDERER_NOT_FOUND"],
    ["OCR_ENGINE_START_FAILED", "PDF_RENDERER_START_FAILED"],
    ["OCR_ENGINE_TIMEOUT", "PDF_RENDER_TIMEOUT"],
  ]);
  return new WordscanError(
    codeByProcessError.get(error?.code) ?? "PDF_RENDER_FAILED",
    `PDF 페이지를 이미지로 변환하지 못했습니다: ${inputPath}`,
    { cause: error, details: error?.details ?? {} },
  );
}

export class PdfPageRenderer {
  constructor({
    command = "python",
    scriptPath = PDF_RENDER_SCRIPT,
    dpi = 300,
    timeoutMs = 10 * 60 * 1000,
    runner = runProcess,
  } = {}) {
    this.command = command;
    this.scriptPath = scriptPath;
    this.dpi = dpi;
    this.timeoutMs = timeoutMs;
    this.runner = runner;
  }

  async render(inputPath, outputDirectory) {
    await mkdir(outputDirectory, { recursive: true });
    try {
      await this.runner(
        this.command,
        [
          this.scriptPath,
          "--input",
          inputPath,
          "--output",
          outputDirectory,
          "--dpi",
          String(this.dpi),
        ],
        { cwd: outputDirectory, timeoutMs: this.timeoutMs },
      );
    } catch (error) {
      throw renderError(error, inputPath);
    }

    const pageFiles = (await readdir(outputDirectory))
      .filter((name) => /^page-\d{4}\.png$/i.test(name))
      .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
    if (pageFiles.length === 0) {
      throw new WordscanError(
        "PDF_NO_PAGES",
        `PDF renderer가 페이지 이미지를 생성하지 않았습니다: ${inputPath}`,
      );
    }

    return await Promise.all(
      pageFiles.map(async (name, index) => ({
        name,
        sourceName: path.basename(inputPath),
        buffer: await readFile(path.join(outputDirectory, name)),
        pageLayout: "single",
        pdfPageNumber: index + 1,
      })),
    );
  }
}
