import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runBatch } from "../../src/batch-runner.js";
import { WordscanError } from "../../src/errors.js";

test("폴더의 지원 이미지를 이름순으로 처리하고 전체 요약을 생성한다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-batch-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const inputDirectory = path.join(root, "inputs");
  const outputDirectory = path.join(root, "outputs");
  await mkdir(inputDirectory);
  await Promise.all([
    writeFile(path.join(inputDirectory, "zeta.PNG"), "image"),
    writeFile(path.join(inputDirectory, "alpha.png"), "image"),
    writeFile(path.join(inputDirectory, "alpha.jpg"), "image"),
    writeFile(path.join(inputDirectory, "ignore.txt"), "not an image"),
  ]);

  const calls = [];
  const result = await runBatch({
    inputPath: inputDirectory,
    outputDirectory,
    watermarkMode: "text-safe",
    dependencies: {
      pipeline: async (options) => {
        calls.push(options);
        await mkdir(options.outputDirectory, { recursive: true });
        const baseName = path.parse(options.inputPath).name;
        const markdownPath = path.join(options.outputDirectory, `${baseName}.md`);
        const manifestPath = path.join(
          options.outputDirectory,
          `${baseName}.manifest.json`,
        );
        await writeFile(markdownPath, "result");
        await writeFile(manifestPath, "{}");
        return { markdownPath, manifestPath };
      },
    },
  });

  assert.deepEqual(
    calls.map((call) => path.basename(call.inputPath)),
    ["alpha.jpg", "alpha.png", "zeta.PNG"],
  );
  assert.deepEqual(
    calls.map((call) => path.basename(call.outputDirectory)),
    ["alpha-jpg", "alpha-png", "zeta"],
  );
  assert.equal(result.summary.totals.discovered, 3);
  assert.equal(result.summary.totals.succeeded, 3);
  assert.equal(result.summary.totals.failed, 0);
  assert.equal(result.hasFailures, false);
  assert.match(await readFile(result.summaryMarkdownPath, "utf8"), /alpha\.jpg/);
  assert.match(await readFile(result.summaryMarkdownPath, "utf8"), /alpha-jpg\/alpha\.md/);
  assert.equal(
    JSON.parse(await readFile(result.summaryJsonPath, "utf8")).results.length,
    3,
  );
});

test("개별 이미지 실패 후에도 다음 이미지를 처리하고 실패를 요약한다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-batch-partial-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const inputDirectory = path.join(root, "inputs");
  await mkdir(inputDirectory);
  await Promise.all([
    writeFile(path.join(inputDirectory, "01-broken.png"), "image"),
    writeFile(path.join(inputDirectory, "02-good.png"), "image"),
  ]);
  const processed = [];

  const result = await runBatch({
    inputPath: inputDirectory,
    outputDirectory: path.join(root, "outputs"),
    dependencies: {
      pipeline: async (options) => {
        processed.push(path.basename(options.inputPath));
        if (options.inputPath.endsWith("01-broken.png")) {
          throw new WordscanError("OCR_ENGINE_FAILED", "OCR 처리 실패");
        }
        return {
          markdownPath: path.join(options.outputDirectory, "02-good.md"),
          manifestPath: path.join(options.outputDirectory, "02-good.manifest.json"),
        };
      },
    },
  });

  assert.deepEqual(processed, ["01-broken.png", "02-good.png"]);
  assert.equal(result.summary.totals.succeeded, 1);
  assert.equal(result.summary.totals.failed, 1);
  assert.equal(result.hasFailures, true);
  assert.equal(result.summary.results[0].error.code, "OCR_ENGINE_FAILED");
  assert.match(await readFile(result.summaryMarkdownPath, "utf8"), /OCR 처리 실패/);
});

test("지원 이미지가 없는 폴더는 명시적 오류로 중단한다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-batch-empty-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "readme.txt"), "text");

  await assert.rejects(
    () =>
      runBatch({
        inputPath: root,
        outputDirectory: path.join(root, "outputs"),
        dependencies: { pipeline: async () => assert.fail("호출되면 안 됨") },
      }),
    (error) => error instanceof WordscanError && error.code === "INPUT_NO_IMAGES",
  );
});
