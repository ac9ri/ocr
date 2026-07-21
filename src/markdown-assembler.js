import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderLayoutBlocks } from "./layout-order.js";
import { postprocessMarkdown } from "./markdown-postprocessor.js";

function normalizeMarkdown(markdown) {
  return markdown.replaceAll("\r\n", "\n").trim();
}

function uniqueAssetName(fileName, usedNames) {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  let candidate = fileName;
  let sequence = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${stem}-${sequence}${extension}`;
    sequence += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function replaceReference(markdown, from, to) {
  return markdown.split(from).join(to);
}

export async function materializePage(
  result,
  pageNumber,
  outputDirectory,
) {
  let markdown = result.markdown
    ? normalizeMarkdown(result.markdown)
    : renderLayoutBlocks(result.blocks ?? []);
  markdown = postprocessMarkdown(markdown, {
    rawTextLines: result.rawTextLines,
    fallbackTextLines: result.fallbackTextLines,
    structureBlocks: result.structureBlocks,
    tableCellBoxes: result.tableCellBoxes,
    rawCoordinateScale: result.rawCoordinateScale,
    fallbackCoordinateScale: result.fallbackCoordinateScale,
  });
  const pageAssetDirectory = path.join(
    outputDirectory,
    "assets",
    `page-${String(pageNumber).padStart(4, "0")}`,
  );
  const usedNames = new Set();
  const assets = [];

  if (result.assets?.length) {
    await mkdir(pageAssetDirectory, { recursive: true });
  }
  for (const asset of result.assets ?? []) {
    const targetName = uniqueAssetName(path.basename(asset.sourcePath), usedNames);
    const targetPath = path.join(pageAssetDirectory, targetName);
    await copyFile(asset.sourcePath, targetPath);
    const markdownPath = path
      .relative(outputDirectory, targetPath)
      .split(path.sep)
      .join("/");
    markdown = replaceReference(markdown, asset.reference, markdownPath);
    assets.push(markdownPath);
  }

  return {
    markdown,
    assets,
    warnings: result.warnings ?? [],
    engine: result.engine ?? null,
  };
}

export function concatenatePages(pages) {
  return (
    pages
      .map(
        (page, index) =>
          `<!-- page: ${index + 1} -->\n\n${normalizeMarkdown(page.markdown)}`,
      )
      .join("\n\n---\n\n") + "\n"
  );
}

export async function writeMarkdownDocument(outputPath, pages) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, concatenatePages(pages), "utf8");
}
