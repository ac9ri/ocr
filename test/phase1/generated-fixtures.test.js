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

const COMMITTED_FIXTURES = path.resolve("test", "fixtures", "generated");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

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

test("워터마크는 각 페이지 상단·하단에 있고 가운데에는 없다", async () => {
  const cleanResult = await sharp(path.join(COMMITTED_FIXTURES, "two-up-clean.png"))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const watermarkedResult = await sharp(
    path.join(COMMITTED_FIXTURES, "two-up-watermarked.png"),
  )
    .raw()
    .toBuffer({ resolveWithObject: true });
  const clean = cleanResult.data;
  const watermarked = watermarkedResult.data;
  const channels = cleanResult.info.channels;
  assert.equal(watermarkedResult.info.channels, channels);

  function countDifferentPixels(startY, endY) {
    let count = 0;
    for (let y = startY; y < endY; y += 1) {
      for (let x = 0; x < FIXTURE_WIDTH; x += 1) {
        const offset = (y * FIXTURE_WIDTH + x) * channels;
        if (
          clean[offset] !== watermarked[offset] ||
          clean[offset + 1] !== watermarked[offset + 1] ||
          clean[offset + 2] !== watermarked[offset + 2]
        ) {
          count += 1;
        }
      }
    }
    return count;
  }

  assert.ok(countDifferentPixels(250, 700) > 5_000);
  assert.equal(countDifferentPixels(900, 2700), 0);
  assert.ok(countDifferentPixels(2850, 3300) > 5_000);
});

test("generator는 커밋된 fixture를 결정적으로 재생성한다", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "wordscan-fixtures-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const manifest = JSON.parse(
    await readFile(path.join(COMMITTED_FIXTURES, "fixture-manifest.json"), "utf8"),
  );
  await generateFixtures(temporary, { timestamp: manifest.generatedAt });

  for (const name of [
    "two-up-clean.png",
    "two-up-watermarked.png",
    "expected.md",
    "fixture-manifest.json",
  ]) {
    const expected = await readFile(path.join(COMMITTED_FIXTURES, name));
    const actual = await readFile(path.join(temporary, name));
    assert.equal(sha256(actual), sha256(expected), `${name} hash mismatch`);
  }
});

test("manifest는 현재시각 watermark 문구와 상·하 배치를 기록한다", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(COMMITTED_FIXTURES, "fixture-manifest.json"), "utf8"),
  );
  assert.match(
    manifest.watermark.text,
    /^SAMPLE ip \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} KST$/,
  );
  assert.deepEqual(manifest.watermark.placements, ["top", "bottom"]);
  assert.equal(manifest.watermark.timeZone, "Asia/Seoul");
});

test("기대 Markdown은 병합 셀과 표 옆 본문의 순서를 명시한다", async () => {
  const expected = await readFile(path.join(COMMITTED_FIXTURES, "expected.md"), "utf8");
  assert.match(expected, /rowspan="2"/);
  assert.match(expected, /colspan="2"/);
  assert.ok(expected.indexOf("설비 점검 현황") < expected.indexOf("운영 요약"));
  assert.match(expected, /TABLE-SIDE-TEXT/);
});
