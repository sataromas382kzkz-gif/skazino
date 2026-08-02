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

const app = express();
const port = Number(process.env.PORT || 3000);
const botToken = process.env.BOT_TOKEN;
const appUrl = process.env.APP_URL;
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
let databaseReady;
let databaseMode = databaseConfigured ? 'postgres' : 'local';
let databaseInitError = null;
let profiles = {};
let localWriteQueue = Promise.resolve();

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
      caseStars: 100, prizeStars: 0, tasks: 0, gifts: { bear: 0, rose: 0 }, promoCode: '',
      usedPromoCodes: [], topupLink: 'https://playerok.com/profile/SaharOK086/products', lastDailyAt: null };
    await saveUser(profile);
  }
  let changed = false;
  if (!profile.gifts) { profile.gifts = { bear: 0, rose: 0 }; changed = true; }
  if (!Object.hasOwn(profile, 'registeredAt')) { profile.registeredAt = Date.now(); changed = true; }
  if (!Object.hasOwn(profile, 'caseStars')) { profile.caseStars = profile.stars ?? 100; changed = true; }
  if (!Object.hasOwn(profile, 'prizeStars')) { profile.prizeStars = 0; changed = true; }
  if (!Object.hasOwn(profile, 'promoCode')) { profile.promoCode = ''; changed = true; }
  if (!Object.hasOwn(profile, 'usedPromoCodes')) { profile.usedPromoCodes = []; changed = true; }
  if (!Object.hasOwn(profile, 'lastDailyAt')) { profile.lastDailyAt = null; changed = true; }
  if (changed) await saveUser(profile);
  return profile;
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
    price: 100,
    rewards: [
      { label: '⭐ 5 звёзд', type: 'stars', amount: 5, chance: 70 },
      { label: '⭐ 10 звёзд', type: 'stars', amount: 10, chance: 20 },
      { label: '🧸 Мишка Telegram', type: 'bear', chance: 5 },
      { label: '🌹 Роза Telegram', type: 'rose', chance: 4 },
      { label: '⭐ 100 звёзд', type: 'stars', amount: 100, chance: 1 }
    ]
  }
};

function drawReward(rewards) {
  const roll = Math.random() * 100;
  let total = 0;
  return rewards.find(reward => {
    total += reward.chance;
    return roll < total;
  });
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
  profile.caseStars += 100;
  profile.stars = profile.caseStars;
  profile.tasks += 1;
  profile.lastDailyAt = now;
  try { await saveUser(profile); }
  catch (error) { console.error(error); return res.status(503).json({ error: 'Не удалось сохранить профиль' }); }
  res.json({ profile, message: 'Получено ⭐100' });
});

app.get('/api/cases', (req, res) => {
  res.json(Object.entries(cases).map(([id, item]) => ({ id, ...item })));
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
  if (!Object.prototype.hasOwnProperty.call(promoCodes, code)) return res.status(400).json({ error: 'Промокод не найден' });
  const promo = Number(promoCodes[code]);
  if (!Number.isInteger(promo) || promo <= 0) return res.status(500).json({ error: 'Промокод настроен неправильно' });
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

  const reward = drawReward(selectedCase.rewards);
  profile.caseStars -= selectedCase.price;
  profile.stars = profile.caseStars;
  if (reward.type === 'stars') profile.prizeStars += reward.amount;
  else profile.gifts[reward.type] += 1;
  try { await saveUser(profile); }
  catch (error) { console.error(error); return res.status(503).json({ error: 'Не удалось сохранить профиль' }); }
  res.json({ profile, reward });
});

if (botToken && !isVercel) {
  const bot = new Telegraf(botToken);
  bot.start(ctx => {
    const button = appUrl
      ? Markup.button.webApp('🚀 Открыть приложение', appUrl)
      : Markup.button.callback('Сначала настройте APP_URL', 'setup');
    return ctx.reply(`Привет, ${ctx.from.first_name}!\\n\\nЭто стартовый Telegram Mini App.`, Markup.inlineKeyboard([[button]]));
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
  bot.launch();
  console.log('Telegram bot started');
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
} else if (!botToken) {
  console.log('BOT_TOKEN не задан: запущен только Mini App в demo-режиме');
} else if (isVercel) {
  console.log('Vercel: бот не запускается в web-request процессе');
}

// Vercel использует экспортированный handler, а локально запускаем обычный HTTP-сервер.
if (!isVercel) app.listen(port, () => console.log(`Mini App: http://localhost:${port}`));
export default app;
