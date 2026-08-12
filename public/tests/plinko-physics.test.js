import assert from 'node:assert/strict';
import {
  createPlinkoBall,
  plinkoMetrics,
  plinkoPegs,
  simulatePlinkoDrop,
  stepPlinkoBall
} from '../plinko-physics.js';

const MAX_STEPS = 3600;
const BOARDS = [[300, 360], [200, 280], [400, 420], [524, 450]];

function testDrop(width, height, seed) {
  const metrics = plinkoMetrics(width, height);
  const pegs = plinkoPegs(width, height);
  const contactRadius = metrics.pegRadius + metrics.ballRadius;
  const serverDrop = simulatePlinkoDrop(width, height, seed);
  const ball = createPlinkoBall(width, height, seed);
  let steps = 0;
  let maxDisplacement = 0;

  while (!ball.settled && steps < MAX_STEPS) {
    const beforeX = ball.x;
    const beforeY = ball.y;
    stepPlinkoBall(ball, width, height, 1 / 120);
    const displacement = Math.hypot(ball.x - beforeX, ball.y - beforeY);
    maxDisplacement = Math.max(maxDisplacement, displacement);
    if (!ball.settled) {
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
  assert.ok(maxDisplacement < 10, `резкий скачок: ${maxDisplacement.toFixed(2)} px`);
  assert.ok(ball.bounces <= 40, `слишком много повторных столкновений: ${ball.bounces}`);

  return { bucket: ball.actualBucket, steps, bounces: ball.bounces };
}

let total = 0;
let sumSteps = 0;
let maxSteps = 0;
let maxBounces = 0;
const slots = new Set();

for (const [width, height] of BOARDS) {
  for (let index = 0; index < 250; index += 1) {
    const seed = Math.imul(index + 1, 2654435761) >>> 0;
    const result = testDrop(width, height, seed);
    total += 1;
    slots.add(result.bucket);
    sumSteps += result.steps;
    maxSteps = Math.max(maxSteps, result.steps);
    maxBounces = Math.max(maxBounces, result.bounces);
  }
}

assert.equal(slots.size, 11, `доступны не все слоты: ${[...slots].sort((a, b) => a - b)}`);
const avgSeconds = sumSteps / total / 120;
// Среднее время падения должно быть близко к 3.5 секундам.
assert.ok(avgSeconds > 3.0 && avgSeconds < 4.0, `среднее время падения вне диапазона: ${avgSeconds.toFixed(2)}s`);
console.log(`Физика Плинко: ${total} падений, все 11 слотов, среднее время ${avgSeconds.toFixed(2)}s`);
console.log(`Макс. шагов: ${maxSteps} (${(maxSteps / 120).toFixed(2)}s); макс. столкновений: ${maxBounces}`);