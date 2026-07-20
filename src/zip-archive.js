import { inflateRawSync } from "node:zlib";
import { WordscanError } from "./errors.js";

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const MAX_EOCD_SEARCH = 65_535 + 22;

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - MAX_EOCD_SEARCH);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }
  throw new WordscanError("INPUT_INVALID_ZIP", "ZIP 중앙 디렉터리를 찾을 수 없습니다.");
}

function safeEntryName(name) {
  const normalized = name.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => part === "..")
  ) {
    throw new WordscanError("INPUT_UNSAFE_ZIP_PATH", `안전하지 않은 ZIP 경로입니다: ${name}`);
  }
  return normalized;
}

export class ZipArchive {
  constructor(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new TypeError("ZipArchive에는 Buffer가 필요합니다.");
    }
    this.buffer = buffer;
    this.entries = this.#readCentralDirectory();
  }

  #readCentralDirectory() {
    const eocdOffset = findEndOfCentralDirectory(this.buffer);
    const entryCount = this.buffer.readUInt16LE(eocdOffset + 10);
    const centralOffset = this.buffer.readUInt32LE(eocdOffset + 16);

    if (entryCount === 0xffff || centralOffset === 0xffffffff) {
      throw new WordscanError("INPUT_UNSUPPORTED_ZIP64", "ZIP64 DOCX는 지원하지 않습니다.");
    }

    const entries = new Map();
    let offset = centralOffset;
    for (let index = 0; index < entryCount; index += 1) {
      if (
        offset + 46 > this.buffer.length ||
        this.buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_HEADER
      ) {
        throw new WordscanError(
          "INPUT_INVALID_ZIP",
          "ZIP 중앙 디렉터리 엔트리가 손상되었습니다.",
        );
      }

      const flags = this.buffer.readUInt16LE(offset + 8);
      const method = this.buffer.readUInt16LE(offset + 10);
      const compressedSize = this.buffer.readUInt32LE(offset + 20);
      const uncompressedSize = this.buffer.readUInt32LE(offset + 24);
      const fileNameLength = this.buffer.readUInt16LE(offset + 28);
      const extraLength = this.buffer.readUInt16LE(offset + 30);
      const commentLength = this.buffer.readUInt16LE(offset + 32);
      const localOffset = this.buffer.readUInt32LE(offset + 42);
      const nameStart = offset + 46;
      const nameEnd = nameStart + fileNameLength;
      const encoding = flags & 0x0800 ? "utf8" : "latin1";
      const name = safeEntryName(this.buffer.toString(encoding, nameStart, nameEnd));

      entries.set(name, {
        name,
        flags,
        method,
        compressedSize,
        uncompressedSize,
        localOffset,
      });
      offset = nameEnd + extraLength + commentLength;
    }
    return entries;
  }

  has(name) {
    return this.entries.has(name);
  }

  names() {
    return [...this.entries.keys()];
  }

  read(name) {
    const entry = this.entries.get(name);
    if (!entry) {
      throw new WordscanError("INPUT_ZIP_ENTRY_MISSING", `DOCX 항목이 없습니다: ${name}`);
    }
    if (entry.flags & 0x0001) {
      throw new WordscanError("INPUT_ENCRYPTED_ZIP", `암호화된 ZIP 항목입니다: ${name}`);
    }

    const offset = entry.localOffset;
    if (
      offset + 30 > this.buffer.length ||
      this.buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER
    ) {
      throw new WordscanError("INPUT_INVALID_ZIP", `ZIP 로컬 헤더가 손상되었습니다: ${name}`);
    }

    const fileNameLength = this.buffer.readUInt16LE(offset + 26);
    const extraLength = this.buffer.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > this.buffer.length) {
      throw new WordscanError("INPUT_INVALID_ZIP", `ZIP 데이터가 잘렸습니다: ${name}`);
    }

    const compressed = this.buffer.subarray(dataStart, dataEnd);
    let result;
    if (entry.method === 0) {
      result = Buffer.from(compressed);
    } else if (entry.method === 8) {
      result = inflateRawSync(compressed);
    } else {
      throw new WordscanError(
        "INPUT_UNSUPPORTED_ZIP_METHOD",
        `지원하지 않는 ZIP 압축 방식(${entry.method})입니다: ${name}`,
      );
    }

    if (result.length !== entry.uncompressedSize) {
      throw new WordscanError("INPUT_INVALID_ZIP", `ZIP 항목 크기가 일치하지 않습니다: ${name}`);
    }
    return result;
  }
}
