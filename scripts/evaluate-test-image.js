import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { evaluateFixture } from "../src/fixture-evaluator.js";

const root = process.cwd();
const actualPath = path.resolve(
  process.argv[2] ?? path.join(root, "output/synthetic-image/two-up-watermarked.md"),
);
const expectedPath = path.resolve(
  process.argv[3] ?? path.join(root, "test/fixtures/generated/expected.md"),
);
const manifestPath = path.resolve(
  process.argv[4] ?? path.join(root, "test/fixtures/generated/fixture-manifest.json"),
);
const reportPath = path.resolve(
  process.argv[5] ?? path.join(root, "output/synthetic-image/evaluation.json"),
);

try {
  const [actualMarkdown, expectedMarkdown, manifestSource] = await Promise.all([
    readFile(actualPath, "utf8"),
    readFile(expectedPath, "utf8"),
    readFile(manifestPath, "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);
  const report = {
    schemaVersion: 1,
    evaluatedAt: new Date().toISOString(),
    files: {
      actual: path.relative(root, actualPath),
      expected: path.relative(root, expectedPath),
      fixtureManifest: path.relative(root, manifestPath),
    },
    ...evaluateFixture({
      actualMarkdown,
      expectedMarkdown,
      watermarkText: manifest.watermark?.text,
    }),
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 2;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
