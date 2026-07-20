import assert from "node:assert/strict";
import test from "node:test";
import { WordscanError } from "../../src/errors.js";
import { extractDocxImages } from "../../src/source-loader.js";
import { docxFixture, storedZip } from "../helpers/zip-fixture.js";

test("DOCX 이미지를 본문 관계 순서대로 추출한다", () => {
  const images = extractDocxImages(docxFixture(["rId2", "rId1"]), "scan.docx");

  assert.deepEqual(
    images.map((image) => image.name),
    ["second.png", "first.png"],
  );
  assert.deepEqual(
    images.map((image) => image.buffer.toString()),
    ["SECOND", "FIRST"],
  );
});

test("같은 이미지가 본문에 두 번 배치되면 두 장으로 처리한다", () => {
  const images = extractDocxImages(docxFixture(["rId1", "rId1"]));
  assert.equal(images.length, 2);
  assert.equal(images[0].buffer.toString(), "FIRST");
  assert.equal(images[1].buffer.toString(), "FIRST");
});

test("이미지가 없는 DOCX는 구체적인 오류 코드를 반환한다", () => {
  const empty = storedZip([
    ["word/document.xml", "<w:document/>"],
    ["word/_rels/document.xml.rels", "<Relationships/>"],
  ]);
  assert.throws(
    () => extractDocxImages(empty),
    (error) => error instanceof WordscanError && error.code === "INPUT_NO_IMAGES",
  );
});

test("손상된 ZIP 입력을 거부한다", () => {
  assert.throws(
    () => extractDocxImages(Buffer.from("not-a-zip")),
    (error) => error instanceof WordscanError && error.code === "INPUT_INVALID_ZIP",
  );
});
