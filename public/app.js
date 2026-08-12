const tg = window.Telegram?.WebApp;
tg?.ready(); tg?.expand();
const headers = {'Content-Type':'application/json','x-telegram-init-data':tg?.initData || ''};
const $ = id => document.getElementById(id);
const toast = text => { $('toast').textContent=text; $('toast').classList.add('show'); setTimeout(()=>$('toast').classList.remove('show'),2500); };
let profile;
let dailyTimer;
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
function formatRemainingTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${secs}`;
}
function updateDailyStatus() {
  const remaining = profile?.lastDailyAt ? DAILY_COOLDOWN - (Date.now() - profile.lastDailyAt) : 0;
  const available = remaining <= 0;
  $('daily').disabled = !available;
  $('daily').textContent = available ? 'Забрать' : 'Получено';
  $('dailyStatus').textContent = available
    ? 'Заходи каждый день и забирай награду.'
    : `Следующая награда через ${formatRemainingTime(remaining)}`;
}
function startDailyTimer() {
  clearInterval(dailyTimer);
  updateDailyStatus();
  if (profile?.lastDailyAt && Date.now() - profile.lastDailyAt < DAILY_COOLDOWN) {
    dailyTimer = setInterval(() => {
      updateDailyStatus();
      if (Date.now() - profile.lastDailyAt >= DAILY_COOLDOWN) clearInterval(dailyTimer);
    }, 1000);
  }
}
async function request(url, options={}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw Error(data?.error || `Ошибка сервера (${response.status})`);
  return data;
}
function render(user, data) {
  profile=data;
  const name=user.first_name||'друг';
  $('name').textContent=name; $('heroName').textContent=name; $('avatar').textContent=(name[0]||'✦').toUpperCase();
  $('stars').textContent=data.caseStars ?? data.stars ?? 0; $('statStars').textContent=data.caseStars ?? data.stars ?? 0;
  if ($('profileCaseStars')) $('profileCaseStars').textContent=data.caseStars ?? data.stars ?? 0;
  const rocketStars = data.caseStars ?? data.stars ?? 0;
  if ($('rocketStars')) $('rocketStars').textContent=rocketStars;
  if ($('plinkoStars')) $('plinkoStars').textContent = rocketStars;
  if ($('profilePrizeStars')) $('profilePrizeStars').textContent=data.prizeStars ?? 0;
  if ($('profileRegistered')) $('profileRegistered').textContent=data.registeredAt ? new Date(data.registeredAt).toLocaleDateString('ru-RU') : '—';
  startDailyTimer();
}
$('daily').onclick=async event=>{
  const button = event.currentTarget;
  if (!profile || button.disabled) return;
  button.disabled = true;
  try {
    const data = await request('/api/daily', { method: 'POST' });
    render({ first_name: profile.name }, data.profile);
    toast(data.message);
  } catch (e) {
    updateDailyStatus();
    toast(e.message);
  }
};
const TOPUP_LINK='https://playerok.com/profile/SaharOK086/products';
$('profileButton').onclick=()=>{ $('profileModal').classList.add('visible'); $('promoCode').value=''; $('topupLink').value=TOPUP_LINK; $('topupLinkOpen').href=TOPUP_LINK; };
$('profileModal').addEventListener('click', event=>{ if (event.target === $('profileModal')) $('profileModal').classList.remove('visible'); });
$('giftsModal').addEventListener('click', event=>{ if (event.target === $('giftsModal')) $('giftsModal').classList.remove('visible'); });
$('closeGifts').onclick=()=> $('giftsModal').classList.remove('visible');
function renderGifts() {
  // У старых профилей giftItems формируется сервером из уже накопленных gifts.
  const gifts = profile?.giftItems || [];
  $('giftsList').innerHTML = gifts.length ? gifts.slice().reverse().map(gift => {
    const fallbackNames = { bear: 'Мишка Telegram', heart: 'Сердце Telegram', rose: 'Роза Telegram', cake: 'Торт Telegram', bouquet: 'Букет Telegram', rocket: 'Ракета Telegram', ring: 'Кольцо Telegram', cup: 'Кубок Telegram', diamond: 'Алмаз Telegram', 'nft-icecream': 'NFT-мороженое', 'nft-snake': 'NFT-змея', 'nft-doshirak': 'NFT-доширак', 'nft-lollipop': 'NFT-леденец' };
    const name = rewardName(gift) === 'Приз' ? (fallbackNames[gift.type] || 'Подарок Telegram') : rewardName(gift);
    return `<article class=\