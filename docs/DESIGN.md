# WordScan OCR 설계 문서

## 1. 목적

가로 방향의 스캔 이미지 한 장에 원문 2쪽이 배치된 Microsoft Word 문서에서
쪽별 내용을 추출하고, 표·본문·그림의 읽기 순서를 보존한 단일 Markdown 파일로
저장한다.

## 2. 범위와 전제

- 입력: `.docx` 안에 삽입된 스캔 이미지, 또는 단일 이미지
  (`.png`, `.jpg`, `.jpeg`, `.webp`, `.tif`, `.tiff`, `.bmp`)
- 기본 페이지 순서: 한 장의 왼쪽을 먼저, 오른쪽을 다음 쪽으로 처리한다.
- 한 스캔 이미지에는 가로로 2쪽이 배치되어 있다고 가정한다.
- 출력: UTF-8 Markdown, 추출된 그림 asset, 처리 결과 manifest(JSON)
- OCR 엔진: PaddleOCR 3.x의 PP-StructureV3
- 한국어 인식 모델: `korean_PP-OCRv5_mobile_rec`
- `.doc` 바이너리 파일은 범위 밖이다. Microsoft Word에서 `.docx`로 저장해야 한다.
- 스캔 원본의 실제 샘플과 정답 데이터가 아직 없으므로, 현재 자동화 검증은 합성
  이미지와 OCR 엔진 대역(test double)을 사용한다. 실제 정확도는 별도 골든셋으로
  검증한다.

## 3. 요구사항 추적

| ID | 요구사항 | 설계 대응 | 자동 검증 |
| --- | --- | --- | --- |
| R1 | Word 스캔 이미지에서 내용 추출 | OOXML 관계를 따라 본문 순서대로 이미지 추출 | DOCX fixture 순서 검증 |
| R2 | 가로 한 장에 2쪽 | 중앙 여백 탐색 후 좌/우 crop | 합성 2-up 이미지 경계 검증 |
| R3 | 표·글·그림 포함 | PP-StructureV3 layout/asset 결과 조립 | 혼합 block/asset 통합 테스트 |
| R4 | 표 옆에 글 배치 | 겹치는 세로 구간은 좌→우, 그 외 위→아래 순서 | 인접 표·본문 순서 테스트 |
| R5 | 병합 셀 | 표는 GFM pipe table로 강제 변환하지 않고 HTML 유지 | `rowspan`/`colspan` 보존 테스트 |
| R6 | 회색 워터마크 | OCR 전 중성 회색 저대비 픽셀을 선택적으로 약화 | 전경 보존/워터마크 밝기 검증 |
| R7 | Markdown 저장 | 쪽 구분자와 asset 경로를 포함한 단일 파일 생성 | end-to-end 파일 검증 |

## 4. 처리 흐름

```text
DOCX/이미지
    │
    ▼
입력 추출 ── DOCX 관계/문서 순서 보존
    │
    ▼
2-up 분할 ── 중앙 인근의 최소 잉크 밀도(gutter) 탐색
    │
    ▼
전처리 ── 회색 워터마크 약화 + PP-Structure 문서 보정
    │
    ▼
PP-StructureV3 ── OCR + layout + 표 구조 + 그림
    │
    ▼
Markdown 조립 ── 읽기 순서/HTML 병합 셀/asset 경로 보존
    │
    ├── document.md
    ├── assets/page-NNNN/*
    └── document.manifest.json
```

## 5. 주요 컴포넌트

### 5.1 입력 추출

DOCX는 ZIP 패키지로 읽는다. `word/document.xml`에 등장하는 `r:embed`/`r:id`를
`word/_rels/document.xml.rels`의 이미지 관계에 대응시킨다. 이 방식은
`word/media` 파일명 정렬보다 실제 본문 순서를 더 정확히 보존하고, inline 및
floating drawing의 공통 이미지 참조를 처리할 수 있다.

잘못된 ZIP, 암호화된 엔트리, 지원하지 않는 압축 방식, 이미지가 없는 문서는
구체적인 오류 코드와 함께 중단한다.

### 5.2 2-up 페이지 분할

이미지 폭 중앙의 ±10% 구간에서 다음 비용이 가장 낮은 세로선을 선택한다.

1. 어두운 픽셀(잉크) 비율
2. 좌우 밝기 변화(글자/선 절단 방지)
3. 정확한 중앙에서 멀어지는 거리

자동 탐색이 불안정한 문서는 `--split-ratio`로 수동 경계를 지정할 수 있다.
각 crop의 폭이 전체 폭의 35% 미만이면 안전하게 실패한다.

### 5.3 워터마크 억제

색상 채도가 낮은 회색 픽셀만 대상으로 밝기에 따라 흰색 쪽으로 점진적으로
이동한다. 검은 글자와 진한 표 선은 보존한다. `off`, `conservative`, `strong`
세 모드를 제공하며 기본값은 `conservative`다. 이 전처리는 인식 정확도를
보장하는 제거 도구가 아니라, OCR 검출기의 워터마크 오검출을 줄이는 단계다.

### 5.4 OCR와 레이아웃

PP-StructureV3를 별도 프로세스로 실행한다. 무거운 모델 의존성과 애플리케이션
로직을 분리해 다음을 가능하게 한다.

- CPU/GPU 장치 선택
- OCR 실패 시 페이지 번호와 stderr를 포함한 진단
- 모델 없이도 단위·통합 테스트 실행
- 향후 원격/self-hosted 엔진으로 교체

방향 분류와 문서 펴기(unwarping)를 켜고, 표 인식과 region detection을 사용한다.
워터마크가 없는 고품질 원본은 전처리를 끌 수 있다.

### 5.5 Markdown 표현 정책

- 페이지 사이에 `<!-- page: N -->` 주석과 수평선을 넣는다.
- 병합 셀이 있는 표는 HTML `<table>`을 그대로 유지한다. 일반 Markdown 표는
  `rowspan`과 `colspan`을 표현할 수 없기 때문이다.
- 그림은 `assets/page-NNNN/` 아래로 복사하고 링크를 상대 경로로 다시 쓴다.
- 표와 글이 나란히 있어도 모든 block을 누락 없이 기록한다. 세로로 겹치는
  block은 좌→우, 그렇지 않으면 위→아래 순서를 적용한다.

## 6. 오류·관측성

오류는 `INPUT_*`, `IMAGE_*`, `OCR_*`, `OUTPUT_*` 코드로 분류한다. 최종
manifest에는 입력, 생성 시각, 설정, 페이지별 OCR 경고 및 asset 수를 기록한다.
한 페이지 OCR 실패 시 기본 정책은 전체 실패이며, 추후 `--continue-on-error`
옵션을 확장할 수 있다.

## 7. 테스트 전략

- Phase 1: ZIP/DOCX 순서, 손상 입력, 2-up 분할
- Phase 2: 워터마크 약화, 전경 보존, layout 읽기 순서
- Phase 3: Paddle CLI 인자/오류, 병합 셀 및 asset 경로
- Phase 4: 가짜 OCR 엔진을 사용한 CLI end-to-end, manifest, 실패 경로
- Phase 5: 합성 watermarked PNG를 실제 PP-StructureV3 CPU 추론으로 처리하고
  CER, 핵심 문구, 의미 기반 병합 셀, 읽기 순서, 그림, 워터마크를 자동 평가
- 합성 fixture: 300dpi 2-up PNG와 해당 PNG 한 장만 포함한 DOCX를 결정적으로
  생성하고, 병합 셀·표 옆 본문·그림·회색 워터마크를 회귀 검증
- 수동/인수: 실제 문서 골든셋에서 문자 오류율(CER), 표 구조 정확도(TEDS),
  그림 누락률을 측정

## 8. 인수 기준

1. DOCX 내 스캔 이미지가 문서 순서대로 처리된다.
2. 이미지 한 장에서 정확히 좌/우 2쪽이 생성된다.
3. 검은 본문과 표 선은 워터마크 전처리 뒤에도 유지된다.
4. 병합 셀 속성이 결과 Markdown의 HTML 표에 남는다.
5. 표 옆 본문과 그림이 누락되지 않고 결정적인 순서로 출력된다.
6. CLI가 Markdown, asset, manifest를 생성하고 실패 시 0이 아닌 종료 코드를
   반환한다.
7. 모든 자동 테스트가 통과한다.

## 9. 위험과 후속 검증

- 실제 스캔 품질, 기울기, 워터마크 농도에 따라 임계값 튜닝이 필요하다.
- PP-StructureV3 모델 최초 실행 시 큰 모델 다운로드와 충분한 메모리가 필요하다.
- 복잡한 무선 표나 셀 경계가 워터마크와 겹치면 병합 구조가 틀릴 수 있다.
- 실제 샘플을 확보하면 익명화한 골든셋과 기대 Markdown을 추가하고 회귀 기준을
  고정해야 한다.

## 10. 기술 근거

- PP-StructureV3는 layout, 표 구조, 읽기 순서, 그림 및 Markdown 변환을 한
  pipeline에서 제공한다.
- PaddleOCR의 한국어 PP-OCRv5 mobile recognition 모델은 한국어·영어·숫자를
  지원한다.
- DOCX picture는 WordprocessingML에서 관계 ID가 이미지 part를 가리키는
  DrawingML 구조로 저장된다.
