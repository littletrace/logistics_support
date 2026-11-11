// 판매No. 중복 안전장치 (이카운트에서 서로 다른 주문에 같은 판매No.가 발급된 사고 대응)
// 같은 판매No.라도 주소가 다르면 다른 주문 → 주소별로 별도 물표로 분리한다.
// 공백 차이로 같은 주소가 갈라지지 않도록 공백 제거 후 비교.
export const addrKey = addr => String(addr ?? '').replace(/\s/g, '');

// 분리된 주문에 표시용 label 부여: 중복 없으면 판매No. 그대로, 있으면 "544579 (분리 1/2)"
// orderNo(원래 판매No.)는 그대로 유지 → 송장/이카운트 업로드 매칭에 영향 없음
export function labelSplitOrders(orders) {
  const total = new Map();
  orders.forEach(o => total.set(o.orderNo, (total.get(o.orderNo) || 0) + 1));
  const seen = new Map();
  return orders.map(o => {
    const n = total.get(o.orderNo);
    if (n === 1) return { ...o, label: o.orderNo };
    const i = (seen.get(o.orderNo) || 0) + 1;
    seen.set(o.orderNo, i);
    return { ...o, label: `${o.orderNo} (분리 ${i}/${n})` };
  });
}

// 수량 → 카톤/잔량. 음수(반품) 수량은 카톤 0, 잔량 0 (품목별 합계에 넣지 않음)
export function splitCarton(qty, unit) {
  if (qty < 0) return { carton: 0, piece: 0 };
  if (!(unit > 0)) return { carton: 0, piece: qty };
  return { carton: Math.trunc(qty / unit), piece: qty % unit };
}
