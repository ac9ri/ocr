import { WordscanError } from "./errors.js";

const PRESETS = {
  off: null,
  conservative: {
    minimumTone: 150,
    maximumTone: 205,
    chromaTolerance: 18,
    strength: 1,
  },
  strong: {
    minimumTone: 125,
    maximumTone: 190,
    chromaTolerance: 30,
    strength: 1,
  },
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value) {
  const normalized = clamp01(value);
  return normalized * normalized * (3 - 2 * normalized);
}

export class WatermarkSuppressor {
  constructor({ mode = "conservative", ...overrides } = {}) {
    if (!(mode in PRESETS)) {
      throw new WordscanError(
        "IMAGE_INVALID_WATERMARK_MODE",
        `지원하지 않는 watermark mode입니다: ${mode}`,
      );
    }
    this.mode = mode;
    this.settings = PRESETS[mode] ? { ...PRESETS[mode], ...overrides } : null;
  }

  apply(image) {
    const output = image.clone();
    if (this.settings === null) {
      return output;
    }

    const {
      minimumTone,
      maximumTone,
      chromaTolerance,
      strength,
    } = this.settings;
    const toneRange = Math.max(1, maximumTone - minimumTone);

    for (let offset = 0; offset < output.data.length; offset += 3) {
      const red = output.data[offset];
      const green = output.data[offset + 1];
      const blue = output.data[offset + 2];
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

      if (maximum - minimum > chromaTolerance || luminance <= minimumTone) {
        continue;
      }

      const tonePosition = (luminance - minimumTone) / toneRange;
      const lift = smoothstep(tonePosition) * strength;
      output.data[offset] = Math.round(red + (255 - red) * lift);
      output.data[offset + 1] = Math.round(green + (255 - green) * lift);
      output.data[offset + 2] = Math.round(blue + (255 - blue) * lift);
    }
    return output;
  }
}
