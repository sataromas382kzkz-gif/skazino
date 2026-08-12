import assert from 'node:assert/strict';
import {
  createPlinkoBall,
  plinkoMetrics,
  plinkoPegs,
  simulatePlinkoDrop,
  stepPlinkoBall
} from '../plinko-physics.js';

const FALL_SPEED = 120;
const MAX_STEPS = 2400;
const BOARDS = [[300, 360], [200, 280], [400, 420], [524, 450]];

function testDrop(width, height, seed) {
  const metrics = plinkoMetrics(width, height);
  const pegs = plinkoPegs(width, height);
  const contactRadius = metrics.pegRadius + metrics.ballRadius;
  const serverDrop = simulatePlinkoDrop(width, height, seed);
  const ball = createPlinkoBall(width, height, seed);
  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - FALL_SPEED) < 1e-6, `некорректный стартовый импульс: seed=${seed}`);
  let steps = 0;
  let maxDisplacement = 0;
  let maxSpeedError = 0;

  while (!ball.settled && steps < MAX_STEPS) {
    const beforeX = ball.x;
    const beforeY = ball.y;
    stepPlinkoBall(ball, width, height, 1 / 120);
    const displacement = Math.hypot(ball.x - beforeX, ball.y - beforeY);
    maxDisplacement = Math.max(maxDisplacement, displacement);
    if (!ball.settled) {
      maxSpeedError = Math.max(maxSpeedError, Math.abs(Math.hypot(ball.vx, ball.vy) - FALL_SPEED));
      assert.ok(ball.vy >= -1e-6, `шарик отскочил вверх: seed=${seed}`);
      for (const peg of pegs) {
        const distance = Math.hypot(ball.x - peg.x, ball.y - peg.y);
        assert.ok(distance >= contactRadius - 1e-4, `шарик прошёл сквозь штырёк: seed=${seed}`);
      }
    }
    steps += 1;
  }

  assert.equal(ball.settled, true, `шарик не завершил падение: ${width}x${height}, seed=${seed}`);
  assert.equal(ball.actualBucket, serverDrop.bucket, `клиентский и серверный слоты расходятся: ${width}x${height}, seed=${seed}`);
  assert.ok(ball.actualBucket >= 0 && ball.actualBucket < 11, `некорректный слот: ${ball.actualBucket}`);
  assert.ok(maxDisplacement < 8, `резкий скачок: ${maxDisplacement.toFixed(2)} px`);
  assert.ok(maxSpeedError < 1e-6, `скорость не постоянна: ошибка ${maxSpeedError}`);
  assert.ok(ball.bounces <= 40, `слишком много повторных столкновений: ${ball.bounces}`);

  return { bucket: ball.actualBucket, steps, maxDisplacement, bounces: ball.bounces };
}

let total = 0;
let maxSteps = 0;
let maxDisplacement = 0;
let maxBounces = 0;
const slots = new Set();

for (const [width, height] of BOARDS) {
  for (let index = 0; index < 250; index += 1) {
    const seed = Math.imul(index + 1, 2654435761) >>> 0;
    const result = testDrop(width, height, seed);
    total += 1;
    slots.add(result.bucket);
    maxSteps = Math.max(maxSteps, result.steps);
    maxDisplacement = Math.max(maxDisplacement, result.maxDisplacement);
    maxBounces = Math.max(maxBounces, result.bounces);
  }
}

assert.equal(slots.size, 11, `доступны не все слоты: ${[...slots].sort((a, b) => a - b)}`);
console.log(`Общая физика Плинко: ${total} падений, все 11 слотов доступны`);
console.log(`Макс. шагов: ${maxSteps}; макс. смещение: ${maxDisplacement.toFixed(2)} px; макс. столкновений: ${maxBounces}`);
