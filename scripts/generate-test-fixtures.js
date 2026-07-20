#!/usr/bin/env node

import { deflateRawSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const FIXTURE_WIDTH = 5080;
export const FIXTURE_HEIGHT = 3508;
export const PAGE_WIDTH = 2480;
export const GUTTER_WIDTH = 120;

const FONT_FAMILY = "'Malgun Gothic', 'Noto Sans CJK KR', Arial, sans-serif";

export function formatFixtureTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`올바르지 않은 fixture timestamp입니다: ${value}`);
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} KST`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function text(x, y, value, {
  size = 42,
  fill = "#172033",
  weight = 400,
  anchor = "start",
  letterSpacing = 0,
} = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${escapeXml(value)}</text>`;
}

function lines(x, y, values, {
  size = 42,
  gap = 62,
  fill = "#283548",
  weight = 400,
} = {}) {
  return values
    .map((value, index) => text(x, y + index * gap, value, { size, fill, weight }))
    .join("");
}

function cell(x, y, width, height, value, {
  fill = "#ffffff",
  stroke = "#3e4a5d",
  size = 34,
  weight = 400,
  align = "middle",
} = {}) {
  const textX =
    align === "start" ? x + 18 : align === "end" ? x + width - 18 : x + width / 2;
  const anchor = align === "start" ? "start" : align === "end" ? "end" : "middle";
  const textY = y + height / 2 + size * 0.36;
  return [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="${stroke}" stroke-width="4"/>`,
    text(textX, textY, value, { size, weight, anchor }),
  ].join("");
}

function leftTable(originX) {
  const x = originX + 150;
  const y = 650;
  const columns = [270, 620, 560, 700];
  const row = 116;
  return [
    cell(x, y, columns[0] + columns[1], row, "검사 구분", {
      fill: "#dce8f5",
      weight: 700,
    }),
    cell(x + columns[0] + columns[1], y, columns[2], row, "측정값", {
      fill: "#dce8f5",
      weight: 700,
    }),
    cell(x + columns[0] + columns[1] + columns[2], y, columns[3], row, "판정", {
      fill: "#dce8f5",
      weight: 700,
    }),

    cell(x, y + row, columns[0], row, "코드", { fill: "#eef3f8", weight: 700 }),
    cell(x + columns[0], y + row, columns[1], row, "항목", {
      fill: "#eef3f8",
      weight: 700,
    }),
    cell(x + columns[0] + columns[1], y + row, columns[2], row, "결과", {
      fill: "#eef3f8",
      weight: 700,
    }),
    cell(x + columns[0] + columns[1] + columns[2], y + row, columns[3], row, "상태", {
      fill: "#eef3f8",
      weight: 700,
    }),

    cell(x, y + row * 2, columns[0], row * 2, "A-01", { fill: "#f7f9fb", weight: 700 }),
    cell(x + columns[0], y + row * 2, columns[1], row, "인쇄 상태"),
    cell(x + columns[0] + columns[1], y + row * 2, columns[2], row, "98.7%"),
    cell(
      x + columns[0] + columns[1] + columns[2],
      y + row * 2,
      columns[3],
      row,
      "정상",
      { fill: "#e7f4ea", weight: 700 },
    ),
    cell(x + columns[0], y + row * 3, columns[1], row, "표 경계 검출"),
    cell(x + columns[0] + columns[1], y + row * 3, columns[2], row, "12 / 12"),
    cell(
      x + columns[0] + columns[1] + columns[2],
      y + row * 3,
      columns[3],
      row,
      "정상",
      { fill: "#e7f4ea", weight: 700 },
    ),

    cell(x, y + row * 4, columns[0], row, "B-07", { fill: "#f7f9fb", weight: 700 }),
    cell(x + columns[0], y + row * 4, columns[1] + columns[2], row, "회색 워터마크 대비"),
    cell(
      x + columns[0] + columns[1] + columns[2],
      y + row * 4,
      columns[3],
      row,
      "확인 필요",
      { fill: "#fff3cd", weight: 700 },
    ),
  ].join("");
}

function rightTable(originX) {
  const x = originX + 140;
  const y = 610;
  const columns = [270, 380, 500];
  const row = 124;
  return [
    cell(x, y, columns[0] + columns[1] + columns[2], row, "설비 점검 현황", {
      fill: "#dce8f5",
      weight: 700,
    }),
    cell(x, y + row, columns[0], row, "설비", { fill: "#eef3f8", weight: 700 }),
    cell(x + columns[0], y + row, columns[1], row, "횟수", {
      fill: "#eef3f8",
      weight: 700,
    }),
    cell(x + columns[0] + columns[1], y + row, columns[2], row, "비고", {
      fill: "#eef3f8",
      weight: 700,
    }),
    cell(x, y + row * 2, columns[0], row * 2, "OCR-1", { fill: "#f7f9fb", weight: 700 }),
    cell(x + columns[0], y + row * 2, columns[1], row, "24"),
    cell(x + columns[0] + columns[1], y + row * 2, columns[2], row, "정기 점검"),
    cell(x + columns[0], y + row * 3, columns[1], row, "3"),
    cell(x + columns[0] + columns[1], y + row * 3, columns[2], row, "재처리"),
    cell(x, y + row * 4, columns[0], row, "SCAN-2", { fill: "#f7f9fb", weight: 700 }),
    cell(x + columns[0], y + row * 4, columns[1], row, "7"),
    cell(x + columns[0] + columns[1], y + row * 4, columns[2], row, "정상"),
  ].join("");
}

function flowDiagram(originX) {
  const y = 1900;
  const boxes = [
    { x: originX + 180, label: "DOCX 입력", fill: "#dbeafe" },
    { x: originX + 790, label: "2-up 분할", fill: "#dcfce7" },
    { x: originX + 1400, label: "OCR 분석", fill: "#fef3c7" },
    { x: originX + 2010, label: "Markdown", fill: "#f3e8ff" },
  ];
  const fragments = [
    text(originX + 150, y - 100, "처리 흐름도", { size: 48, weight: 700 }),
  ];
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index];
    fragments.push(
      `<rect x="${box.x}" y="${y}" width="400" height="180" rx="24" fill="${box.fill}" stroke="#42526b" stroke-width="5"/>`,
      text(box.x + 200, y + 108, box.label, { size: 38, weight: 700, anchor: "middle" }),
    );
    if (index < boxes.length - 1) {
      const next = boxes[index + 1];
      fragments.push(
        `<line x1="${box.x + 410}" y1="${y + 90}" x2="${next.x - 30}" y2="${y + 90}" stroke="#56657a" stroke-width="10"/>`,
        `<polygon points="${next.x - 30},${y + 65} ${next.x},${y + 90} ${next.x - 30},${y + 115}" fill="#56657a"/>`,
      );
    }
  }
  fragments.push(
    lines(
      originX + 180,
      2260,
      [
        "그림 1. 문서 이미지가 구조화된 Markdown으로 변환되는 단계",
        "Figure ID: FLOW-2026-07 · 색상 도형과 화살표 추출 여부 확인",
      ],
      { size: 36, gap: 58, fill: "#4b5563" },
    ),
  );
  return fragments.join("");
}

function barChart(originX) {
  const x = originX + 220;
  const y = 2000;
  const chartWidth = 2040;
  const chartHeight = 850;
  const bars = [
    { label: "본문", value: 91, color: "#2563eb" },
    { label: "표", value: 84, color: "#16a34a" },
    { label: "그림", value: 76, color: "#d97706" },
    { label: "병합 셀", value: 69, color: "#7c3aed" },
  ];
  const fragments = [
    text(x, y - 110, "요소별 인식 목표 (%)", { size: 48, weight: 700 }),
    `<line x1="${x + 130}" y1="${y + chartHeight}" x2="${x + chartWidth}" y2="${y + chartHeight}" stroke="#4b5563" stroke-width="5"/>`,
    `<line x1="${x + 130}" y1="${y}" x2="${x + 130}" y2="${y + chartHeight}" stroke="#4b5563" stroke-width="5"/>`,
  ];
  for (let tick = 0; tick <= 100; tick += 20) {
    const tickY = y + chartHeight - (tick / 100) * chartHeight;
    fragments.push(
      `<line x1="${x + 120}" y1="${tickY}" x2="${x + chartWidth}" y2="${tickY}" stroke="#d8dee8" stroke-width="3"/>`,
      text(x + 95, tickY + 12, String(tick), { size: 30, fill: "#64748b", anchor: "end" }),
    );
  }
  bars.forEach((bar, index) => {
    const barX = x + 260 + index * 430;
    const barHeight = (bar.value / 100) * chartHeight;
    fragments.push(
      `<rect x="${barX}" y="${y + chartHeight - barHeight}" width="240" height="${barHeight}" rx="12" fill="${bar.color}"/>`,
      text(barX + 120, y + chartHeight - barHeight - 28, `${bar.value}%`, {
        size: 34,
        weight: 700,
        anchor: "middle",
      }),
      text(barX + 120, y + chartHeight + 60, bar.label, {
        size: 32,
        weight: 600,
        anchor: "middle",
      }),
    );
  });
  return fragments.join("");
}

function watermark(originX, watermarkText) {
  const centerX = originX + PAGE_WIDTH / 2;
  return [
    { y: 470, rotation: -7 },
    { y: 3100, rotation: 7 },
  ]
    .map(
      ({ y, rotation }) =>
        `<g transform="translate(${centerX} ${y}) rotate(${rotation})" opacity="0.28">` +
        text(0, 0, watermarkText, {
          size: 66,
          fill: "#707070",
          weight: 700,
          anchor: "middle",
          letterSpacing: 3,
        }) +
        "</g>",
    )
    .join("");
}

function pageOne(originX) {
  return [
    `<g>`,
    `<rect x="${originX + 110}" y="105" width="18" height="170" rx="9" fill="#2563eb"/>`,
    text(originX + 160, 180, "월간 품질 점검 보고서", { size: 72, weight: 700 }),
    text(originX + 160, 250, "OCR Quality Review · 2026년 7월", {
      size: 34,
      fill: "#64748b",
      weight: 600,
    }),
    `<line x1="${originX + 150}" y1="300" x2="${originX + 2330}" y2="300" stroke="#d6dde8" stroke-width="4"/>`,
    lines(
      originX + 160,
      390,
      [
        "문서 번호: QA-2026-0720   담당 부서: 디지털 아카이브팀",
        "목적: 한글·English·숫자 12345 및 특수기호 (A/B, 98.7%) 인식 확인",
        "검증 범위에는 표, 병합 셀, 회색 워터마크와 그림이 포함됩니다.",
      ],
      { size: 39, gap: 68 },
    ),
    leftTable(originX),
    flowDiagram(originX),
    `<rect x="${originX + 150}" y="2570" width="2180" height="360" rx="20" fill="#f5f7fa" stroke="#cfd7e3" stroke-width="4"/>`,
    text(originX + 195, 2645, "검토 메모", { size: 42, weight: 700, fill: "#1f3a5f" }),
    lines(
      originX + 195,
      2720,
      [
        "검은 본문과 표 선은 워터마크 억제 후에도 유지되어야 합니다.",
        "병합된 A-01 셀과 ‘검사 구분’ 머리글 구조를 확인합니다.",
        "Expected keyword: 품질 / OCR / Markdown / 정상 / 확인 필요",
      ],
      { size: 36, gap: 58 },
    ),
    text(originX + 160, 3390, "WORDSCAN OCR · SYNTHETIC FIXTURE", {
      size: 28,
      fill: "#7a8595",
      weight: 600,
    }),
    text(originX + 2320, 3390, "1", {
      size: 30,
      fill: "#7a8595",
      weight: 700,
      anchor: "end",
    }),
    `</g>`,
  ].join("");
}

function pageTwo(originX) {
  return [
    `<g>`,
    `<rect x="${originX + 110}" y="105" width="18" height="170" rx="9" fill="#0f766e"/>`,
    text(originX + 160, 180, "설비 운영 현황", { size: 72, weight: 700 }),
    text(originX + 160, 250, "표 옆 본문 및 그림 배치 시험", {
      size: 34,
      fill: "#64748b",
      weight: 600,
    }),
    `<line x1="${originX + 150}" y1="300" x2="${originX + 2330}" y2="300" stroke="#d6dde8" stroke-width="4"/>`,
    lines(
      originX + 160,
      390,
      [
        "스캔 장비 ID: SCAN-2   해상도: 300 dpi   상태: RUNNING",
        "왼쪽 표와 오른쪽 설명의 읽기 순서를 함께 검증합니다.",
      ],
      { size: 39, gap: 68 },
    ),
    rightTable(originX),
    `<rect x="${originX + 1370}" y="610" width="960" height="740" rx="20" fill="#f8fafc" stroke="#cbd5e1" stroke-width="4"/>`,
    text(originX + 1420, 690, "운영 요약", { size: 48, weight: 700, fill: "#134e4a" }),
    lines(
      originX + 1420,
      780,
      [
        "표 오른쪽에 바로 이어지는 본문입니다.",
        "읽기 순서는 표 → 운영 요약이어야 합니다.",
        "OCR-1 장비는 총 27회 처리했습니다.",
        "재처리 건수는 3회이며 오류율은 1.2%입니다.",
        "영문 키워드: TABLE-SIDE-TEXT",
        "연락처(가상): qa@example.test",
      ],
      { size: 35, gap: 75 },
    ),
    `<rect x="${originX + 1370}" y="1400" width="960" height="310" rx="20" fill="#ecfdf5" stroke="#86bfa5" stroke-width="4"/>`,
    text(originX + 1420, 1480, "판정 기준", { size: 42, weight: 700, fill: "#166534" }),
    lines(
      originX + 1420,
      1560,
      [
        "• 표의 병합 구조가 HTML로 유지될 것",
        "• 오른쪽 설명 문단이 누락되지 않을 것",
        "• 아래 차트가 그림 asset으로 추출될 것",
      ],
      { size: 33, gap: 65 },
    ),
    barChart(originX),
    text(originX + 160, 3390, "WORDSCAN OCR · SYNTHETIC FIXTURE", {
      size: 28,
      fill: "#7a8595",
      weight: 600,
    }),
    text(originX + 2320, 3390, "2", {
      size: 30,
      fill: "#7a8595",
      weight: 700,
      anchor: "end",
    }),
    `</g>`,
  ].join("");
}

export function buildFixtureSvg({
  withWatermark = true,
  watermarkText = `SAMPLE ip ${formatFixtureTimestamp()}`,
} = {}) {
  const rightOrigin = PAGE_WIDTH + GUTTER_WIDTH;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FIXTURE_WIDTH}" height="${FIXTURE_HEIGHT}" viewBox="0 0 ${FIXTURE_WIDTH} ${FIXTURE_HEIGHT}">`,
    `<style>text { font-family: ${FONT_FAMILY}; }</style>`,
    `<rect width="${FIXTURE_WIDTH}" height="${FIXTURE_HEIGHT}" fill="#e5e7eb"/>`,
    `<rect x="0" y="0" width="${PAGE_WIDTH}" height="${FIXTURE_HEIGHT}" fill="#ffffff" stroke="#c7ced8" stroke-width="5"/>`,
    `<rect x="${rightOrigin}" y="0" width="${PAGE_WIDTH}" height="${FIXTURE_HEIGHT}" fill="#ffffff" stroke="#c7ced8" stroke-width="5"/>`,
    `<rect x="${PAGE_WIDTH}" y="0" width="${GUTTER_WIDTH}" height="${FIXTURE_HEIGHT}" fill="#f2f4f7"/>`,
    withWatermark ? watermark(0, watermarkText) : "",
    withWatermark ? watermark(rightOrigin, watermarkText) : "",
    pageOne(0),
    pageTwo(rightOrigin),
    `</svg>`,
  ].join("");
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;
  const dosTime = 0;
  const dosDate = (46 << 9) | (1 << 5) | 1;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localRecords.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralRecords.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localRecords, centralDirectory, end]);
}

function drawingXml(relationshipId, imageName, drawingId) {
  const widthEmu = 14_844_000;
  const heightEmu = Math.round((widthEmu * FIXTURE_HEIGHT) / FIXTURE_WIDTH);
  return `<w:p>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>
    <w:r><w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="${drawingId}" name="${imageName}" descr="Synthetic two-up OCR test scan"/>
        <wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr>
                <pic:cNvPr id="${drawingId}" name="${imageName}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="${relationshipId}"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing></w:r>
  </w:p>`;
}

export function buildFixtureDocx(imageBuffer) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${drawingXml("rId1", "two-up-watermarked.png", 1)}
    <w:sectPr>
      <w:pgSz w:w="23811" w:h="16838" w:orient="landscape"/>
      <w:pgMar w:top="216" w:right="216" w:bottom="216" w:left="216" w:header="0" w:footer="0" w:gutter="0"/>
      <w:cols w:space="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  const entries = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    { name: "word/document.xml", data: documentXml },
    {
      name: "word/_rels/document.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/two-up-watermarked.png"/>
</Relationships>`,
    },
    { name: "word/media/two-up-watermarked.png", data: imageBuffer },
    {
      name: "docProps/core.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties
  xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>WordScan OCR Synthetic Two-up Fixture</dc:title>
  <dc:subject>OCR test fixture with tables, figures, adjacent text and watermark</dc:subject>
  <dc:creator>WordScan OCR Fixture Generator</dc:creator>
  <cp:lastModifiedBy>WordScan OCR Fixture Generator</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-07-20T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-07-20T00:00:00Z</dcterms:modified>
</cp:coreProperties>`,
    },
    {
      name: "docProps/app.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>WordScan OCR Fixture Generator</Application>
  <Pages>1</Pages>
  <Words>0</Words>
</Properties>`,
    },
  ];
  return buildZip(entries);
}

export const EXPECTED_MARKDOWN = `<!-- page: 1 -->

# 월간 품질 점검 보고서

OCR Quality Review · 2026년 7월

문서 번호: QA-2026-0720
담당 부서: 디지털 아카이브팀

목적: 한글·English·숫자 12345 및 특수기호 (A/B, 98.7%) 인식 확인

검증 범위에는 표, 병합 셀, 회색 워터마크와 그림이 포함됩니다.

<table>
  <tr><th colspan="2">검사 구분</th><th>측정값</th><th>판정</th></tr>
  <tr><th>코드</th><th>항목</th><th>결과</th><th>상태</th></tr>
  <tr><td rowspan="2">A-01</td><td>인쇄 상태</td><td>98.7%</td><td>정상</td></tr>
  <tr><td>표 경계 검출</td><td>12 / 12</td><td>정상</td></tr>
  <tr><td>B-07</td><td colspan="2">회색 워터마크 대비</td><td>확인 필요</td></tr>
</table>

## 처리 흐름도

그림 1. 문서 이미지가 구조화된 Markdown으로 변환되는 단계
Figure ID: FLOW-2026-07 · 색상 도형과 화살표 추출 여부 확인

## 검토 메모

검은 본문과 표 선은 워터마크 억제 후에도 유지되어야 합니다.
병합된 A-01 셀과 ‘검사 구분’ 머리글 구조를 확인합니다.
Expected keyword: 품질 / OCR / Markdown / 정상 / 확인 필요

---

<!-- page: 2 -->

# 설비 운영 현황

표 옆 본문 및 그림 배치 시험

스캔 장비 ID: SCAN-2   해상도: 300 dpi   상태: RUNNING
왼쪽 표와 오른쪽 설명의 읽기 순서를 함께 검증합니다.

<table>
  <tr><th colspan="3">설비 점검 현황</th></tr>
  <tr><th>설비</th><th>횟수</th><th>비고</th></tr>
  <tr><td rowspan="2">OCR-1</td><td>24</td><td>정기 점검</td></tr>
  <tr><td>3</td><td>재처리</td></tr>
  <tr><td>SCAN-2</td><td>7</td><td>정상</td></tr>
</table>

## 운영 요약

표 오른쪽에 바로 이어지는 본문입니다. 읽기 순서는 표 → 운영 요약이어야 합니다.
OCR-1 장비는 총 27회 처리했습니다. 재처리 건수는 3회이며 오류율은 1.2%입니다.

영문 키워드: TABLE-SIDE-TEXT
연락처(가상): qa@example.test

## 판정 기준

- 표의 병합 구조가 HTML로 유지될 것
- 오른쪽 설명 문단이 누락되지 않을 것
- 아래 차트가 그림 asset으로 추출될 것

## 요소별 인식 목표 (%)
`;

export async function generateFixtures(outputDirectory, { timestamp = new Date() } = {}) {
  const absoluteOutput = path.resolve(outputDirectory);
  await mkdir(absoluteOutput, { recursive: true });
  const fontCacheDirectory = path.join(os.tmpdir(), "wordscan-fontconfig-cache");
  await mkdir(fontCacheDirectory, { recursive: true });
  const fontConfigPath = path.join(fontCacheDirectory, "fonts.conf");
  await writeFile(
    fontConfigPath,
    `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>C:/Windows/Fonts</dir><cachedir>${escapeXml(fontCacheDirectory.replaceAll("\\", "/"))}</cachedir></fontconfig>`,
    "utf8",
  );
  process.env.FONTCONFIG_FILE = fontConfigPath;
  process.env.XDG_CACHE_HOME = fontCacheDirectory;
  process.env.LOCALAPPDATA = fontCacheDirectory;
  process.env.HOME = fontCacheDirectory;
  const sharp = (await import("sharp")).default;
  const timestampDate = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(timestampDate.getTime())) {
    throw new TypeError(`올바르지 않은 fixture timestamp입니다: ${timestamp}`);
  }
  const generatedAt = timestampDate.toISOString();
  const watermarkText = `SAMPLE ip ${formatFixtureTimestamp(timestampDate)}`;
  const cleanSvg = buildFixtureSvg({ withWatermark: false });
  const watermarkSvg = buildFixtureSvg({ withWatermark: true, watermarkText });
  const cleanPng = await sharp(Buffer.from(cleanSvg))
    .png({ compressionLevel: 9 })
    .withMetadata({ density: 300 })
    .toBuffer();
  const watermarkedPng = await sharp(Buffer.from(watermarkSvg))
    .png({ compressionLevel: 9 })
    .withMetadata({ density: 300 })
    .toBuffer();
  const docx = buildFixtureDocx(watermarkedPng);
  const manifest = {
    schemaVersion: 1,
    generatedBy: "scripts/generate-test-fixtures.js",
    generatedAt,
    dimensions: {
      width: FIXTURE_WIDTH,
      height: FIXTURE_HEIGHT,
      pageWidth: PAGE_WIDTH,
      gutterWidth: GUTTER_WIDTH,
      densityDpi: 300,
    },
    files: {
      cleanImage: "two-up-clean.png",
      watermarkedImage: "two-up-watermarked.png",
      wordDocument: "synthetic-two-up.docx",
      expectedMarkdown: "expected.md",
    },
    coverage: [
      "two-up-landscape",
      "korean-english-numbers",
      "table",
      "rowspan",
      "colspan",
      "table-adjacent-text",
      "figures",
      "gray-watermark",
    ],
    watermark: {
      text: watermarkText,
      placements: ["top", "bottom"],
      timeZone: "Asia/Seoul",
    },
  };

  await Promise.all([
    writeFile(path.join(absoluteOutput, "two-up-clean.png"), cleanPng),
    writeFile(path.join(absoluteOutput, "two-up-watermarked.png"), watermarkedPng),
    writeFile(path.join(absoluteOutput, "synthetic-two-up.docx"), docx),
    writeFile(path.join(absoluteOutput, "expected.md"), EXPECTED_MARKDOWN, "utf8"),
    writeFile(
      path.join(absoluteOutput, "fixture-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    ),
  ]);
  return { outputDirectory: absoluteOutput, manifest };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const outputDirectory =
    process.argv[2] ?? path.join("test", "fixtures", "generated");
  const timestamp = process.env.WORDSCAN_FIXTURE_TIMESTAMP ?? new Date();
  const result = await generateFixtures(outputDirectory, { timestamp });
  process.stdout.write(`Generated OCR fixtures: ${result.outputDirectory}\n`);
}
