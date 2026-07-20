import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadInputSources } from "./source-loader.js";
import { SharpImageCodec } from "./sharp-codec.js";
import { TwoUpPageSplitter } from "./page-splitter.js";
import { WatermarkSuppressor } from "./watermark-suppressor.js";
import { PaddleCliEngine } from "./paddle-cli-engine.js";
import { materializePage, writeMarkdownDocument } from "./markdown-assembler.js";

const PADDLE_BRIDGE_SCRIPT = fileURLToPath(
  new URL("../scripts/paddle-structure-bridge.py", import.meta.url),
);

function notify(callback, event) {
  callback?.(event);
}

async function inputSha256(inputPath) {
  const data = await readFile(inputPath);
  return createHash("sha256").update(data).digest("hex");
}

export async function runPipeline({
  inputPath,
  outputDirectory,
  splitRatio = null,
  watermarkMode = "conservative",
  device = "cpu",
  paddleCommand = "paddleocr",
  paddlePython = null,
  keepWork = false,
  onProgress,
  dependencies = {},
}) {
  const absoluteInput = path.resolve(inputPath);
  const absoluteOutput = path.resolve(outputDirectory);
  const baseName = path.parse(absoluteInput).name;
  const codec = dependencies.codec ?? new SharpImageCodec();
  const sourceLoader = dependencies.sourceLoader ?? loadInputSources;
  const splitter =
    dependencies.splitter ?? new TwoUpPageSplitter({ splitRatio });
  const suppressor =
    dependencies.suppressor ?? new WatermarkSuppressor({ mode: watermarkMode });
  const engine =
    dependencies.engine ??
    new PaddleCliEngine({
      command: paddlePython ?? paddleCommand,
      commandArguments: paddlePython ? [PADDLE_BRIDGE_SCRIPT] : [],
      device,
    });

  await mkdir(absoluteOutput, { recursive: true });
  const workDirectory = await mkdtemp(path.join(absoluteOutput, ".wordscan-work-"));
  const startedAt = new Date().toISOString();
  const pages = [];
  const manifestPages = [];

  try {
    notify(onProgress, { type: "input:start", inputPath: absoluteInput });
    const sources = await sourceLoader(absoluteInput);
    notify(onProgress, { type: "input:complete", sheetCount: sources.length });

    let pageNumber = 0;
    for (let sheetIndex = 0; sheetIndex < sources.length; sheetIndex += 1) {
      const sheetNumber = sheetIndex + 1;
      notify(onProgress, { type: "sheet:start", sheetNumber, sheetCount: sources.length });
      const raster = await codec.decode(sources[sheetIndex].buffer);
      const split = splitter.split(raster);

      for (let sideIndex = 0; sideIndex < split.pages.length; sideIndex += 1) {
        pageNumber += 1;
        const side = sideIndex === 0 ? "left" : "right";
        notify(onProgress, { type: "page:start", pageNumber, sheetNumber, side });
        const pageWorkDirectory = path.join(
          workDirectory,
          `page-${String(pageNumber).padStart(4, "0")}`,
        );
        const ocrOutputDirectory = path.join(pageWorkDirectory, "ocr");
        await mkdir(ocrOutputDirectory, { recursive: true });
        const preprocessed = suppressor.apply(split.pages[sideIndex]);
        const pageInputPath = path.join(pageWorkDirectory, "input.png");
        await writeFile(pageInputPath, await codec.encodePng(preprocessed));

        const recognized = await engine.recognize(pageInputPath, ocrOutputDirectory);
        const materialized = await materializePage(
          recognized,
          pageNumber,
          absoluteOutput,
        );
        pages.push(materialized);
        manifestPages.push({
          pageNumber,
          sheetNumber,
          side,
          sourceImage: sources[sheetIndex].name,
          sourceSize: { width: raster.width, height: raster.height },
          pageSize: { width: preprocessed.width, height: preprocessed.height },
          splitColumn: split.splitColumn,
          assets: materialized.assets,
          warnings: materialized.warnings,
          engine: materialized.engine,
        });
        notify(onProgress, {
          type: "page:complete",
          pageNumber,
          sheetNumber,
          side,
          assetCount: materialized.assets.length,
        });
      }
    }

    const markdownPath = path.join(absoluteOutput, `${baseName}.md`);
    const manifestPath = path.join(absoluteOutput, `${baseName}.manifest.json`);
    await writeMarkdownDocument(markdownPath, pages);
    const manifest = {
      schemaVersion: 1,
      input: {
        path: absoluteInput,
        sha256: await inputSha256(absoluteInput),
      },
      output: {
        markdown: path.basename(markdownPath),
        manifest: path.basename(manifestPath),
      },
      settings: {
        splitRatio,
        watermarkMode,
        device,
        paddleCommand,
        paddlePython,
      },
      startedAt,
      completedAt: new Date().toISOString(),
      sheetCount: new Set(manifestPages.map((page) => page.sheetNumber)).size,
      pageCount: manifestPages.length,
      pages: manifestPages,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    notify(onProgress, { type: "complete", markdownPath, manifestPath });
    return { markdownPath, manifestPath, manifest, workDirectory: keepWork ? workDirectory : null };
  } finally {
    if (!keepWork) {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }
}
