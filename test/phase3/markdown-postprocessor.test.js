import assert from "node:assert/strict";
import test from "node:test";
import { postprocessMarkdown } from "../../src/markdown-postprocessor.js";

test("괄호형 순서 표시는 Markdown 렌더링 뒤에도 괄호를 보존한다", () => {
  const markdown = "1) 첫 번째\n2)두 번째\n\n<table><tr><td>3) 셀</td></tr></table>";
  const result = postprocessMarkdown(markdown);

  assert.match(result, /^1\\\) 첫 번째/m);
  assert.match(result, /^2\\\) 두 번째/m);
  assert.match(result, /<td>3\) 셀<\/td>/);
});

test("표 오른쪽 번호 본문으로 오인된 긴 rowspan 셀을 표 밖으로 이동한다", () => {
  const markdown = `
<div style="text-align: center;"><html><body><table border="1">
<tr><td>A</td><td>B</td><td>C</td><td>D</td><td rowspan="4">3. 용어 3.1 설명 1) 첫 번째 정의가 충분히 길게 이어지는 문장입니다 2) 두 번째 정의도 별도 본문으로 이어집니다</td></tr>
<tr><td>A1</td><td>B1</td><td>C1</td><td>D1</td></tr>
<tr><td>A2</td><td>B2</td><td>C2</td><td>D2</td></tr>
<tr><td>A3</td><td>B3</td><td>C3</td><td>D3</td></tr>
</table></body></html></div>
`;
  const result = postprocessMarkdown(markdown);

  const table = result.match(/<table[\s\S]*?<\/table>/i)?.[0] ?? "";
  assert.doesNotMatch(table, /rowspan="4"/);
  assert.doesNotMatch(table, /첫 번째 정의/);
  assert.match(result, /3\. 용어/);
  assert.match(result, /^1\\\) 첫 번째 정의/m);
  assert.match(result, /^2\\\) 두 번째 정의/m);
});

test("표 인접 본문의 같은 줄에 분리된 소제목을 원문 OCR 좌표로 복구한다", () => {
  const markdown = `<table>
<tr><td>A</td><td>B</td><td>C</td><td>D</td><td rowspan="4">3. 용어 정의 3.1 I8 1) 첫 번째 정의가 충분히 길게 이어지는 문장입니다 2) 두 번째 정의도 별도 본문으로 이어집니다</td></tr>
<tr><td>A1</td><td>B1</td><td>C1</td><td>D1</td></tr>
<tr><td>A2</td><td>B2</td><td>C2</td><td>D2</td></tr>
<tr><td>A3</td><td>B3</td><td>C3</td><td>D3</td></tr>
</table>`;
  const result = postprocessMarkdown(markdown, {
    rawCoordinateScale: 2,
    tableCellBoxes: [
      [20, 20, 180, 65],
      [190, 20, 400, 65],
      [20, 70, 180, 115],
      [190, 70, 400, 115],
      [700, 35, 890, 390],
    ],
    rawTextLines: [
      { text: "실제 표 데이터", box: [100, 100, 600, 140] },
      { text: "3. 용어 정의", box: [1_400, 200, 1_720, 260] },
      { text: "3.1", box: [1_400, 300, 1_490, 350] },
      { text: "용어", box: [1_560, 296, 1_670, 354] },
      { text: "1) 첫 번째 정의가", box: [1_400, 440, 1_730, 490] },
      { text: "충분히 길게 이어지는 문장입니다", box: [1_400, 510, 1_770, 560] },
      { text: "2) 두 번째 정의도 별도 본문으로 이어집니다", box: [1_400, 760, 1_770, 810] },
    ],
  });

  const table = result.match(/<table[\s\S]*?<\/table>/i)?.[0] ?? "";
  assert.doesNotMatch(table, /첫 번째 정의/);
  assert.doesNotMatch(result, /I8/);
  assert.match(result, /^3\.1 용어$/m);
  assert.match(result, /^1\\\) 첫 번째 정의가 충분히 길게 이어지는 문장입니다$/m);
  assert.match(result, /^2\\\) 두 번째 정의도 별도 본문으로 이어집니다$/m);
  assert.equal((result.match(/실제 표 데이터/g) ?? []).length, 0);
});

test("일반적인 rowspan 표 셀은 이동하지 않는다", () => {
  const markdown =
    '<table><tr><td rowspan="3">정상 병합 셀</td><td>A</td></tr>' +
    "<tr><td>B</td></tr><tr><td>C</td></tr></table>";
  assert.equal(postprocessMarkdown(markdown), markdown);
});

test("빈 rowspan 옆의 본문 셀도 표 밖으로 이동한다", () => {
  const markdown = `<table>
<tr><td></td><td>3. 용어 정의 1)첫 번째 설명이 충분히 길게 이어지는 표 오른쪽 본문입니다 2)두 번째 설명 역시 본문에 속하며 표 데이터가 아닙니다</td><td>표 데이터</td><td></td><td rowspan="5"></td></tr>
<tr><td>A1</td><td>B1</td><td>C1</td><td>D1</td></tr>
<tr><td>A2</td><td>B2</td><td>C2</td><td>D2</td></tr>
<tr><td>A3</td><td>B3</td><td>C3</td><td>D3</td></tr>
</table>`;
  const result = postprocessMarkdown(markdown);
  const table = result.match(/<table[\s\S]*?<\/table>/i)?.[0] ?? "";

  assert.doesNotMatch(table, /첫 번째 설명/);
  assert.match(table, /표 데이터/);
  assert.match(result, /^1\\\) 첫 번째 설명/m);
  assert.match(result, /^2\\\) 두 번째 설명/m);
});

test("구조 Markdown에서 빠진 번호 문단만 원문 OCR 좌표 순서로 복구한다", () => {
  const markdown = "3) 세 번째\n\n6) 여섯 번째\n\n8) 여덟 번째";
  const rawTextLines = [
    { text: "3) 세 번째", box: [100, 100, 700, 140] },
    { text: "4) 네 번째", box: [100, 160, 700, 200] },
    { text: "5) 다섯 번째 첫 줄", box: [100, 220, 700, 260] },
    { text: "다섯 번째 이어지는 줄", box: [140, 270, 700, 310] },
    { text: "6) 여섯 번째", box: [100, 330, 700, 370] },
    { text: "8) 여덟 번째", box: [100, 450, 700, 490] },
  ];

  const result = postprocessMarkdown(markdown, { rawTextLines });

  assert.match(result, /^4\\\) 네 번째/m);
  assert.match(result, /^5\\\) 다섯 번째 첫 줄 다섯 번째 이어지는 줄/m);
  assert.ok(result.indexOf("5\\) 다섯") < result.indexOf("6\\) 여섯"));
  assert.equal((result.match(/3\\\)/g) ?? []).length, 1);
});

test("구조 Markdown에서 빠진 Note 줄을 다음 인식 줄 앞에 복구한다", () => {
  const markdown = "앞 문단\n\n48 V 전원을 사용하는 다음 문장";
  const rawTextLines = [
    { text: "※ Note.24 V 전원에 대한 긴 참조 문장입니다", box: [100, 100, 800, 140] },
    { text: "48 V 전원을 사용하는 다음 문장", box: [100, 160, 800, 200] },
  ];

  const result = postprocessMarkdown(markdown, { rawTextLines });

  assert.match(result, /※ Note\.24 V 전원/);
  assert.ok(result.indexOf("※ Note") < result.indexOf("48 V"));
});

test("같은 좌표의 깨진 일반 문장을 확대 OCR 문장으로 교체한다", () => {
  const markdown = "앞 문단\n\n|&ㅋ ㄷ()|| 극 <7(S\n\n뒤 문단";
  const rawTextLines = [
    {
      text: "5) 워터마크와 겹쳐도 복구되어야 하는 일반 문장",
      box: [200, 400, 1_600, 480],
    },
  ];
  const structureBlocks = [
    {
      label: "text",
      content: "|&ㅋ ㄷ()|| 극 <7(S",
      bbox: [90, 190, 810, 250],
    },
  ];

  const result = postprocessMarkdown(markdown, {
    rawTextLines,
    structureBlocks,
    rawCoordinateScale: 2,
  });

  assert.doesNotMatch(result, /\|&ㅋ/);
  assert.match(result, /^5\\\) 워터마크와 겹쳐도 복구/m);
});

test("표 block은 일반 텍스트 교체 대상에서 제외한다", () => {
  const markdown = "<table><tr><td>표 원문</td></tr></table>";
  const result = postprocessMarkdown(markdown, {
    rawTextLines: [{ text: "중복 표 텍스트", box: [10, 10, 100, 30] }],
    structureBlocks: [
      { label: "table", content: markdown, bbox: [0, 0, 120, 40] },
    ],
  });
  assert.equal(result, markdown);
});

test("두 OCR 문장이 거의 같으면 보존형 후보로 이진화 문자 오류를 교정한다", () => {
  const markdown = "aT---";
  const structureBlocks = [
    { label: "text", content: "aT---", bbox: [100, 100, 900, 150] },
  ];
  const result = postprocessMarkdown(markdown, {
    rawTextLines: [
      { text: "50V 초과 고전압을 사용하는 부품", box: [200, 200, 1_600, 280] },
    ],
    fallbackTextLines: [
      { text: "60V 초과 고전압을 사유하는 부품", box: [100, 100, 800, 140] },
    ],
    structureBlocks,
    rawCoordinateScale: 2,
  });

  assert.equal(result, "60V 초과 고전압을 사용하는 부품");
});

test("정상 구조 문장은 보조 OCR 오타로 덮어쓰지 않는다", () => {
  const markdown = "6) 전원 Of 상태이며 외부와 통신이 연결된 상태";
  const result = postprocessMarkdown(markdown, {
    rawTextLines: [
      { text: "6) 전원 Off 상태이며 외부와 통신이 면결된 상태", box: [100, 100, 800, 140] },
    ],
    fallbackTextLines: [
      { text: "6) 전원 Off 상태이며 외부와 통신이 연결된 상태", box: [100, 100, 800, 140] },
    ],
    structureBlocks: [
      { label: "text", content: markdown, bbox: [100, 100, 800, 140] },
    ],
  });

  assert.equal(result, "6\\) 전원 Off 상태이며 외부와 통신이 연결된 상태");
});
