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
const databaseConfigured = Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL);
const isVercel = Boolean(process.env.VERCEL);
const localDatabasePath = path.join(__dirname, 'data', 'users.json');
let databaseReady;

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
  if (!databaseConfigured) {
    if (isVercel) {
      throw new Error('Не задан POSTGRES_URL или POSTGRES_PRISMA_URL в настройках Vercel');
    }
    await ensureLocalDatabase();
    console.warn('Postgres не задан: используется локальная база data/users.json');
    return;
  }
  await sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    profile JSONB NOT NULL
  )`;
}

databaseReady = initDatabase().catch(error => {
  console.error('Не удалось инициализировать Postgres:', error.message);
  throw error;
});

async function saveUser(profile) {
  await databaseReady;
  if (!databaseConfigured) {
    const profiles = await readLocalProfiles();
    profiles[String(profile.id)] = profile;
    await writeLocalProfiles(profiles);
    return;
  }
  await sql`INSERT INTO users (id, profile) VALUES (${String(profile.id)}, ${JSON.stringify(profile)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET profile = EXCLUDED.profile`;
}

async function getProfile(tgUser) {
  const id = String(tgUser.id);
  await databaseReady;
  let profile;
  if (!databaseConfigured) {
    const profiles = await readLocalProfiles();
    profile = profiles[id];
  } else {
    const result = await sql`SELECT profile FROM users WHERE id = ${id}`;
    profile = result.rows[0]?.profile;
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
    if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
    return JSON.parse(params.get('user'));
  } catch { return null; }
}

function currentUser(req) {
  const telegramUser = verifyTelegramInitData(req.headers['x-telegram-init-data']);
  if (telegramUser) return telegramUser;
  if (process.env.NODE_ENV !== 'production') return { id: 'demo', first_name: 'Демо', username: 'demo' };
  // В Vercel без Telegram initData API всё равно отвечает корректно, но без профиля.
  // Это предотвращает падение страницы при первичной проверке деплоя.
  return null;
}

const cases = {
  freebie: {
    name: 'КЕЙС ХАЛЯВА',
    price: 100,
    rewards: [
      { label: '⭐ 5 звёзд', type: 'stars', amount: 5, chance: 70, image: '/assets/5-stars.png' },
      { label: '⭐ 10 звёзд', type: 'stars', amount: 10, chance: 20, image: '/assets/10-stars.png' },
      { label: '🧸 Мишка Telegram', type: 'bear', chance: 5, image: '/assets/bear.png' },
      { label: '🌹 Роза Telegram', type: 'rose', chance: 4, image: '/assets/rose.png' },
      { label: '⭐ 100 звёзд', type: 'stars', amount: 100, chance: 1, image: '/assets/100-stars.png' }
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
