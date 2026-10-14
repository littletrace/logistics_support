// 실행: node orderNoGuard.check.mjs
import assert from 'node:assert';
import { addrKey, labelSplitOrders } from './src/orderNoGuard.js';

// 공백만 다른 주소는 같은 주소
assert.strictEqual(addrKey('경기도 평택시  상서재로 55'), addrKey('경기도 평택시 상서재로55'));
assert.notStrictEqual(addrKey('경기도 평택시'), addrKey('서울특별시 강남구'));

// 중복 없으면 label = 판매No., 중복이면 분리 표시 + 원래 판매No. 유지
const out = labelSplitOrders([{ orderNo: '544579' }, { orderNo: '544580' }, { orderNo: '544579' }]);
assert.deepStrictEqual(out.map(o => o.label), ['544579 (분리 1/2)', '544580', '544579 (분리 2/2)']);
assert.deepStrictEqual(out.map(o => o.orderNo), ['544579', '544580', '544579']);
console.log('orderNoGuard OK');
