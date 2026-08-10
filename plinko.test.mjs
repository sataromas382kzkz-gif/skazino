import assert from 'node:assert/strict';
import { calculatePlinkoPayout, plinkoResult, validatePlinkoResult } from './plinko.js';

const expected = [2, 5, 10, 12, 15, 50, 15, 12, 10, 5, 2];
for (const [bucket, tenths] of expected.entries()) {
  const result = plinkoResult(10, bucket);
  assert.equal(result.coefficientTenths, tenths);
  assert.equal(result.multiplier, tenths / 10);
  assert.equal(result.payout, Math.floor(10 * tenths / 10));
}
assert.equal(plinkoResult(25, 0).payout, 5);
assert.equal(plinkoResult(25, 3).payout, 30);
assert.equal(plinkoResult(25, 5).payout, 125);
assert.equal(plinkoResult(10, 5).coefficientTenths, 50);
assert.equal(plinkoResult(10, 5).multiplier, 5);
assert.equal(plinkoResult(10, 5).payout, 50);
assert.equal(calculatePlinkoPayout(10, 50), 50);
assert.equal(calculatePlinkoPayout(25, 50), 125);
// При 5 шариках общая ставка 25 ⭐ распределяется по 5 ⭐ на шарик:
// шарик на 5x приносит 25 ⭐.
assert.equal(calculatePlinkoPayout(25, 50, 5), 25);
assert.equal(calculatePlinkoPayout(10, 2, 3), 0);
assert.throws(() => calculatePlinkoPayout(10, 50, 0), /количество шариков/);
console.log('Проверка выплат Плинко пройдена');
