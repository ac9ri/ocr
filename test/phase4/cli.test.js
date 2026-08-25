import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectInput, parseCliArguments, runCli } from "../../src/cli.js";
import { WordscanError } from "../../src/errors.js";

function stringWriter() {
  let value = "";
  return {
    write(chunk) {
      value += chunk;
    },
    value() {
      return value;
    },
  };
}

test("CLI 옵션을 pipeline 설정으로 변환한다", () => {
  const options = parseCliArguments([
    "scan.docx",
    "-o",
    "converted",
    "--split-ratio",
    "0.48",
    "--watermark",
    "strong",
    "--page-layout",
    "two-up",
    "--device",
    "gpu:0",
    "--paddle-python",
    ".venv-ocr/python",
    "--keep-work",
  ]);
  assert.match(options.inputPath, /scan\.docx$/);
  assert.match(options.outputDirectory, /converted$/);
  assert.equal(options.splitRatio, 0.48);
  assert.equal(options.watermarkMode, "strong");
  assert.equal(options.pageLayout, "two-up");
  assert.equal(options.device, "gpu:0");
  assert.equal(path.isAbsolute(options.paddlePython), true);
  assert.match(options.paddlePython, /\.venv-ocr[\\/]python$/);
  assert.equal(options.keepWork, true);
});

test("CLI 성공 시 결과 경로와 진행 상황을 출력한다", async () => {
  const stdout = stringWriter();
  const stderr = stringWriter();
  let received;
  const exitCode = await runCli(["scan.png"], {
    stdout,
    stderr,
    inspectInput: async () => "file",
    pipeline: async (options) => {
      received = options;
      options.onProgress({ type: "page:complete", pageNumber: 1, assetCount: 2 });
      return { markdownPath: "out/scan.md", manifestPath: "out/scan.manifest.json" };
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(received.watermarkMode, "text-safe");
  assert.match(stdout.value(), /페이지 1 완료/);
  assert.match(stdout.value(), /out\/scan\.md/);
  assert.equal(stderr.value(), "");
});

test("CLI는 워터마크 겹침용 text-safe 모드를 허용한다", () => {
  const options = parseCliArguments(["scan.png", "--watermark", "text-safe"]);
  assert.equal(options.watermarkMode, "text-safe");
});

test("CLI는 auto, single, two-up 페이지 레이아웃만 허용한다", () => {
  assert.equal(parseCliArguments(["scan.pdf"]).pageLayout, "auto");
  assert.equal(
    parseCliArguments(["scan.png", "--page-layout", "two-up"]).pageLayout,
    "two-up",
  );
  assert.throws(
    () => parseCliArguments(["scan.png", "--page-layout", "spread"]),
    (error) =>
      error instanceof WordscanError && error.code === "CLI_INVALID_PAGE_LAYOUT",
  );
  assert.throws(
    () =>
      parseCliArguments([
        "scan.png",
        "--page-layout",
        "single",
        "--split-ratio",
        "0.5",
      ]),
    (error) =>
      error instanceof WordscanError && error.code === "CLI_INCOMPATIBLE_OPTIONS",
  );
});

test("입력 경로가 파일인지 폴더인지 판별한다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-cli-input-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const filePath = path.join(root, "scan.png");
  const directoryPath = path.join(root, "images");
  await writeFile(filePath, "image");
  await mkdir(directoryPath);

  assert.equal(await inspectInput(filePath), "file");
  assert.equal(await inspectInput(directoryPath), "directory");
  await assert.rejects(
    () => inspectInput(path.join(root, "missing")),
    (error) => error instanceof WordscanError && error.code === "INPUT_READ_FAILED",
  );
});

test("입력 누락과 잘못된 옵션은 0이 아닌 종료 코드를 반환한다", async () => {
  const noInputError = stringWriter();
  assert.equal(await runCli([], { stdout: stringWriter(), stderr: noInputError }), 2);
  assert.match(noInputError.value(), /입력 파일 또는 폴더가 필요/);

  const invalidError = stringWriter();
  assert.equal(
    await runCli(["scan.png", "--split-ratio", "2"], {
      stdout: stringWriter(),
      stderr: invalidError,
    }),
    1,
  );
  assert.match(invalidError.value(), /CLI_INVALID_SPLIT_RATIO/);
});

test("OCR engine 실패 시 stderr 진단 꼬리를 함께 출력한다", async () => {
  const stderr = stringWriter();
  const exitCode = await runCli(["scan.png"], {
    stdout: stringWriter(),
    stderr,
    inspectInput: async () => "file",
    pipeline: async () => {
      throw new WordscanError("OCR_ENGINE_FAILED", "engine failure", {
        details: { stderr: "model initialization traceback" },
      });
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.value(), /OCR_ENGINE_FAILED/);
  assert.match(stderr.value(), /model initialization traceback/);
});

test("폴더 입력은 배치 실행 결과와 전체 요약 경로를 출력한다", async () => {
  const stdout = stringWriter();
  const stderr = stringWriter();
  let received;
  const exitCode = await runCli(["images", "-o", "batch-output"], {
    stdout,
    stderr,
    inspectInput: async () => "directory",
    batch: async (options) => {
      received = options;
      options.onProgress({ type: "batch:start", fileCount: 2 });
      options.onProgress({
        type: "batch:file:complete",
        fileNumber: 1,
        fileCount: 2,
        inputPath: "images/a.png",
      });
      return {
        summaryMarkdownPath: "batch-output/batch-summary.md",
        summaryJsonPath: "batch-output/batch-summary.json",
        summary: { totals: { discovered: 2, succeeded: 2, failed: 0 } },
        hasFailures: false,
      };
    },
  });

  assert.equal(exitCode, 0);
  assert.match(received.inputPath, /images$/);
  assert.match(stdout.value(), /이미지 2개/);
  assert.match(stdout.value(), /batch-summary\.md/);
  assert.match(stdout.value(), /성공 2, 실패 0/);
  assert.equal(stderr.value(), "");
});

test("배치 일부 실패는 요약을 생성한 뒤 실패 종료 코드를 반환한다", async () => {
  const stdout = stringWriter();
  const stderr = stringWriter();
  const exitCode = await runCli(["images"], {
    stdout,
    stderr,
    inspectInput: async () => "directory",
    batch: async () => ({
      summaryMarkdownPath: "output/batch-summary.md",
      summaryJsonPath: "output/batch-summary.json",
      summary: { totals: { discovered: 2, succeeded: 1, failed: 1 } },
      hasFailures: true,
    }),
  });

  assert.equal(exitCode, 1);
  assert.match(stdout.value(), /성공 1, 실패 1/);
  assert.match(stderr.value(), /일부 이미지 처리에 실패/);
});
