import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  FIXTURE_HEIGHT,
  FIXTURE_WIDTH,
  GUTTER_WIDTH,
  PAGE_WIDTH,
  generateFixtures,
} from "../../scripts/generate-test-fixtures.js";
import { TwoUpPageSplitter } from "../../src/page-splitter.js";
import { SharpImageCodec } from "../../src/sharp-codec.js";
import { extractDocxImages } from "../../src/source-loader.js";
import { ZipArchive } from "../../src/zip-archive.js";

const COMMITTED_FIXTURES = path.resolve("test", "fixtures", "generated");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

test("합성 DOCX는 watermarked PNG 한 장만 포함한다", async () => {
  const docx = await readFile(path.join(COMMITTED_FIXTURES, "synthetic-two-up.docx"));
  const embedded = extractDocxImages(docx, "synthetic-two-up.docx");
  const watermarked = await readFile(
    path.join(COMMITTED_FIXTURES, "two-up-watermarked.png"),
  );

  assert.equal(embedded.length, 1);
  assert.equal(embedded[0].name, "two-up-watermarked.png");
  assert.equal(sha256(embedded[0].buffer), sha256(watermarked));

  const archive = new ZipArchive(docx);
  const documentXml = archive.read("word/document.xml").toString("utf8");
  assert.doesNotMatch(documentXml, /<w:t(?:\s|>)/);
  assert.match(documentXml, /Synthetic two-up OCR test scan/);
});

test("합성 이미지는 300dpi 2-up 크기와 중앙 gutter를 가진다", async () => {
  const imagePath = path.join(COMMITTED_FIXTURES, "two-up-watermarked.png");
  const metadata = await sharp(imagePath).metadata();
  assert.equal(metadata.width, FIXTURE_WIDTH);
  assert.equal(metadata.height, FIXTURE_HEIGHT);
  assert.ok(Math.abs((metadata.density ?? 0) - 300) <= 1);

  const codec = new SharpImageCodec();
  const raster = await codec.decode(await readFile(imagePath));
  const result = new TwoUpPageSplitter().split(raster);
  const expectedCenter = PAGE_WIDTH + GUTTER_WIDTH / 2;
  assert.ok(Math.abs(result.splitColumn - expectedCenter) <= 20);
  assert.equal(result.pages.length, 2);
});

test("watermarked 이미지에는 clean 이미지와 구별되는 회색 layer가 있다", async () => {
  const clean = await sharp(path.join(COMMITTED_FIXTURES, "two-up-clean.png"))
    .raw()
    .toBuffer();
  const watermarked = await sharp(
    path.join(COMMITTED_FIXTURES, "two-up-watermarked.png"),
  )
    .raw()
    .toBuffer();
  let differentPixels = 0;
  for (let offset = 0; offset < clean.length; offset += 3) {
    if (
      clean[offset] !== watermarked[offset] ||
      clean[offset + 1] !== watermarked[offset + 1] ||
      clean[offset + 2] !== watermarked[offset + 2]
    ) {
      differentPixels += 1;
    }
  }
  assert.ok(differentPixels > 10_000);
});

test("generator는 커밋된 fixture를 결정적으로 재생성한다", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "wordscan-fixtures-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  await generateFixtures(temporary);

  for (const name of [
    "two-up-clean.png",
    "two-up-watermarked.png",
    "synthetic-two-up.docx",
    "expected.md",
    "fixture-manifest.json",
  ]) {
    const expected = await readFile(path.join(COMMITTED_FIXTURES, name));
    const actual = await readFile(path.join(temporary, name));
    assert.equal(sha256(actual), sha256(expected), `${name} hash mismatch`);
  }
});

test("기대 Markdown은 병합 셀과 표 옆 본문의 순서를 명시한다", async () => {
  const expected = await readFile(path.join(COMMITTED_FIXTURES, "expected.md"), "utf8");
  assert.match(expected, /rowspan="2"/);
  assert.match(expected, /colspan="2"/);
  assert.ok(expected.indexOf("설비 점검 현황") < expected.indexOf("운영 요약"));
  assert.match(expected, /TABLE-SIDE-TEXT/);
});
