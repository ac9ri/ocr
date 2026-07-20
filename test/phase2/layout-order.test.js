import assert from "node:assert/strict";
import test from "node:test";
import { WordscanError } from "../../src/errors.js";
import { renderLayoutBlocks, sortLayoutBlocks } from "../../src/layout-order.js";

test("표 옆 본문은 같은 시각 행에서 좌에서 우로 정렬한다", () => {
  const blocks = [
    { id: "body", type: "text", content: "표 옆 설명", bbox: [320, 60, 600, 180] },
    {
      id: "table",
      type: "table",
      markdown: "<table><tr><td>값</td></tr></table>",
      bbox: [20, 40, 300, 220],
    },
  ];

  assert.deepEqual(
    sortLayoutBlocks(blocks).map((block) => block.id),
    ["table", "body"],
  );
  assert.match(renderLayoutBlocks(blocks), /^<table>[\s\S]*표 옆 설명$/);
});

test("서로 다른 행의 block은 위에서 아래로 정렬한다", () => {
  const blocks = [
    { id: "bottom", content: "아래", bbox: [10, 200, 100, 230] },
    { id: "top", content: "위", bbox: [400, 10, 500, 40] },
  ];
  assert.deepEqual(
    sortLayoutBlocks(blocks).map((block) => block.id),
    ["top", "bottom"],
  );
});

test("OCR engine이 제공한 order가 있으면 우선한다", () => {
  const blocks = [
    { id: "visual-first", order: 2, bbox: [0, 0, 50, 20] },
    { id: "engine-first", order: 1, bbox: [0, 30, 50, 50] },
  ];
  assert.deepEqual(
    sortLayoutBlocks(blocks).map((block) => block.id),
    ["engine-first", "visual-first"],
  );
});

test("잘못된 bbox는 조용히 누락하지 않고 오류로 처리한다", () => {
  assert.throws(
    () => sortLayoutBlocks([{ content: "invalid", bbox: [0, 0, 0, 10] }]),
    (error) => error instanceof WordscanError && error.code === "OCR_INVALID_BLOCK",
  );
});
