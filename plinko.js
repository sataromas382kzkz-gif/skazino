// Единая бизнес-логика Плинко для сервера и тестов.
// Коэффициент хранится в десятых долях: 2 = 0.2x, 12 = 1.2x.
export const PLINKO_MIN_BET = 10;
export const PLINKO_COEFFICIENT_TENTHS = Object.freeze([2, 5, 10, 12, 15, 50, 15, 12, 10, 5, 2]);

export function calculatePlinkoPayout(bet, coefficientTenths) {
  const totalStake = Number(bet);
  const coefficient = Number(coefficientTenths);
  if (!Number.isSafeInteger(totalStake) || totalStake < PLINKO_MIN_BET) {
    throw new Error('Некорректная ставка Плинко');
  }
  if (!Number.isSafeInteger(coefficient) || coefficient < 0) {
    throw new Error('Некорректный коэффициент Плинко');
  }
  // Выплата одного шарика = его ставка × множитель. Коэффициент хранится
  // в десятых долях: 50 = 5x. Округляем выплату вниз до целой звезды,
  // поскольку баланс Telegram не поддерживает дробные звёзды.
  return Math.floor(totalStake * coefficient / 10);
}

// Выплата одного шарика в раунде с несколькими шариками.
// Общая ставка делится между шариками, а дробная звезда округляется вниз,
// поскольку баланс Telegram хранит только целые звёзды.
export function calculatePlinkoRoundPayout(totalStake, ballCount, coefficientTenths) {
  const stake = Number(totalStake);
  const count = Number(ballCount);
  const coefficient = Number(coefficientTenths);
  if (!Number.isSafeInteger(stake) || stake < PLINKO_MIN_BET) {
    throw new Error('Некорректная общая ставка Плинко');
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > 10) {
    throw new Error('Некорректное количество шариков Плинко');
  }
  if (!Number.isSafeInteger(coefficient) || coefficient < 0) {
    throw new Error('Некорректный коэффициент Плинко');
  }
  return Math.floor(stake * coefficient / (10 * count));
}

export function plinkoResult(bet, bucket) {
  const slot = Number(bucket);
  if (!Number.isInteger(slot) || slot < 0 || slot >= PLINKO_COEFFICIENT_TENTHS.length) {
    throw new Error('Некорректный слот Плинко');
  }
  const coefficientTenths = PLINKO_COEFFICIENT_TENTHS[slot];
  return {
    bucket: slot,
    coefficientTenths,
    multiplier: coefficientTenths / 10,
    // Выплата каждого шарика = его ставка × коэффициент его слота.
    payout: calculatePlinkoPayout(bet, coefficientTenths)
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
