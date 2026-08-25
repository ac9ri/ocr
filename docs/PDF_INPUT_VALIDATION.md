# PDF 및 단일 페이지 Phase 10 검증

## 범위

2026-08-25에 기존 합성 2-up clean PNG의 좌우 페이지를 각각 PDF 페이지로 묶어
2페이지 검증 PDF를 만들었다. 이 PDF와 렌더 중간 파일은 `tmp/pdfs/`와 Git에서
제외된 `output/pdf/`에만 두고 저장소에는 추가하지 않았다.

## 렌더 검증

OCR 가상환경에 이미 포함된 `pypdfium2`를 사용해 PDF를 300dpi RGB PNG로
렌더링했다.

- PDF 페이지 수: 2
- 렌더 결과: `page-0001.png`, `page-0002.png`
- 각 이미지: `2540×3508`, RGB
- 시각 검토: 한글, 표 선, 병합 셀, 흐름도, 차트, 페이지 경계의 잘림·중복 없음
- 원본 PDF 페이지 순서와 PNG 파일 순서 일치

## 실제 CLI OCR 검증

```powershell
node .\src\cli.js .\tmp\pdfs\phase10-two-page.pdf `
  -o .\output\pdf\phase10-validation-retry `
  --page-layout auto `
  --watermark conservative `
  --paddle-python .\.venv-ocr\Scripts\python.exe
```

결과:

- 입력 PDF 2페이지 → 출력 Markdown 2쪽
- `sheetCount=2`, `pageCount=2`
- 각 manifest 페이지의 `pdfPageNumber`: 1, 2
- 두 페이지 모두 `pageLayout=single`, `side=single`, `splitColumn=null`
- HTML 표 2개와 페이지별 그림 asset 1개씩 생성
- 기존 2-up처럼 4쪽으로 잘못 분할되지 않음

최초 모델 초기화와 다운로드가 동시에 수행된 첫 실행에서는 Paddle 네이티브
`RuntimeError`가 한 번 발생했다. 같은 렌더 PNG의 단일 이미지 대조 실행과 모델
cache 준비 후 PDF 전체 재실행은 모두 통과했으므로 PDF 렌더/페이지 라우팅 오류는
아니었다. 제한된 사내 환경에서는 기존 안내대로 모델 cache를 미리 복사하고
본 처리 전에 한 페이지 smoke test를 권장한다.

## 자동 테스트

- PDF renderer 명령·페이지 순서·빈 결과 오류
- source loader의 PDF 위임과 renderer 누락 오류
- 세로 단일 페이지 `auto`
- 가로 단일 페이지 `single`
- PDF source의 `auto → single`
- 기존 가로 2-up 회귀
- CLI layout 옵션과 충돌 옵션 검증
