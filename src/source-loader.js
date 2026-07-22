import { readFile } from "node:fs/promises";
import path from "node:path";
import { WordscanError, asWordscanError } from "./errors.js";
import { ZipArchive } from "./zip-archive.js";

const DOCUMENT_XML = "word/document.xml";
const DOCUMENT_RELS = "word/_rels/document.xml.rels";
export const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".tif",
  ".tiff",
  ".bmp",
]);

function xmlDecode(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function parseAttributes(tag) {
  const attributes = {};
  const pattern = /([:\w.-]+)\s*=\s*(["'])(.*?)\2/gs;
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1]] = xmlDecode(match[3]);
  }
  return attributes;
}

function relationshipMap(xml) {
  const relationships = new Map();
  for (const match of xml.matchAll(/<Relationship\b[^>]*\/?>/gi)) {
    const attributes = parseAttributes(match[0]);
    if (
      attributes.Id &&
      attributes.Target &&
      attributes.Type?.toLowerCase().endsWith("/image") &&
      attributes.TargetMode?.toLowerCase() !== "external"
    ) {
      relationships.set(attributes.Id, attributes.Target);
    }
  }
  return relationships;
}

function imageRelationshipIds(documentXml) {
  const ids = [];
  const referencePattern = /\b(?:r:embed|r:id)\s*=\s*(["'])(.*?)\1/gi;
  for (const match of documentXml.matchAll(referencePattern)) {
    ids.push(xmlDecode(match[2]));
  }
  return ids;
}

function resolveWordTarget(target) {
  const normalized = path.posix.normalize(path.posix.join("word", target.replaceAll("\\", "/")));
  if (!normalized.startsWith("word/") || normalized.includes("../")) {
    throw new WordscanError(
      "INPUT_UNSAFE_RELATIONSHIP",
      `DOCX 이미지 관계 경로가 안전하지 않습니다: ${target}`,
    );
  }
  return normalized;
}

export function extractDocxImages(buffer, sourceName = "document.docx") {
  const archive = new ZipArchive(buffer);
  if (!archive.has(DOCUMENT_XML) || !archive.has(DOCUMENT_RELS)) {
    throw new WordscanError(
      "INPUT_INVALID_DOCX",
      "DOCX 본문 또는 관계 파일을 찾을 수 없습니다.",
    );
  }

  const documentXml = archive.read(DOCUMENT_XML).toString("utf8");
  const relsXml = archive.read(DOCUMENT_RELS).toString("utf8");
  const relationships = relationshipMap(relsXml);
  const references = imageRelationshipIds(documentXml);
  const sheets = [];

  for (const relationshipId of references) {
    const target = relationships.get(relationshipId);
    if (!target) {
      continue;
    }
    const entryName = resolveWordTarget(target);
    if (!archive.has(entryName)) {
      throw new WordscanError(
        "INPUT_IMAGE_MISSING",
        `DOCX가 참조한 이미지가 없습니다: ${entryName}`,
      );
    }
    sheets.push({
      name: path.posix.basename(entryName),
      sourceName,
      buffer: archive.read(entryName),
    });
  }

  if (sheets.length === 0) {
    const mediaNames = archive
      .names()
      .filter(
        (name) =>
          name.startsWith("word/media/") &&
          IMAGE_EXTENSIONS.has(path.posix.extname(name).toLowerCase()),
      )
      .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
    for (const entryName of mediaNames) {
      sheets.push({
        name: path.posix.basename(entryName),
        sourceName,
        buffer: archive.read(entryName),
      });
    }
  }

  if (sheets.length === 0) {
    throw new WordscanError("INPUT_NO_IMAGES", "DOCX에서 스캔 이미지를 찾지 못했습니다.");
  }
  return sheets;
}

export async function loadInputSources(inputPath) {
  const extension = path.extname(inputPath).toLowerCase();
  let buffer;
  try {
    buffer = await readFile(inputPath);
  } catch (error) {
    throw asWordscanError(error, "INPUT_READ_FAILED", `입력 파일을 읽을 수 없습니다: ${inputPath}`);
  }

  if (extension === ".docx") {
    return extractDocxImages(buffer, path.basename(inputPath));
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return [{ name: path.basename(inputPath), sourceName: path.basename(inputPath), buffer }];
  }
  throw new WordscanError(
    "INPUT_UNSUPPORTED_TYPE",
    `지원하지 않는 입력 형식입니다: ${extension || "(확장자 없음)"}`,
  );
}
