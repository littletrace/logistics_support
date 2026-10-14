/**
 * "물류지원-전표출력" 스프레드시트 전용 Web App.
 * 웹앱(logistics-support.vercel.app)이 처리한 주문/품목 데이터를 받아
 * "물표"와 "품목별수량" 시트에 값을 직접 채워 넣는다.
 * (원본 스프레드시트의 다른 탭을 참조하던 수식은 복제 과정에서 #REF!로
 *  깨졌으므로, 수식 대신 웹앱이 이미 계산해 둔 값을 그대로 씀)
 *
 * 배포 방법:
 * 1. 이 스프레드시트에서 확장 프로그램 > Apps Script
 * 2. 기본 Code.gs 내용을 지우고 이 파일 내용 전체를 붙여넣기
 * 3. 저장 후 배포 > 새 배포 > 유형: 웹 앱
 *    - 실행 계정: 나
 *    - 액세스 권한: 링크가 있는 모든 사용자 (또는 조직 내 모든 사용자)
 * 4. 배포 후 나오는 웹 앱 URL을 복사해서 웹앱 쪽 VITE_SHEET_WEBAPP_URL 값으로 설정
 *
 * 코드를 수정한 뒤에는 배포 > 배포 관리 > (연필 아이콘) > 버전: 새 버전 > 배포로
 * 기존 웹 앱 URL에 새 코드를 반영해야 함 (그냥 저장만 하면 실행 URL엔 반영 안 됨).
 *
 * ⚠ 이 파일의 원본은 GitHub 저장소(webapp/gas/)에 있음. 수정은 여기서 하고 Apps Script에 붙여넣기.
 * ⚠ 배포 액세스 권한은 반드시 "모든 사용자" ("Google 계정이 있는 모든 사용자"는 401로 실패)
 */

const ORDER_SHEET_NAME = '물표';
const PAGE_ROWS = 46;
const ITEM_ROWS = 37;
const FORMULA_START_ROW = 2;
const FORMULA_END_ROW = 45;

const SUMMARY_SHEET_NAME = '품목별수량';
const SUMMARY_HEADER_ROW = 1;
const SUMMARY_COLS = 13; // A~M

function doPost(e) {
  // 두 사람이 동시에 눌러도 시트 쓰기가 섞이지 않도록 한 번에 하나씩 처리
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return jsonResponse({ ok: false, error: '다른 사용자가 구글시트에 쓰는 중입니다. 잠시 후 다시 시도하세요.' });
  }
  try {
    const body = JSON.parse(e.postData.contents);
    const orders = body.orders || [];
    const itemSummary = body.itemSummary || [];

    if (orders.length === 0 && itemSummary.length === 0) {
      return jsonResponse({ ok: false, error: '주문/품목 데이터가 없습니다.' });
    }

    const ss = SpreadsheetApp.getActive();
    const result = { ok: true };

    if (orders.length > 0) {
      const r = writeOrders(ss, orders);
      if (!r.ok) return jsonResponse(r);
      result.pages = r.pages;
      result.sheetUrl = r.sheetUrl;
    }

    if (itemSummary.length > 0) {
      const r = writeItemSummary(ss, itemSummary);
      if (!r.ok) return jsonResponse(r);
      result.summaryRows = r.summaryRows;
      if (!result.sheetUrl) result.sheetUrl = r.sheetUrl;
    }

    SpreadsheetApp.flush();
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function writeOrders(ss, orders) {
  const sheet = ss.getSheetByName(ORDER_SHEET_NAME);
  if (!sheet) {
    return { ok: false, error: `"${ORDER_SHEET_NAME}" 시트를 찾을 수 없습니다.` };
  }

  // 0. 기존에 생성됐던 2페이지 이후 내용을 시트 끝까지 완전히 삭제 (1페이지는 템플릿 구조로 유지)
  //    getLastRow()는 "값이 남아있는 마지막 행"만 반환하므로, 빈 품목칸처럼
  //    clearContent()로 값만 지워지고 테두리 서식만 남은 행은 포함되지 않는다.
  //    그 결과 과거 큰 배치에서 생긴 서식이 지워지지 않고 계속 누적되므로,
  //    반드시 시트의 실제 최대 행(getMaxRows)까지 지워야 한다.
  const deleteStartRow = PAGE_ROWS + 1;
  const existingMaxRows = sheet.getMaxRows();
  if (existingMaxRows >= deleteStartRow) {
    sheet
      .getRange(deleteStartRow, 1, existingMaxRows - deleteStartRow + 1, sheet.getMaxColumns())
      .clear();
  }

  // 1. 주문 건수만큼 페이지를 채우려면 필요한 행 수를 확보 (부족하면 추가)
  const requiredRows = orders.length * PAGE_ROWS;
  const maxRows = sheet.getMaxRows();
  if (maxRows < requiredRows) {
    sheet.insertRowsAfter(maxRows, requiredRows - maxRows);
  }

  // 2. 1페이지(A2:E45)의 서식/병합 구조를 기준 템플릿으로 사용
  const baseFormulaRange = sheet.getRange(
    FORMULA_START_ROW,
    1,
    FORMULA_END_ROW - FORMULA_START_ROW + 1,
    5
  );

  orders.forEach((order, index) => {
    const pageStartRow = index * PAGE_ROWS + 1;

    // 2페이지부터는 1페이지 구조(서식/병합)를 복제
    if (index > 0) {
      const targetRange = sheet.getRange(
        pageStartRow + FORMULA_START_ROW - 1,
        1,
        FORMULA_END_ROW - FORMULA_START_ROW + 1,
        5
      );
      baseFormulaRange.copyTo(targetRange, { contentsOnly: false });
    }

    // 주문번호
    sheet.getRange(pageStartRow, 1).setValue('<주문번호>');
    sheet.getRange(pageStartRow, 2).setNumberFormat('@').setValue(order.orderNo || '');

    // 거래처 / 수령인 / 연락처1 / 일자 / 주소 / 특이사항
    sheet.getRange(pageStartRow + 2, 2).setValue(order.clientName || '');
    sheet.getRange(pageStartRow + 2, 4).setValue(order.recipient || '');
    sheet.getRange(pageStartRow + 3, 2).setValue(order.contact || '');
    sheet.getRange(pageStartRow + 3, 4).setValue(order.date || '');
    sheet.getRange(pageStartRow + 4, 2).setValue(order.address || '');
    sheet.getRange(pageStartRow + 5, 2).setValue(order.remarks || '');

    // 품목 (고정 37행, 빈 칸은 비움) — 37행을 한 번에 기록 (행별 호출 대비 시트 API 호출 1/37)
    const items = order.itemList || [];
    const itemValues = [];
    for (let i = 0; i < ITEM_ROWS; i++) {
      const item = items[i];
      itemValues.push(item ? [i + 1, item.name, item.qty, item.carton, item.piece] : ['', '', '', '', '']);
    }
    sheet.getRange(pageStartRow + 8, 1, ITEM_ROWS, 5).setValues(itemValues);
  });

  return {
    ok: true,
    pages: orders.length,
    sheetUrl: ss.getUrl() + '#gid=' + sheet.getSheetId()
  };
}

function writeItemSummary(ss, itemSummary) {
  const sheet = ss.getSheetByName(SUMMARY_SHEET_NAME);
  if (!sheet) {
    return { ok: false, error: `"${SUMMARY_SHEET_NAME}" 시트를 찾을 수 없습니다.` };
  }

  // 기존 데이터(헤더 아래) 전부 삭제
  const lastRow = sheet.getLastRow();
  const dataStartRow = SUMMARY_HEADER_ROW + 1;
  if (lastRow >= dataStartRow) {
    sheet
      .getRange(dataStartRow, 1, lastRow - dataStartRow + 1, sheet.getMaxColumns())
      .clearContent();
  }

  // 웹앱이 보낸 순서 그대로 한 줄씩 기록
  // [이카운트코드, 영림원코드, 주문번호, 거래처, 수취인, 품목명, 수량, 카톤, 잔량, 합계품목명, 합계수량, 합계카톤, 합계잔량]
  const rows = itemSummary.map(r => [
    r.ecountCode || '',
    r.younglimwonCode || '',
    r.orderNo || '',
    r.clientName || '',
    r.recipient || '',
    r.itemName || '',
    r.qty,
    r.carton,
    r.piece,
    r.sumItemName || '',
    r.sumQty,
    r.sumCarton,
    r.sumPiece
  ]);

  if (rows.length > 0) {
    sheet.getRange(dataStartRow, 1, rows.length, SUMMARY_COLS).setValues(rows);
  }

  return {
    ok: true,
    summaryRows: rows.length,
    sheetUrl: ss.getUrl() + '#gid=' + sheet.getSheetId()
  };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}