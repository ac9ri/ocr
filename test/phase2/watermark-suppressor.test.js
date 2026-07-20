import assert from "node:assert/strict";
import test from "node:test";
import { RasterImage } from "../../src/raster-image.js";
import { WatermarkSuppressor } from "../../src/watermark-suppressor.js";

test("회색 워터마크는 밝게 만들고 검은 전경은 보존한다", () => {
  const image = RasterImage.solid(3, 1);
  image.setRgb(0, 0, 25);
  image.setRgb(1, 0, 195);
  image.setRgb(2, 0, 255);

  const result = new WatermarkSuppressor({ mode: "conservative" }).apply(image);

  assert.deepEqual(result.rgbAt(0, 0), [25, 25, 25]);
  assert.ok(result.rgbAt(1, 0)[0] > 215);
  assert.deepEqual(result.rgbAt(2, 0), [255, 255, 255]);
});

test("색이 있는 그림 픽셀은 워터마크로 오인하지 않는다", () => {
  const image = RasterImage.solid(1, 1, 190, 120, 120);
  const result = new WatermarkSuppressor({ mode: "strong" }).apply(image);
  assert.deepEqual(result.rgbAt(0, 0), [190, 120, 120]);
});

test("off 모드는 동일한 내용의 복사본을 반환한다", () => {
  const image = RasterImage.solid(2, 1, 170);
  const result = new WatermarkSuppressor({ mode: "off" }).apply(image);
  assert.notEqual(result, image);
  assert.deepEqual([...result.data], [...image.data]);
});

test("strong 모드는 conservative보다 중간 회색을 더 약화한다", () => {
  const image = RasterImage.solid(1, 1, 180);
  const conservative = new WatermarkSuppressor({ mode: "conservative" }).apply(image);
  const strong = new WatermarkSuppressor({ mode: "strong" }).apply(image);
  assert.ok(strong.rgbAt(0, 0)[0] > conservative.rgbAt(0, 0)[0]);
});
