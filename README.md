# WordScan OCR

Word 문서(`.docx`), 다중 페이지 PDF, 단일 페이지 이미지와 가로 2-up 스캔
이미지에서 표·글·그림을 추출하고 Markdown으로 저장하는 CLI입니다.

## 지원 기능

- DOCX 안의 스캔 이미지를 본문 배치 순서대로 추출
- PDF를 300dpi RGB 이미지로 렌더링하고 원래 페이지 순서대로 처리
- 세로 단일 페이지 자동 판별 및 가로 단일/2-up 명시 옵션
- 중앙 여백 자동 탐색 또는 수동 비율로 좌/우 2쪽 분할
- 회색 저대비 워터마크 약화
- 저해상도 워터마크 겹침용 다중 OCR과 표 인접 본문의 좌표 기반 행 복구
- PP-StructureV3 기반 layout, 표 구조, 그림, 읽기 순서 인식
- 한국어·영어·숫자용 `korean_PP-OCRv5_mobile_rec`
- 병합 셀의 `rowspan`/`colspan`을 HTML table로 보존
- 단일 Markdown, page별 그림 asset, 처리 manifest 생성

상세 결정과 요구사항 추적은 [설계 문서](docs/DESIGN.md), 단계별 검증은
[Phase 기록](docs/PHASES.md)을 참고하세요.
[합성 PNG 실제 OCR 검증](docs/REAL_OCR_VALIDATION.md)에는 측정 결과와 알려진
인식 한계를 기록했습니다.
[비공개 실이미지 검증](docs/PRIVATE_IMAGE_VALIDATION.md)에는 저장소에 원본을
추가하지 않고 수행한 Phase 6·7 결과를 기록했습니다.
[PDF 및 단일 페이지 검증](docs/PDF_INPUT_VALIDATION.md)에는 실제 다중 페이지
PDF 렌더링과 CPU OCR 결과를 기록했습니다.

개인정보 없는 합성 테스트 PNG/DOCX를 만드는 방법은
[테스트 fixture 제작 안내](docs/TEST_FIXTURES.md)를 참고하세요.

## 사전 요구사항

1. Node.js 20 이상
2. Python 3.11
3. `requirements-ocr.txt`에 고정된 PaddlePaddle/PaddleOCR/PaddleX 조합

PDF 렌더링은 같은 Python 환경의 `pypdfium2`를 사용하며
`requirements-ocr.txt`에 버전을 고정한다.

PaddlePaddle 설치는 CPU/GPU와 운영체제에 따라 다르므로
[공식 PaddleOCR 설치 문서](https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/installation.html)를
따르세요. CPU 실행용 Python 의존성은 다음처럼 격리 환경에 설치합니다.
PaddleOCR 3.1.0과 최신 PaddleX를 섞으면 내부 API가 호환되지 않으므로 이 파일의
버전 고정을 유지해야 합니다.

```powershell
npm install
python -m venv .venv-ocr
.\.venv-ocr\Scripts\python.exe -m pip install -r requirements-ocr.txt
```

PaddleOCR 모델은 최초 실행 시 내려받습니다. 모델 저장소 접근이 제한된 환경에서는
PaddleOCR 문서에 따라 `PADDLE_PDX_MODEL_SOURCE=BOS`를 설정할 수 있습니다.

## 사용법

```powershell
npm exec wordscan-ocr -- .\scan.docx -o .\output
```

이미지를 직접 처리하는 경우:

```powershell
npm exec wordscan-ocr -- .\scan.png -o .\output `
  --paddle-python .\.venv-ocr\Scripts\python.exe
```

다중 페이지 PDF를 처리하는 경우(각 PDF 페이지는 기본적으로 한 쪽):

```powershell
npm exec wordscan-ocr -- .\manual.pdf -o .\output\manual `
  --paddle-python .\.venv-ocr\Scripts\python.exe
```

세로 이미지는 `auto`에서 단일 페이지로 처리된다. 가로 한 쪽 이미지처럼
방향만으로 2-up 여부를 구분할 수 없는 경우에는 `single`을 명시한다.

```powershell
npm exec wordscan-ocr -- .\landscape-page.png -o .\output\landscape `
  --page-layout single `
  --paddle-python .\.venv-ocr\Scripts\python.exe
```

기존 가로 2-up 입력을 명시하려면 `--page-layout two-up`을 사용한다.

폴더 바로 아래의 지원 이미지를 모두 처리하는 경우:

```powershell
npm exec wordscan-ocr -- .\input-images -o .\output-batch `
  --paddle-python .\.venv-ocr\Scripts\python.exe
```

폴더 입력은 하위 폴더를 재귀 탐색하지 않는다. PNG, JPEG, WebP, TIFF, BMP를
파일명 순서로 처리하며, 한 이미지가 실패해도 나머지 이미지는 계속 처리한다.
일부 실패가 있으면 요약 파일은 생성하고 CLI 종료 코드는 `1`을 반환한다.

기본 실행은 정확도 우선 `text-safe` 모드를 사용한다:

```powershell
npm exec wordscan-ocr -- .\scan.png -o .\output `
  --watermark text-safe `
  --paddle-python .\.venv-ocr\Scripts\python.exe
```

`text-safe`는 무채색 픽셀을 이진화하고 쪽 폭이 1,400px 미만이면 2배 확대한다.
표·그림 구조는 보존형 이미지로 따로 분석하고, 이진화·보존형 일반 OCR 결과는
깨진 text block에만 좌표 기반으로 적용한다. OCR을 추가 실행하므로 처리 속도가
중요하고 워터마크 겹침이 없는 입력은 `--watermark conservative`를 지정한다.

GPU, 강한 워터마크 억제, 수동 분할 위치를 함께 지정하는 예:

```powershell
npm exec wordscan-ocr -- .\scan.docx -o .\output `
  --device gpu:0 `
  --watermark strong `
  --split-ratio 0.49
```

출력:

```text
output/
├── scan.md
├── scan.manifest.json
└── assets/
    ├── page-0001/
    └── page-0002/
```

폴더 입력 출력:

```text
output-batch/
├── image-01/
│   ├── image-01.md
│   ├── image-01.manifest.json
│   └── assets/
├── image-02/
│   ├── image-02.md
│   ├── image-02.manifest.json
│   └── assets/
├── batch-summary.md
└── batch-summary.json
```

기본 이름이 같은 이미지가 여러 개면 확장자를 붙인 출력 폴더를 사용한다.
예를 들어 `scan.png`와 `scan.jpg`는 각각 `scan-png`, `scan-jpg`에 저장된다.

## 옵션

```text
-o, --output <directory>       출력 디렉터리
    --split-ratio <0..1>       수동 좌/우 분할 위치
    --page-layout <layout>     auto|single|two-up (기본값: auto)
    --watermark <mode>         off|conservative|strong|text-safe (기본값: text-safe)
    --device <device>          cpu|gpu:0 등
    --paddle-command <path>    PaddleOCR 실행 명령/경로
    --paddle-python <path>     bundled Markdown bridge를 실행할 Python 경로
    --keep-work                전처리 및 OCR 임시 결과 보존
```

`.doc`은 지원하지 않습니다. Word에서 `.docx`로 다시 저장한 후 실행하세요.
`--page-layout single`과 `--split-ratio`는 함께 사용할 수 없습니다.

## 테스트

전체 자동 테스트에는 실제 OCR 모델이 필요하지 않습니다.

```powershell
npm test
```

합성 2-up 이미지, 이미지 전용 DOCX와 기대 Markdown 생성:

```powershell
npm run fixtures:generate
```

Phase별 실행:

```powershell
npm run test:phase1
npm run test:phase2
npm run test:phase3
npm run test:phase4
npm run test:phase9
```

합성 PNG 실제 OCR 검증은 CER 5.93%, 핵심 문구 recall 90.91%로 통과했습니다.
비공개 실이미지 1장에서는 구조/복구 OCR 분리, 워터마크 겹침 일반 문장, 괄호형
번호, 표 옆 본문을 추가 검증했습니다. 전체 실문서 품질을 승인하려면 그림과
서로 다른 표 해상도·농도의 워터마크가 포함된 익명화 골든셋이 추가로 필요합니다.
