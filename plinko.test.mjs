import assert from 'node:assert/strict';
import { calculatePlinkoPayout, calculatePlinkoRoundPayout, plinkoResult, validatePlinkoResult } from './plinko.js';

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
assert.equal(calculatePlinkoPayout(10, 2), 2);
assert.equal(calculatePlinkoRoundPayout(10, 1, 2), 2);
assert.equal(calculatePlinkoRoundPayout(100, 5, 2), 4);
assert.equal(calculatePlinkoRoundPayout(100, 5, 50), 100);
assert.equal(calculatePlinkoRoundPayout(100, 10, 15), 15);
for (const totalStake of [10, 25, 100, 1000]) {
  for (const ballCount of [1, 2, 5, 10]) {
    for (const coefficientTenths of expected) {
      assert.equal(
        calculatePlinkoRoundPayout(totalStake, ballCount, coefficientTenths),
        Math.floor(totalStake * coefficientTenths / (10 * ballCount)),
      );
    }
  }
}
assert.throws(() => calculatePlinkoPayout(5, 50), /ставка/);
assert.throws(() => calculatePlinkoRoundPayout(9, 2, 10), /ставка/);
console.log('Проверка выплат Плинко пройдена');
