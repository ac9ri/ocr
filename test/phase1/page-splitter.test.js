import assert from "node:assert/strict";
import test from "node:test";
import { WordscanError } from "../../src/errors.js";
import { TwoUpPageSplitter } from "../../src/page-splitter.js";
import { RasterImage } from "../../src/raster-image.js";

function syntheticTwoUp() {
  const image = RasterImage.solid(200, 80);
  for (let y = 10; y < 70; y += 8) {
    for (let x = 8; x < 88; x += 1) image.setRgb(x, y, 30);
    for (let x = 112; x < 192; x += 1) image.setRgb(x, y, 30);
  }
  return image;
}

test("중앙 여백을 찾아 좌우 페이지를 분할한다", () => {
  const splitter = new TwoUpPageSplitter();
  const result = splitter.split(syntheticTwoUp());

  assert.ok(result.splitColumn >= 95 && result.splitColumn <= 105);
  assert.equal(result.pages.length, 2);
  assert.equal(result.pages[0].width + result.pages[1].width, 200);
  assert.equal(result.pages[0].height, 80);
});

test("수동 split ratio를 정확히 적용한다", () => {
  const splitter = new TwoUpPageSplitter({ splitRatio: 0.45 });
  const result = splitter.split(syntheticTwoUp());
  assert.equal(result.splitColumn, 90);
  assert.equal(result.pages[0].width, 90);
  assert.equal(result.pages[1].width, 110);
});

test("세로 이미지를 2-up 입력으로 처리하지 않는다", () => {
  const splitter = new TwoUpPageSplitter();
  const portrait = RasterImage.solid(80, 200);
  assert.throws(
    () => splitter.split(portrait),
    (error) => error instanceof WordscanError && error.code === "IMAGE_NOT_LANDSCAPE",
  );
});

test("한쪽 페이지가 지나치게 작은 수동 분할을 거부한다", () => {
  const splitter = new TwoUpPageSplitter({ splitRatio: 0.2 });
  assert.throws(
    () => splitter.split(syntheticTwoUp()),
    (error) => error instanceof WordscanError && error.code === "IMAGE_UNSAFE_SPLIT",
  );
});
