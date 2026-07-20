import { WordscanError } from "./errors.js";

export class RasterImage {
  constructor(width, height, data) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new WordscanError("IMAGE_INVALID_DIMENSIONS", "이미지 크기가 올바르지 않습니다.");
    }
    if (
      !ArrayBuffer.isView(data) ||
      data.BYTES_PER_ELEMENT !== 1 ||
      data.length !== width * height * 3
    ) {
      throw new WordscanError(
        "IMAGE_INVALID_BUFFER",
        `RGB buffer 크기가 올바르지 않습니다. expected=${width * height * 3}`,
      );
    }
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(data);
  }

  static solid(width, height, red = 255, green = red, blue = red) {
    const data = new Uint8ClampedArray(width * height * 3);
    for (let offset = 0; offset < data.length; offset += 3) {
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
    }
    return new RasterImage(width, height, data);
  }

  clone() {
    return new RasterImage(this.width, this.height, this.data);
  }

  offset(x, y) {
    return (y * this.width + x) * 3;
  }

  rgbAt(x, y) {
    const offset = this.offset(x, y);
    return [this.data[offset], this.data[offset + 1], this.data[offset + 2]];
  }

  setRgb(x, y, red, green = red, blue = red) {
    const offset = this.offset(x, y);
    this.data[offset] = red;
    this.data[offset + 1] = green;
    this.data[offset + 2] = blue;
  }

  luminanceAt(x, y) {
    const offset = this.offset(x, y);
    return (
      this.data[offset] * 0.2126 +
      this.data[offset + 1] * 0.7152 +
      this.data[offset + 2] * 0.0722
    );
  }

  crop(left, top, width, height) {
    if (
      !Number.isInteger(left) ||
      !Number.isInteger(top) ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      left < 0 ||
      top < 0 ||
      width <= 0 ||
      height <= 0 ||
      left + width > this.width ||
      top + height > this.height
    ) {
      throw new WordscanError("IMAGE_INVALID_CROP", "이미지 crop 범위가 올바르지 않습니다.");
    }

    const output = new Uint8ClampedArray(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      const sourceStart = this.offset(left, top + y);
      const sourceEnd = sourceStart + width * 3;
      output.set(this.data.subarray(sourceStart, sourceEnd), y * width * 3);
    }
    return new RasterImage(width, height, output);
  }
}
