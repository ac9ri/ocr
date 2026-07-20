# 합성 PNG 실제 OCR 검증

## 결과

상태: PASS

2026-07-20에 `two-up-watermarked.png` 한 장만 입력으로 사용해 실제
PP-StructureV3 CPU 추론을 수행했다. DOCX는 이 검증에 사용하지 않았다.

| 항목 | 기준 | 결과 |
|---|---:|---:|
| 2-up 분할 | 2쪽 | 2쪽 |
| 문자 오류율(CER) | 25% 이하 | 5.93% |
| 핵심 문구 recall | 80% 이상 | 90.91% (10/11) |
| 표 | 2개 이상 | 2개 |
| 행 병합 | `A-01`, `OCR-1` | 모두 보존 |
| 열 병합 | `검사 구분`, `설비 점검 현황` | 모두 보존 |
| 읽기 순서 | 표 → 운영 요약 | 통과 |
| 그림 | 2개 이상 | 2개 |
| 워터마크 | `SAMPLE` 미검출 | 통과 |

실행 시간은 143.7초였고, 입력은 `5080×3508` PNG, 분할 결과는
`2540×3508` 두 쪽이었다. 최종 실행은 CPU를 사용했다.

## 실행 환경

- Windows, Python 3.11.9
- PaddlePaddle 3.0.0 CPU
- PaddleOCR 3.1.0
- PaddleX 3.1.0
- 시스템 RAM 31.9GB
- GPU: NVIDIA RTX 3060 Ti 8GB(이번 추론에는 사용하지 않음)

PP-StructureV3 전체 모델은 8GB VRAM에서 여유가 부족할 수 있어 CPU 경로를
선택했다. 최초 실행에서는 모델 다운로드가 추가로 필요하다.

## 재현

```powershell
python -m venv .venv-ocr
.\.venv-ocr\Scripts\python.exe -m pip install -r requirements-ocr.txt

node .\src\cli.js `
  .\test\fixtures\generated\two-up-watermarked.png `
  -o .\output\synthetic-image `
  --paddle-python .\.venv-ocr\Scripts\python.exe

npm run fixtures:evaluate
```

평가기 결과는 `output/synthetic-image/evaluation.json`에 저장된다. `output/`은
실행 산출물이므로 Git에는 커밋하지 않는다.

## 실행 중 발견하고 수정한 문제

1. PaddleOCR 3.1.0이 최신 PaddleX 3.7.2를 설치하면 내부 predictor 생성자
   시그니처가 맞지 않았다. `requirements-ocr.txt`에서 PaddleX 3.1.0을 함께
   고정했다.
2. PaddleX 3.1.0 CLI의 `save_all()`은 일부 결과에서 시각화 폰트 배열
   `IndexError`를 냈다. bundled Python bridge는 같은 추론 결과에
   `save_to_markdown()`만 호출해 Markdown과 필요한 그림을 안전하게 저장한다.
3. 초기 워터마크 억제는 사람이 보기에도 문구가 남아 OCR에 유입됐다. 합성
   워터마크 명도에 맞춰 임계값을 조정하고 잔차 비율 5% 미만 회귀 기준을
   추가했다. 최종 전체 이미지 잔차 비율은 0.46%였다.
4. Windows에서 engine 프로세스 시작이 동기적으로 실패하는 경우와 engine
   traceback이 CLI에서 숨겨지는 경우를 보강했다.

## 남은 한계

- `설비 운영 현황` 제목은 최종 Markdown에서 누락돼 핵심 문구 1개를 놓쳤다.
- 일부 짧은 문자열은 오인식됐다. 예: `판정`, `확인 필요`, 두 번째 표의
  마지막 `정상`.
- 이 결과는 깨끗하게 합성한 이미지에 대한 검증이다. 실제 스캐너의 기울기,
  JPEG 압축, 종이 질감, 다양한 워터마크 농도는 대표하지 않는다.
- 익명화한 실제 스캔 10장 이상을 이용한 최종 골든셋 검증은 Issue #5에서
  계속 추적한다.

추적 이슈: <https://github.com/ac9ri/ocr/issues/6>
