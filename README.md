# 물류지원 웹앱 (logistics-support)

이카운트 **물표미발행** 엑셀을 업로드하면 물표·품목별수량·송장발행 자료를 만드는 물류팀용 웹앱.
운영: https://logistics-support.vercel.app (main 브랜치 push 시 Vercel 자동 배포)

## 구성
| 위치 | 역할 |
|---|---|
| `src/App.jsx` | 업로드 파싱, 연결품목 치환, 카톤/잔량 계산, 화면·인쇄·송장 엑셀 |
| `src/orderNoGuard.js` | 판매No. 중복 안전장치 (같은 판매No.라도 주소가 다르면 물표 분리) |
| `gas/물표생성_WebApp.gs` | "물류지원-전표출력" 구글시트에 붙여넣는 Apps Script (물표/품목별수량 탭 기록) |
| `vercel.json` | `/api/gsheets` → 마스터 구글시트(품목관계·품목리스트) xlsx 프록시 |

## 환경변수 (Vercel)
- `VITE_SHEET_WEBAPP_URL`: Apps Script 웹앱 배포 URL

## Apps Script 수정 절차
1. `gas/물표생성_WebApp.gs` 수정 → `GAS_VERSION` 날짜 올리기
2. `src/App.jsx`의 `GAS_VERSION`도 같은 값으로 변경
3. 구글시트 > 확장 프로그램 > Apps Script에 전체 붙여넣기 → 저장
4. 배포 > 배포 관리 > 연필 > 버전: **새 버전** > 배포 (URL 유지됨)
5. 웹앱 push
> 4번을 빠뜨리면 웹앱에서 "구글시트 스크립트 버전이 다릅니다" 경고가 뜸

## 확인
```
npm run dev                     # 로컬 실행 (vite 프록시로 /api/gsheets 연결)
node orderNoGuard.check.mjs     # 판매No. 분리 로직 검사
```
