import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { Telegraf, Markup } from 'telegraf';

const app = express();
const port = Number(process.env.PORT || 3000);
const isVercel = process.env.VERCEL === '1';
const botToken = process.env.BOT_TOKEN;
const appUrl = process.env.APP_URL;
const users = new Map();
const usersFile = path.join(__dirname, 'users.json');

try {
  if (fs.existsSync(usersFile)) {
    for (const [id, profile] of Object.entries(JSON.parse(fs.readFileSync(usersFile, 'utf8')))) users.set(id, profile);
  }
} catch (error) {
  console.error('Не удалось загрузить пользователей:', error.message);
}

function saveUsers() {
  try { fs.writeFileSync(usersFile, JSON.stringify(Object.fromEntries(users), null, 2)); }
  catch (error) { console.error('Не удалось сохранить пользователей:', error.message); }
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
      stars: 100,
      tasks: 0,
      gifts: { bear: 0, rose: 0 },
      lastDailyAt: null
    });
    saveUsers();
  }
  const profile = users.get(id);
  if (!profile.gifts) profile.gifts = { bear: 0, rose: 0 };
  if (!Object.prototype.hasOwnProperty.call(profile, 'lastDailyAt')) {
    profile.lastDailyAt = profile.lastDaily ? new Date(`${profile.lastDaily}T00:00:00.000Z`).getTime() : null;
    delete profile.lastDaily;
    saveUsers();
  }
  return profile;
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
  profile.stars += 100;
  profile.tasks += 1;
  profile.lastDailyAt = now;
  saveUsers();
  res.json({ profile, message: 'Получено ⭐100' });
});

app.get('/api/cases', (req, res) => {
  res.json(Object.entries(cases).map(([id, item]) => ({ id, ...item })));
});

app.post('/api/cases/:caseId/open', (req, res) => {
  const tgUser = currentUser(req);
  if (!tgUser) return res.status(401).json({ error: 'Нет авторизации' });
  const selectedCase = cases[req.params.caseId];
  if (!selectedCase) return res.status(404).json({ error: 'Кейс не найден' });
  const profile = getProfile(tgUser);
  if (profile.stars < selectedCase.price) return res.status(400).json({ error: 'Недостаточно звёзд' });

  const reward = drawReward(selectedCase.rewards);
  profile.stars -= selectedCase.price;
  if (reward.type === 'stars') profile.stars += reward.amount;
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
