import assert from 'node:assert/strict';
import { plinkoResult } from './plinko.js';

const expected = [2, 5, 10, 12, 15, 50, 15, 12, 10, 5, 2];
for (const [bucket, tenths] of expected.entries()) {
  const result = plinkoResult(10, bucket);
  assert.equal(result.coefficientTenths, tenths);
  assert.equal(result.payout, tenths);
}
assert.equal(plinkoResult(25, 0).payout, 5);
assert.equal(plinkoResult(25, 3).payout, 30);
assert.equal(plinkoResult(25, 5).payout, 125);
console.log('Проверка выплат Плинко пройдена');
