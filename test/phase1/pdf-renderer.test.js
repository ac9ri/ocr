import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PdfPageRenderer } from "../../src/pdf-renderer.js";
import { WordscanError } from "../../src/errors.js";

test("PDF 페이지를 PNG로 렌더링하고 페이지 순서로 반환한다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-pdf-renderer-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const inputPath = path.join(root, "manual.pdf");
  const outputDirectory = path.join(root, "rendered");
  await writeFile(inputPath, "%PDF-test");
  let invocation;

  const renderer = new PdfPageRenderer({
    command: "python-test",
    scriptPath: "pdf-render-test.py",
    dpi: 240,
    runner: async (command, args, options) => {
      invocation = { command, args, options };
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(path.join(outputDirectory, "page-0002.png"), "SECOND");
      await writeFile(path.join(outputDirectory, "page-0001.png"), "FIRST");
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  const pages = await renderer.render(inputPath, outputDirectory);

  assert.equal(invocation.command, "python-test");
  assert.deepEqual(invocation.args, [
    "pdf-render-test.py",
    "--input",
    inputPath,
    "--output",
    outputDirectory,
    "--dpi",
    "240",
  ]);
  assert.deepEqual(
    pages.map((page) => ({
      name: page.name,
      sourceName: page.sourceName,
      pageLayout: page.pageLayout,
      pdfPageNumber: page.pdfPageNumber,
      content: page.buffer.toString(),
    })),
    [
      {
        name: "page-0001.png",
        sourceName: "manual.pdf",
        pageLayout: "single",
        pdfPageNumber: 1,
        content: "FIRST",
      },
      {
        name: "page-0002.png",
        sourceName: "manual.pdf",
        pageLayout: "single",
        pdfPageNumber: 2,
        content: "SECOND",
      },
    ],
  );
});

test("PDF renderer 결과가 없으면 명시적 오류를 반환한다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-pdf-empty-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const renderer = new PdfPageRenderer({
    runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
  });

  await assert.rejects(
    () => renderer.render(path.join(root, "empty.pdf"), path.join(root, "rendered")),
    (error) => error instanceof WordscanError && error.code === "PDF_NO_PAGES",
  );
});
