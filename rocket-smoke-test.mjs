import assert from 'node:assert/strict';

const MAX = 20;
const MIN_CRASH = 1.15;
const COMMON_CRASH = 1.5;
const multiplier = seconds => Math.min(MAX, 1 + 0.18 * seconds + 0.04 * seconds ** 2);
const crashMultiplier = roll => roll < 0.82
  ? MIN_CRASH + (roll / 0.82) * (COMMON_CRASH - MIN_CRASH)
  : COMMON_CRASH + ((roll - 0.82) / 0.18) ** 2.4 * (MAX - COMMON_CRASH);

// Formula must be monotonically increasing and bounded: no endless flights.
let previous = multiplier(0);
for (let seconds = 0.1; seconds <= 30; seconds += 0.1) {
  const value = multiplier(seconds);
  assert.ok(value >= previous, `multiplier decreased at ${seconds}s`);
  assert.ok(value <= MAX, `multiplier exceeded ${MAX}x`);
  previous = value;
}
assert.ok(multiplier(20) === MAX, 'rocket should reach max in about 20 seconds');
assert.ok(multiplier(1) >= MIN_CRASH, 'minimum crash gives player a visible reaction window');

let commonResults = 0;
for (let index = 0; index < 100_000; index += 1) {
  const value = crashMultiplier((index + 0.5) / 100_000);
  assert.ok(value >= MIN_CRASH && value <= MAX, 'crash multiplier must stay in bounds');
  if (value <= COMMON_CRASH) commonResults += 1;
}
assert.equal(commonResults, 82_000, '82% of crash results should not exceed 1.50x');
console.log('Rocket formula smoke test passed');
