import assert from "node:assert/strict";
import test from "node:test";
import { parseCliArguments, runCli } from "../../src/cli.js";

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
    "--device",
    "gpu:0",
    "--keep-work",
  ]);
  assert.match(options.inputPath, /scan\.docx$/);
  assert.match(options.outputDirectory, /converted$/);
  assert.equal(options.splitRatio, 0.48);
  assert.equal(options.watermarkMode, "strong");
  assert.equal(options.device, "gpu:0");
  assert.equal(options.keepWork, true);
});

test("CLI 성공 시 결과 경로와 진행 상황을 출력한다", async () => {
  const stdout = stringWriter();
  const stderr = stringWriter();
  let received;
  const exitCode = await runCli(["scan.png"], {
    stdout,
    stderr,
    pipeline: async (options) => {
      received = options;
      options.onProgress({ type: "page:complete", pageNumber: 1, assetCount: 2 });
      return { markdownPath: "out/scan.md", manifestPath: "out/scan.manifest.json" };
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(received.watermarkMode, "conservative");
  assert.match(stdout.value(), /페이지 1 완료/);
  assert.match(stdout.value(), /out\/scan\.md/);
  assert.equal(stderr.value(), "");
});

test("입력 누락과 잘못된 옵션은 0이 아닌 종료 코드를 반환한다", async () => {
  const noInputError = stringWriter();
  assert.equal(await runCli([], { stdout: stringWriter(), stderr: noInputError }), 2);
  assert.match(noInputError.value(), /입력 파일이 필요/);

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
