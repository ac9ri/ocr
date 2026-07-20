<!-- page: 1 -->

# 월간 품질 점검 보고서

OCR Quality Review · 2026년 7월

문서 번호: QA-2026-0720
담당 부서: 디지털 아카이브팀

목적: 한글·English·숫자 12345 및 특수기호 (A/B, 98.7%) 인식 확인

검증 범위에는 표, 병합 셀, 회색 워터마크와 그림이 포함됩니다.

<table>
  <tr><th colspan="2">검사 구분</th><th>측정값</th><th>판정</th></tr>
  <tr><th>코드</th><th>항목</th><th>결과</th><th>상태</th></tr>
  <tr><td rowspan="2">A-01</td><td>인쇄 상태</td><td>98.7%</td><td>정상</td></tr>
  <tr><td>표 경계 검출</td><td>12 / 12</td><td>정상</td></tr>
  <tr><td>B-07</td><td colspan="2">회색 워터마크 대비</td><td>확인 필요</td></tr>
</table>

## 처리 흐름도

그림 1. 문서 이미지가 구조화된 Markdown으로 변환되는 단계
Figure ID: FLOW-2026-07 · 색상 도형과 화살표 추출 여부 확인

## 검토 메모

검은 본문과 표 선은 워터마크 억제 후에도 유지되어야 합니다.
병합된 A-01 셀과 ‘검사 구분’ 머리글 구조를 확인합니다.
Expected keyword: 품질 / OCR / Markdown / 정상 / 확인 필요

---

<!-- page: 2 -->

# 설비 운영 현황

표 옆 본문 및 그림 배치 시험

스캔 장비 ID: SCAN-2   해상도: 300 dpi   상태: RUNNING
왼쪽 표와 오른쪽 설명의 읽기 순서를 함께 검증합니다.

<table>
  <tr><th colspan="3">설비 점검 현황</th></tr>
  <tr><th>설비</th><th>횟수</th><th>비고</th></tr>
  <tr><td rowspan="2">OCR-1</td><td>24</td><td>정기 점검</td></tr>
  <tr><td>3</td><td>재처리</td></tr>
  <tr><td>SCAN-2</td><td>7</td><td>정상</td></tr>
</table>

## 운영 요약

표 오른쪽에 바로 이어지는 본문입니다. 읽기 순서는 표 → 운영 요약이어야 합니다.
OCR-1 장비는 총 27회 처리했습니다. 재처리 건수는 3회이며 오류율은 1.2%입니다.

영문 키워드: TABLE-SIDE-TEXT
연락처(가상): qa@example.test

## 판정 기준

- 표의 병합 구조가 HTML로 유지될 것
- 오른쪽 설명 문단이 누락되지 않을 것
- 아래 차트가 그림 asset으로 추출될 것

## 요소별 인식 목표 (%)
