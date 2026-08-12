const ROWS = 8;
const SLOT_COUNT = 11;
const PADDING_X = 30;
const TOP_Y = 22;
const BOTTOM_MARGIN = 50;
const BALL_RADIUS = 7;
const FALL_SPEED = 120;
const MIN_DOWNWARD_SPEED = 60;
const RESTITUTION = 0.32;
const TANGENT_KEEP = 0.72;
const SUBSTEPS = 16;
const COLLISION_PASSES = 2;
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

  return {
    x: spawnX,
    y: TOP_Y - 16,
    vx: spawnOffset * 12 + (rng() - 0.5) * 600,
    vy: 0,
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
  if (distance >= contactRadius || distance < 1e-6) return;

  const nx = dx / distance;
  const ny = dy / distance;
  ball.x = peg.x + nx * contactRadius;
  ball.y = peg.y + ny * contactRadius;

  const normalVelocity = ball.vx * nx + ball.vy * ny;
  if (normalVelocity >= 0) return;

  const tx = -ny;
  const ty = nx;
  const tangentVelocity = ball.vx * tx + ball.vy * ty;
  ball.vx = tx * tangentVelocity * TANGENT_KEEP - nx * Math.abs(normalVelocity) * RESTITUTION;
  ball.vy = ty * tangentVelocity * TANGENT_KEEP - ny * Math.abs(normalVelocity) * RESTITUTION;
  ball.bounces += 1;
  ball.impact = Math.min(1, Math.abs(normalVelocity) / 360);
  ball.lastPeg = peg;
}

function keepFallSpeed(ball) {
  let vx = Number(ball.vx) || 0;
  let vy = Math.max(MIN_DOWNWARD_SPEED, Number(ball.vy) || 0);
  const speed = Math.hypot(vx, vy) || FALL_SPEED;
  ball.vx = vx * FALL_SPEED / speed;
  ball.vy = vy * FALL_SPEED / speed;
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
    keepFallSpeed(ball);

    if (ball.lastPeg) {
      const distanceFromLastPeg = Math.hypot(ball.x - ball.lastPeg.x, ball.y - ball.lastPeg.y);
      if (distanceFromLastPeg >= contactRadius * 1.08) ball.lastPeg = null;
    }

    ball.x += ball.vx * h;
    ball.y += ball.vy * h;

    if (ball.x < ball.radius) {
      ball.x = ball.radius;
      ball.vx = Math.abs(ball.vx) * RESTITUTION;
    } else if (ball.x > metrics.boardWidth - ball.radius) {
      ball.x = metrics.boardWidth - ball.radius;
      ball.vx = -Math.abs(ball.vx) * RESTITUTION;
    }

    // Несколько проходов нужны, когда шарик касается двух соседних штырьков
    // одновременно: так коррекция контакта не возвращает его в предыдущий.
    for (let pass = 0; pass < COLLISION_PASSES; pass += 1) {
      for (const peg of pegs) {
        if (peg === ball.lastPeg) continue;
        resolvePeg(ball, peg, contactRadius);
      }
    }
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
