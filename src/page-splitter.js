import { WordscanError } from "./errors.js";

export class TwoUpPageSplitter {
  constructor({
    splitRatio = null,
    searchRatio = 0.1,
    minimumPageRatio = 0.35,
    darkThreshold = 210,
  } = {}) {
    if (splitRatio !== null && (splitRatio <= 0 || splitRatio >= 1)) {
      throw new WordscanError("IMAGE_INVALID_SPLIT_RATIO", "split ratio는 0과 1 사이여야 합니다.");
    }
    this.splitRatio = splitRatio;
    this.searchRatio = searchRatio;
    this.minimumPageRatio = minimumPageRatio;
    this.darkThreshold = darkThreshold;
  }

  findSplitColumn(image) {
    if (image.width <= image.height) {
      throw new WordscanError(
        "IMAGE_NOT_LANDSCAPE",
        `2-up 입력은 가로 이미지여야 합니다: ${image.width}x${image.height}`,
      );
    }

    if (this.splitRatio !== null) {
      return Math.round(image.width * this.splitRatio);
    }

    const center = image.width / 2;
    const radius = Math.max(1, Math.round(image.width * this.searchRatio));
    const start = Math.max(1, Math.floor(center - radius));
    const end = Math.min(image.width - 2, Math.ceil(center + radius));
    let bestColumn = Math.round(center);
    let bestScore = Number.POSITIVE_INFINITY;

    for (let x = start; x <= end; x += 1) {
      let darkPixels = 0;
      let gradient = 0;
      for (let y = 0; y < image.height; y += 1) {
        let windowLuminance = 0;
        let samples = 0;
        for (let dx = -2; dx <= 2; dx += 1) {
          const sampleX = Math.max(0, Math.min(image.width - 1, x + dx));
          windowLuminance += image.luminanceAt(sampleX, y);
          samples += 1;
        }
        if (windowLuminance / samples < this.darkThreshold) {
          darkPixels += 1;
        }
        gradient += Math.abs(image.luminanceAt(x - 1, y) - image.luminanceAt(x + 1, y));
      }
      const inkCost = darkPixels / image.height;
      const edgeCost = gradient / (image.height * 255);
      const distanceCost = Math.abs(x - center) / radius;
      const score = inkCost * 0.7 + edgeCost * 0.25 + distanceCost * 0.05;
      if (score < bestScore) {
        bestScore = score;
        bestColumn = x;
      }
    }
    return bestColumn;
  }

  split(image) {
    const splitColumn = this.findSplitColumn(image);
    const minimumWidth = image.width * this.minimumPageRatio;
    if (splitColumn < minimumWidth || image.width - splitColumn < minimumWidth) {
      throw new WordscanError(
        "IMAGE_UNSAFE_SPLIT",
        `분할 결과의 한쪽 폭이 너무 작습니다: split=${splitColumn}, width=${image.width}`,
      );
    }
    return {
      splitColumn,
      pages: [
        image.crop(0, 0, splitColumn, image.height),
        image.crop(splitColumn, 0, image.width - splitColumn, image.height),
      ],
    };
  }
}
