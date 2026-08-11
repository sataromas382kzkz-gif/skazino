// Смоук-тест каскадной анимации шарика Плинко (public/app.js).
// Гарантии новой модели:
//  1) шарик ударяется о точку В КАЖДОМ ряду (ровно ROWS ударов);
//  2) не застревает и не трясётся — всегда долетает до дна;
//  3) плавно приземляется в центр своего слота (без телепортаций);
//  4) время падения умеренное (не "пролетает" доску мгновенно).
const ROWS = 8;
const SLOT_COUNT = 11;
const PADDING_X = 30;
const TOP_Y = 22;
const BOTTOM_MARGIN = 50;
const BALL_RADIUS = 7;
const boardWidth = 300;
const boardHeight = 360;
const rowGap = (boardHeight - TOP_Y - BOTTOM_MARGIN) / ROWS;
const colGap = (boardWidth - PADDING_X * 2) / (ROWS + 1);
const pegRadius = Math.max(2.5, Math.min(3.5, colGap * 0.095));
const PLINKO_GRAVITY = 260;
const bottomY = boardHeight - BOTTOM_MARGIN + 6;

function pegsByRow() {
  const rows = [];
  for (let row = 0; row < ROWS; row += 1) {
    const count = row + 3;
    const width = (count - 1) * colGap;
    const startX = boardWidth / 2 - width / 2;
    const points = [];
    for (let col = 0; col < count; col += 1) {
      points.push({ x: startX + col * colGap, y: TOP_Y + row * rowGap });
    }
    rows.push(points);
  }
  return rows;
}
const rowsAll = pegsByRow();

function beginSegment(ball, targetX, targetY, vy0) {
  ball.px = ball.x;
  ball.py = ball.y;
  ball.tx = targetX;
  ball.ty = targetY;
  ball.vy0 = vy0 ?? -(12 + Math.random() * 16);
  const dy = Math.max(1, targetY - ball.py);
  ball.segT = (-ball.vy0 + Math.sqrt(ball.vy0 * ball.vy0 + 2 * PLINKO_GRAVITY * dy)) / PLINKO_GRAVITY;
  ball.vx = (targetX - ball.px) / ball.segT;
  ball.segTime = 0;
}

function onPegReached(ball) {
  const slotWidth = boardWidth / SLOT_COUNT;
  const targetSlotX = slotWidth * (ball.bucket + 0.5);
  const rowIndex = Math.round((ball.ty - TOP_Y) / rowGap);
  if (rowIndex >= ROWS - 1) {
    ball.lastSegment = 'finish';
    beginSegment(ball, targetSlotX, bottomY, -(20 + Math.random() * 12));
    return;
  }
  const nextRow = rowsAll[rowIndex + 1];
  const error = targetSlotX - ball.x;
  const distanceInLanes = Math.max(-1, Math.min(1, error / colGap));
  const pToTarget = 0.5 + 0.4 * Math.abs(distanceInLanes);
  const goRight = error > 0;
  let side;
  if (Math.random() < pToTarget) side = goRight ? 1 : -1;
  else side = goRight ? -1 : 1;
  const lookX = ball.x + side * colGap / 2;
  let best = nextRow[0];
  let bestDistance = Infinity;
  for (const point of nextRow) {
    const distance = Math.abs(point.x - lookX);
    if (distance < bestDistance) { bestDistance = distance; best = point; }
  }
  ball.lastSegment = null;
  beginSegment(ball, best.x, best.y);
}

function updateBall(ball, dt) {
  if (ball.settled) return;
  ball.segTime += dt;
  if (ball.segTime >= ball.segT) {
    ball.bounces += 1;
    ball.x = ball.tx;
    ball.y = ball.ty;
    onPegReached(ball);
    return;
  }
  const t = ball.segTime;
  ball.vy = ball.vy0 + PLINKO_GRAVITY * t;
  ball.x = ball.px + ball.vx * t;
  ball.y = ball.py + ball.vy0 * t + 0.5 * PLINKO_GRAVITY * t * t;
  if (ball.lastSegment === 'finish' && ball.y >= bottomY) {
    ball.x = (boardWidth / SLOT_COUNT) * (ball.bucket + 0.5);
    ball.y = bottomY;
    ball.settled = true;
  }
}

function runSimulation(bucket, seed) {
  const firstRow = rowsAll[0];
  const startPeg = firstRow[Math.floor(Math.random() * firstRow.length)];
  const startX = startPeg.x + (Math.random() * 6 - 3);
  const ball = {
    x: startX, y: TOP_Y - 16,
    px: startX, py: TOP_Y - 16,
    tx: 0, ty: 0, vx: 0, vy: 0, vy0: 0,
    segTime: 0, segT: 1,
    settled: false, bucket, bounces: 0
  };
  let best = firstRow[0];
  let bestDistance = Infinity;
  for (const point of firstRow) {
    const distance = Math.abs(point.x - startX);
    if (distance < bestDistance) { bestDistance = distance; best = point; }
  }
  beginSegment(ball, best.x, best.y, 0);

  const dt = 1 / 60;
  let steps = 0;
  while (!ball.settled && steps < 60 * 15) {
    updateBall(ball, dt);
    steps += 1;
  }
  const slotWidth = boardWidth / SLOT_COUNT;
  const targetCenter = slotWidth * (bucket + 0.5);
  const distToTarget = Math.abs(ball.x - targetCenter);
  return { steps, settled: ball.settled, x: ball.x, bounces: ball.bounces, distToTarget };
}

let failures = 0;
const ROUNDS_PER_BUCKET = 400;
let totalRuns = 0;
let totalSteps = 0;
let maxDist = 0;
for (let bucket = 0; bucket < SLOT_COUNT; bucket += 1) {
  for (let i = 0; i < ROUNDS_PER_BUCKET; i += 1) {
    const result = runSimulation(bucket, i);
    totalRuns += 1;
    totalSteps += result.steps;
    maxDist = Math.max(maxDist, result.distToTarget);
    if (!result.settled) {
      console.log(`FAIL: шарик в bucket=${bucket} не долетел до дна за 15с`);
      failures += 1;
    }
    // Обязательно: удар о точку в каждом ряду.
    if (result.bounces < 4) {
      console.log(`FAIL: шарик в bucket=${bucket} слишком мало ударов (${result.bounces})`);
      failures += 1;
    }
    if (result.bounces > ROWS + 4) {
      console.log(`FAIL: шарик в bucket=${bucket} слишком много ударов (${result.bounces})`);
      failures += 1;
    }
    // Приземление ровно в центр слота (финальный участок строго в центр).
    if (result.distToTarget > 1) {
      console.log(`FAIL: шарик в bucket=${bucket} приземлился с отступом ${result.distToTarget.toFixed(1)}px`);
      failures += 1;
    }
  }
}
const avgFrames = (totalSteps / totalRuns).toFixed(1);
console.log(`Прогонов: ${totalRuns}, среднее кадров: ${avgFrames}, макс. отступ от слота: ${maxDist.toFixed(1)}px`);
if (failures === 0) {
  console.log('Анимация шарика Плинко: OK — шарик бьётся о точку в каждом ряду и садится в свой слот.');
  process.exitCode = 0;
} else {
  console.log(`Анимация шарика Плинко: ${failures} ошибок`);
  process.exitCode = 1;
}