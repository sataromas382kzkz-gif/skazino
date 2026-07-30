import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '@vercel/postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { Telegraf, Markup } from 'telegraf';
import { promoCodes } from './promo-codes.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const botToken = process.env.BOT_TOKEN;
const appUrl = process.env.APP_URL;
const isVercel = Boolean(process.env.VERCEL);
const databaseConfigured = Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL);
const localDatabasePath = path.join(__dirname, 'data', 'users.json');
let databaseReady;
let profiles = {};

async function ensureLocalDatabase() {
  await fs.mkdir(path.dirname(localDatabasePath), { recursive: true });
  try { await fs.access(localDatabasePath); }
  catch { await fs.writeFile(localDatabasePath, '{}', 'utf8'); }
}

async function readLocalProfiles() {
  await ensureLocalDatabase();
  return JSON.parse(await fs.readFile(localDatabasePath, 'utf8'));
}

async function writeLocalProfiles(profiles) {
  await ensureLocalDatabase();
  const temporaryPath = `${localDatabasePath}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(profiles, null, 2), 'utf8');
  await fs.rename(temporaryPath, localDatabasePath);
}

async function initDatabase() {
  if (databaseConfigured) {
    await sql`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      profile JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    console.log('Подключена постоянная база PostgreSQL');
    return;
  }
  await ensureLocalDatabase();
  profiles = await readLocalProfiles();
  console.log(`Локальная база пользователей загружена: ${Object.keys(profiles).length}`);
  if (isVercel) console.warn('На Vercel локальный файл временный: добавьте POSTGRES_URL для постоянных сохранений.');
}

databaseReady = initDatabase().catch(error => {
  console.error('Не удалось открыть базу пользователей:', error.message);
  throw error;
});

async function saveUser(profile) {
  await databaseReady;
  if (databaseConfigured) {
    await sql`INSERT INTO users (id, profile) VALUES (${String(profile.id)}, ${JSON.stringify(profile)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET profile = EXCLUDED.profile, updated_at = NOW()`;
    return;
  }
  profiles[String(profile.id)] = profile;
  await writeLocalProfiles(profiles);
}

async function getProfile(tgUser) {
  const id = String(tgUser.id);
  await databaseReady;
  let profile;
  if (databaseConfigured) {
    const result = await sql`SELECT profile FROM users WHERE id = ${id}`;
    profile = result.rows[0]?.profile;
  } else {
    profile = profiles[id];
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
