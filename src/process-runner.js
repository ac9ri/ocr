import { spawn } from "node:child_process";
import { WordscanError } from "./errors.js";

export async function runProcess(command, args, { cwd, env, timeoutMs = 30 * 60 * 1000 } = {}) {
  return await new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
      shell: false,
    });
    const stdout = [];
    const stderr = [];

    child.stdout?.on("data", (chunk) => stdout.push(chunk));
    child.stderr?.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const code = error.code === "ENOENT" ? "OCR_ENGINE_NOT_FOUND" : "OCR_ENGINE_START_FAILED";
      reject(
        new WordscanError(code, `OCR engine을 실행하지 못했습니다: ${command}`, {
          cause: error,
          details: { command, args },
        }),
      );
    });
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = {
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (exitCode === 0) {
        resolve(result);
      } else {
        reject(
          new WordscanError(
            "OCR_ENGINE_FAILED",
            `OCR engine이 실패했습니다(exit=${exitCode}, signal=${signal ?? "none"}).`,
            { details: { command, args, ...result } },
          ),
        );
      }
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(
        new WordscanError(
          "OCR_ENGINE_TIMEOUT",
          `OCR engine 제한 시간(${timeoutMs}ms)을 초과했습니다.`,
          { details: { command, args, timeoutMs } },
        ),
      );
    }, timeoutMs);
    timer.unref();
  });
}
