import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runPipeline } from "../../src/pipeline.js";
import { RasterImage } from "../../src/raster-image.js";

class FakeCodec {
  constructor({ width = 200, height = 80 } = {}) {
    this.width = width;
    this.height = height;
  }

  async decode() {
    const image = RasterImage.solid(this.width, this.height);
    if (this.width > this.height) {
      for (let y = 10; y < this.height - 10; y += 10) {
        for (let x = 10; x < this.width / 2 - 10; x += 1) image.setRgb(x, y, 20);
        for (let x = this.width / 2 + 10; x < this.width - 10; x += 1) {
          image.setRgb(x, y, 20);
        }
      }
    }
    return image;
  }

  async encodePng(image) {
    return Buffer.from(`${image.width}x${image.height}`);
  }
}

class FakeEngine {
  constructor({ fail = false } = {}) {
    this.calls = 0;
    this.fail = fail;
    this.inputs = [];
  }

  async recognize(inputPath, outputDirectory, { rawInputPath = inputPath } = {}) {
    this.calls += 1;
    if (this.fail) throw new Error("fake OCR failure");
    this.inputs.push({
      structure: await readFile(inputPath, "utf8"),
      recovery: await readFile(rawInputPath, "utf8"),
    });
    await mkdir(outputDirectory, { recursive: true });
    const assetPath = path.join(outputDirectory, `figure-${this.calls}.png`);
    await writeFile(assetPath, `asset-${this.calls}`);
    return {
      markdown:
        `<table><tr><td colspan="2">쪽 ${this.calls}</td></tr></table>\n\n` +
        `![그림](figure-${this.calls}.png)`,
      assets: [{ reference: `figure-${this.calls}.png`, sourcePath: assetPath }],
      warnings: [],
      engine: { name: "fake" },
    };
  }
}

test("한 장의 2-up 입력을 두 페이지 Markdown/manifest로 만든다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-pipeline-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const inputPath = path.join(root, "scan.png");
  const outputDirectory = path.join(root, "result");
  await writeFile(inputPath, "scan");
  const engine = new FakeEngine();
  const events = [];

  const result = await runPipeline({
    inputPath,
    outputDirectory,
    onProgress: (event) => events.push(event.type),
    dependencies: { codec: new FakeCodec(), engine },
  });

  assert.equal(engine.calls, 2);
  const markdown = await readFile(result.markdownPath, "utf8");
  assert.match(markdown, /<!-- page: 1 -->/);
  assert.match(markdown, /<!-- page: 2 -->/);
  assert.match(markdown, /colspan="2"/);
  assert.match(markdown, /assets\/page-0001\/figure-1\.png/);
  assert.equal(result.manifest.pageCount, 2);
  assert.equal(result.manifest.sheetCount, 1);
  assert.equal(result.manifest.pages[0].side, "left");
  assert.equal(result.manifest.pages[1].side, "right");
  assert.equal(result.manifest.input.sha256.length, 64);
  assert.ok(events.includes("complete"));
  assert.equal(
    (await readdir(outputDirectory)).some((name) => name.startsWith(".wordscan-work-")),
    false,
  );
});

test("text-safe는 구조용 보존 이미지와 2배 복구 이미지를 분리한다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-dual-input-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const inputPath = path.join(root, "scan.png");
  const outputDirectory = path.join(root, "result");
  await writeFile(inputPath, "scan");
  const engine = new FakeEngine();

  const result = await runPipeline({
    inputPath,
    outputDirectory,
    watermarkMode: "text-safe",
    dependencies: { codec: new FakeCodec(), engine },
  });

  assert.deepEqual(engine.inputs[0], {
    structure: "100x80",
    recovery: "200x160",
  });
  assert.deepEqual(result.manifest.pages[0].pageSize, { width: 100, height: 80 });
  assert.deepEqual(result.manifest.pages[0].recoveryPageSize, {
    width: 200,
    height: 160,
  });
});

test("세로 단일 페이지 이미지는 분할하지 않고 한 페이지로 처리한다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-single-auto-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const inputPath = path.join(root, "portrait.png");
  await writeFile(inputPath, "scan");
  const engine = new FakeEngine();

  const result = await runPipeline({
    inputPath,
    outputDirectory: path.join(root, "result"),
    dependencies: {
      codec: new FakeCodec({ width: 80, height: 200 }),
      engine,
    },
  });

  assert.equal(engine.calls, 1);
  assert.equal(result.manifest.pageCount, 1);
  assert.equal(result.manifest.pages[0].side, "single");
  assert.equal(result.manifest.pages[0].pageLayout, "single");
  assert.equal(result.manifest.pages[0].splitColumn, null);
});

test("가로 단일 페이지는 page-layout single로 분할을 건너뛴다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-single-forced-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const inputPath = path.join(root, "landscape.png");
  await writeFile(inputPath, "scan");
  const engine = new FakeEngine();

  const result = await runPipeline({
    inputPath,
    outputDirectory: path.join(root, "result"),
    pageLayout: "single",
    dependencies: { codec: new FakeCodec(), engine },
  });

  assert.equal(engine.calls, 1);
  assert.equal(result.manifest.pages[0].sourceSize.width, 200);
  assert.equal(result.manifest.pages[0].pageSize.width, 200);
  assert.equal(result.manifest.settings.pageLayout, "single");
});

test("PDF renderer 페이지는 auto에서도 각각 단일 페이지로 처리한다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-pdf-pipeline-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const inputPath = path.join(root, "manual.pdf");
  await writeFile(inputPath, "%PDF-test");
  const engine = new FakeEngine();
  let pdfRenderOptions;

  const result = await runPipeline({
    inputPath,
    outputDirectory: path.join(root, "result"),
    paddlePython: "python-test",
    dependencies: {
      codec: new FakeCodec(),
      engine,
      pdfRenderer: {
        async render(receivedInput, outputDirectory) {
          pdfRenderOptions = { receivedInput, outputDirectory };
          return [
            {
              name: "page-0001.png",
              sourceName: "manual.pdf",
              pageLayout: "single",
              pdfPageNumber: 1,
              buffer: Buffer.from("page"),
            },
          ];
        },
      },
    },
  });

  assert.equal(engine.calls, 1);
  assert.equal(path.basename(pdfRenderOptions.receivedInput), "manual.pdf");
  assert.match(pdfRenderOptions.outputDirectory, /pdf-pages$/);
  assert.equal(result.manifest.pages[0].pdfPageNumber, 1);
  assert.equal(result.manifest.pages[0].pageLayout, "single");
});

test("실패해도 기본 설정에서는 작업 디렉터리를 정리한다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-cleanup-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const inputPath = path.join(root, "scan.png");
  const outputDirectory = path.join(root, "result");
  await writeFile(inputPath, "scan");

  await assert.rejects(() =>
    runPipeline({
      inputPath,
      outputDirectory,
      dependencies: { codec: new FakeCodec(), engine: new FakeEngine({ fail: true }) },
    }),
  );
  assert.equal(
    (await readdir(outputDirectory)).some((name) => name.startsWith(".wordscan-work-")),
    false,
  );
});
