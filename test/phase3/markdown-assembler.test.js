import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  concatenatePages,
  materializePage,
  writeMarkdownDocument,
} from "../../src/markdown-assembler.js";

test("병합 셀 HTML을 보존하고 그림을 page asset 경로로 옮긴다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-markdown-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourceAsset = path.join(root, "source.png");
  const output = path.join(root, "output");
  await writeFile(sourceAsset, "asset");

  const page = await materializePage(
    {
      markdown:
        '<table><tr><td rowspan="2" colspan="3">병합</td></tr></table>\n\n![도면](imgs/source.png)',
      assets: [{ reference: "imgs/source.png", sourcePath: sourceAsset }],
    },
    1,
    output,
  );

  assert.match(page.markdown, /rowspan="2"/);
  assert.match(page.markdown, /colspan="3"/);
  assert.match(page.markdown, /assets\/page-0001\/source\.png/);
  await access(path.join(output, "assets", "page-0001", "source.png"));
});

test("페이지 번호와 구분자를 포함한 단일 Markdown을 생성한다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-document-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const outputPath = path.join(root, "result.md");
  const pages = [{ markdown: "첫 쪽" }, { markdown: "둘째 쪽" }];

  const combined = concatenatePages(pages);
  assert.match(combined, /<!-- page: 1 -->/);
  assert.match(combined, /\n\n---\n\n<!-- page: 2 -->/);
  await writeMarkdownDocument(outputPath, pages);
  assert.equal(await readFile(outputPath, "utf8"), combined);
});

test("OCR Markdown이 없으면 block 읽기 순서로 fallback한다", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wordscan-blocks-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const page = await materializePage(
    {
      blocks: [
        { type: "text", content: "오른쪽 설명", bbox: [200, 0, 300, 100] },
        { type: "table", markdown: "<table></table>", bbox: [0, 0, 180, 100] },
      ],
    },
    1,
    root,
  );
  assert.equal(page.markdown, "<table></table>\n\n오른쪽 설명");
});
