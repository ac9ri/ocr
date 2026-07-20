import { WordscanError } from "./errors.js";

function validatedBox(block) {
  const box = block.bbox;
  if (
    !Array.isArray(box) ||
    box.length !== 4 ||
    !box.every(Number.isFinite) ||
    box[2] <= box[0] ||
    box[3] <= box[1]
  ) {
    throw new WordscanError(
      "OCR_INVALID_BLOCK",
      `layout block bbox가 올바르지 않습니다: ${JSON.stringify(box)}`,
    );
  }
  return box;
}

function verticalOverlapRatio(leftBox, rightBox) {
  const overlap = Math.max(
    0,
    Math.min(leftBox[3], rightBox[3]) - Math.max(leftBox[1], rightBox[1]),
  );
  const shorterHeight = Math.min(leftBox[3] - leftBox[1], rightBox[3] - rightBox[1]);
  return overlap / shorterHeight;
}

export function sortLayoutBlocks(blocks, { rowOverlapRatio = 0.3 } = {}) {
  const decorated = blocks.map((block, index) => ({
    block,
    box: validatedBox(block),
    index,
  }));

  decorated.sort((left, right) => {
    if (Number.isFinite(left.block.order) && Number.isFinite(right.block.order)) {
      return left.block.order - right.block.order || left.index - right.index;
    }

    const sameVisualRow = verticalOverlapRatio(left.box, right.box) >= rowOverlapRatio;
    if (sameVisualRow && left.box[0] !== right.box[0]) {
      return left.box[0] - right.box[0];
    }
    if (left.box[1] !== right.box[1]) {
      return left.box[1] - right.box[1];
    }
    if (left.box[0] !== right.box[0]) {
      return left.box[0] - right.box[0];
    }
    return left.index - right.index;
  });

  return decorated.map(({ block }) => block);
}

function blockMarkdown(block) {
  if (block.markdown) {
    return block.markdown.trim();
  }
  if (block.type === "figure" && block.assetPath) {
    const alternative = block.alt?.trim() || "추출 이미지";
    return `![${alternative}](${block.assetPath})`;
  }
  return String(block.content ?? "").trim();
}

export function renderLayoutBlocks(blocks, options) {
  return sortLayoutBlocks(blocks, options)
    .map(blockMarkdown)
    .filter(Boolean)
    .join("\n\n");
}
