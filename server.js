import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import { Telegraf, Markup } from 'telegraf';

const app = express();
const port = Number(process.env.PORT || 3000);
const isVercel = process.env.VERCEL === '1';
const botToken = process.env.BOT_TOKEN;
const appUrl = process.env.APP_URL;
const users = new Map();

app.use(express.json());
app.use(express.static('public'));

// Vercel передаёт запросы в этот Express-инстанс через serverless function.
// Явный fallback гарантирует, что корень домена всегда отдаёт Mini App.
app.get('/', (req, res) => res.sendFile('index.html', { root: 'public' }));

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
  if (!users.has(id)) users.set(id, { id, name: tgUser.first_name || 'Пользователь', stars: 100, tasks: 0 });
  return users.get(id);
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
  if (profile.tasks > 0) return res.status(400).json({ error: 'Бонус уже получен сегодня' });
  profile.stars += 25;
  profile.tasks += 1;
  res.json({ profile, message: 'Получено ⭐25' });
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
