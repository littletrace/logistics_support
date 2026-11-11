// 실행: node orderNoGuard.check.mjs
import assert from 'node:assert';
import { addrKey, labelSplitOrders, splitCarton } from './src/orderNoGuard.js';

// 공백만 다른 주소는 같은 주소
assert.strictEqual(addrKey('경기도 평택시  상서재로 55'), addrKey('경기도 평택시 상서재로55'));
assert.notStrictEqual(addrKey('경기도 평택시'), addrKey('서울특별시 강남구'));

// 중복 없으면 label = 판매No., 중복이면 분리 표시 + 원래 판매No. 유지
const out = labelSplitOrders([{ orderNo: '544579' }, { orderNo: '544580' }, { orderNo: '544579' }]);
assert.deepStrictEqual(out.map(o => o.label), ['544579 (분리 1/2)', '544580', '544579 (분리 2/2)']);
assert.deepStrictEqual(out.map(o => o.orderNo), ['544579', '544580', '544579']);
// 카톤/잔량: 음수(반품)는 0/0, 카톤단위 없으면 전부 잔량
assert.deepStrictEqual(splitCarton(-4, 4), { carton: 0, piece: 0 });
assert.deepStrictEqual(splitCarton(6, 4), { carton: 1, piece: 2 });
assert.deepStrictEqual(splitCarton(5, 0), { carton: 0, piece: 5 });
console.log('orderNoGuard OK');
