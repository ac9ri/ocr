<!-- page: 1 -->

# 월간 품질 점검 보고서

OCR Quality Review · 2026년 7월

문서 번호: QA-2026-0720
담당 부서: 디지털 아카이브팀

목적: 한글·English·숫자 12345 및 특수기호 (A/B, 98.7%) 인식 확인

<table>
  <tr><th colspan="2">검사 구분</th><th>측정값</th><th>판정</th></tr>
  <tr><th>코드</th><th>항목</th><th>결과</th><th>상태</th></tr>
  <tr><td rowspan="2">A-01</td><td>인쇄 상태</td><td>98.7%</td><td>정상</td></tr>
  <tr><td>표 경계 검출</td><td>12 / 12</td><td>정상</td></tr>
  <tr><td>B-07</td><td colspan="2">회색 워터마크 대비</td><td>확인 필요</td></tr>
</table>

처리 흐름도: DOCX 입력 → 2-up 분할 → OCR 분석 → Markdown

---

<!-- page: 2 -->

# 설비 운영 현황

표 옆 본문 및 그림 배치 시험

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

요소별 인식 목표 (%): 본문 91, 표 84, 그림 76, 병합 셀 69
