import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '@vercel/postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { Telegraf, Markup } from 'telegraf';
import { promoCodes } from './promo-codes.js';

const ADMIN_TELEGRAM_ID = '5310549412';
const adminStates = new Map();
const localCustomPromoCodes = new Map();
// Активные раунды «Ракеты» живут на сервере: клиент не может сам назначить
// себе коэффициент или запросить выплату после взрыва.
const rocketRounds = new Map();
const ROCKET_MIN_BET = 20;
const ROCKET_MAX_MULTIPLIER = 20;

const app = express();
const port = Number(process.env.PORT || 3000);
// В .env часто остаётся пробел при копировании токена — Telegram воспринимает
// его как неверный. Убираем только пробелы по краям, сам токен не логируем.
const botToken = process.env.BOT_TOKEN?.trim();
const appUrl = process.env.APP_URL?.trim();
// VERCEL обычно доступна в Runtime, но определяем serverless-среду и по
// служебным переменным: иначе функция ошибочно пытается писать в /var/task/data.
const isVercel = Boolean(
  process.env.VERCEL
  || process.env.VERCEL_ENV
  || process.env.VERCEL_REGION
  || process.env.AWS_LAMBDA_FUNCTION_NAME
  || process.cwd() === '/var/task'
);
// Имена Environment Variables регистрозависимы. Поддерживаем также
// `postgres_url`, если именно так переменная была создана в панели Vercel.
// Пакет @vercel/postgres читает POSTGRES_URL, поэтому нормализуем её до старта SQL-клиента.
const postgresUrl = process.env.POSTGRES_URL
  || process.env.postgres_url
  || process.env.POSTGRES_URL_NON_POOLING
  || process.env.DATABASE_URL
  || process.env.POSTGRES_PRISMA_URL
  // Vercel добавляет префикс имени подключённой интеграции Neon.
  // В этом проекте интеграция называется `skazinodatabase`.
  || process.env.skazinodatabase_POSTGRES_URL
  || process.env.skazinodatabase_POSTGRES_URL_NON_POOLING
  || process.env.skazinodatabase_POSTGRES_PRISMA_URL
  || process.env.skazinodatabase_DATABASE_URL_UNPOOLED;
if (postgresUrl && !process.env.POSTGRES_URL) process.env.POSTGRES_URL = postgresUrl;
const databaseConfigured = Boolean(postgresUrl);
// Явно передаём строку подключения: импортированный `sql` считывает переменные
// при инициализации модуля, а их нормализация выполняется ниже импорта.
const db = databaseConfigured ? createPool({ connectionString: postgresUrl }) : null;
const localDatabasePath = path.join(__dirname, 'data', 'users.json');
const localPromoCodesPath = path.join(__dirname, 'data', 'custom-promo-codes.json');
let databaseReady;
let databaseMode = databaseConfigured ? 'postgres' : 'local';
let databaseInitError = null;
let profiles = {};
let localWriteQueue = Promise.resolve();
let localPromoWriteQueue = Promise.resolve();

async function ensureLocalDatabase() {
  await fs.mkdir(path.dirname(localDatabasePath), { recursive: true });
  try { await fs.access(localDatabasePath); }
  catch { await fs.writeFile(localDatabasePath, '{}', 'utf8'); }
}

async function readLocalProfiles() {
  await ensureLocalDatabase();
  try {
    const contents = await fs.readFile(localDatabasePath, 'utf8');
    return contents.trim() ? JSON.parse(contents) : {};
  } catch (error) {
    if (error instanceof SyntaxError) {
      const backupPath = `${localDatabasePath}.broken-${Date.now()}`;
      await fs.rename(localDatabasePath, backupPath);
      await fs.writeFile(localDatabasePath, '{}', 'utf8');
      console.error(`Повреждённая база перенесена в ${backupPath}`);
      return {};
    }
    throw error;
  }
}

async function readLocalCustomPromoCodes() {
  try {
    const contents = await fs.readFile(localPromoCodesPath, 'utf8');
    const storedCodes = contents.trim() ? JSON.parse(contents) : {};
    for (const [code, amount] of Object.entries(storedCodes)) {
      if (Number.isInteger(amount) && amount > 0) localCustomPromoCodes.set(code, amount);
    }
  } catch (error) {
    if (error.code === 'ENOENT') return;
    console.error(`Не удалось загрузить локальные промокоды: ${error.message}`);
  }
}

function writeLocalProfiles() {
  // Последовательная запись исключает конфликт временных файлов при параллельных запросах.
  localWriteQueue = localWriteQueue.catch(() => {}).then(async () => {
    await ensureLocalDatabase();
    const temporaryPath = `${localDatabasePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(profiles, null, 2), 'utf8');
    await fs.rename(temporaryPath, localDatabasePath);
  });
  return localWriteQueue;
}

function writeLocalCustomPromoCodes() {
  localPromoWriteQueue = localPromoWriteQueue.catch(() => {}).then(async () => {
    await ensureLocalDatabase();
    const storedCodes = Object.fromEntries(localCustomPromoCodes);
    const temporaryPath = `${localPromoCodesPath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(storedCodes, null, 2), 'utf8');
    await fs.rename(temporaryPath, localPromoCodesPath);
  });
  return localPromoWriteQueue;
}

async function initDatabase() {
  // На локальной машине файл удобен для разработки. На Vercel он эфемерный,
  // поэтому при настроенной БД нельзя незаметно переключаться на него.
  if (!databaseConfigured) {
    // Файловая система Vercel доступна только для чтения (кроме /tmp) и не
    // является постоянным хранилищем. Не пытаемся создавать data/users.json.
    if (isVercel) {
      databaseMode = 'unavailable';
      throw new Error('Не задана строка подключения PostgreSQL: добавьте POSTGRES_URL или подключите Neon-переменную с префиксом интеграции');
    }
    await ensureLocalDatabase();
    profiles = await readLocalProfiles();
    await readLocalCustomPromoCodes();
    databaseMode = 'local';
    console.log(`Локальная база пользователей загружена: ${Object.keys(profiles).length}`);
    return;
  }
  try {
    await db.sql`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      profile JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    // Уникальный ключ не позволяет активировать один промокод разными Telegram-аккаунтами.
    await db.sql`CREATE TABLE IF NOT EXISTS promo_claims (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await db.sql`CREATE TABLE IF NOT EXISTS custom_promo_codes (
      code TEXT PRIMARY KEY,
      amount INTEGER NOT NULL CHECK (amount > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT NOT NULL
    )`;
    // Раунд хранится отдельно от профиля: Vercel может направить следующий
    // запрос пользователя в другой экземпляр функции, где нет памяти процесса.
    await db.sql`CREATE TABLE IF NOT EXISTS rocket_rounds (
      user_id TEXT PRIMARY KEY,
      bet INTEGER NOT NULL CHECK (bet >= 20),
      crash_multiplier NUMERIC(5, 2) NOT NULL CHECK (crash_multiplier >= 1.10 AND crash_multiplier <= 20.00),
      started_at BIGINT NOT NULL
    )`;
    databaseMode = 'postgres';
    console.log('Подключена постоянная база PostgreSQL');
  } catch (error) {
    // Не пишем в data/users.json на serverless-хостинге: данные там исчезают,
    // а ошибка подключения должна быть видна в логах и API.
    if (isVercel) {
      databaseMode = 'unavailable';
      throw new Error(`PostgreSQL недоступен: ${error.message}`);
    }
    await ensureLocalDatabase();
    profiles = await readLocalProfiles();
    await readLocalCustomPromoCodes();
    databaseMode = 'local';
    console.error(`PostgreSQL недоступен, включена локальная база: ${error.message}`);
  }
}

databaseReady = initDatabase().catch(error => {
  databaseInitError = error;
  console.error('Не удалось открыть базу пользователей:', error.message);
  // На Vercel нельзя подменять постоянную БД памятью функции: она очищается
  // при следующем холодном запуске (обычно это выглядит как потеря через минуты).
  databaseMode = isVercel ? 'unavailable' : 'memory';
});

// Каждый холодный запуск Vercel получает свой экземпляр функции. Если переменная
// БД оказалась недоступна в одном из экземпляров, повторяем инициализацию перед
// запросом: это исключает случайные 503 после уже успешного подключения.
async function ensureDatabaseReady() {
  await databaseReady;
  if (databaseMode !== 'unavailable' || !databaseConfigured) return;
  databaseReady = initDatabase().catch(error => {
    databaseInitError = error;
    console.error('Повторное подключение к базе не удалось:', error.message);
    databaseMode = isVercel ? 'unavailable' : 'memory';
  });
  await databaseReady;
}

async function getPromoAmount(code) {
  if (Object.hasOwn(promoCodes, code)) return Number(promoCodes[code]);
  await ensureDatabaseReady();
  if (databaseMode === 'postgres') {
    const result = await db.sql`SELECT amount FROM custom_promo_codes WHERE code = ${code}`;
    return result.rows[0] ? Number(result.rows[0].amount) : null;
  }
  return localCustomPromoCodes.get(code) ?? null;
}

async function createCustomPromoCode(code, amount, createdBy) {
  await ensureDatabaseReady();
  if (Object.hasOwn(promoCodes, code)) throw new Error('Такой промокод уже существует');
  if (databaseMode === 'postgres') {
    const result = await db.sql`INSERT INTO custom_promo_codes (code, amount, created_by)
      VALUES (${code}, ${amount}, ${createdBy}) ON CONFLICT (code) DO NOTHING RETURNING code`;
    if (!result.rowCount) throw new Error('Такой промокод уже существует');
    return;
  }
  if (localCustomPromoCodes.has(code)) throw new Error('Такой промокод уже существует');
  localCustomPromoCodes.set(code, amount);
  await writeLocalCustomPromoCodes();
}

async function claimPromoCode(code, userId) {
  await ensureDatabaseReady();
  if (databaseMode === 'postgres') {
    // Учитываем и активации, сделанные до появления таблицы promo_claims.
    const previousUse = await db.sql`SELECT id FROM users
      WHERE id <> ${String(userId)} AND profile->'usedPromoCodes' ? ${code} LIMIT 1`;
    if (previousUse.rowCount) return false;
    const result = await db.sql`INSERT INTO promo_claims (code, user_id) VALUES (${code}, ${String(userId)})
      ON CONFLICT (code) DO NOTHING RETURNING code`;
    return result.rowCount === 1;
  }
  // Локальное хранилище: ищем код во всех профилях, так же как в общей таблице PostgreSQL.
  return !Object.values(profiles).some(existing =>
    String(existing.id) !== String(userId) && existing.usedPromoCodes?.includes(code)
  );
}

async function saveUser(profile) {
  await ensureDatabaseReady();
  if (databaseMode === 'unavailable' || databaseMode === 'memory') {
    throw new Error(`Постоянная база данных недоступна${databaseInitError ? `: ${databaseInitError.message}` : ''}`);
  }
  profiles[String(profile.id)] = profile;
  if (databaseMode === 'postgres') {
    try {
      await db.sql`INSERT INTO users (id, profile) VALUES (${String(profile.id)}, ${JSON.stringify(profile)}::jsonb)
        ON CONFLICT (id) DO UPDATE SET profile = EXCLUDED.profile, updated_at = NOW()`;
      return;
    } catch (error) {
      console.error(`Не удалось сохранить профиль в PostgreSQL: ${error.message}`);
      throw error;
    }
  }
  if (databaseMode === 'local') await writeLocalProfiles();
}

async function getProfile(tgUser) {
  const id = String(tgUser.id);
  await ensureDatabaseReady();
  let profile = profiles[id];
  if (databaseMode === 'unavailable' || databaseMode === 'memory') {
    throw new Error(`Постоянная база данных недоступна${databaseInitError ? `: ${databaseInitError.message}` : ''}`);
  }
  if (databaseMode === 'postgres') {
    try {
      const result = await db.sql`SELECT profile FROM users WHERE id = ${id}`;
      profile = result.rows[0]?.profile || profile;
      if (profile) profiles[id] = profile;
    } catch (error) {
      console.error(`Не удалось прочитать профиль из PostgreSQL: ${error.message}`);
      throw error;
    }
  }
  if (!profile) {
    profile = { id, name: tgUser.first_name || 'Пользователь', registeredAt: Date.now(), stars: 100,
      caseStars: 100, prizeStars: 0, tasks: 0, gifts: { bear: 0, rose: 0 }, giftItems: [], promoCode: '',
      usedPromoCodes: [], topupLink: 'https://playerok.com/profile/SaharOK086/products', lastDailyAt: null };
    await saveUser(profile);
  }
  let changed = false;
  if (!profile.gifts) { profile.gifts = { bear: 0, rose: 0 }; changed = true; }
  // Новые открытия храним отдельными объектами: так в профиле виден каждый
  // выбитый подарок, а не только суммарное количество по типу.
  if (!Array.isArray(profile.giftItems)) {
    profile.giftItems = Object.entries(profile.gifts).flatMap(([type, count]) =>
      Array.from({ length: Number(count) || 0 }, () => ({ id: createPayoutId('GIFT'), type, receivedAt: Date.now() }))
    );
    changed = true;
  }
  // У каждой единицы приза есть независимый ID для проверки перед выводом.
  for (const gift of profile.giftItems) {
    if (!gift.id) { gift.id = createPayoutId('GIFT'); changed = true; }
  }
  if (!Array.isArray(profile.starPrizeItems)) {
    // В старых профилях призовой баланс был только числом. Превращаем его в
    // отдельный приз, чтобы переход на ставки не «съел» уже выигранные звёзды.
    const legacyPrizeAmount = Math.max(0, Number(profile.prizeStars) || 0);
    profile.starPrizeItems = legacyPrizeAmount ? [{
      id: createPayoutId('STAR'), amount: legacyPrizeAmount, remainingAmount: legacyPrizeAmount,
      label: '⭐ Ранее полученные призовые звёзды', receivedAt: Date.now(), withdrawalStatus: 'available'
    }] : [];
    changed = true;
  }
  // Статус нужен и пользователю, и администратору: новый приз доступен к выводу,
  // после выдачи администратор отмечает его как выведенный.
  for (const gift of profile.giftItems) {
    if (!gift.withdrawalStatus) { gift.withdrawalStatus = 'available'; changed = true; }
  }
  for (const starPrize of profile.starPrizeItems) {
    if (!starPrize.id) { starPrize.id = createPayoutId('STAR'); changed = true; }
    if (!starPrize.withdrawalStatus) { starPrize.withdrawalStatus = 'available'; changed = true; }
    // Сумма может быть частично поставлена в «Ракете». Старые призы считаем
    // полностью доступными, чтобы миграция не отнимала баланс у игроков.
    if (!Object.hasOwn(starPrize, 'remainingAmount')) {
      starPrize.remainingAmount = Math.max(0, Number(starPrize.amount) || 0);
      changed = true;
    }
  }
  if (!Object.hasOwn(profile, 'registeredAt')) { profile.registeredAt = Date.now(); changed = true; }
  if (!Object.hasOwn(profile, 'caseStars')) { profile.caseStars = profile.stars ?? 100; changed = true; }
  if (!Object.hasOwn(profile, 'prizeStars')) { profile.prizeStars = 0; changed = true; }
  const previousRocketStars = Number(profile.rocketStars);
  const previousPrizeStars = Number(profile.prizeStars);
  syncRocketStars(profile);
  if (previousRocketStars !== profile.rocketStars || previousPrizeStars !== profile.prizeStars) changed = true;
  if (!Object.hasOwn(profile, 'tasks')) { profile.tasks = 0; changed = true; }
  if (!Object.hasOwn(profile, 'promoCode')) { profile.promoCode = ''; changed = true; }
  if (!Object.hasOwn(profile, 'usedPromoCodes')) { profile.usedPromoCodes = []; changed = true; }
  if (!Object.hasOwn(profile, 'lastDailyAt')) { profile.lastDailyAt = null; changed = true; }
  if (changed) await saveUser(profile);
  return profile;
}

async function getAllProfiles() {
  await ensureDatabaseReady();
  if (databaseMode === 'postgres') {
    const result = await db.sql`SELECT profile FROM users`;
    return result.rows.map(row => row.profile);
  }
  if (databaseMode === 'local') return Object.values(profiles);
  throw new Error('Постоянная база данных недоступна');
}

function createPayoutId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function findPayoutItem(id) {
  const profilesList = await getAllProfiles();
  for (const profile of profilesList) {
    const gift = (profile.giftItems || []).find(item => item.id === id);
    if (gift) return { profile, item: gift, type: 'gift' };
    const starPrize = (profile.starPrizeItems || []).find(item => item.id === id);
    if (starPrize) return { profile, item: starPrize, type: 'stars' };
  }
  return null;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Необязательные иконки браузера не должны засорять логи Vercel ответами 404.
app.get(['/favicon.ico', '/favicon.png'], (req, res) => res.status(204).end());

// Vercel передаёт запросы в этот Express-инстанс через serverless function.
// Явный fallback гарантирует, что корень домена всегда отдаёт Mini App.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function verifyTelegramInitData(raw) {
  if (!raw || !botToken) return null;
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash) return null;
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (hash.length !== calculated.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(calculated))) return null;
  try {
    const authDate = Number(params.get('auth_date'));
    // Telegram initData остаётся актуальной в течение сессии Mini App.
    // Суточное ограничение приводило к ложному «Нет авторизации» при повторном входе.
    if (!authDate || Date.now() / 1000 - authDate > 7 * 24 * 60 * 60) return null;
    return JSON.parse(params.get('user'));
  } catch { return null; }
}

function currentUser(req) {
  const telegramUser = verifyTelegramInitData(req.headers['x-telegram-init-data']);
  if (telegramUser) return telegramUser;

  // Не включать в production: параметр предназначен только для локальной проверки API.
  if (process.env.NODE_ENV !== 'production') return { id: 'demo', first_name: 'Демо', username: 'demo' };
  return null;
}

const cases = {
  freebie: {
    name: 'КЕЙС ХАЛЯВА',
    image: '/case-freebie.png',
    price: 25,
    rewards: [
      { label: '⭐ 5 звёзд', type: 'stars', amount: 5, chance: 70 },
      { label: '⭐ 10 звёзд', type: 'stars', amount: 10, chance: 20 },
      { label: '🧸 Мишка Telegram', type: 'bear', chance: 5 },
      { label: '🌹 Роза Telegram', type: 'rose', chance: 4 },
      { label: '⭐ 100 звёзд', type: 'stars', amount: 100, chance: 1 }
    ]
  },
  lucky: {
    name: 'КЕЙС УДАЧИ',
    image: '/case-lucky.png',
    price: 50,
    rewards: [
      { label: '⭐ 10 звёзд', type: 'stars', amount: 10, chance: 50 },
      { label: '⭐ 15 звёзд', type: 'stars', amount: 15, chance: 30 },
      { label: '🌹 Роза Telegram', type: 'rose', chance: 10 },
      { label: '🎂 Торт Telegram', type: 'cake', chance: 4 },
      { label: '💐 Букет Telegram', type: 'bouquet', chance: 3 },
      { label: '🚀 Ракета Telegram', type: 'rocket', chance: 3 }
    ]
  },
  baron: {
    name: 'КЕЙС БАРОНА',
    image: '/case-baron.png',
    price: 75,
    rewards: [
      { label: '🧸 Мишка Telegram', type: 'bear', chance: 30 },
      { label: '💝 Сердце Telegram', type: 'heart', chance: 30 },
      { label: '🌹 Роза Telegram', type: 'rose', chance: 20 },
      { label: '🎂 Торт Telegram', type: 'cake', chance: 10 },
      { label: '🚀 Ракета Telegram', type: 'rocket', chance: 7 },
      { label: '💍 Кольцо Telegram', type: 'ring', chance: 3 }
    ]
  }
};

function availableRocketStars(profile) {
  return (profile.starPrizeItems || [])
    .filter(item => item.withdrawalStatus !== 'withdrawn')
    .reduce((total, item) => total + Math.max(0, Number(item.remainingAmount) || 0), 0);
}

function syncRocketStars(profile) {
  profile.rocketStars = availableRocketStars(profile);
  // «Призовые» — это фактически ещё не выведенные звёзды. Синхронизация
  // исправляет устаревшие профили после частичной ставки или вывода.
  profile.prizeStars = profile.rocketStars;
  return profile.rocketStars;
}

function deductRocketStars(profile, amount) {
  let remaining = amount;
  // Ставка списывается с наиболее старых доступных призов, что делает движение
  // баланса предсказуемым и не затрагивает уже оформленные на вывод звёзды.
  for (const item of profile.starPrizeItems || []) {
    if (item.withdrawalStatus === 'withdrawn' || remaining <= 0) continue;
    const available = Math.max(0, Number(item.remainingAmount) || 0);
    const spent = Math.min(available, remaining);
    item.remainingAmount = available - spent;
    remaining -= spent;
  }
  if (remaining > 0) throw new Error('Недостаточно призовых звёзд для ставки');
  syncRocketStars(profile);
}

function addRocketPrize(profile, amount) {
  profile.prizeStars = (Number(profile.prizeStars) || 0) + amount;
  profile.starPrizeItems ||= [];
  profile.starPrizeItems.push({
    id: createPayoutId('STAR'), amount, remainingAmount: amount,
    label: `⭐ ${amount} звёзд из Ракеты`, receivedAt: Date.now(), withdrawalStatus: 'available'
  });
  syncRocketStars(profile);
}

function rocketMultiplier(round, now = Date.now()) {
  // Единственная формула игры. Клиент использует её только для плавной
  // отрисовки, а сервер применяет при взрыве и выплате.
  const seconds = Math.max(0, now - Number(round.startedAt)) / 1000;
  return Math.min(ROCKET_MAX_MULTIPLIER, 1 + 0.12 * seconds + 0.015 * seconds ** 2);
}

function rocketLiveState(round, now = Date.now()) {
  return {
    crashed: rocketMultiplier(round, now) >= round.crashMultiplier,
    startedAt: Number(round.startedAt),
    bet: Number(round.bet),
    multiplier: Number(rocketMultiplier(round, now).toFixed(4)),
    now
  };
}

function drawRocketCrashMultiplier() {
  // Степенное распределение сильно сдвинуто к ранним взрывам: большинство
  // раундов заканчивается на малых x, а значения близкие к x20 очень редки.
  const earlyCrashBias = Math.random() ** 3.5;
  return Number((1.1 + earlyCrashBias * (ROCKET_MAX_MULTIPLIER - 1.1)).toFixed(2));
}

async function getRocketRound(userId) {
  if (databaseMode === 'postgres') {
    const result = await db.sql`SELECT bet, crash_multiplier, started_at FROM rocket_rounds WHERE user_id = ${String(userId)}`;
    const row = result.rows[0];
    return row && { bet: Number(row.bet), crashMultiplier: Number(row.crash_multiplier), startedAt: Number(row.started_at) };
  }
  return rocketRounds.get(String(userId)) || null;
}

async function deleteRocketRound(userId) {
  if (databaseMode === 'postgres') {
    await db.sql`DELETE FROM rocket_rounds WHERE user_id = ${String(userId)}`;
    return;
  }
  rocketRounds.delete(String(userId));
}

function drawReward(rewards) {
  const totalChance = rewards.reduce((total, reward) => total + Number(reward.chance), 0);
  if (totalChance <= 0) throw new Error('У кейса не настроены шансы призов');
  const roll = Math.random() * totalChance;
  let total = 0;
  return rewards.find(reward => {
    total += Number(reward.chance);
    return roll < total;
  }) || rewards.at(-1);
}

app.get('/api/me', async (req, res) => {
  const tgUser = currentUser(req);
  if (!tgUser) return res.status(401).json({ error: 'Откройте приложение через Telegram' });
  try { res.json({ user: tgUser, profile: await getProfile(tgUser) }); }
  catch (error) { console.error(error); res.status(503).json({ error: 'База данных временно недоступна' }); }
});

app.post('/api/daily', async (req, res) => {
  const tgUser = currentUser(req);
  if (!tgUser) return res.status(401).json({ error: 'Нет авторизации' });
  let profile;
  try { profile = await getProfile(tgUser); }
  catch (error) { console.error(error); return res.status(503).json({ error: 'База данных временно недоступна' }); }
  const now = Date.now();
  const cooldown = 24 * 60 * 60 * 1000;
  if (profile.lastDailyAt && now - profile.lastDailyAt < cooldown) {
    const remainingHours = Math.ceil((cooldown - (now - profile.lastDailyAt)) / 3600000);
    return res.status(400).json({ error: `Бонус будет доступен через ${remainingHours} ч.` });
  }
  profile.caseStars = Number(profile.caseStars) || 0;
  profile.caseStars += 5;
  profile.stars = profile.caseStars;
  profile.tasks = (Number(profile.tasks) || 0) + 1;
  profile.lastDailyAt = now;
  try { await saveUser(profile); }
  catch (error) { console.error(error); return res.status(503).json({ error: 'Не удалось сохранить профиль' }); }
  res.json({ profile, message: 'Получено ⭐5' });
});

app.get('/api/cases', (req, res) => {
  res.json(Object.entries(cases).map(([id, item]) => ({ id, ...item })));
});

app.post('/api/rocket/start', async (req, res) => {
  const tgUser = currentUser(req);
  if (!tgUser) return res.status(401).json({ error: 'Нет авторизации' });
  const bet = Number(req.body?.bet);
  if (!Number.isInteger(bet) || bet < ROCKET_MIN_BET) return res.status(400).json({ error: `Минимальная ставка — ${ROCKET_MIN_BET} ⭐` });
  try {
    await getProfile(tgUser); // создаёт и мигрирует старые профили до транзакции
    const userId = String(tgUser.id);
    const round = { bet, crashMultiplier: drawRocketCrashMultiplier(), startedAt: Date.now() };
    let profile;
    if (databaseMode === 'postgres') {
      const client = await db.connect();
      try {
        await client.sql`BEGIN`;
        const userResult = await client.sql`SELECT profile FROM users WHERE id = ${userId} FOR UPDATE`;
        profile = userResult.rows[0]?.profile;
        if (!profile) throw new Error('Профиль не найден');
        if (availableRocketStars(profile) < bet) throw new Error('Недостаточно призовых звёзд для ставки');
        deductRocketStars(profile, bet);
        await client.sql`UPDATE users SET profile = ${JSON.stringify(profile)}::jsonb, updated_at = NOW() WHERE id = ${userId}`;
        await client.sql`INSERT INTO rocket_rounds (user_id, bet, crash_multiplier, started_at) VALUES (${userId}, ${bet}, ${round.crashMultiplier}, ${round.startedAt})`;
        await client.sql`COMMIT`;
      } catch (error) { await client.sql`ROLLBACK`; throw error; } finally { client.release(); }
      profiles[userId] = profile;
    } else {
      profile = await getProfile(tgUser);
      if (await getRocketRound(userId)) throw new Error('Ракета уже запущена');
      if (availableRocketStars(profile) < bet) throw new Error('Недостаточно призовых звёзд для ставки');
      deductRocketStars(profile, bet);
      rocketRounds.set(userId, round); await saveUser(profile);
    }
    // `now` и multiplier позволяют клиенту синхронизировать живой счётчик с сервером,
    // не полагаясь на часы устройства пользователя.
    const now = Date.now();
    res.json({ profile, ...rocketLiveState(round, now), maxMultiplier: ROCKET_MAX_MULTIPLIER });
  } catch (error) {
    if (error.code === '23505' || error.message === 'Ракета уже запущена') return res.status(400).json({ error: 'Ракета уже запущена' });
      if (error.message === 'Недостаточно призовых звёзд для ставки') return res.status(400).json({ error: error.message });
    console.error('Не удалось запустить ракету:', error); res.status(503).json({ error: 'Не удалось запустить ракету' });
  }
});

app.get('/api/rocket/status', async (req, res) => {
  const tgUser = currentUser(req);
  if (!tgUser) return res.status(401).json({ error: 'Нет авторизации' });
  try {
    await ensureDatabaseReady();
    const round = await getRocketRound(tgUser.id);
    if (!round) return res.status(404).json({ error: 'Нет активной ракеты' });
    const now = Date.now();
    const state = rocketLiveState(round, now);
    if (state.crashed) {
      await deleteRocketRound(tgUser.id);
      return res.json({ crashed: true, multiplier: round.crashMultiplier, now });
    }
    res.json(state);
  } catch (error) { console.error('Не удалось проверить ракету:', error); res.status(503).json({ error: 'Не удалось проверить ракету' }); }
});

app.post('/api/rocket/cashout', async (req, res) => {
  const tgUser = currentUser(req);
  if (!tgUser) return res.status(401).json({ error: 'Нет авторизации' });
  const userId = String(tgUser.id);
  try {
    await getProfile(tgUser);
    let profile, round;
    if (databaseMode === 'postgres') {
      const client = await db.connect();
      try {
        await client.sql`BEGIN`;
        // DELETE ... RETURNING делает повторный запрос cashout безопасным: выплату получит только первый.
        const roundResult = await client.sql`DELETE FROM rocket_rounds WHERE user_id = ${userId} RETURNING bet, crash_multiplier, started_at`;
        const row = roundResult.rows[0];
        if (!row) throw new Error('Нет активной ракеты');
        round = { bet: Number(row.bet), crashMultiplier: Number(row.crash_multiplier), startedAt: Number(row.started_at) };
        const multiplier = rocketMultiplier(round);
        if (multiplier >= round.crashMultiplier) { await client.sql`COMMIT`; return res.status(400).json({ error: `Ракета взорвалась на ${round.crashMultiplier.toFixed(2)}x` }); }
        const userResult = await client.sql`SELECT profile FROM users WHERE id = ${userId} FOR UPDATE`;
        profile = userResult.rows[0]?.profile;
        if (!profile) throw new Error('Профиль не найден');
        const payout = Math.floor(round.bet * multiplier);
        addRocketPrize(profile, payout);
        await client.sql`UPDATE users SET profile = ${JSON.stringify(profile)}::jsonb, updated_at = NOW() WHERE id = ${userId}`;
        await client.sql`COMMIT`; profiles[userId] = profile;
        return res.json({ profile, multiplier: Number(multiplier.toFixed(2)), payout });
      } catch (error) { await client.sql`ROLLBACK`; throw error; } finally { client.release(); }
    }
    round = await getRocketRound(userId);
    if (!round) return res.status(400).json({ error: 'Нет активной ракеты' });
    const multiplier = rocketMultiplier(round);
    await deleteRocketRound(userId);
    if (multiplier >= round.crashMultiplier) return res.status(400).json({ error: `Ракета взорвалась на ${round.crashMultiplier.toFixed(2)}x` });
    const payout = Math.floor(round.bet * multiplier);
    profile = await getProfile(tgUser);
    addRocketPrize(profile, payout);
    await saveUser(profile); return res.json({ profile, multiplier: Number(multiplier.toFixed(2)), payout });
  } catch (error) {
    if (error.message === 'Нет активной ракеты') return res.status(400).json({ error: error.message });
    console.error('Не удалось выплатить ракету:', error); res.status(503).json({ error: 'Не удалось зачислить выигрыш' });
  }
});

app.post('/api/profile/topup', async (req, res) => {
  const tgUser = currentUser(req);
  if (!tgUser) return res.status(401).json({ error: 'Нет авторизации' });
  let profile;
  try { profile = await getProfile(tgUser); }
  catch (error) { console.error(error); return res.status(503).json({ error: 'База данных временно недоступна' }); }
  profile.topupLink = 'https://playerok.com/profile/SaharOK086/products';
  try { await saveUser(profile); }
  catch (error) { console.error(error); return res.status(503).json({ error: 'Не удалось сохранить профиль' }); }
  res.json({ profile });
});

app.post('/api/profile/promo', async (req, res) => {
  const tgUser = currentUser(req);
  if (!tgUser) return res.status(401).json({ error: 'Нет авторизации' });
  let profile;
  try { profile = await getProfile(tgUser); }
  catch (error) { console.error(error); return res.status(503).json({ error: 'База данных временно недоступна' }); }
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Введите промокод' });
  if (profile.usedPromoCodes?.includes(code)) return res.status(400).json({ error: 'Промокод уже использован' });
  const promo = await getPromoAmount(code);
  if (promo === null) return res.status(400).json({ error: 'Промокод не найден' });
  if (!Number.isInteger(promo) || promo <= 0) return res.status(500).json({ error: 'Промокод настроен неправильно' });
  try {
    if (!await claimPromoCode(code, profile.id)) {
      return res.status(400).json({ error: 'Промокод уже использован другим аккаунтом' });
    }
  } catch (error) {
    console.error(error);
    return res.status(503).json({ error: 'Не удалось проверить промокод' });
  }
  profile.caseStars += promo;
  profile.stars = profile.caseStars;
  profile.usedPromoCodes = [...(profile.usedPromoCodes || []), code];
  profile.promoCode = code;
  try { await saveUser(profile); }
  catch (error) { console.error(error); return res.status(503).json({ error: 'Не удалось сохранить профиль' }); }
  res.json({ profile, message: `Начислено ⭐${promo}` });
});

app.post('/api/cases/:caseId/open', async (req, res) => {
  const tgUser = currentUser(req);
  if (!tgUser) return res.status(401).json({ error: 'Нет авторизации' });
  const selectedCase = cases[req.params.caseId];
  if (!selectedCase) return res.status(404).json({ error: 'Кейс не найден' });
  let profile;
  try { profile = await getProfile(tgUser); }
  catch (error) { console.error(error); return res.status(503).json({ error: 'База данных временно недоступна' }); }
  if (profile.caseStars < selectedCase.price) return res.status(400).json({ error: 'Недостаточно звёзд для кейса' });

  let reward;
  try { reward = drawReward(selectedCase.rewards); }
  catch (error) {
    console.error(`Ошибка настройки кейса ${req.params.caseId}:`, error.message);
    return res.status(500).json({ error: 'Кейс временно недоступен' });
  }
  profile.caseStars = Number(profile.caseStars) || 0;
  profile.prizeStars = Number(profile.prizeStars) || 0;
  profile.caseStars -= selectedCase.price;
  profile.stars = profile.caseStars;
  if (reward.type === 'stars') {
    const amount = Number(reward.amount) || 0;
    profile.prizeStars += amount;
    profile.starPrizeItems ||= [];
    profile.starPrizeItems.push({
      id: createPayoutId('STAR'), amount, remainingAmount: amount,
      label: reward.label, receivedAt: Date.now(), withdrawalStatus: 'available'
    });
    syncRocketStars(profile);
  } else {
    profile.gifts ||= {};
    profile.giftItems ||= [];
    profile.gifts[reward.type] = (Number(profile.gifts[reward.type]) || 0) + 1;
    profile.giftItems.push({
      id: crypto.randomUUID(),
      type: reward.type,
      label: reward.label,
      receivedAt: Date.now()
    });
  }
  try { await saveUser(profile); }
  catch (error) { console.error(error); return res.status(503).json({ error: 'Не удалось сохранить профиль' }); }
  res.json({ profile, reward });
});

if (botToken && !isVercel) {
  const bot = new Telegraf(botToken);
  const isAdmin = ctx => String(ctx.from?.id) === ADMIN_TELEGRAM_ID;
  const adminKeyboard = () => Markup.inlineKeyboard([
    [Markup.button.callback('👥 Пользователи', 'admin_users')],
    [Markup.button.callback('🔎 Проверить ID приза', 'admin_check')],
    [Markup.button.callback('➕ Создать промокод', 'admin_promo')]
  ]);
  const userDisplayName = profile => profile.name || `Пользователь ${profile.id}`;
  const adminUserKeyboard = users => Markup.inlineKeyboard([
    ...users.map(profile => [Markup.button.callback(
      `👤 ${userDisplayName(profile)} · ${profile.id}`.slice(0, 64),
      `admin_user:${profile.id}`
    )]),
    [Markup.button.callback('← Назад', 'admin_back')]
  ]);
  const adminUserDetailsKeyboard = (profile, payoutItems) => Markup.inlineKeyboard([
    ...payoutItems.filter(({ item }) => item.withdrawalStatus !== 'withdrawn').map(({ item, type }) => [
      Markup.button.callback(
        `✅ Отметить выведенным: ${item.id}`.slice(0, 64),
        // callback_data Telegram ограничивает 64 байтами, поэтому используем
        // короткие префиксы и типы вместо длинных слов.
        `w:${profile.id}:${type === 'gift' ? 'g' : 's'}:${item.id}`
      )
    ]),
    [Markup.button.callback('← К списку пользователей', 'admin_users')]
  ]);

  bot.command('admin', async ctx => {
    if (!isAdmin(ctx)) return;
    adminStates.delete(String(ctx.from.id));
    await ctx.reply('Панель администратора', adminKeyboard());
  });
  bot.action('admin_users', async ctx => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа');
    try {
      const users = await getAllProfiles();
      await ctx.answerCbQuery();
      if (!users.length) return ctx.reply('👥 Пользователей пока нет.');
      // Telegram принимает не более 100 кнопок в одном сообщении.
      const visibleUsers = users.slice(0, 99);
      const suffix = users.length > visibleUsers.length ? `\nПоказаны первые ${visibleUsers.length} из ${users.length}.` : '';
      await ctx.reply(`👥 Пользователи: ${users.length}${suffix}`, adminUserKeyboard(visibleUsers));
    } catch (error) {
      console.error('Не удалось получить список пользователей:', error);
      await ctx.answerCbQuery('Ошибка базы');
    }
  });
  bot.action('admin_back', async ctx => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа');
    await ctx.answerCbQuery();
    return ctx.editMessageText('Панель администратора', adminKeyboard());
  });
  bot.action(/^admin_user:(.+)$/, async ctx => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа');
    try {
      const userId = ctx.match[1];
      const profile = (await getAllProfiles()).find(item => String(item.id) === userId);
      if (!profile) return ctx.answerCbQuery('Пользователь не найден');
      const payoutItems = [
        ...(profile.giftItems || []).map(item => ({ item, type: 'gift' })),
        ...(profile.starPrizeItems || []).map(item => ({ item, type: 'stars' }))
      ];
      const available = payoutItems.filter(({ item }) => item.withdrawalStatus !== 'withdrawn');
      const withdrawn = payoutItems.filter(({ item }) => item.withdrawalStatus === 'withdrawn');
      const describe = ({ item, type }) => {
        const label = item.label || (type === 'stars' ? `⭐ ${item.amount || 0} звёзд` : `Подарок: ${item.type}`);
        return `• ${label}\n  ID: ${item.id}\n  ${item.withdrawalStatus === 'withdrawn' ? '✅ Выведен' : '🟡 Доступен для вывода'}`;
      };
      const text = `👤 ${userDisplayName(profile)}\nTelegram ID: ${profile.id}\n\n🟡 Доступно для вывода: ${available.length}\n${available.map(describe).join('\n') || '—'}\n\n✅ Уже выведено: ${withdrawn.length}\n${withdrawn.map(describe).join('\n') || '—'}`;
      await ctx.answerCbQuery();
      await ctx.editMessageText(text.slice(0, 4000), adminUserDetailsKeyboard(profile, payoutItems));
    } catch (error) {
      console.error('Не удалось открыть профиль пользователя:', error);
      await ctx.answerCbQuery('Ошибка базы');
    }
  });
  bot.action(/^w:([^:]+):([gs]):(.+)$/, async ctx => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа');
    try {
      const [, userId, shortType, payoutId] = ctx.match;
      const type = shortType === 'g' ? 'gift' : 'stars';
      const profile = (await getAllProfiles()).find(item => String(item.id) === userId);
      const items = type === 'gift' ? profile?.giftItems : profile?.starPrizeItems;
      const item = items?.find(candidate => candidate.id === payoutId);
      if (!profile || !item) return ctx.answerCbQuery('Приз не найден');
      if (item.withdrawalStatus === 'withdrawn') return ctx.answerCbQuery('Уже отмечен как выведенный');
      item.withdrawalStatus = 'withdrawn';
      item.withdrawnAt = Date.now();
      if (type === 'stars') syncRocketStars(profile);
      await saveUser(profile);
      await ctx.answerCbQuery('Приз отмечен как выведенный');
      // Повторно открываем карточку, чтобы сразу показать новый статус.
      const payoutItems = [
        ...(profile.giftItems || []).map(entry => ({ item: entry, type: 'gift' })),
        ...(profile.starPrizeItems || []).map(entry => ({ item: entry, type: 'stars' }))
      ];
      const available = payoutItems.filter(({ item }) => item.withdrawalStatus !== 'withdrawn');
      const withdrawn = payoutItems.filter(({ item }) => item.withdrawalStatus === 'withdrawn');
      const describe = ({ item, type: itemType }) => `• ${item.label || (itemType === 'stars' ? `⭐ ${item.amount || 0} звёзд` : `Подарок: ${item.type}`)}\n  ID: ${item.id}\n  ${item.withdrawalStatus === 'withdrawn' ? '✅ Выведен' : '🟡 Доступен для вывода'}`;
      const text = `👤 ${userDisplayName(profile)}\nTelegram ID: ${profile.id}\n\n🟡 Доступно для вывода: ${available.length}\n${available.map(describe).join('\n') || '—'}\n\n✅ Уже выведено: ${withdrawn.length}\n${withdrawn.map(describe).join('\n') || '—'}`;
      await ctx.editMessageText(text.slice(0, 4000), adminUserDetailsKeyboard(profile, payoutItems));
    } catch (error) {
      console.error('Не удалось отметить вывод приза:', error);
      await ctx.answerCbQuery('Не удалось сохранить статус');
    }
  });
  bot.action('admin_check', async ctx => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа');
    adminStates.set(String(ctx.from.id), 'check');
    await ctx.answerCbQuery();
    await ctx.reply('Пришлите уникальный ID подарка или звёздного приза (например, GIFT-... или STAR-...).');
  });
  bot.action('admin_promo', async ctx => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа');
    adminStates.set(String(ctx.from.id), 'promo');
    await ctx.answerCbQuery();
    await ctx.reply('Пришлите промокод и количество звёзд через пробел. Пример: SUMMER50 50');
  });
  // Не перехватываем обычные команды: раньше этот обработчик стоял выше
  // bot.start и останавливал цепочку middleware для любого не-администратора.
  // Из-за этого Telegram принимал /start, но приветствие не отправлялось.
  bot.on('text', async (ctx, next) => {
    if (!isAdmin(ctx)) return next();
    const userId = String(ctx.from.id);
    const state = adminStates.get(userId);
    if (!state || ctx.message.text.startsWith('/')) return next();
    const text = ctx.message.text.trim();
    try {
      if (state === 'check') {
        adminStates.delete(userId);
        const result = await findPayoutItem(text);
        if (!result) return ctx.reply('❌ Приз с таким ID не найден.');
        const owner = result.profile;
        const item = result.item;
        const description = result.type === 'gift'
          ? (item.label || `Подарок: ${item.type}`)
          : `${item.label || 'Звёздный приз'} (${item.amount} ⭐)`;
        return ctx.reply(`✅ Приз найден\nID: ${item.id}\nТип: ${result.type === 'gift' ? 'подарок' : 'звёзды'}\n${description}\nВладелец: ${owner.name || 'Пользователь'} (Telegram ID: ${owner.id})\nПолучен: ${new Date(item.receivedAt).toLocaleString('ru-RU')}`);
      }
      if (state === 'promo') {
        const [rawCode, rawAmount, ...extra] = text.split(/\s+/);
        const code = String(rawCode || '').toUpperCase();
        const amount = Number(rawAmount);
        if (extra.length || !/^[A-Z0-9_-]{3,40}$/.test(code) || !Number.isInteger(amount) || amount <= 0 || amount > 1000000) {
          return ctx.reply('❌ Неверный формат. Пример: SUMMER50 50');
        }
        await createCustomPromoCode(code, amount, userId);
        adminStates.delete(userId);
        return ctx.reply(`✅ Промокод ${code} создан: ${amount} ⭐. Использовать его сможет только один аккаунт.`);
      }
    } catch (error) {
      return ctx.reply(`❌ ${error.message || 'Не удалось выполнить действие'}`);
    }
  });

  // Ошибки Telegram API (конфликт двух запущенных экземпляров, неверный токен
  // или webhook) не должны теряться без сообщения в терминале.
  bot.catch((error, ctx) => {
    console.error(`Ошибка обработки Telegram update ${ctx.update.update_id}:`, error);
  });

  bot.start(async ctx => {
    try {
      // Регистрируем пользователя в том же хранилище, что и Mini App.
      // Поэтому счётчик в админ-панели включает и пользователей, начавших с Telegram.
      await getProfile(ctx.from);
    } catch (error) {
      console.error('Не удалось зарегистрировать пользователя из Telegram:', error);
      return ctx.reply('Сервис временно недоступен. Попробуйте ещё раз чуть позже.');
    }
    const button = appUrl
      ? Markup.button.webApp('🚀 Открыть приложение', appUrl)
      : Markup.button.callback('Сначала настройте APP_URL', 'setup');
    return ctx.reply(
      `👋 Добро пожаловать, ${ctx.from.first_name}!\n\n🎁 Здесь можно открывать кейсы, получать звёзды и выигрывать Telegram-подарки.\n\nНажмите кнопку ниже, чтобы открыть приложение и начать.`,
      Markup.inlineKeyboard([[button]])
    );
  });
  bot.command('app', ctx => ctx.reply('Открыть Mini App:', Markup.inlineKeyboard([[Markup.button.webApp('🚀 Открыть', appUrl || 'https://example.com')]])));
  bot.command('profile', async ctx => {
    try {
      const profile = await getProfile(ctx.from);
      return ctx.reply(`👤 ${profile.name}\\n⭐ Баланс: ${profile.stars}\\n✅ Заданий: ${profile.tasks}`);
    } catch (error) {
      console.error(error);
      return ctx.reply('База данных временно недоступна');
    }
  });
  bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('Telegram bot started (long polling)'))
    .catch(error => console.error(
      'Telegram bot не запущен. Проверьте BOT_TOKEN и остановите другие экземпляры бота:',
      error.message
    ));
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
} else if (!botToken) {
  console.log('BOT_TOKEN не задан: запущен только Mini App в demo-режиме');
} else if (isVercel) {
  console.log('Vercel: бот не запускается в web-request процессе');
}

// Vercel использует экспортированный handler, а локально запускаем обычный HTTP-сервер.
if (!isVercel) {
  const server = app.listen(port, () => console.log(`Mini App: http://localhost:${port}`));
  // Не завершаем процесс необработанным исключением: обычно это означает,
  // что предыдущий экземпляр приложения ещё занимает порт.
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Порт ${port} уже занят. Остановите предыдущий экземпляр (Ctrl+C) или запустите приложение на другом порту: PORT=3001 npm start`);
    } else {
      console.error('Не удалось запустить HTTP-сервер:', error);
    }
    process.exitCode = 1;
  });
}
export default app;
