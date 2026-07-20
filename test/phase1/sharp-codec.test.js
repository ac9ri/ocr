import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { SharpImageCodec } from "../../src/sharp-codec.js";

test("실제 PNG를 RGB raster로 decode하고 다시 PNG로 encode한다", async () => {
  const source = await sharp({
    create: {
      width: 4,
      height: 2,
      channels: 3,
      background: { r: 240, g: 240, b: 240 },
    },
  })
    .png()
    .toBuffer();
  const codec = new SharpImageCodec();

  const raster = await codec.decode(source);
  assert.equal(raster.width, 4);
  assert.equal(raster.height, 2);
  assert.equal(raster.data.length, 24);

  const encoded = await codec.encodePng(raster);
  const metadata = await sharp(encoded).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 4);
  assert.equal(metadata.height, 2);
});
