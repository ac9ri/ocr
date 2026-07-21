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
