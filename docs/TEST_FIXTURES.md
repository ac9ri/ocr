# OCR 테스트 이미지·문서 직접 제작

## 권장 방식

실제 개인정보가 없는 합성 스캔을 코드로 생성한다. 편집 가능한 Word 표나 본문을
직접 테스트 DOCX에 넣으면 이미지 추출 경로를 시험하지 못하므로, 다음 2단계를
분리한다.

1. 표·본문·그림·워터마크를 포함한 가로 PNG를 만든다.
2. 완성된 PNG 하나만 Word 문서에 삽입해 DOCX로 저장한다.

이 저장소의 generator는 같은 결과를 반복 생성한다.

```powershell
npm install
npm run fixtures:generate
```

생성 위치:

```text
test/fixtures/generated/
├── two-up-clean.png
├── two-up-watermarked.png
├── synthetic-two-up.docx
├── expected.md
└── fixture-manifest.json
```

## Fixture 구성

- 해상도: `5080×3508`, 300dpi metadata
- 왼쪽/오른쪽 원문 폭: 각 2480px
- 중앙 gutter: 120px
- 한국어·영어·숫자·특수기호
- `rowspan`과 `colspan`에 해당하는 병합 표
- 표 바로 오른쪽의 본문
- 흐름도와 막대 차트
- 회색 대각선 `SAMPLE / 테스트 문서` 워터마크

`synthetic-two-up.docx`에는 `two-up-watermarked.png` 한 장만 들어 있다. 따라서
Word의 텍스트 layer가 아니라 DOCX 이미지 추출부터 실제 OCR까지 전체 pipeline을
시험한다.

## 수동 제작 방법

PowerPoint, Word 또는 그래픽 편집기에서도 다음 순서로 만들 수 있다.

1. A3 가로 또는 A4 세로 2장을 나란히 놓은 canvas를 만든다.
2. 중앙에 5~10mm의 빈 gutter를 둔다.
3. 왼쪽 페이지에는 일반 본문과 행/열 병합 표를 배치한다.
4. 오른쪽 페이지에는 왼쪽 절반에 표, 오른쪽 절반에 설명 문단을 배치한다.
5. 색상 도형, 사진 또는 차트를 한 개 이상 넣는다.
6. 회색 워터마크를 본문 뒤에 15~25% opacity로 배치한다.
7. 전체 canvas를 300dpi PNG로 rasterize한다.
8. 새 Word 문서에 PNG만 삽입하고 `.docx`로 저장한다.
9. 사람이 읽은 정답을 `expected.md`로 별도 작성한다.

Word 문서에서 글자나 표를 마우스로 선택할 수 있다면 스캔 이미지 fixture가 아니다.
반드시 최종 PNG 한 장만 선택 가능해야 한다.

## 실제 OCR 실행

PaddleOCR가 설치된 환경:

```powershell
npm exec wordscan-ocr -- `
  .\test\fixtures\generated\synthetic-two-up.docx `
  -o .\output\synthetic
```

결과를 `expected.md`와 비교한다. OCR 결과는 모델과 장치에 따라 미세하게 달라질 수
있으므로 전체 문자열 일치보다 다음 기준을 권장한다.

- 본문: 문자 오류율(CER)
- 표: 병합 셀과 행/열 구조
- 읽기 순서: 표가 `운영 요약`보다 먼저 나오는지
- 그림: page별 asset 존재 여부
- 워터마크: `SAMPLE`, `테스트 문서`가 본문으로 오인되지 않는지

합성 fixture는 기능 회귀에 적합하지만 실제 스캐너의 기울기, 압축 노이즈, 종이
질감까지 대표하지 않는다. 최종 인수에는 익명화한 실제 문서 골든셋도 필요하다.
