# 개발 Phase 및 검증 기록

상태 표기: `TODO` → `IN PROGRESS` → `DONE`

## Phase 0 — 요구사항·아키텍처

상태: DONE

- 요구사항 ID와 인수 기준 정의
- 입력/출력, 오류 정책, OCR engine 경계 설계
- 테스트 전략과 실제 문서 골든셋 필요성 기록

검증:

```powershell
Get-Content docs/DESIGN.md
```

## Phase 1 — 입력과 2-up 분할

상태: DONE

- OOXML ZIP/DOCX 이미지 추출
- raster model 및 image codec
- 자동/수동 2-up 분할
- 손상 입력 오류 처리

검증:

```powershell
npm run test:phase1
```

결과: 9 tests, 9 pass, 0 fail (실제 PNG codec 왕복 포함)

## Phase 2 — 워터마크와 읽기 순서

상태: DONE

- 중성 회색 워터마크 약화
- 검은 전경/표 선 보존
- 표 옆 본문을 포함한 layout block 정렬

검증:

```powershell
npm run test:phase2
```

결과: 9 tests, 9 pass, 0 fail

## Phase 3 — OCR와 Markdown

상태: DONE

- PP-StructureV3 CLI adapter
- 한국어 모델·표 인식·문서 보정 옵션
- 병합 셀 HTML 유지
- 그림 asset 수집 및 링크 재작성

검증:

```powershell
npm run test:phase3
```

결과: 9 tests, 9 pass, 0 fail

## Phase 4 — 통합 CLI와 인수 검증

상태: DONE

- 전체 pipeline과 CLI
- Markdown/asset/manifest 생성
- end-to-end와 오류 경로 테스트
- 운영/설치 문서

검증:

```powershell
npm test
```

결과:

- Phase 4: 9 tests, 9 pass, 0 fail
- 전체: 42 pass, 0 fail (`node --test`가 test helper 모듈 1개도 pass로 집계)
- 모든 `src/*.js`: `node --check` 통과
- `npm audit --omit=dev`: 취약점 0건
- 실제 PP-StructureV3 합성 PNG 추론: Phase 5에서 통과

## 합성 테스트 fixture

상태: DONE

- 300dpi `5080×3508` clean/watermarked 2-up PNG
- watermarked PNG 한 장만 포함한 이미지 전용 DOCX
- 병합 셀, 표 옆 본문, 흐름도, 차트, 한국어·영문·숫자 포함
- 사람이 작성한 기대 Markdown과 fixture manifest
- 생성 결정성, 자동 분할, 상·하 워터마크 배치, 워터마크 억제 효과 검증
- PNG 원본 시각 검토: 한글 glyph, 표 선, 병합 영역, 표 옆 본문, 그림,
  워터마크와 페이지 경계 이상 없음
- 이 fixture 변경의 검증 대상은 PNG이며 DOCX 렌더 검증은 수행하지 않음

생성:

```powershell
npm run fixtures:generate
```

## Phase 5 — 합성 PNG 실제 OCR 인수 검증

상태: DONE

- Python 3.11 격리 환경과 Paddle CPU 의존성 버전 고정
- 실제 PP-StructureV3로 watermarked PNG 1장 → 2쪽 Markdown 실행
- PaddleX 시각화 저장 오류를 우회하는 Markdown bridge
- 워터마크 잔차 회귀 기준과 의미 기반 병합 셀 평가기
- CER, 핵심 문구 recall, 표, 읽기 순서, 그림, 워터마크 판정

결과:

- CER 5.93%, 핵심 문구 recall 90.91%
- 2쪽, 표 2개, 그림 2개
- `A-01`/`OCR-1` rowspan과 두 표 헤더 colspan 보존
- 표 → 운영 요약 순서 및 `SAMPLE` 미검출
- 상세: [합성 PNG 실제 OCR 검증](REAL_OCR_VALIDATION.md)

## GitHub 이슈 등록

상태: DONE

- 공개 저장소: <https://github.com/ac9ri/ocr>
- Phase 1: <https://github.com/ac9ri/ocr/issues/1>
- Phase 2: <https://github.com/ac9ri/ocr/issues/2>
- Phase 3: <https://github.com/ac9ri/ocr/issues/3>
- Phase 4: <https://github.com/ac9ri/ocr/issues/4>
- 실제 문서 골든셋: <https://github.com/ac9ri/ocr/issues/5>
- Phase 5: <https://github.com/ac9ri/ocr/issues/6>

## 실제 문서 인수 시험(샘플 수령 후)

상태: BLOCKED — 실제 스캔 원본과 정답본 미제공

- 최소 10개 스캔 장(20쪽)
- 일반 본문, 유선/무선 표, 행/열 병합, 표 옆 본문, 그림을 각각 포함
- 옅음/중간/진함 회색 워터마크를 포함
- CER, TEDS, 그림 recall과 사람이 확인한 읽기 순서를 기록
