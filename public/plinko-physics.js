const ROWS = 8;
const SLOT_COUNT = 11;
const PADDING_X = 30;
const TOP_Y = 22;
const BOTTOM_MARGIN = 50;
const BALL_RADIUS = 7;

// ---------------------------------------------------------------------------
// ФИЗИКА ШАРИКА КАК ФИЗИЧЕСКОГО ОБЪЕКТА
// ---------------------------------------------------------------------------
// Шарик — тяжёлый объект с инерцией: падает под действием гравитации,
// сталкивается с колышками по закону сохранения импульса (с потерями энергии),
// трение раскручивает его, а сопротивление воздуха гасит разгон.
// Симуляция полностью детерминирована: один seed => один результат и на
// сервере, и в браузере, поэтому визуальное падение совпадает с выплатой.
const PHYSICS_DT = 1 / 120;      // фиксированный шаг (клиент и сервер совпадают)
const SUBSTEPS = 8;              // подшагов на шаг для точных коллизий
const MAX_STEPS = 3600;          // запас 30 секунд на полное падение
const GRAVITY = 370;             // px/с² — подобрано под ~3.5 сек полёта
const RESTITUTION = 0.16;        // упругость удара о колышек (тяжёлый шарик)
const WALL_RESTITUTION = 0.45;   // упругость о боковые стены
const FRICTION = 0.16;           // трение скольжения о колышек
const AIR_DRAG = 0.05;           // сопротивление воздуха
const MAX_SPEED = 420;           // предел скорости для стабильности
const SPIN_FACTOR = 0.24;        // насколько трение раскручивает шарик
const SPIN_DAMP = 0.995;         // затухание вращения
// Тяжёлый шарик почти не «вылетает» вверх после удара: вертикальная
// составляющая гасится, горизонтальное отклонение сохраняется.
const UP_KILL = 0.22;
// Минимальная скорость вниз: шарик не может «зависнуть» между колышками.
const MIN_FALL = 18;
// Пока шарик не отдалится от последнего колышка на это расстояние, он
// считается «в контакте» и не получает повторного отскока (только скользит).
const CONTACT_CLEARANCE = 1.4;

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

// Группирует колышки по рядам: шарик может столкнуться только с ближайшими
// рядами, поэтому проверка всех 52 колышков каждый шаг не нужна. Группировка
// детерминирована и одинакова на сервере и клиенте.
export function plinkoPegRows(width, height) {
  const metrics = plinkoMetrics(width, height);
  const rows = [];
  for (let row = 0; row < ROWS; row += 1) {
    const count = row + 3;
    const rowWidth = (count - 1) * metrics.colGap;
    const startX = metrics.boardWidth / 2 - rowWidth / 2;
    const rowPegs = [];
    for (let col = 0; col < count; col += 1) {
      rowPegs.push({
        x: startX + col * metrics.colGap,
        y: TOP_Y + row * metrics.rowGap
      });
    }
    rows.push(rowPegs);
  }
  return rows;
}

export function plinkoSlotFromX(x, width) {
  const boardWidth = plinkoMetrics(width, 360).boardWidth;
  const slotWidth = boardWidth / SLOT_COUNT;
  return Math.max(0, Math.min(SLOT_COUNT - 1, Math.floor(Math.max(0, Math.min(boardWidth - 0.001, x)) / slotWidth)));
}

export function createPlinkoBall(width, height, seed) {
  const metrics = plinkoMetrics(width, height);
  const rng = makeRng(seed);
  // Широкий спавн по верхней части доски: шарик падает через первые
  // колышки из разных точек, поэтому и крайние слоты (0.2x) достижимы.
  // Это не меняет результат симуляции для уже выбранного seed, а лишь
  // ускоряет подбор seed под нужный слот (rejection sampling).
  const halfSpan = 2 * metrics.colGap;
  const spawnMinX = metrics.boardWidth / 2 - halfSpan + metrics.ballRadius;
  const spawnMaxX = metrics.boardWidth / 2 + halfSpan - metrics.ballRadius;
  const spawnX = spawnMinX + rng() * Math.max(1, spawnMaxX - spawnMinX);

  return {
    x: spawnX,
    y: TOP_Y - 16,
    vx: 0,
    vy: 0,
    spawnX,
    spawnY: TOP_Y - 16,
    radius: metrics.ballRadius,
    settled: false,
    actualBucket: null,
    bounces: 0,
    impact: 0,
    angle: 0,
    spin: 0,
    lastPeg: null,
    seed: Number(seed) >>> 0,
    rng
  };
}

// Столкновение с боковой стеной: мягкое отражение по горизонтали.
function collideBallWall(ball, metrics) {
  if (ball.x < ball.radius) {
    ball.x = ball.radius;
    if (ball.vx < 0) ball.vx = -ball.vx * WALL_RESTITUTION;
  } else if (ball.x > metrics.boardWidth - ball.radius) {
    ball.x = metrics.boardWidth - ball.radius;
    if (ball.vx > 0) ball.vx = -ball.vx * WALL_RESTITUTION;
  }
}

// Полностью неупругое скольжение вдоль колышка: убираем только скорость,
// направленную внутрь. Шарик не отскакивает, а обтекает колышек.
function isSamePeg(first, second) {
  return Boolean(first && second && first.x === second.x && first.y === second.y);
}

function slideOffPeg(ball, peg, contactRadius) {
  const dx = ball.x - peg.x;
  const dy = ball.y - peg.y;
  const dist = Math.hypot(dx, dy) || 1e-6;
  const nx = dx / dist;
  const ny = dy / dist;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn >= 0) return;
  // Удаляем только нормальную составляющую внутрь колышка.
  ball.vx -= nx * vn;
  ball.vy -= ny * vn;
  // Трение раскручивает шарик.
  const tx = -ny;
  const ty = nx;
  const vt = ball.vx * tx + ball.vy * ty;
  ball.spin += vt * SPIN_FACTOR * 0.5;
}

// Импульсное столкновение с колышком (первый контакт).
// Масса шарика = 1, колышек неподвижен (масса = бесконечность).
function bounceOffPeg(ball, peg, contactRadius) {
  const dx = ball.x - peg.x;
  const dy = ball.y - peg.y;
  const dist = Math.hypot(dx, dy) || 1e-6;
  const nx = dx / dist;
  const ny = dy / dist;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn >= 0) return;

  // Нормальный импульс с потерей энергии.
  const jn = -(1 + RESTITUTION) * vn;
  ball.vx += jn * nx;
  ball.vy += jn * ny;

  // Трение: тангенциальный импульс, ограниченный силой трения.
  const tx = -ny;
  const ty = nx;
  const vt = ball.vx * tx + ball.vy * ty;
  const maxFriction = FRICTION * Math.abs(jn);
  const jt = -Math.max(-maxFriction, Math.min(maxFriction, vt));
  ball.vx += jt * tx;
  ball.vy += jt * ty;
  ball.spin += jt * SPIN_FACTOR;

  // Тяжёлый шарик почти не отскакивает вверх.
  if (ball.vy < 0) ball.vy *= UP_KILL;
  // Шарик не «зависает»: всегда остаётся небольшое движение вниз.
  if (ball.vy < MIN_FALL) ball.vy = MIN_FALL;

  ball.bounces += 1;
  ball.impact = Math.min(1, Math.abs(vn) / 250);
  ball.lastPeg = peg;
}

export function stepPlinkoBall(ball, width, height, dt, prepared = null) {
  if (ball.settled) return;
  const metrics = prepared?.metrics || plinkoMetrics(width, height);
  const pegRows = prepared?.pegRows || plinkoPegRows(width, height);
  const contactRadius = metrics.pegRadius + ball.radius;
  const bottomY = metrics.boardHeight - BOTTOM_MARGIN + 6;
  const h = Math.min(0.05, Math.max(0, Number(dt) || 0)) / SUBSTEPS;
  ball.impact = Math.max(0, (ball.impact || 0) - Math.max(0, Number(dt) || 0) * 5);

  for (let substep = 0; substep < SUBSTEPS; substep += 1) {
    // ---- гравитация: единственная постоянная сила ----
    ball.vy += GRAVITY * h;

    // ---- сопротивление воздуха ----
    ball.vx *= (1 - AIR_DRAG * h);
    ball.vy *= (1 - AIR_DRAG * h);

    // ---- предел скорости ----
    const speedSq = ball.vx * ball.vx + ball.vy * ball.vy;
    if (speedSq > MAX_SPEED * MAX_SPEED) {
      const k = MAX_SPEED / Math.sqrt(speedSq);
      ball.vx *= k;
      ball.vy *= k;
    }

    // ---- интеграция ----
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;

    // ---- вращение ----
    ball.angle += ball.spin * h;
    ball.spin *= SPIN_DAMP;

    // ---- боковые стены ----
    collideBallWall(ball, metrics);

    // ---- контакт с последним колышком: скользим, не отскакиваем повторно ----
    if (ball.lastPeg) {
      const d = Math.hypot(ball.x - ball.lastPeg.x, ball.y - ball.lastPeg.y);
      if (d >= contactRadius * CONTACT_CLEARANCE) ball.lastPeg = null;
      else slideOffPeg(ball, ball.lastPeg, contactRadius);
    }

    // ---- колышки: проверяем только ближайшие ряды ----
    // Шарик за один подшаг проходит < 1px, поэтому кандидаты — ряды,
    // чьи y-координаты лежат в пределах contactRadius + rowGap от шарика.
    const minRow = Math.max(0, Math.floor((ball.y - contactRadius - metrics.rowGap - TOP_Y) / metrics.rowGap));
    const maxRow = Math.min(ROWS - 1, Math.ceil((ball.y + contactRadius + metrics.rowGap - TOP_Y) / metrics.rowGap));
    for (let row = minRow; row <= maxRow; row += 1) {
      for (const peg of pegRows[row]) {
        const dx = ball.x - peg.x;
        const dy = ball.y - peg.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= contactRadius) continue;
        // Выталкиваем из колышка.
        const nx = dist < 1e-6 ? 1 : dx / dist;
        const ny = dist < 1e-6 ? 0 : dy / dist;
        ball.x = peg.x + nx * contactRadius;
        ball.y = peg.y + ny * contactRadius;
        if (isSamePeg(peg, ball.lastPeg)) {
          slideOffPeg(ball, peg, contactRadius);
        } else {
          bounceOffPeg(ball, peg, contactRadius);
        }
      }
    }
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
  const prepared = {
    metrics,
    pegs: plinkoPegs(metrics.boardWidth, metrics.boardHeight),
    pegRows: plinkoPegRows(metrics.boardWidth, metrics.boardHeight)
  };
  const ball = createPlinkoBall(metrics.boardWidth, metrics.boardHeight, seed);
  let steps = 0;
  while (!ball.settled && steps < MAX_STEPS) {
    stepPlinkoBall(ball, metrics.boardWidth, metrics.boardHeight, PHYSICS_DT, prepared);
    steps += 1;
  }
  if (!ball.settled) throw new Error('Шарик Плинко не завершил физическое падение');
  return { bucket: ball.actualBucket, steps, bounces: ball.bounces };
}
