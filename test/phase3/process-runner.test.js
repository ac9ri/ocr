import assert from "node:assert/strict";
import test from "node:test";
import { WordscanError } from "../../src/errors.js";
import { runProcess } from "../../src/process-runner.js";

test("프로세스 시작이 동기적으로 실패해도 도메인 오류로 변환한다", async () => {
  const startError = Object.assign(new Error("spawn blocked"), { code: "EPERM" });

  await assert.rejects(
    () =>
      runProcess("paddleocr", [], {
        spawnImpl: () => {
          throw startError;
        },
      }),
    (error) =>
      error instanceof WordscanError &&
      error.code === "OCR_ENGINE_START_FAILED" &&
      error.cause === startError,
  );
});

test("존재하지 않는 실행 파일은 명시적 오류로 변환한다", async () => {
  await assert.rejects(
    () => runProcess("wordscan-command-that-does-not-exist", [], { timeoutMs: 5_000 }),
    (error) =>
      error instanceof WordscanError &&
      error.code === "OCR_ENGINE_NOT_FOUND",
  );
});
