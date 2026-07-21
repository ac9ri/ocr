import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WordscanError } from "../../src/errors.js";
import { PaddleCliEngine } from "../../src/paddle-cli-engine.js";

test("PP-StructureV3에 한국어·표·문서 보정 옵션을 전달하고 결과를 읽는다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-engine-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const inputPath = path.join(root, "page.png");
  const outputDirectory = path.join(root, "ocr");
  await mkdir(outputDirectory);
  await writeFile(inputPath, "image");

  let invocation;
  const runner = async (command, args, options) => {
    invocation = { command, args, options };
    await mkdir(path.join(outputDirectory, "imgs"));
    await writeFile(path.join(outputDirectory, "imgs", "figure.png"), "figure");
    await writeFile(
      path.join(outputDirectory, "page.md"),
      '<table><tr><td rowspan="2" colspan="2">병합</td></tr></table>\n\n![그림](imgs/figure.png)',
    );
    await writeFile(
      path.join(outputDirectory, "page_res.json"),
      JSON.stringify({
        overall_ocr_res: {
          rec_texts: ["구조 분석에 남은 줄"],
          rec_boxes: [[10, 20, 100, 40]],
        },
      }),
    );
    await writeFile(
      path.join(outputDirectory, "raw_ocr.json"),
      JSON.stringify({
        overall_ocr_res: {
          rec_texts: ["1) 첫 줄"],
          rec_boxes: [[10, 20, 100, 40]],
        },
      }),
    );
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const engine = new PaddleCliEngine({
    runner,
    device: "gpu:0",
    rawTextRecovery: true,
  });
  const result = await engine.recognize(inputPath, outputDirectory);

  assert.equal(invocation.command, "paddleocr");
  assert.ok(invocation.args.includes("pp_structurev3"));
  assert.equal(
    invocation.args[invocation.args.indexOf("--text_recognition_model_name") + 1],
    "korean_PP-OCRv5_mobile_rec",
  );
  assert.equal(invocation.args[invocation.args.indexOf("--device") + 1], "gpu:0");
  assert.equal(invocation.args[invocation.args.indexOf("--use_table_recognition") + 1], "True");
  assert.equal(invocation.args[invocation.args.indexOf("--save_raw_ocr") + 1], "true");
  assert.match(result.markdown, /rowspan="2"/);
  assert.match(result.markdown, /colspan="2"/);
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].reference, "imgs/figure.png");
  assert.deepEqual(result.rawTextLines, [
    { text: "1) 첫 줄", box: [10, 20, 100, 40] },
  ]);
});

test("Markdown 결과가 없으면 명시적 오류를 반환한다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-engine-empty-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const engine = new PaddleCliEngine({
    runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
  });

  await assert.rejects(
    () => engine.recognize(path.join(root, "page.png"), root),
    (error) => error instanceof WordscanError && error.code === "OCR_MARKDOWN_NOT_FOUND",
  );
});

test("Python bridge 경로를 OCR 인자 앞에 전달한다", () => {
  const engine = new PaddleCliEngine({
    command: "python",
    commandArguments: ["scripts/paddle-structure-bridge.py"],
  });
  const args = [
    ...engine.commandArguments,
    ...engine.buildArguments("page.png", "result"),
  ];

  assert.equal(args[0], "scripts/paddle-structure-bridge.py");
  assert.equal(args[1], "pp_structurev3");
  assert.equal(args[args.indexOf("--save_raw_ocr") + 1], "false");
});

test("engine 실행 오류를 숨기지 않는다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-engine-error-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const expected = new WordscanError("OCR_ENGINE_FAILED", "failure");
  const engine = new PaddleCliEngine({
    runner: async () => {
      throw expected;
    },
  });

  await assert.rejects(() => engine.recognize("page.png", root), expected);
});
