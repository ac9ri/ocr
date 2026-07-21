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

export function postprocessMarkdown(markdown, { rawTextLines = [] } = {}) {
  return recoverMissingNumberedParagraphs(
    recoverMissingNotes(
      escapeParenthesizedOrderedMarkers(extractAdjacentTextFromTables(markdown)),
      rawTextLines,
    ),
    rawTextLines,
  );
}
