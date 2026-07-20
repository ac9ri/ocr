import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { SharpImageCodec } from "../../src/sharp-codec.js";
import { WatermarkSuppressor } from "../../src/watermark-suppressor.js";

function meanAbsoluteDifference(left, right, maskLeft = null, maskRight = null) {
  let difference = 0;
  let samples = 0;
  for (let index = 0; index < left.data.length; index += 1) {
    if (
      maskLeft &&
      maskRight &&
      maskLeft.data[index] === maskRight.data[index]
    ) {
      continue;
    }
    difference += Math.abs(left.data[index] - right.data[index]);
    samples += 1;
  }
  return difference / Math.max(1, samples);
}

test("합성 회색 워터마크 억제 후 clean 이미지에 더 가까워진다", async () => {
  const fixtureDirectory = path.resolve("test", "fixtures", "generated");
  const codec = new SharpImageCodec();
  const clean = await codec.decode(
    await readFile(path.join(fixtureDirectory, "two-up-clean.png")),
  );
  const watermarked = await codec.decode(
    await readFile(path.join(fixtureDirectory, "two-up-watermarked.png")),
  );
  const suppressed = new WatermarkSuppressor({ mode: "conservative" }).apply(
    watermarked,
  );

  const before = meanAbsoluteDifference(clean, watermarked, clean, watermarked);
  const after = meanAbsoluteDifference(clean, suppressed, clean, watermarked);
  assert.ok(before > 0);
  assert.ok(after < before, `expected ${after} to be less than ${before}`);
});
