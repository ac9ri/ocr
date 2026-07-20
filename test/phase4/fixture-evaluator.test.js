import assert from "node:assert/strict";
import test from "node:test";
import {
  characterErrorRate,
  evaluateFixture,
  markdownToComparableText,
} from "../../src/fixture-evaluator.js";

const expected = `
<!-- page: 1 -->
# 월간 품질 점검 보고서
QA-2026-0720 A-01 B-07 회색 워터마크 대비
<table><tr><td colspan="2">검사 구분</td></tr><tr><td rowspan="2">A-01</td></tr></table>
<!-- page: 2 -->
# 설비 운영 현황
<table><tr><th colspan="3">설비 점검 현황</th></tr><tr><td rowspan="2">OCR-1</td><td>SCAN-2</td></tr></table>
## 운영 요약
TABLE-SIDE-TEXT
`;

test("Markdown/HTML 표시를 제외한 비교 문자열과 CER을 계산한다", () => {
  assert.equal(markdownToComparableText("# 제목\n\n<table><tr><td>값</td></tr></table>"), "제목값");
  assert.equal(characterErrorRate("가나다", "가마나"), 2 / 3);
});

test("2쪽·병합 표·읽기 순서·그림·워터마크 억제를 함께 판정한다", () => {
  const actual = `${expected}\n![그림 1](assets/page-0001/a.png)\n![그림 2](assets/page-0002/b.png)`;
  const report = evaluateFixture({
    actualMarkdown: actual,
    expectedMarkdown: expected,
    watermarkText: "SAMPLE ip 2026-07-20 18:55:15 KST",
  });

  assert.equal(report.pass, true);
  assert.equal(report.metrics.pageCount, 2);
  assert.equal(report.metrics.figureAssetCount, 2);
  assert.equal(report.criteria.tableBeforeAdjacentText, true);
});

test("워터마크 누출과 병합 셀·그림 누락을 실패로 보고한다", () => {
  const actual = `
<!-- page: 1 --> SAMPLE ip 2026-07-20 18:55:15 KST
<!-- page: 2 --> 운영 요약 설비 점검 현황
<table><tr><td>표</td></tr></table>
`;
  const report = evaluateFixture({
    actualMarkdown: actual,
    expectedMarkdown: expected,
    watermarkText: "SAMPLE ip 2026-07-20 18:55:15 KST",
  });

  assert.equal(report.pass, false);
  assert.equal(report.criteria.watermarkSuppressed, false);
  assert.equal(report.criteria.rowspanPreserved, false);
  assert.equal(report.criteria.atLeastTwoFigureAssets, false);
  assert.equal(report.criteria.tableBeforeAdjacentText, false);
});
