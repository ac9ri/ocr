import { WordscanError, asWordscanError } from "./errors.js";
import { RasterImage } from "./raster-image.js";

async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch (error) {
    throw asWordscanError(
      error,
      "IMAGE_CODEC_UNAVAILABLE",
      "이미지 처리를 위해 `npm install`로 sharp를 설치해야 합니다.",
    );
  }
}

export class SharpImageCodec {
  async decode(buffer) {
    try {
      const sharp = await loadSharp();
      const { data, info } = await sharp(buffer)
        .removeAlpha()
        .toColourspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (info.channels !== 3) {
        throw new WordscanError(
          "IMAGE_UNSUPPORTED_CHANNELS",
          `지원하지 않는 channel 수입니다: ${info.channels}`,
        );
      }
      return new RasterImage(info.width, info.height, data);
    } catch (error) {
      throw asWordscanError(error, "IMAGE_DECODE_FAILED", "스캔 이미지를 해석하지 못했습니다.");
    }
  }

  async encodePng(image) {
    try {
      const sharp = await loadSharp();
      return await sharp(Buffer.from(image.data), {
        raw: { width: image.width, height: image.height, channels: 3 },
      })
        .png()
        .toBuffer();
    } catch (error) {
      throw asWordscanError(error, "IMAGE_ENCODE_FAILED", "전처리 이미지를 저장하지 못했습니다.");
    }
  }
}
