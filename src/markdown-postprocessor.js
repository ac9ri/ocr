function decodeEntities(value) {
  const entities = new Map([
    ["amp", "&"],
    ["lt", "<"],
    ["gt", ">"],
    ["quot", '"'],
    ["apos", "'"],
    ["nbsp", " "],
  ]);
  return value.replace(/&([a-z]+);/gi, (match, entity) =>
    entities.get(entity.toLowerCase()) ?? match,
  );
}

function cellText(cellHtml) {
  return decodeEntities(cellHtml)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function modalCellCount(rows) {
  const frequencies = new Map();
  for (const row of rows) {
    const count = row.cells.length;
    frequencies.set(count, (frequencies.get(count) ?? 0) + 1);
  }
  return [...frequencies.entries()].sort(
    ([leftCount, leftFrequency], [rightCount, rightFrequency]) =>
      rightFrequency - leftFrequency || leftCount - rightCount,
  )[0]?.[0] ?? 0;
}

function formatAdjacentText(text) {
  return text
    .replace(/\s+(?=\d+(?:\.\d+)+\s)/g, "\n\n")
    .replace(/\s+(?=\d+\))/g, "\n\n")
    .trim();
}

function repairTable(tableHtml) {
  const rows = [...tableHtml.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(
    (match) => ({
      html: match[0],
      cells: [...match[0].matchAll(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi)],
    }),
  );
  if (rows.length < 3) return { html: tableHtml, extracted: [] };

  const expectedCells = modalCellCount(rows);
  const extracted = [];
  let repaired = tableHtml;

  for (const row of rows) {
    if (row.cells.length !== expectedCells + 1) continue;
    const rowHasLongRowspan = row.cells.some((cell) => {
      const attributes = cell[0].match(/^<t[dh]\b([^>]*)>/i)?.[1] ?? "";
      return Number(attributes.match(/\browspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1) >= 3;
    });
    if (!rowHasLongRowspan) continue;

    const candidate = row.cells.find((cell) => {
      const text = cellText(cell[0]);
      const numberedMarkers = text.match(/(?:^|\s)\d+\)\s*/g) ?? [];
      return text.length >= 60 && numberedMarkers.length >= 2;
    });
    if (!candidate) continue;
    const text = cellText(candidate[0]);

    const repairedRow = row.html.replace(candidate[0], "");
    repaired = repaired.replace(row.html, repairedRow);
    extracted.push(formatAdjacentText(text));
  }

  return { html: repaired, extracted };
}

function extractAdjacentTextFromTables(markdown) {
  const tableBlock = /(<div\b[^>]*>\s*<html><body>\s*)?(<table\b[\s\S]*?<\/table>)(\s*<\/body><\/html>\s*<\/div>)?/gi;
  return markdown.replace(
    tableBlock,
    (full, prefix = "", table = "", suffix = "") => {
      const repaired = repairTable(table);
      if (repaired.extracted.length === 0) return full;
      return `${prefix}${repaired.html}${suffix}\n\n${repaired.extracted.join("\n\n")}`;
    },
  );
}

function scaledRawLines(rawTextLines, scale) {
  const divisor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return (rawTextLines ?? []).map((line) => ({
    ...line,
    box: Array.isArray(line?.box)
      ? line.box.map((coordinate) => coordinate / divisor)
      : line?.box,
  }));
}

function lineCenterInside(line, bbox, tolerance = 4) {
  if (!Array.isArray(line?.box) || line.box.length !== 4) return false;
  const centerX = (line.box[0] + line.box[2]) / 2;
  const centerY = (line.box[1] + line.box[3]) / 2;
  return (
    centerX >= bbox[0] - tolerance &&
    centerX <= bbox[2] + tolerance &&
    centerY >= bbox[1] - tolerance &&
    centerY <= bbox[3] + tolerance
  );
}

function eligibleStructureBlock(block, excludedLabels) {
  return !(
    excludedLabels.has(block?.label) ||
    typeof block?.content !== "string" ||
    !Array.isArray(block?.bbox) ||
    block.bbox.length !== 4 ||
    /<(?:table|img)\b/i.test(block.content)
  );
}

function prefixMatches(left, right, prefixLength = 8) {
  const leftNormalized = normalizedText(left);
  const rightNormalized = normalizedText(right);
  if (leftNormalized.length < prefixLength || rightNormalized.length < prefixLength) {
    return false;
  }
  return (
    leftNormalized.slice(0, prefixLength) ===
    rightNormalized.slice(0, prefixLength)
  );
}

function alignRawLineCoordinates(rawTextLines, structureBlocks, excludedLabels) {
  const lines = [...rawTextLines].sort(
    (left, right) => left.box[1] - right.box[1] || left.box[0] - right.box[0],
  );
  const blocks = (structureBlocks ?? [])
    .filter((block) => eligibleStructureBlock(block, excludedLabels))
    .sort((left, right) => left.bbox[1] - right.bbox[1] || left.bbox[0] - right.bbox[0]);
  const anchors = [];
  let rawStart = 0;
  for (const block of blocks) {
    for (let index = rawStart; index < lines.length; index += 1) {
      if (!prefixMatches(block.content, lines[index].text)) continue;
      anchors.push({ rawY: lines[index].box[1], structureY: block.bbox[1] });
      rawStart = index + 1;
      break;
    }
  }
  if (anchors.length === 0) return lines;

  function mappedY(rawY) {
    let left = anchors[0];
    let right = anchors[1] ?? anchors[0];
    for (let index = 1; index < anchors.length; index += 1) {
      if (rawY <= anchors[index].rawY) {
        left = anchors[index - 1];
        right = anchors[index];
        break;
      }
      left = anchors[index - 1];
      right = anchors[index];
    }
    const rawRange = right.rawY - left.rawY;
    if (Math.abs(rawRange) < 0.001) return rawY + left.structureY - left.rawY;
    const position = (rawY - left.rawY) / rawRange;
    return left.structureY + position * (right.structureY - left.structureY);
  }

  return lines.map((line) => {
    const centerY = (line.box[1] + line.box[3]) / 2;
    const alignedCenterY = mappedY(centerY);
    const offsetY = alignedCenterY - centerY;
    return {
      ...line,
      box: [line.box[0], line.box[1] + offsetY, line.box[2], line.box[3] + offsetY],
    };
  });
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function candidateSimilarity(left, right) {
  const leftNormalized = normalizedText(left);
  const rightNormalized = normalizedText(right);
  const longest = Math.max(leftNormalized.length, rightNormalized.length);
  if (longest === 0) return 0;
  return 1 - editDistance(leftNormalized, rightNormalized) / longest;
}

function replacementForBlock(lines, block) {
  return lines
    .filter((line) => lineCenterInside(line, block.bbox))
    .sort((left, right) => left.box[1] - right.box[1] || left.box[0] - right.box[0])
    .map((line) => line.text?.trim())
    .filter(Boolean)
    .join(" ");
}

function chooseReplacement(primary, fallback) {
  if (!primary) return fallback;
  if (!fallback) return primary;
  const primaryLength = normalizedText(primary).length;
  const fallbackLength = normalizedText(fallback).length;
  if (
    fallbackLength >= primaryLength * 0.75 &&
    candidateSimilarity(primary, fallback) >= 0.72
  ) {
    const measurement = /\b(\d{1,3})\s*(k?V|m?A|W|Hz|%|°C|℃)/giu;
    const primaryMeasurements = [...primary.matchAll(measurement)];
    const fallbackMeasurements = [...fallback.matchAll(measurement)];
    if (primaryMeasurements.length === fallbackMeasurements.length) {
      let merged = primary;
      for (let index = primaryMeasurements.length - 1; index >= 0; index -= 1) {
        const primaryMatch = primaryMeasurements[index];
        const fallbackMatch = fallbackMeasurements[index];
        if (primaryMatch[2].toLowerCase() !== fallbackMatch[2].toLowerCase()) continue;
        merged =
          merged.slice(0, primaryMatch.index) +
          fallbackMatch[0] +
          merged.slice(primaryMatch.index + primaryMatch[0].length);
      }
      return merged;
    }
  }
  return primary;
}

function correctConsensusAsciiTokens(source, primary, fallback) {
  if (!primary || !fallback) return source;
  const tokenPattern = /\b[A-Za-z]{2,}\b/g;
  const primaryTokens = [...primary.matchAll(tokenPattern)].map((match) => match[0]);
  const fallbackTokens = new Set(
    [...fallback.matchAll(tokenPattern)].map((match) => match[0].toLowerCase()),
  );
  const consensus = primaryTokens.filter((token) =>
    fallbackTokens.has(token.toLowerCase()),
  );
  return source.replace(tokenPattern, (token) => {
    const replacement = consensus.find(
      (candidate) =>
        candidate.length >= token.length &&
        editDistance(token.toLowerCase(), candidate.toLowerCase()) === 1,
    );
    return replacement ?? token;
  });
}

function replaceStructureTextBlocks(
  markdown,
  rawTextLines,
  structureBlocks,
  fallbackTextLines = [],
) {
  let recovered = markdown;
  const excludedLabels = new Set([
    "table",
    "image",
    "figure",
    "chart",
    "seal",
    "formula",
    "number",
  ]);
  const alignedRawLines = alignRawLineCoordinates(
    rawTextLines,
    structureBlocks,
    excludedLabels,
  );
  const alignedFallbackLines = alignRawLineCoordinates(
    fallbackTextLines,
    structureBlocks,
    excludedLabels,
  );

  for (const block of structureBlocks ?? []) {
    if (!eligibleStructureBlock(block, excludedLabels)) continue;
    const source = block.content.trim();
    const sourceIndex = recovered.indexOf(source);
    if (!source || sourceIndex < 0) continue;

    const primaryCandidate = replacementForBlock(alignedRawLines, block);
    const fallbackCandidate = replacementForBlock(alignedFallbackLines, block);
    const sourceNumber = numberedMarker(source);
    const primaryNumber = numberedMarker(primaryCandidate);
    const isNote = /^(?:※\s*)?note\b/i.test(source);
    const isBroken =
      normalizedText(source).length < 12 ||
      (primaryNumber !== null && primaryNumber !== sourceNumber);
    let replacement;
    if (!isNote && !isBroken) {
      replacement = correctConsensusAsciiTokens(
        source,
        primaryCandidate,
        fallbackCandidate,
      );
      if (replacement === source) continue;
    } else {
      replacement = isNote && fallbackCandidate
        ? fallbackCandidate
        : chooseReplacement(primaryCandidate, fallbackCandidate);
    }
    const sourceNormalized = normalizedText(source);
    const replacementNormalized = normalizedText(replacement);
    if (
      replacementNormalized.length < 4 ||
      replacementNormalized.length < sourceNormalized.length * 0.45 ||
      replacementNormalized === sourceNormalized
    ) {
      continue;
    }
    recovered =
      recovered.slice(0, sourceIndex) +
      replacement +
      recovered.slice(sourceIndex + source.length);
  }
  return recovered;
}

function escapeParenthesizedOrderedMarkers(markdown) {
  return markdown
    .split(/(<table\b[\s\S]*?<\/table>)/gi)
    .map((section) => {
      if (/^<table\b/i.test(section)) return section;
      return section.replace(
        /(^|\n)([\t ]{0,3})(\d{1,3})\)[\t ]*/g,
        "$1$2$3\\) ",
      );
    })
    .join("");
}

function numberedMarker(text) {
  const match = text.trim().match(/^(\d{1,3})\)\s*/);
  return match ? Number(match[1]) : null;
}

function markdownMarkerNumbers(markdown) {
  return new Set(
    [...markdown.matchAll(/\b(\d{1,3})\s*\\?\)/g)].map((match) => Number(match[1])),
  );
}

function numberedParagraphs(rawTextLines) {
  const lines = (rawTextLines ?? [])
    .filter(
      (line) =>
        typeof line?.text === "string" &&
        Array.isArray(line.box) &&
        line.box.length === 4 &&
        line.box.every(Number.isFinite),
    )
    .map((line) => ({ text: line.text.trim(), box: line.box }))
    .filter((line) => line.text)
    .sort((left, right) => left.box[1] - right.box[1] || left.box[0] - right.box[0]);
  const starts = lines
    .map((line, index) => ({ line, index, number: numberedMarker(line.text) }))
    .filter((entry) => entry.number !== null);
  if (starts.length < 3) return [];

  return starts.map((start, startIndex) => {
    const nextStartIndex = starts[startIndex + 1]?.index ?? lines.length;
    const parts = [start.line.text];
    let lastBottom = start.line.box[3];
    for (let index = start.index + 1; index < nextStartIndex; index += 1) {
      const line = lines[index];
      const verticalGap = line.box[1] - lastBottom;
      if (verticalGap > 90) break;
      if (Math.abs(line.box[0] - start.line.box[0]) > 100) continue;
      parts.push(line.text);
      lastBottom = Math.max(lastBottom, line.box[3]);
    }
    return { number: start.number, text: parts.join(" ") };
  });
}

function markerLineIndex(markdown, number) {
  const pattern = new RegExp(
    `(^|\\n)[\\t ]{0,3}${number}\\s*\\\\?\\)[\\t ]*`,
    "m",
  );
  return pattern.exec(markdown)?.index ?? -1;
}

function normalizedText(value) {
  return [...value.toLowerCase()]
    .filter((character) => /[0-9a-z가-힣]/u.test(character))
    .join("");
}

function normalizedPrefixIndex(markdown, text, prefixLength = 12) {
  const target = normalizedText(text).slice(0, prefixLength);
  if (target.length < prefixLength) return -1;
  let normalizedMarkdown = "";
  const sourceIndexes = [];
  for (let index = 0; index < markdown.length; index += 1) {
    const normalized = normalizedText(markdown[index]);
    if (!normalized) continue;
    normalizedMarkdown += normalized;
    sourceIndexes.push(index);
  }
  const normalizedIndex = normalizedMarkdown.indexOf(target);
  return normalizedIndex < 0 ? -1 : sourceIndexes[normalizedIndex];
}

function recoverMissingNotes(markdown, rawTextLines) {
  const lines = (rawTextLines ?? [])
    .filter((line) => typeof line?.text === "string" && Array.isArray(line.box))
    .map((line) => ({ ...line, text: line.text.trim() }))
    .filter((line) => line.text)
    .sort((left, right) => left.box[1] - right.box[1] || left.box[0] - right.box[0]);
  let recovered = markdown;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^(?:※\s*)?note\b/i.test(line.text)) continue;
    if (normalizedPrefixIndex(recovered, line.text) >= 0) continue;

    let insertionIndex = -1;
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      insertionIndex = normalizedPrefixIndex(recovered, lines[nextIndex].text);
      if (insertionIndex >= 0) break;
    }
    if (insertionIndex < 0) continue;
    recovered = `${recovered.slice(0, insertionIndex)}${line.text}\n\n${recovered.slice(insertionIndex)}`;
  }
  return recovered;
}

function recoverMissingNumberedParagraphs(markdown, rawTextLines) {
  const paragraphs = numberedParagraphs(rawTextLines);
  const present = markdownMarkerNumbers(markdown);
  let recovered = markdown;

  for (const paragraph of paragraphs) {
    if (present.has(paragraph.number)) continue;
    const normalized = paragraph.text.replace(
      /^\s*(\d{1,3})\)\s*/,
      (_, number) => `${number}\\) `,
    );
    const next = [...present]
      .filter((number) => number > paragraph.number)
      .sort((left, right) => left - right)
      .find((number) => markerLineIndex(recovered, number) >= 0);
    const insertionIndex = next === undefined ? -1 : markerLineIndex(recovered, next);
    recovered =
      insertionIndex >= 0
        ? `${recovered.slice(0, insertionIndex)}${normalized}\n\n${recovered.slice(insertionIndex)}`
        : `${recovered.trimEnd()}\n\n${normalized}`;
    present.add(paragraph.number);
  }
  return recovered;
}

export function postprocessMarkdown(
  markdown,
  {
    rawTextLines = [],
    fallbackTextLines = [],
    structureBlocks = [],
    rawCoordinateScale = 1,
    fallbackCoordinateScale = 1,
  } = {},
) {
  const normalizedRawLines = scaledRawLines(rawTextLines, rawCoordinateScale);
  const normalizedFallbackLines = scaledRawLines(
    fallbackTextLines,
    fallbackCoordinateScale,
  );
  const textRecovered = replaceStructureTextBlocks(
    markdown,
    normalizedRawLines,
    structureBlocks,
    normalizedFallbackLines,
  );
  return recoverMissingNumberedParagraphs(
    recoverMissingNotes(
      escapeParenthesizedOrderedMarkers(extractAdjacentTextFromTables(textRecovered)),
      normalizedRawLines,
    ),
    normalizedRawLines,
  );
}
