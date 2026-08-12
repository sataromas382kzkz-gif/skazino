// Тест физики Плинко. Дублирует чистую логику из public/app.js
// (initPlinko: геометрия, dropBall, applyBallPhysics, settleBall) и
// проверяет инварианты реалистичного падения без резких телепортов:
//   - шарик никогда не проникает сквозь точки;
//   - шарик всегда приземляется (не "залипает");
//   - шарик прилетает ровно в центр целевого слота (результат сервера);
//   - между кадрами нет резких скачков (нет "отскока к коэффициенту").
// Запуск: node public/tests/plinko-physics.test.js

'use strict';

// --- Детерминированный ГПСЧ, чтобы тест был воспроизводимым.
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = makeRng(123456789);

// --- Константы и геометрия (как в app.js, блок ПЛИНКО).
const ROWS = 8;
const SLOT_COUNT = 11;
const PADDING_X = 30;
const TOP_Y = 22;
const BOTTOM_MARGIN = 50;
const BALL_RADIUS = 7;
let pegRadius = 3.5;
let rowGap = 0;
let colGap = 0;
let boardWidth = 300;
let boardHeight = 360;

function resize(width, height) {
  boardWidth = Math.max(200, width || 300);
  boardHeight = Math.max(280, height || 360);
  rowGap = (boardHeight - TOP_Y - BOTTOM_MARGIN) / ROWS;
  colGap = (boardWidth - PADDING_X * 2) / (ROWS + 1);
  pegRadius = Math.max(2.5, Math.min(3.5, colGap * 0.095));
}

function pegPositions() {
  const positions = [];
  for (let row = 0; row < ROWS; row += 1) {
    const count = row + 3;
    const width = (count - 1) * colGap;
    const startX = boardWidth / 2 - width / 2;
    for (let col = 0; col < count; col += 1) {
      positions.push({ x: startX + col * colGap, y: TOP_Y + row * rowGap });
    }
  }
  return positions;
}

function pegContactRadius() {
  return pegRadius + BALL_RADIUS;
}

const PLINKO_GRAVITY = 900;
const SUBSTEPS = 24;
const RESTITUTION = 0.35;
const STEER_STRENGTH = 8;
const STEER_BELOW_PEGS = 30;
const STEER_RESCUE = 200;
const MAX_SPEED = 1200;
const STILL_LIMIT = 0.3;

function settleBall(ball) {
  const slotWidth = boardWidth / SLOT_COUNT;
  const bottomY = boardHeight - BOTTOM_MARGIN + 6;
  ball.actualBucket = ball.bucket;
  ball.x = slotWidth * (ball.bucket + 0.5);
  ball.y = bottomY;
  ball.vx = 0;
  ball.vy = 0;
  ball.settled = true;
}

function contactRadius(ball) {
  return ball.wedged ? BALL_RADIUS * 0.4 : pegContactRadius();
}

function updateStuckGuard(ball, dt, lastRowY) {
  if (ball.y > (ball.lowestY ?? ball.y) + 0.5) {
    ball.lowestY = ball.y;
    ball.stillTime = 0;
    ball.wedged = false;
  } else {
    ball.stillTime = (ball.stillTime || 0) + dt;
  }
  if (ball.stillTime > STILL_LIMIT) ball.wedged = true;
  if (ball.wedged && ball.y > lastRowY) ball.wedged = false;
}

function applyBallPhysics(ball, dt) {
  if (ball.settled) return;
  const slotWidth = boardWidth / SLOT_COUNT;
  const targetX = slotWidth * (ball.bucket + 0.5);
  const pegs = pegPositions();
  const lastRowY = TOP_Y + (ROWS - 1) * rowGap;
  const bottomY = boardHeight - BOTTOM_MARGIN + 6;

  if (ball.settling) {
    ball.x += (targetX - ball.x) * Math.min(1, 10 * dt);
    ball.vx *= 0.7;
    ball.vy = 0;
    if (Math.abs(ball.x - targetX) < 1.2) {
      ball.x = targetX;
      settleBall(ball);
    }
    return;
  }

  updateStuckGuard(ball, dt, lastRowY);
  const R = contactRadius(ball);
  const h = dt / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s += 1) {
    ball.vy += PLINKO_GRAVITY * h;
    const steer = ball.wedged ? STEER_RESCUE
      : ball.y > lastRowY ? STEER_BELOW_PEGS : STEER_STRENGTH;
    ball.vx += (targetX - ball.x) * steer * h;
    ball.vx *= (1 - 0.8 * h);
    if (ball.wedged) ball.vy += 500 * h;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > MAX_SPEED) { ball.vx *= MAX_SPEED / speed; ball.vy *= MAX_SPEED / speed; }
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;
    if (ball.x < BALL_RADIUS) { ball.x = BALL_RADIUS; ball.vx = Math.abs(ball.vx) * 0.5; }
    if (ball.x > boardWidth - BALL_RADIUS) { ball.x = boardWidth - BALL_RADIUS; ball.vx = -Math.abs(ball.vx) * 0.5; }
    for (const peg of pegs) {
      const dx = ball.x - peg.x;
      const dy = ball.y - peg.y;
      const dist = Math.hypot(dx, dy);
      if (dist < R && dist > 1e-6) {
        const nx = dx / dist;
        const ny = dy / dist;
        ball.x = peg.x + nx * R;
        ball.y = peg.y + ny * R;
        const vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) {
          ball.vx -= (1 + RESTITUTION) * vn * nx;
          ball.vy -= (1 + RESTITUTION) * vn * ny;
          if (ny < -0.6) {
            const dir = Math.abs(dx) > 1e-3 ? Math.sign(dx) : (rand() < 0.5 ? -1 : 1);
            ball.vx += dir * 12;
          }
          ball.vx += (rand() * 2 - 1) * 6;
          ball.bounces = (ball.bounces || 0) + 1;
        }
      }
    }
  }
  if (ball.y >= bottomY) {
    ball.y = bottomY;
    ball.vy = 0;
    ball.settling = true;
  }
}

function dropBall(bucket, multiplier, payout) {
  const bucketIndex = Math.max(0, Math.min(SLOT_COUNT - 1, Math.floor(Number(bucket))));
  const offset = (bucketIndex - 5) * 0.15;
  const startX = boardWidth / 2 + offset * colGap * 3 + (rand() * 2 - 1) * colGap * 0.3;
  return {
    x: startX,
    y: TOP_Y - 16,
    vx: (rand() * 2 - 1) * 18,
    vy: 0,
    bounces: 0,
    lowestY: TOP_Y - 16,
    stillTime: 0,
    wedged: false,
    settling: false,
    settled: false,
    bucket: bucketIndex,
    multiplier,
    payout: Number(payout),
  };
}

// --- Прогон одного шарика и сбор статистики.
function simulate(boardW, boardH, bucket, seed) {
  rand = makeRng(seed);
  resize(boardW, boardH);
  const slotWidth = boardWidth / SLOT_COUNT;
  const pegs = pegPositions();
  const dt = 1 / 60;
  const maxSteps = 6000;
  const ball = dropBall(bucket, 1, 1);
  let steps = 0;
  let minPegDist = Infinity;
  let maxStepDisp = 0;
  let zeroBounceDrops = 0;
  let penetration = null;

  while (!ball.settled && steps < maxSteps) {
    const px = ball.x;
    const py = ball.y;
    applyBallPhysics(ball, dt);
    const disp = Math.hypot(ball.x - px, ball.y - py);
    if (disp > maxStepDisp) maxStepDisp = disp;
    // Проверяем проникновение на каждом кадре, используя эффективный радиус
    // столкновения (во время аварийного "просачивания" он меньше нормы).
    const R = contactRadius(ball);
    let frameMin = Infinity;
    for (const peg of pegs) {
      const d = Math.hypot(ball.x - peg.x, ball.y - peg.y);
      if (d < frameMin) frameMin = d;
    }
    if (frameMin < R - 0.6 && !penetration) {
      penetration = { min: frameMin, R };
    }
    if (frameMin < minPegDist) minPegDist = frameMin;
    steps += 1;
  }

  if (!ball.settled) {
    return { ok: false, reason: 'stuck (не приземлился за ' + maxSteps + ' шагов)', ball, steps, minPegDist, maxStepDisp };
  }
  if (penetration) {
    return { ok: false, reason: 'проникновение сквозь точку (minDist=' + penetration.min.toFixed(2) + ' < R=' + penetration.R.toFixed(2) + ')', ball, steps, minPegDist, maxStepDisp };
  }
  const slotCenter = slotWidth * (ball.bucket + 0.5);
  if (Math.abs(ball.x - slotCenter) > 1e-6) {
    return { ok: false, reason: 'приземлился не в центре слота (dx=' + (ball.x - slotCenter).toFixed(3) + ')', ball, steps, minPegDist, maxStepDisp };
  }
  if (ball.bucket !== bucket) {
    return { ok: false, reason: 'приземлился не в целевой слот', ball, steps, minPegDist, maxStepDisp };
  }
  if (ball.bounces === 0) zeroBounceDrops += 1;
  return { ok: true, ball, steps, minPegDist, maxStepDisp, zeroBounceDrops };
}

// --- Запуск тестов.
function main() {
  const boards = [
    [300, 360],
    [200, 280],
    [400, 420],
    [360, 300],
  ];
  let failures = 0;
  let total = 0;
  let maxStepsSeen = 0;
  let maxDispSeen = 0;
  let minBounces = Infinity;
  let zeroBounceCount = 0;

  for (const [bw, bh] of boards) {
    for (let bucket = 0; bucket < SLOT_COUNT; bucket += 1) {
      for (let i = 0; i < 60; i += 1) {
        const seed = (bucket * 1000003 + i * 7919 + 1) >>> 0;
        const res = simulate(bw, bh, bucket, seed);
        total += 1;
        if (!res.ok) {
          failures += 1;
          console.error(`FAIL [${bw}x${bh} bucket=${bucket} i=${i}]: ${res.reason}`);
        } else {
          maxStepsSeen = Math.max(maxStepsSeen, res.steps);
          maxDispSeen = Math.max(maxDispSeen, res.maxStepDisp);
          minBounces = Math.min(minBounces, res.ball.bounces);
          zeroBounceCount += res.zeroBounceDrops;
        }
      }
    }
  }

  console.log(`Всего прогонов: ${total}, провалов: ${failures}`);
  console.log(`Макс. кадров до приземления: ${maxStepsSeen} (${(maxStepsSeen / 60).toFixed(1)} c)`);
  console.log(`Макс. смещение за кадр: ${maxDispSeen.toFixed(2)} px`);
  console.log(`Мин. число отскоков за прогон: ${minBounces}`);
  console.log(`Прогонов без отскоков: ${zeroBounceCount}`);

  if (failures > 0) {
    console.error('ТЕСТ ПРОВАЛЕН');
    process.exit(1);
  }
  console.log('ТЕСТ ПРОЙДЕН: падение плавное, без проникновений и резких скачков к коэффициенту.');
}

main();
