// Единая бизнес-логика Плинко для сервера и тестов.
// Коэффициент хранится в десятых долях: 2 = 0.2x, 12 = 1.2x.
export const PLINKO_MIN_BET = 10;
export const PLINKO_COEFFICIENT_TENTHS = Object.freeze([2, 5, 10, 12, 15, 50, 15, 12, 10, 5, 2]);

export function plinkoResult(bet, bucket) {
  const stake = Number(bet);
  const slot = Number(bucket);
  if (!Number.isSafeInteger(stake) || stake < PLINKO_MIN_BET) {
    throw new Error('Некорректная ставка Плинко');
  }
  if (!Number.isInteger(slot) || slot < 0 || slot >= PLINKO_COEFFICIENT_TENTHS.length) {
    throw new Error('Некорректный слот Плинко');
  }
  const coefficientTenths = PLINKO_COEFFICIENT_TENTHS[slot];
  return {
    bucket: slot,
    coefficientTenths,
    multiplier: coefficientTenths / 10,
    // Возвращаемая сумма = ставка × коэффициент. Считаем в десятых,
    // чтобы 10 × 1.2 давало ровно 12, а 10 × 0.2 — ровно 2.
    payout: Math.floor(stake * coefficientTenths / 10)
  };
}

// Проверяет полный результат, чтобы коэффициент и сумма никогда не жили
// независимо друг от друга. Особенно важно для 5x: при ставке 10 выплата
// должна быть 10 * 50 / 10 = 50, а не просто значение коэффициента 5.
export function validatePlinkoResult(bet, result) {
  const expected = plinkoResult(bet, result?.bucket);
  if (Number(result?.coefficientTenths) !== expected.coefficientTenths
    || Number(result?.multiplier) !== expected.multiplier
    || Number(result?.payout) !== expected.payout) {
    throw new Error('Несоответствие коэффициента и выплаты Плинко');
  }
  return expected;
}

export function plinkoTable() {
  return PLINKO_COEFFICIENT_TENTHS.map((tenths, bucket) => ({
    bucket, coefficientTenths: tenths, multiplier: tenths / 10
  }));
}
