const REQUIRED_MARKERS = [
  "월간 품질 점검 보고서",
  "QA-2026-0720",
  "A-01",
  "B-07",
  "회색 워터마크 대비",
  "설비 운영 현황",
  "설비 점검 현황",
  "OCR-1",
  "SCAN-2",
  "운영 요약",
  "TABLE-SIDE-TEXT",
];

function decodeHtmlEntities(value) {
  const entities = new Map([
    ["amp", "&"],
    ["lt", "<"],
    ["gt", ">"],
    ["quot", '"'],
    ["apos", "'"],
    ["nbsp", " "],
  ]);
  return value.replace(/&([a-z]+);/gi, (match, entity) => entities.get(entity.toLowerCase()) ?? match);
}

export function markdownToComparableText(markdown) {
  return decodeHtmlEntities(markdown)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[([^\]]*)]\([^)]*\)/g, " $1 ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, " $1 ")
    .replace(/<\/(?:td|th)>/gi, " ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/^[\t ]{0,3}(?:#{1,6}|[-*+]|\d+\.)[\t ]+/gm, "")
    .replace(/[*_`~>|]/g, " ")
    .normalize("NFKC")
    .replace(/\s+/g, "");
}

export function characterErrorRate(expected, actual) {
  if (expected.length === 0) return actual.length === 0 ? 0 : 1;
  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);

  for (let expectedIndex = 1; expectedIndex <= expected.length; expectedIndex += 1) {
    const current = [expectedIndex];
    for (let actualIndex = 1; actualIndex <= actual.length; actualIndex += 1) {
      const substitutionCost =
        expected[expectedIndex - 1] === actual[actualIndex - 1] ? 0 : 1;
      current[actualIndex] = Math.min(
        previous[actualIndex] + 1,
        current[actualIndex - 1] + 1,
        previous[actualIndex - 1] + substitutionCost,
      );
    }
    previous = current;
  }

  return previous[actual.length] / expected.length;
}

function imageReferences(markdown) {
  return [
    ...markdown.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g),
    ...markdown.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi),
  ].map((match) => match[2] ?? match[1]);
}

function mergedCellContains(markdown, attribute, expectedText) {
  const attributePattern = new RegExp(`\\b${attribute}\\s*=\\s*["']?[2-9]`, "i");
  const comparableExpected = markdownToComparableText(expectedText);
  return [...markdown.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].some(
    (match) =>
      attributePattern.test(match[1]) &&
      markdownToComparableText(match[2]).includes(comparableExpected),
  );
}

export function evaluateFixture({
  actualMarkdown,
  expectedMarkdown,
  watermarkText = "",
}) {
  const actualText = markdownToComparableText(actualMarkdown);
  const expectedText = markdownToComparableText(expectedMarkdown);
  const matchedMarkers = REQUIRED_MARKERS.filter((marker) =>
    actualText.includes(markdownToComparableText(marker)),
  );
  const pageCount = [...actualMarkdown.matchAll(/<!--\s*page:\s*\d+\s*-->/gi)].length;
  const tableCount = [...actualMarkdown.matchAll(/<table\b/gi)].length;
  const assets = imageReferences(actualMarkdown);
  const tableIndex = actualText.indexOf(markdownToComparableText("설비 점검 현황"));
  const summaryIndex = actualText.indexOf(markdownToComparableText("운영 요약"));
  const watermarkCandidates = ["SAMPLE", watermarkText].filter(Boolean);
  const leakedWatermarks = watermarkCandidates.filter((candidate) =>
    actualText.toLowerCase().includes(markdownToComparableText(candidate).toLowerCase()),
  );
  const cer = characterErrorRate(expectedText, actualText);

  const criteria = {
    twoPages: pageCount === 2,
    textCerAtMost25Percent: cer <= 0.25,
    requiredMarkerRecallAtLeast80Percent:
      matchedMarkers.length / REQUIRED_MARKERS.length >= 0.8,
    twoTables: tableCount >= 2,
    rowspanPreserved:
      mergedCellContains(actualMarkdown, "rowspan", "A-01") &&
      mergedCellContains(actualMarkdown, "rowspan", "OCR-1"),
    colspanPreserved:
      mergedCellContains(actualMarkdown, "colspan", "검사 구분") &&
      mergedCellContains(actualMarkdown, "colspan", "설비 점검 현황"),
    tableBeforeAdjacentText:
      tableIndex >= 0 && summaryIndex >= 0 && tableIndex < summaryIndex,
    atLeastTwoFigureAssets: assets.length >= 2,
    watermarkSuppressed: leakedWatermarks.length === 0,
  };

  return {
    pass: Object.values(criteria).every(Boolean),
    criteria,
    metrics: {
      characterErrorRate: Number(cer.toFixed(4)),
      requiredMarkerRecall: Number(
        (matchedMarkers.length / REQUIRED_MARKERS.length).toFixed(4),
      ),
      matchedMarkers,
      missingMarkers: REQUIRED_MARKERS.filter((marker) => !matchedMarkers.includes(marker)),
      pageCount,
      tableCount,
      figureAssetCount: assets.length,
      figureAssets: assets,
      leakedWatermarks,
    },
  };
}
