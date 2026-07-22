# GitHub 이슈 백로그

공개 저장소: <https://github.com/ac9ri/ocr>

아래 이슈를 실제 저장소에 등록했다. 구현이 끝난 Phase 이슈는 완료 후 닫고,
추가 샘플이 필요한 골든셋 이슈는 열어 둔다.

## Issue 1 — [Phase 1] DOCX 이미지 추출 및 2-up 분할

<https://github.com/ac9ri/ocr/issues/1>

Labels: `phase-1`, `enhancement`, `test`

완료 조건:

- DOCX의 이미지 관계를 본문 순서대로 추출
- 이미지 한 장을 좌/우 페이지로 자동 분할
- 수동 split ratio 지원
- Phase 1 단위 테스트 통과

## Issue 2 — [Phase 2] 회색 워터마크 억제 및 읽기 순서

<https://github.com/ac9ri/ocr/issues/2>

Labels: `phase-2`, `enhancement`, `test`

완료 조건:

- 회색 저대비 watermark를 약화
- 검은 글자와 표 선 보존
- 표 옆 본문 block을 누락 없이 정렬
- Phase 2 단위 테스트 통과

## Issue 3 — [Phase 3] PP-StructureV3 및 Markdown 변환

<https://github.com/ac9ri/ocr/issues/3>

Labels: `phase-3`, `enhancement`, `test`

완료 조건:

- 한국어 PP-OCRv5 모델을 사용하는 PP-StructureV3 adapter
- 표와 그림 추출
- `rowspan`/`colspan` 유지
- asset link 재작성과 Phase 3 테스트 통과

## Issue 4 — [Phase 4] CLI·manifest·통합 테스트

<https://github.com/ac9ri/ocr/issues/4>

Labels: `phase-4`, `enhancement`, `test`

완료 조건:

- DOCX/이미지 입력 CLI 제공
- 단일 Markdown, assets, manifest 출력
- 오류 종료 코드와 진단 제공
- 전체 자동 테스트와 운영 문서 완료

## Issue 5 — 실제 문서 골든셋 인수 시험

<https://github.com/ac9ri/ocr/issues/5>

Labels: `validation`, `needs-sample`

완료 조건:

- 합성 fixture는 `test/fixtures/generated/`에 준비됨
- 익명화한 실제 스캔/정답 골든셋 구축
- CER/TEDS/그림 recall 측정
- watermark mode와 split threshold 튜닝
- 인수 결과 문서화

## Issue 6 — [Phase 5] 합성 PNG 실제 PP-StructureV3 인수 검증

URL: <https://github.com/ac9ri/ocr/issues/6>

- 실제 CPU OCR 환경과 호환 버전 고정
- bundled Markdown bridge
- 워터마크 억제 튜닝
- CER/핵심 문구/병합 셀/읽기 순서/그림 자동 평가
- 합성 PNG 결과와 남은 인식 한계 문서화

## Issue 7 — [Phase 6] 저해상도 워터마크 겹침 OCR 강건성 개선

URL: <https://github.com/ac9ri/ocr/issues/7>

- 비공개 원본과 문서 내용을 GitHub에 올리지 않음
- `text-safe` 이진화·확대와 색상 픽셀 보존
- 괄호형 번호 표시와 누락 번호 문단 복구
- 표 옆 본문이 표 셀로 흡수되는 두 형태 후처리
- 비공개 이미지 로컬 검증 및 공개 가능한 결과만 문서화

## Issue 8 — [Phase 7] 워터마크 겹침 일반 문장 복구 개선

URL: <https://github.com/ac9ri/ocr/issues/8>

- Phase 6의 좁은 존재 여부 검증으로 놓친 일반 문장 깨짐 재현
- 구조 OCR과 이진화/보존형 일반 OCR 입력 분리
- 문장 anchor 기반 좌표 정렬과 깨진 block 제한 교체
- 정상 구조 문장과 표 block의 덮어쓰기 방지
- 기본 `text-safe` 실행 및 비공개 이미지 E2E 검증

## Issue 9 — [Phase 8] 표 인접 소제목의 좌표 기반 OCR 복구

URL: <https://github.com/ac9ri/ocr/issues/9>

- 큰 자간 소제목이 구조 OCR의 장기 병합셀 안에서 손상되는 문제 재현
- 표 셀 좌표와 `text-safe` 원문 OCR 박스를 이용한 시각 행 재조립
- 같은 행의 분리 단어를 좌→우 순서로 결합
- 실제 표 데이터 혼입 방지 회귀 테스트와 비공개 이미지 재검증

## Issue 10 — [Phase 9] 이미지 폴더 일괄 처리 및 전체 요약

URL: <https://github.com/ac9ri/ocr/issues/10>

- 지원 이미지의 비재귀·이름순 폴더 탐색
- 이미지별 독립 출력과 같은 기본 이름 충돌 방지
- 개별 실패 후 계속 처리 및 실패 종료 코드
- `batch-summary.md`/`batch-summary.json` 전체 결과 생성
- 기존 단일 파일 동작을 포함한 전체 회귀 테스트
