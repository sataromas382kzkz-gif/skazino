import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { Telegraf, Markup } from 'telegraf';
import { promoCodes } from './promo-codes.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const isVercel = process.env.VERCEL === '1';
const botToken = process.env.BOT_TOKEN;
const appUrl = process.env.APP_URL;
// Локальная SQLite-база находится на компьютере рядом с приложением и переживает перезапуски.
const databaseFile = process.env.DATABASE_FILE || path.join(__dirname, 'users.sqlite3');
const db = new Database(databaseFile);
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, profile TEXT NOT NULL)`);
const writeUser = db.prepare(`INSERT INTO users (id, profile) VALUES (?, ?)
  ON CONFLICT(id) DO UPDATE SET profile = excluded.profile`);
const users = new Map();

// data.json остаётся источником настроек кейсов/промокодов, а пользователи живут в SQLite.
const dataFile = process.env.DATA_FILE || path.join(__dirname, 'data.json');

function readDataFile() {
  if (!fs.existsSync(dataFile)) return {};
  try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
  catch (error) {
    console.error('Не удалось загрузить данные:', error.message);
    return {};
  }
}

// Загружаем профили из SQLite при старте приложения.
for (const row of db.prepare('SELECT id, profile FROM users').all()) {
  try { users.set(row.id, JSON.parse(row.profile)); }
  catch (error) { console.error(`Не удалось прочитать профиль ${row.id}:`, error.message); }
}

function saveUsers() {
  const transaction = db.transaction(() => {
    for (const [id, profile] of users) writeUser.run(id, JSON.stringify(profile));
  });
  try { transaction(); }
  catch (error) { console.error('Не удалось сохранить пользователей:', error.message); }
}

// Однократный импорт старых профилей из data.json/users.json в SQLite.
const storedData = readDataFile();
const oldUsers = storedData.users || {};
const legacyUsersFile = path.join(__dirname, 'users.json');
if (!Object.keys(oldUsers).length && fs.existsSync(legacyUsersFile)) {
  try { Object.assign(oldUsers, JSON.parse(fs.readFileSync(legacyUsersFile, 'utf8'))); }
  catch (error) { console.error('Не удалось перенести старые данные пользователей:', error.message); }
}
for (const [id, profile] of Object.entries(oldUsers)) if (!users.has(id)) users.set(id, profile);
if (Object.keys(oldUsers).length) saveUsers();
// После импорта не оставляем старый JSON источником пользовательских данных.
if (Object.keys(oldUsers).length && storedData.users) {
  try {
    const cleanData = { ...storedData };
    delete cleanData.users;
    const temporaryFile = `${dataFile}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(cleanData, null, 2));
    fs.renameSync(temporaryFile, dataFile);
  } catch (error) { console.error('Не удалось очистить старые данные:', error.message); }
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
  return null;
}

function getProfile(tgUser) {
  const id = String(tgUser.id);
  if (!users.has(id)) {
    users.set(id, {
      id,
      name: tgUser.first_name || 'Пользователь',
      registeredAt: Date.now(),
      stars: 100,
      caseStars: 100,
      prizeStars: 0,
      tasks: 0,
      gifts: { bear: 0, rose: 0 },
      promoCode: '',
      usedPromoCodes: [],
      topupLink: 'https://playerok.com/profile/SaharOK086/products',
      lastDailyAt: null
    });
    saveUsers();
  }
  const profile = users.get(id);
  // Всегда сохраняем профиль в памяти под Telegram ID, а не в браузере устройства.
  // Поэтому повторный вход с другого устройства получает те же данные.
  let changed = false;
  if (!profile.gifts) { profile.gifts = { bear: 0, rose: 0 }; changed = true; }
  if (!Object.prototype.hasOwnProperty.call(profile, 'registeredAt')) { profile.registeredAt = Date.now(); changed = true; }
  if (!Object.prototype.hasOwnProperty.call(profile, 'caseStars')) { profile.caseStars = profile.stars ?? 100; changed = true; }
  if (!Object.prototype.hasOwnProperty.call(profile, 'prizeStars')) { profile.prizeStars = 0; changed = true; }
  if (!Object.prototype.hasOwnProperty.call(profile, 'promoCode')) { profile.promoCode = ''; changed = true; }
  if (!Object.prototype.hasOwnProperty.call(profile, 'usedPromoCodes')) { profile.usedPromoCodes = []; changed = true; }
  if (profile.topupLink !== 'https://playerok.com/profile/SaharOK086/products') { profile.topupLink = 'https://playerok.com/profile/SaharOK086/products'; changed = true; }
  if (!Object.prototype.hasOwnProperty.call(profile, 'lastDailyAt')) {
    profile.lastDailyAt = profile.lastDaily ? new Date(`${profile.lastDaily}T00:00:00.000Z`).getTime() : null;
    delete profile.lastDaily;
    changed = true;
  }
  if (changed) saveUsers();
  return profile;
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

app.get('/api/me', (req, res) => {
  const tgUser = currentUser(req);
  if (!tgUser) return res.status(401).json({ error: 'Откройте приложение через Telegram' });
  res.json({ user: tgUser, profile: getProfile(tgUser) });
});

app.post('/api/daily', (req, res) => {
  const tgUser = currentUser(req);
  if (!tgUser) return res.status(401).json({ error: 'Нет авторизации' });
  const profile = getProfile(tgUser);
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
  saveUsers();
  res.json({ profile, message: 'Получено ⭐100' });
});

app.get('/api/cases', (req, res) => {
  res.json(Object.entries(cases).map(([id, item]) => ({ id, ...item })));
});

app.post('/api/profile/topup', (req, res) => {
  const tgUser = currentUser(req);
  if (!tgUser) return res.status(401).json({ error: 'Нет авторизации' });
  const profile = getProfile(tgUser);
  profile.topupLink = 'https://playerok.com/profile/SaharOK086/products';
  saveUsers();
  res.json({ profile });
});

app.post('/api/profile/promo', (req, res) => {
  const tgUser = currentUser(req);
  if (!tgUser) return res.status(401).json({ error: 'Нет авторизации' });
  const profile = getProfile(tgUser);
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Введите промокод' });
  if ([...users.values()].some(user => user.usedPromoCodes?.includes(code))) return res.status(400).json({ error: 'Промокод уже использован' });
  if (!Object.prototype.hasOwnProperty.call(promoCodes, code)) return res.status(400).json({ error: 'Промокод не найден' });
  const promo = Number(promoCodes[code]);
  if (!Number.isInteger(promo) || promo <= 0) return res.status(500).json({ error: 'Промокод настроен неправильно' });
  profile.caseStars += promo;
  profile.stars = profile.caseStars;
  profile.usedPromoCodes = [...(profile.usedPromoCodes || []), code];
  profile.promoCode = code;
  saveUsers();
  res.json({ profile, message: `Начислено ⭐${promo}` });
});

app.post('/api/cases/:caseId/open', (req, res) => {
  const tgUser = currentUser(req);
  if (!tgUser) return res.status(401).json({ error: 'Нет авторизации' });
  const selectedCase = cases[req.params.caseId];
  if (!selectedCase) return res.status(404).json({ error: 'Кейс не найден' });
  const profile = getProfile(tgUser);
  if (profile.caseStars < selectedCase.price) return res.status(400).json({ error: 'Недостаточно звёзд для кейса' });

  const reward = drawReward(selectedCase.rewards);
  profile.caseStars -= selectedCase.price;
  profile.stars = profile.caseStars;
  if (reward.type === 'stars') profile.prizeStars += reward.amount;
  else profile.gifts[reward.type] += 1;
  saveUsers();
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
  bot.command('profile', ctx => {
    const profile = getProfile(ctx.from);
    return ctx.reply(`👤 ${profile.name}\\n⭐ Баланс: ${profile.stars}\\n✅ Заданий: ${profile.tasks}`);
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
