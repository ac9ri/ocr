# WordScan OCR

가로 스캔 이미지 한 장에 2쪽이 들어 있는 Word 문서(`.docx`)를 쪽별로 나눠
표·글·그림을 추출하고 Markdown으로 저장하는 CLI입니다.

## 지원 기능

- DOCX 안의 스캔 이미지를 본문 배치 순서대로 추출
- 중앙 여백 자동 탐색 또는 수동 비율로 좌/우 2쪽 분할
- 회색 저대비 워터마크 약화
- PP-StructureV3 기반 layout, 표 구조, 그림, 읽기 순서 인식
- 한국어·영어·숫자용 `korean_PP-OCRv5_mobile_rec`
- 병합 셀의 `rowspan`/`colspan`을 HTML table로 보존
- 단일 Markdown, page별 그림 asset, 처리 manifest 생성

상세 결정과 요구사항 추적은 [설계 문서](docs/DESIGN.md), 단계별 검증은
[Phase 기록](docs/PHASES.md)을 참고하세요.
[합성 PNG 실제 OCR 검증](docs/REAL_OCR_VALIDATION.md)에는 측정 결과와 알려진
인식 한계를 기록했습니다.

개인정보 없는 합성 테스트 PNG/DOCX를 만드는 방법은
[테스트 fixture 제작 안내](docs/TEST_FIXTURES.md)를 참고하세요.

## 사전 요구사항

1. Node.js 20 이상
2. Python 3.11
3. `requirements-ocr.txt`에 고정된 PaddlePaddle/PaddleOCR/PaddleX 조합

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

## 옵션

```text
-o, --output <directory>       출력 디렉터리
    --split-ratio <0..1>       수동 좌/우 분할 위치
    --watermark <mode>         off|conservative|strong
    --device <device>          cpu|gpu:0 등
    --paddle-command <path>    PaddleOCR 실행 명령/경로
    --paddle-python <path>     bundled Markdown bridge를 실행할 Python 경로
    --keep-work                전처리 및 OCR 임시 결과 보존
```

`.doc`은 지원하지 않습니다. Word에서 `.docx`로 다시 저장한 후 실행하세요.

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
```

합성 PNG 실제 OCR 검증은 CER 5.93%, 핵심 문구 recall 90.91%로 통과했습니다.
실문서 품질을 승인하려면 표, 병합 셀, 표 옆 본문, 그림, 서로 다른 농도의
워터마크가 포함된 익명화 골든셋이 추가로 필요합니다.
