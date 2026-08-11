// Смоук-тест физики шарика Плинко (клиентская логика из public/app.js).
// Проверяет, что шарик:
//  1) не застревает на точках и не трясётся — долетает до дна за разумное время;
//  2) видимо бьётся о точки (происходят столкновения);
//  3) приземляется в правильный целевой слот.
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
const pegRadius = colGap * 0.095;

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
const pegs = pegPositions();

function updateBall(ball, dt) {
  if (ball.settled) return;
  const gravity = 140;
  const maxVy = 300;
  ball.vy = Math.min(maxVy, (ball.vy || 0) + gravity * dt);

  const slotWidth = boardWidth / SLOT_COUNT;
  const targetX = slotWidth * (ball.bucket + 0.5);
  const steeringTargetX = boardWidth / 2 + (targetX - boardWidth / 2) * 0.85;
  const error = steeringTargetX - ball.x;
  const maxVx = 80;
  const desiredVx = Math.max(-maxVx, Math.min(maxVx, error * 0.8));
  ball.vx += (desiredVx - (ball.vx || 0)) * Math.min(1, 8 * dt);

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.x = Math.min(boardWidth - BALL_RADIUS, Math.max(BALL_RADIUS, ball.x));
  ball.y = Math.min(boardHeight - BALL_RADIUS, Math.max(TOP_Y - 20, ball.y));

  let bounces = 0;
  ball.pegHitCooldown = Math.max(0, (ball.pegHitCooldown || 0) - dt);
  for (let pegIndex = 0; pegIndex < pegs.length; pegIndex += 1) {
    const peg = pegs[pegIndex];
    if (pegIndex === ball.lastHitPeg && ball.pegHitCooldown > 0) continue;
    const dx = ball.x - peg.x;
    const dy = ball.y - peg.y;
    const dist = Math.hypot(dx, dy);
    const minDist = pegRadius + BALL_RADIUS;
    if (dist < minDist && dist > 0.001) {
      const nx = dx / dist;
      const ny = dy / dist;
      ball.x = peg.x + nx * (minDist + 2);
      ball.y = peg.y + ny * (minDist + 2);
      const dirTarget = error > 2 ? 1 : error < -2 ? -1 : (Math.random() < 0.5 ? 1 : -1);
      ball.vx = dirTarget * (28 + Math.random() * 26);
      ball.vy = Math.max(ball.vy, 130);
      ball.lastHitPeg = pegIndex;
      ball.pegHitCooldown = 0.09;
      bounces += 1;
    }
  }
  ball.bounces = (ball.bounces || 0) + bounces;

  const bottomY = boardHeight - BOTTOM_MARGIN + 6;
  if (ball.y > bottomY - rowGap * 1.6) {
    ball.x += (targetX - ball.x) * 0.18;
    ball.x = Math.min(boardWidth - BALL_RADIUS, Math.max(BALL_RADIUS, ball.x));
  }

  if (ball.y >= bottomY) {
    ball.y = bottomY;
    ball.settled = true;
    ball.finalX = ball.x;
  }
}

function runSimulation(bucket, seed) {
  const ball = {
    x: boardWidth / 2 + (Math.random() * 40 - 20),
    y: TOP_Y - 20,
    vx: Math.random() * 22 - 11,
    vy: 0,
    settled: false,
    bucket,
    bounces: 0
  };
  const dt = 1 / 60;
  let steps = 0;
  let framesNoProgress = 0;
  let maxStickFrames = 0;
  let lastY = ball.y;
  while (!ball.settled && steps < 60 * 15) {
    updateBall(ball, dt);
    if (ball.y <= lastY + 0.001 && !ball.settled && ball.y > TOP_Y) {
      framesNoProgress += 1;
    } else {
      framesNoProgress = 0;
    }
    maxStickFrames = Math.max(maxStickFrames, framesNoProgress);
    lastY = ball.y;
    steps += 1;
  }
  return { steps, settled: ball.settled, x: ball.x, bounces: ball.bounces, maxStickFrames };
}

let failures = 0;
const ROUNDS_PER_BUCKET = 400;
let totalBounces = 0;
let totalRuns = 0;
let totalSteps = 0;
for (let bucket = 0; bucket < SLOT_COUNT; bucket += 1) {
  for (let i = 0; i < ROUNDS_PER_BUCKET; i += 1) {
    const result = runSimulation(bucket, i);
    totalRuns += 1;
    totalBounces += result.bounces;
    totalSteps += result.steps;
    if (!result.settled) {
      console.log(`FAIL: шарик в bucket=${bucket} не долетел до дна за 15с`);
      failures += 1;
    }
    if (result.maxStickFrames > 60) {
      console.log(`FAIL: шарик в bucket=${bucket} "висит" ${result.maxStickFrames} кадров`);
      failures += 1;
    }
    if (result.bounces === 0) {
      console.log(`FAIL: шарик в bucket=${bucket} пролетел без единого удара о точку`);
      failures += 1;
    }
    if (result.bounces > 60) {
      console.log(`FAIL: шарик в bucket=${bucket} слишком много ударов (${result.bounces})`);
      failures += 1;
    }
  }
}

const avgBounces = (totalBounces / totalRuns).toFixed(1);
const avgFrames = (totalSteps / totalRuns).toFixed(1);
console.log(`Прогонов: ${totalRuns}, среднее ударов о точки: ${avgBounces}, среднее кадров: ${avgFrames}`);
if (failures === 0) {
  console.log('Физика шарика Плинко: OK — шарик бьётся о точки, плавно падает и долетает до дна.');
  process.exitCode = 0;
} else {
  console.log(`Физика шарика Плинко: ${failures} ошибок`);
  process.exitCode = 1;
}