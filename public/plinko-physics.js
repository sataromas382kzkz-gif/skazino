const ROWS = 8;
const SLOT_COUNT = 11;
const PADDING_X = 30;
const TOP_Y = 22;
const BOTTOM_MARGIN = 50;
const BALL_RADIUS = 7;
const FALL_SPEED = 120;
const MAX_HORIZONTAL_SPEED = FALL_SPEED;
const INITIAL_HORIZONTAL_IMPULSE = 72;
const FALL_TURN_RATE = 90;
const SUBSTEPS = 4;
const CONTACT_CLEARANCE = 1.25;
const MAX_STEPS = 2400;

function makeRng(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function plinkoMetrics(width, height) {
  const boardWidth = Math.max(200, Number(width) || 300);
  const boardHeight = Math.max(280, Number(height) || 360);
  const rowGap = (boardHeight - TOP_Y - BOTTOM_MARGIN) / ROWS;
  const colGap = (boardWidth - PADDING_X * 2) / (ROWS + 1);
  const pegRadius = Math.max(2.5, Math.min(3.5, colGap * 0.095));
  // На узких экранах расстояние между штырьками меньше диаметра большого
  // шарика. Масштабируем сам шарик, чтобы геометрия оставалась проходимой.
  const ballRadius = Math.min(BALL_RADIUS, Math.max(4.5, colGap * 0.28));
  return { boardWidth, boardHeight, rowGap, colGap, pegRadius, ballRadius };
}

export function plinkoPegs(width, height) {
  const metrics = plinkoMetrics(width, height);
  const positions = [];
  for (let row = 0; row < ROWS; row += 1) {
    const count = row + 3;
    const rowWidth = (count - 1) * metrics.colGap;
    const startX = metrics.boardWidth / 2 - rowWidth / 2;
    for (let col = 0; col < count; col += 1) {
      positions.push({
        x: startX + col * metrics.colGap,
        y: TOP_Y + row * metrics.rowGap
      });
    }
  }
  return positions;
}

export function plinkoSlotFromX(x, width) {
  const boardWidth = plinkoMetrics(width, 360).boardWidth;
  const slotWidth = boardWidth / SLOT_COUNT;
  return Math.max(0, Math.min(SLOT_COUNT - 1, Math.floor(Math.max(0, Math.min(boardWidth - 0.001, x)) / slotWidth)));
}

export function createPlinkoBall(width, height, seed) {
  const metrics = plinkoMetrics(width, height);
  const rng = makeRng(seed);
  const firstPegLeft = metrics.boardWidth / 2 - metrics.colGap;
  const firstPegRight = metrics.boardWidth / 2 + metrics.colGap;
  const spawnX = firstPegLeft + metrics.ballRadius
    + rng() * Math.max(1, firstPegRight - firstPegLeft - metrics.ballRadius * 2);
  const spawnOffset = (spawnX - metrics.boardWidth / 2) / Math.max(1, metrics.colGap);
  const initialVx = spawnOffset * 12 + (rng() - 0.5) * INITIAL_HORIZONTAL_IMPULSE * 2;
  const horizontalSpeed = Math.max(-MAX_HORIZONTAL_SPEED, Math.min(MAX_HORIZONTAL_SPEED, initialVx));

  return {
    x: spawnX,
    y: TOP_Y - 16,
    vx: horizontalSpeed,
    vy: Math.sqrt(FALL_SPEED * FALL_SPEED - horizontalSpeed * horizontalSpeed),
    spawnX,
    spawnY: TOP_Y - 16,
    radius: metrics.ballRadius,
    settled: false,
    actualBucket: null,
    bounces: 0,
    impact: 0,
    seed: Number(seed) >>> 0,
    rng
  };
}

function resolvePeg(ball, peg, contactRadius) {
  const dx = ball.x - peg.x;
  const dy = ball.y - peg.y;
  const distance = Math.hypot(dx, dy);
  if (distance > contactRadius + 1e-6) return;

  const fallbackSide = Math.sign(ball.vx) || 1;
  const nx = distance < 1e-6 ? -fallbackSide * 0.35 : dx / distance;
  const ny = distance < 1e-6 ? -Math.sqrt(1 - nx * nx) : dy / distance;
  ball.x = peg.x + nx * contactRadius;
  ball.y = peg.y + ny * contactRadius;

  // Полностью неупругое столкновение: удаляем только скорость, направленную
  // внутрь штырька. Нормальная скорость не отражается обратно, поэтому шарик
  // не отскакивает, а продолжает движение по касательной.
  const normalSpeed = ball.vx * nx + ball.vy * ny;
  let tangentVx = ball.vx - nx * Math.min(normalSpeed, 0);
  let tangentVy = ball.vy - ny * Math.min(normalSpeed, 0);
  let tangentLength = Math.hypot(tangentVx, tangentVy);

  if (tangentLength < 1e-6 || tangentVy < 0) {
    const tx = -ny;
    const ty = nx;
    const tangentSign = ty >= 0 ? 1 : -1;
    tangentVx = tx * tangentSign;
    tangentVy = ty * tangentSign;
    tangentLength = 1;
  }
  ball.vx = tangentVx * FALL_SPEED / tangentLength;
  ball.vy = tangentVy * FALL_SPEED / tangentLength;
  ball.bounces += 1;
  ball.impact = 1;
  ball.lastPeg = peg;
}

function isSamePeg(first, second) {
  return first && second && first.x === second.x && first.y === second.y;
}

function keepFallSpeed(ball, dt = 0, allowFallTurn = true) {
  let vx = Math.max(-MAX_HORIZONTAL_SPEED, Math.min(MAX_HORIZONTAL_SPEED, Number(ball.vx) || 0));
  if (allowFallTurn && dt > 0) {
    const turn = Math.min(Math.abs(vx), FALL_TURN_RATE * dt);
    vx -= Math.sign(vx) * turn;
  }
  ball.vx = vx;
  ball.vy = Math.sqrt(Math.max(0, FALL_SPEED * FALL_SPEED - vx * vx));
}

function findFirstPegHit(startX, startY, moveX, moveY, pegs, contactRadius, lastPeg) {
  const movementLengthSquared = moveX * moveX + moveY * moveY;
  if (movementLengthSquared < 1e-9) return null;

  let firstHit = null;
  for (const peg of pegs) {
    if (isSamePeg(peg, lastPeg)) continue;
    const offsetX = startX - peg.x;
    const offsetY = startY - peg.y;
    const c = offsetX * offsetX + offsetY * offsetY - contactRadius * contactRadius;
    const b = 2 * (offsetX * moveX + offsetY * moveY);
    const discriminant = b * b - 4 * movementLengthSquared * c;
    if (discriminant < 0) continue;
    const hitTime = c <= 0 ? 0 : (-b - Math.sqrt(discriminant)) / (2 * movementLengthSquared);
    if (hitTime < 0 || hitTime > 1 || (firstHit && hitTime >= firstHit.time)) continue;
    firstHit = { peg, time: hitTime };
  }
  return firstHit;
}

export function stepPlinkoBall(ball, width, height, dt, prepared = null) {
  if (ball.settled) return;
  const metrics = prepared?.metrics || plinkoMetrics(width, height);
  const pegs = prepared?.pegs || plinkoPegs(width, height);
  const contactRadius = metrics.pegRadius + ball.radius;
  const bottomY = metrics.boardHeight - BOTTOM_MARGIN + 6;
  const h = Math.min(0.05, Math.max(0, Number(dt) || 0)) / SUBSTEPS;
  ball.impact = Math.max(0, (ball.impact || 0) - Math.max(0, Number(dt) || 0) * 5);

  for (let substep = 0; substep < SUBSTEPS; substep += 1) {
    if (ball.lastPeg) {
      const distanceFromLastPeg = Math.hypot(ball.x - ball.lastPeg.x, ball.y - ball.lastPeg.y);
      if (distanceFromLastPeg >= contactRadius * CONTACT_CLEARANCE) ball.lastPeg = null;
    }
    keepFallSpeed(ball, h, !ball.lastPeg);

    let remaining = 1;
    for (let contact = 0; contact < 3 && remaining > 1e-6; contact += 1) {
      const hit = findFirstPegHit(
        ball.x,
        ball.y,
        ball.vx * h * remaining,
        ball.vy * h * remaining,
        pegs,
        contactRadius,
        ball.lastPeg
      );
      if (!hit) {
        ball.x += ball.vx * h * remaining;
        ball.y += ball.vy * h * remaining;
        break;
      }
      ball.x += ball.vx * h * remaining * hit.time;
      ball.y += ball.vy * h * remaining * hit.time;
      resolvePeg(ball, hit.peg, contactRadius);
      remaining *= 1 - hit.time;
    }

    if (ball.x < ball.radius) {
      ball.x = ball.radius;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x > metrics.boardWidth - ball.radius) {
      ball.x = metrics.boardWidth - ball.radius;
      ball.vx = -Math.abs(ball.vx);
    }

    // Скорость сохраняется после любой корректировки положения и у границ поля.
    keepFallSpeed(ball);
  }

  if (ball.y >= bottomY) {
    ball.y = bottomY;
    ball.vy = 0;
    ball.vx = 0;
    ball.actualBucket = plinkoSlotFromX(ball.x, metrics.boardWidth);
    ball.settled = true;
  }
}

export function simulatePlinkoDrop(width, height, seed) {
  const metrics = plinkoMetrics(width, height);
  const prepared = { metrics, pegs: plinkoPegs(metrics.boardWidth, metrics.boardHeight) };
  const ball = createPlinkoBall(metrics.boardWidth, metrics.boardHeight, seed);
  const dt = 1 / 120;
  let steps = 0;
  while (!ball.settled && steps < MAX_STEPS) {
    stepPlinkoBall(ball, metrics.boardWidth, metrics.boardHeight, dt, prepared);
    steps += 1;
  }
  if (!ball.settled) throw new Error('Шарик Плинко не завершил физическое падение');
  return { bucket: ball.actualBucket, steps, bounces: ball.bounces };
}
