function localHeader(name, data) {
  const nameBuffer = Buffer.from(name, "utf8");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  return Buffer.concat([header, nameBuffer, data]);
}

function centralHeader(name, data, localOffset) {
  const nameBuffer = Buffer.from(name, "utf8");
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(data.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt32LE(localOffset, 42);
  return Buffer.concat([header, nameBuffer]);
}

export function storedZip(entries) {
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  for (const [name, value] of entries) {
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
    const local = localHeader(name, data);
    locals.push(local);
    centrals.push(centralHeader(name, data, localOffset));
    localOffset += local.length;
  }

  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...locals, central, end]);
}

export function docxFixture(imageOrder = ["rId2", "rId1"]) {
  const documentXml = `
    <w:document xmlns:w="w" xmlns:a="a" xmlns:r="r">
      <w:body>
        ${imageOrder.map((id) => `<a:blip r:embed="${id}"/>`).join("\n")}
      </w:body>
    </w:document>`;
  const relsXml = `
    <Relationships>
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/first.png"/>
      <Relationship Target="media/second.png" Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/>
    </Relationships>`;
  return storedZip([
    ["word/document.xml", documentXml],
    ["word/_rels/document.xml.rels", relsXml],
    ["word/media/first.png", Buffer.from("FIRST")],
    ["word/media/second.png", Buffer.from("SECOND")],
  ]);
}
