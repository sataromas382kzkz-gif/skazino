// Смоук-тест каскадной анимации шарика Плинко (public/app.js).
// Гарантии модели с жёсткими точками:
//  1) шарик ударяется о точку в каждом ряду и отскакивает от её поверхности
//     (минимум ROWS ударов; шарик никогда не проходит сквозь точку);
//  2) не застревает и не трясётся — всегда долетает до дна;
//  3) плавно приземляется в центр своего слота (без телепортаций);
//  4) время падения умеренное.
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
const contactRadius = pegRadius + BALL_RADIUS;
const slotWidth = boardWidth / SLOT_COUNT;

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
const flatPegs = rowsAll.flat();

function beginSegment(ball, targetX, targetY, vy0, targetIsPeg) {
  ball.px = ball.x;
  ball.py = ball.y;
  ball.tx = targetX;
  ball.ty = targetY;
  ball.targetIsPeg = targetIsPeg;
  // После удара о точку шарик уходит только вниз-вбок (без подъёма обратно
  // в жёсткую зону той же точки).
  ball.vy0 = vy0 ?? (6 + Math.random() * 16);
  const dy = Math.max(1, targetY - ball.py);
  ball.segT = (-ball.vy0 + Math.sqrt(ball.vy0 * ball.vy0 + 2 * PLINKO_GRAVITY * dy)) / PLINKO_GRAVITY;
  ball.vx = (targetX - ball.px) / ball.segT;
  ball.segTime = 0;
}

function firstSegmentCircleHit(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-9) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t1 = (-b - Math.sqrt(disc)) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  return -1;
}

function onPegHit(ball, pegX, pegY) {
  const targetSlotX = slotWidth * (ball.bucket + 0.5);
  const rowIndex = Math.round((pegY - TOP_Y) / rowGap);
  if (rowIndex >= ROWS - 1) {
    const dirSign = targetSlotX >= pegX ? 1 : -1;
    ball.x = pegX + dirSign * contactRadius;
    ball.y = pegY;
    ball.finalStage = 1;
    beginSegment(ball, ball.x, bottomY - 28, 0, false);
    return;
  }
  const nextRow = rowsAll[rowIndex + 1];
  const error = targetSlotX - pegX;
  const distanceInLanes = Math.max(-1, Math.min(1, error / colGap));
  const pToTarget = 0.5 + 0.4 * Math.abs(distanceInLanes);
  const goRight = error > 0;
  let side;
  if (Math.random() < pToTarget) side = goRight ? 1 : -1;
  else side = goRight ? -1 : 1;
  const lookX = pegX + side * colGap / 2;
  let best = nextRow[0];
  let bestDistance = Infinity;
  for (const point of nextRow) {
    const distance = Math.abs(point.x - lookX);
    if (distance < bestDistance) { bestDistance = distance; best = point; }
  }
  const dirSign = best.x >= pegX ? 1 : -1;
  ball.x = pegX + dirSign * contactRadius;
  ball.y = pegY;
  beginSegment(ball, best.x, best.y, undefined, true);
}

function updateBall(ball, dt) {
  if (ball.settled) return;
  const t0 = ball.segTime;
  const t1 = ball.segTime + dt;
  ball.segTime = t1;
  ball.vy = ball.vy0 + PLINKO_GRAVITY * t1;
  ball.x = ball.px + ball.vx * t1;
  ball.y = ball.py + ball.vy0 * t1 + 0.5 * PLINKO_GRAVITY * t1 * t1;
  const px0 = ball.px + ball.vx * t0;
  const py0 = ball.py + ball.vy0 * t0 + 0.5 * PLINKO_GRAVITY * t0 * t0;

  if (ball.targetIsPeg) {
    const contact = firstSegmentCircleHit(px0, py0, ball.x, ball.y, ball.tx, ball.ty, contactRadius);
    if (contact >= 0 || Math.hypot(ball.x - ball.tx, ball.y - ball.ty) <= contactRadius) {
      const cx = px0 + (ball.x - px0) * (contact >= 0 ? contact : 1);
      const cy = py0 + (ball.y - py0) * (contact >= 0 ? contact : 1);
      ball.bounces += 1;
      onPegHit(ball, cx, cy, ball.tx, ball.ty);
    }
    return;
  }

  // Финальный спуск: проверка контакта с ЛЮБОЙ точкой (жёсткий обход).
  let hitT = -1;
  let hitPeg = null;
  for (const peg of flatPegs) {
    const t = firstSegmentCircleHit(px0, py0, ball.x, ball.y, peg.x, peg.y, contactRadius);
    if (t >= 0 && (hitT < 0 || t < hitT)) { hitT = t; hitPeg = peg; }
  }
  if (hitPeg) {
    const cx = px0 + (ball.x - px0) * hitT;
    const cy = py0 + (ball.y - py0) * hitT;
    ball.bounces += 1;
    onPegHit(ball, cx, cy, hitPeg.x, hitPeg.y);
    return;
  }

  if (ball.finalStage === 1 && ball.y >= ball.ty) {
    const targetSlotX = slotWidth * (ball.bucket + 0.5);
    ball.finalStage = 2;
    beginSegment(ball, targetSlotX, bottomY, 0, false);
    return;
  }
  if (ball.y >= bottomY) {
    ball.x = slotWidth * (ball.bucket + 0.5);
    ball.y = bottomY;
    ball.settled = true;
  }
}

function runSimulation(bucket) {
  const firstRow = rowsAll[0];
  const startPeg = firstRow[Math.floor(Math.random() * firstRow.length)];
  const startX = startPeg.x + (Math.random() * 6 - 3);
  const ball = {
    x: startX, y: TOP_Y - 16,
    px: startX, py: TOP_Y - 16,
    tx: 0, ty: 0, vx: 0, vy: 0, vy0: 0,
    segTime: 0, segT: 1,
    bounces: 0, finalStage: 0,
    settled: false, bucket
  };
  let best = firstRow[0];
  let bestDistance = Infinity;
  for (const point of firstRow) {
    const distance = Math.abs(point.x - startX);
    if (distance < bestDistance) { bestDistance = distance; best = point; }
  }
  beginSegment(ball, best.x, best.y, 0, true);

  const dt = 1 / 60;
  let steps = 0;
  let minDistToPeg = Infinity;
  let minFrame = -1;
  let minPegPos = null;
  let minBallPos = null;
  while (!ball.settled && steps < 60 * 15) {
    updateBall(ball, dt);
    steps += 1;
    for (const peg of flatPegs) {
      const distance = Math.hypot(ball.x - peg.x, ball.y - peg.y);
      if (distance < minDistToPeg) {
        minDistToPeg = distance;
        minFrame = steps;
        minPegPos = { x: peg.x, y: peg.y };
        minBallPos = { x: ball.x, y: ball.y };
      }
    }
  }
  const targetCenter = slotWidth * (bucket + 0.5);
  return {
    steps, settled: ball.settled, x: ball.x,
    bounces: ball.bounces, distToTarget: Math.abs(ball.x - targetCenter),
    minDistToPeg, minFrame, minPegPos, minBallPos
  };
}

let failures = 0;
const ROUNDS_PER_BUCKET = 400;
let totalRuns = 0;
let totalSteps = 0;
let maxDist = 0;
let minPegDistOverall = Infinity;
let maxBounces = 0;
let minBounces = Infinity;
for (let bucket = 0; bucket < SLOT_COUNT; bucket += 1) {
  for (let i = 0; i < ROUNDS_PER_BUCKET; i += 1) {
    const result = runSimulation(bucket);
    totalRuns += 1;
    totalSteps += result.steps;
    maxDist = Math.max(maxDist, result.distToTarget);
    minPegDistOverall = Math.min(minPegDistOverall, result.minDistToPeg);
    maxBounces = Math.max(maxBounces, result.bounces);
    minBounces = Math.min(minBounces, result.bounces);
    if (!result.settled) {
      console.log(`FAIL: шарик в bucket=${bucket} не долетел до дна за 15с`);
      failures += 1;
    }
    if (result.bounces < ROWS) {
      console.log(`FAIL: шарик в bucket=${bucket} ударов ${result.bounces}, минимум ${ROWS}`);
      failures += 1;
    }
    if (result.distToTarget > 1) {
      console.log(`FAIL: шарик в bucket=${bucket} приземлился с отступом ${result.distToTarget.toFixed(1)}px`);
      failures += 1;
    }
    if (result.minDistToPeg < contactRadius - 0.01) {
      console.log(`FAIL: шарик в bucket=${bucket} проник в точку (мин. дистанция ${result.minDistToPeg.toFixed(2)}px) на кадре ${result.minFrame}`);
      console.log(`      точка (${result.minPegPos?.x.toFixed(1)}, ${result.minPegPos?.y.toFixed(1)}), шарик (${result.minBallPos?.x.toFixed(1)}, ${result.minBallPos?.y.toFixed(1)}), bounces ${result.bounces}`);
      failures += 1;
    }
  }
}
const avgFrames = (totalSteps / totalRuns).toFixed(1);
console.log(`Прогонов: ${totalRuns}, среднее кадров: ${avgFrames}, макс. отступ от слота: ${maxDist.toFixed(1)}px, мин. дистанция до точки: ${minPegDistOverall.toFixed(2)}px (радиус ${contactRadius}), ударов: ${minBounces}..${maxBounces}`);
if (failures === 0) {
  console.log('Анимация шарика Плинко: OK — точки жёсткие, шарик отскакивает от их поверхности и садится в свой слот.');
  process.exitCode = 0;
} else {
  console.log(`Анимация шарика Плинко: ${failures} ошибок`);
  process.exitCode = 1;
}