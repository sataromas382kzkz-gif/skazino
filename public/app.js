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
  $('daily').textContent = available ? 'Р—Р°Р±СЂР°С‚СЊ' : 'РџРѕР»СѓС‡РµРЅРѕ';
  $('dailyStatus').textContent = available
    ? 'Р—Р°С…РѕРґРё РєР°Р¶РґС‹Р№ РґРµРЅСЊ Рё Р·Р°Р±РёСЂР°Р№ РЅР°РіСЂР°РґСѓ.'
    : `РЎР»РµРґСѓСЋС‰Р°СЏ РЅР°РіСЂР°РґР° С‡РµСЂРµР· ${formatRemainingTime(remaining)}`;
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
  if (!response.ok) throw Error(data?.error || `РћС€РёР±РєР° СЃРµСЂРІРµСЂР° (${response.status})`);
  return data;
}
function render(user, data) {
  profile=data;
  const name=user.first_name||'РґСЂСѓРі';
  $('name').textContent=name; $('heroName').textContent=name; $('avatar').textContent=(name[0]||'вњ¦').toUpperCase();
  $('stars').textContent=data.caseStars ?? data.stars ?? 0; $('statStars').textContent=data.caseStars ?? data.stars ?? 0;
  if ($('profileCaseStars')) $('profileCaseStars').textContent=data.caseStars ?? data.stars ?? 0;
  const rocketStars = data.caseStars ?? data.stars ?? 0;
  if ($('rocketStars')) $('rocketStars').textContent=rocketStars;
  if ($('plinkoStars')) $('plinkoStars').textContent = rocketStars;
  if ($('profilePrizeStars')) $('profilePrizeStars').textContent=data.prizeStars ?? 0;
  if ($('profileRegistered')) $('profileRegistered').textContent=data.registeredAt ? new Date(data.registeredAt).toLocaleDateString('ru-RU') : 'вЂ”';
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
  // РЈ СЃС‚Р°СЂС‹С… РїСЂРѕС„РёР»РµР№ giftItems С„РѕСЂРјРёСЂСѓРµС‚СЃСЏ СЃРµСЂРІРµСЂРѕРј РёР· СѓР¶Рµ РЅР°РєРѕРїР»РµРЅРЅС‹С… gifts.
  const gifts = profile?.giftItems || [];
  $('giftsList').innerHTML = gifts.length ? gifts.slice().reverse().map(gift => {
    const fallbackNames = { bear: 'РњРёС€РєР° Telegram', heart: 'РЎРµСЂРґС†Рµ Telegram', rose: 'Р РѕР·Р° Telegram', cake: 'РўРѕСЂС‚ Telegram', bouquet: 'Р‘СѓРєРµС‚ Telegram', rocket: 'Р Р°РєРµС‚Р° Telegram', ring: 'РљРѕР»СЊС†Рѕ Telegram', cup: 'РљСѓР±РѕРє Telegram', diamond: 'РђР»РјР°Р· Telegram', 'nft-icecream': 'NFT-РјРѕСЂРѕР¶РµРЅРѕРµ', 'nft-snake': 'NFT-Р·РјРµСЏ', 'nft-doshirak': 'NFT-РґРѕС€РёСЂР°Рє', 'nft-lollipop': 'NFT-Р»РµРґРµРЅРµС†' };
    const name = rewardName(gift) === 'РџСЂРёР·' ? (fallbackNames[gift.type] || 'РџРѕРґР°СЂРѕРє Telegram') : rewardName(gift);
    return `<article class="gift-card"><span class="gift-icon">${rewardEmoji(gift)}</span><div><b>${escapeHtml(name)}</b><small>Р’С‹Р±РёС‚Рѕ РёР· РєРµР№СЃР°</small></div><a class="withdraw-button" href="https://t.me/murarru" target="_blank" rel="noopener">Р’С‹РІРµСЃС‚Рё</a></article>`;
  }).join('') : '<p class="empty-gifts">РџРѕРєР° РЅРµС‚ РїРѕРґР°СЂРєРѕРІ. РћС‚РєСЂРѕР№С‚Рµ РєРµР№СЃ вЂ” Рё РѕРЅРё РїРѕСЏРІСЏС‚СЃСЏ Р·РґРµСЃСЊ.</p>';
}
$('giftsButton').onclick=()=>{ renderGifts(); $('giftsModal').classList.add('visible'); };
$('withdrawStarsButton').onclick=()=>{
  if ((profile?.prizeStars ?? 0) < 50) return toast('Р’С‹РІРѕРґ Р·РІС‘Р·Рґ РґРѕСЃС‚СѓРїРµРЅ РїСЂРё Р±Р°Р»Р°РЅСЃРµ РѕС‚ 50 Р·РІС‘Р·Рґ');
  window.open('https://t.me/murarru', '_blank', 'noopener');
};
$('promoButton').onclick=async()=>{ try { const data=await request('/api/profile/promo',{method:'POST',body:JSON.stringify({code:$('promoCode').value})}); render({first_name:profile.name},data.profile); toast(data.message); } catch(e){toast(e.message)} };
// РЎСЃС‹Р»РєР° С„РёРєСЃРёСЂРѕРІР°РЅРЅР°СЏ Рё РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ РЅР°РїСЂСЏРјСѓСЋ; РєРЅРѕРїРєРё СЃРѕС…СЂР°РЅРµРЅРёСЏ РЅРµС‚.
$('topupLink').onclick=()=>$('topupLink').select();
// РџРµСЂРµРєР»СЋС‡РµРЅРёРµ РІРєР»Р°РґРѕРє РњРёРЅРё-РёРіСЂ: Р°РєС‚РёРІРЅР°СЏ РїР°РЅРµР»СЊ СЃРѕРѕС‚РІРµС‚СЃС‚РІСѓРµС‚ РІС‹Р±СЂР°РЅРЅРѕР№ РёРіСЂРµ.
function switchMiniGame(game) {
  document.querySelectorAll('.mini-game-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.game === game));
  document.querySelectorAll('.mini-game-panel').forEach(panel => panel.classList.toggle('active', panel.id === `${game}Game`));
}
document.querySelectorAll('.mini-game-tab').forEach(tab => tab.addEventListener('click', () => switchMiniGame(tab.dataset.game)));
let rocketActive = false;
let rocketStartedAt = 0;
let rocketServerNow = 0;
let rocketClockAtSync = 0;
let rocketFrame = 0;
let rocketStatusTimer = 0;
let rocketStatusPending = false;
let rocketLastMultiplierText = '';
let rocketFlightSoundTimer = 0;
// РќРѕРјРµСЂ Р»РѕРєР°Р»СЊРЅРѕРіРѕ СЂР°СѓРЅРґР° РѕС‚СЃРµРєР°РµС‚ Р·Р°РїРѕР·РґР°Р»С‹Рµ РѕС‚РІРµС‚С‹ status/start РѕС‚ СѓР¶Рµ
// Р·Р°РІРµСЂС€С‘РЅРЅРѕР№ РёРіСЂС‹: РѕРЅРё РЅРµ СЃРјРѕРіСѓС‚ РІРµСЂРЅСѓС‚СЊ Р°РЅРёРјР°С†РёСЋ РїРѕСЃР»Рµ РІР·СЂС‹РІР°.
let rocketRunId = 0;

function readServerTime(value) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}
function rocketMultiplierForElapsed(seconds) {
  // РўР° Р¶Рµ С„РѕСЂРјСѓР»Р°, С‡С‚Рѕ Рё РЅР° СЃРµСЂРІРµСЂРµ: РєР»РёРµРЅС‚ РїРѕРєР°Р·С‹РІР°РµС‚ С‚РѕР»СЊРєРѕ Р°РЅРёРјР°С†РёСЋ,
  // РѕРєРѕРЅС‡Р°С‚РµР»СЊРЅС‹Р№ СЂРµР·СѓР»СЊС‚Р°С‚ РІСЃС‘ СЂР°РІРЅРѕ РїСЂРѕРІРµСЂСЏРµС‚ API.
  return Math.min(20, 1 + .18 * seconds + .04 * seconds ** 2);
}
function syncRocketClock(round) {
  // РўРѕС‡РєР° РѕС‚СЃС‡С‘С‚Р° РїРµСЂРµРЅРѕСЃРёС‚СЃСЏ РЅР° monotonic performance.now(), РєРѕС‚РѕСЂС‹Р№ РЅРµ
  // РјРµРЅСЏРµС‚СЃСЏ РїСЂРё СЂСѓС‡РЅРѕР№ СЃРјРµРЅРµ С‡Р°СЃРѕРІ РЅР° С‚РµР»РµС„РѕРЅРµ. РЎРµСЂРІРµСЂРЅРѕРµ `now` РѕСЃС‚Р°С‘С‚СЃСЏ
  // РёСЃС‚РѕС‡РЅРёРєРѕРј РёСЃС‚РёРЅС‹ РґР»СЏ СЂР°СЃС‡С‘С‚Р° СЃР»РµРґСѓСЋС‰РµРіРѕ РєР°РґСЂР°.
  rocketStartedAt = readServerTime(round.startedAt);
  rocketServerNow = readServerTime(round.now);
  rocketClockAtSync = performance.now();
}
function currentRocketServerTime() {
  return rocketServerNow + Math.max(0, performance.now() - rocketClockAtSync);
}
function rocketMultiplier() {
  const seconds = Math.max(0, currentRocketServerTime() - rocketStartedAt) / 1000;
  return rocketMultiplierForElapsed(seconds);
}
function updateRocketButton() {
  const bet = Math.max(20, Number($('rocketBet').value) || 20);
  $('rocketButton').textContent = rocketActive ? 'Р—Р°Р±СЂР°С‚СЊ РІС‹РёРіСЂС‹С€' : `Р—Р°РїСѓСЃС‚РёС‚СЊ Р·Р° ${bet} в­ђ`;
}
function stopRocketAnimation() {
  cancelAnimationFrame(rocketFrame);
  clearInterval(rocketStatusTimer);
  clearInterval(rocketFlightSoundTimer);
  rocketFrame = null;
  rocketStatusTimer = null;
  rocketFlightSoundTimer = null;
}
function finishRocketCrash(message) {
  // РРЅРІР°Р»РёРґРёСЂСѓРµРј РІСЃРµ РЅРµР·Р°РІРµСЂС€С‘РЅРЅС‹Рµ СЃРµС‚РµРІС‹Рµ РѕС‚РІРµС‚С‹ Рё РїРѕР»РЅРѕСЃС‚СЊСЋ РѕС‡РёС‰Р°РµРј РїРѕР»С‘С‚.
  rocketRunId += 1;
  rocketActive = false;
  rocketStatusPending = false;
  stopRocketAnimation();
  $('rocketBet').disabled = false;
  $('rocketSky').classList.remove('flying');
  $('rocketStar').style.removeProperty('--flight-delay');
  $('rocketSky').classList.add('crashed');
  $('rocketStatus').textContent = message;
  $('rocketMultiplier').textContent = 'рџ’Ґ';
  $('rocketMultiplier').classList.remove('multiplier-tick');
  setTimeout(() => $('rocketSky').classList.remove('crashed'), 900);
  playTone(90, .35, .14);
  updateRocketButton();
}
function renderRocketFrame() {
  if (!rocketActive) return;
  const multiplier = rocketMultiplier();
  const multiplierElement = $('rocketMultiplier');
  const multiplierText = `${multiplier.toFixed(2)}x`;
  if (multiplierText !== rocketLastMultiplierText) {
    rocketLastMultiplierText = multiplierText;
    multiplierElement.textContent = multiplierText;
    // РРјРїСѓР»СЊСЃ Р·Р°РїСѓСЃРєР°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ РїСЂРё СЃРјРµРЅРµ СЃРѕС‚РѕР№, РЅРµ РЅР° РєР°Р¶РґРѕРј РєР°РґСЂРµ.
    multiplierElement.classList.remove('multiplier-tick');
    void multiplierElement.offsetWidth;
    multiplierElement.classList.add('multiplier-tick');
  }
  rocketFrame = requestAnimationFrame(renderRocketFrame);
}
async function checkRocketStatus() {
  if (!rocketActive || rocketStatusPending) return;
  const runId = rocketRunId;
  rocketStatusPending = true;
  try {
    const status = await request('/api/rocket/status');
    if (!rocketActive || runId !== rocketRunId) return;
    if (status.crashed) return finishRocketCrash(`Р Р°РєРµС‚Р° РІР·РѕСЂРІР°Р»Р°СЃСЊ РЅР° ${Number(status.multiplier).toFixed(2)}x`);
    // РЎРµСЂРІРµСЂ вЂ” РёСЃС‚РѕС‡РЅРёРє РёСЃС‚РёРЅС‹, Р° requestAnimationFrame РѕС‚СЂРёСЃРѕРІС‹РІР°РµС‚ РІСЃРµ
    // РїСЂРѕРјРµР¶СѓС‚РѕС‡РЅС‹Рµ СЃРѕС‚С‹Рµ РјРµР¶РґСѓ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏРјРё Р±РµР· СЂС‹РІРєРѕРІ.
    syncRocketClock(status);
  } catch (error) {
    // РџРѕСЃР»Рµ РІР·СЂС‹РІР° СЃРµСЂРІРµСЂ СѓРґР°Р»СЏРµС‚ СЂР°СѓРЅРґ. Р•СЃР»Рё РѕС‚РІРµС‚ Рѕ РІР·СЂС‹РІРµ РЅРµ РґРѕС€С‘Р»,
    // В«РќРµС‚ Р°РєС‚РёРІРЅРѕР№ СЂР°РєРµС‚С‹В» РѕР·РЅР°С‡Р°РµС‚ Р·Р°РІРµСЂС€С‘РЅРЅС‹Р№ СЂР°СѓРЅРґ, Р° РЅРµ РїРѕРІРѕРґ Р»РµС‚РµС‚СЊ РґР°Р»СЊС€Рµ.
    if (rocketActive && runId === rocketRunId && String(error.message).includes('РќРµС‚ Р°РєС‚РёРІРЅРѕР№ СЂР°РєРµС‚С‹')) {
      finishRocketCrash('Р Р°РєРµС‚Р° РІР·РѕСЂРІР°Р»Р°СЃСЊ. РЎС‚Р°РІРєР° СЃРіРѕСЂРµР»Р°.');
    }
    // РџСЂРё РєСЂР°С‚РєРѕРІСЂРµРјРµРЅРЅРѕРј СЃР±РѕРµ СЃРµС‚Рё РЅРµ РѕСЃС‚Р°РЅР°РІР»РёРІР°РµРј СѓР¶Рµ Р·Р°РїСѓС‰РµРЅРЅС‹Р№ СЂР°СѓРЅРґ.
  } finally {
    if (runId === rocketRunId) rocketStatusPending = false;
  }
}
function startRocketAnimation() {
  stopRocketAnimation();
  rocketLastMultiplierText = '';
  renderRocketFrame(); // РїР»Р°РІРЅРѕРµ РѕР±РЅРѕРІР»РµРЅРёРµ РЅР° РєР°Р¶РґРѕРј РєР°РґСЂРµ, Р±РµР· РґСЂРѕР¶Р°РЅРёСЏ С‚Р°Р№РјРµСЂРѕРІ
  checkRocketStatus();
  // РЎРµСЂРІРµСЂ РѕСЃС‚Р°С‘С‚СЃСЏ РёСЃС‚РѕС‡РЅРёРєРѕРј РёСЃС‚РёРЅС‹: РєР»РёРµРЅС‚ Р»РёС€СЊ СЂРёСЃСѓРµС‚ С‚РµРєСѓС‰РёР№ РєРѕСЌС„С„РёС†РёРµРЅС‚.
  rocketStatusTimer = setInterval(checkRocketStatus, 900);
  rocketFlightSoundTimer = setInterval(() => {
    if (rocketActive && !document.hidden) playRocketFlightSound();
  }, 4200);
}
$('rocketBet').addEventListener('input', updateRocketButton);
$('rocketButton').onclick = async () => {
  const button = $('rocketButton');
  if (!profile) return;
  const cashingOut = rocketActive;
  button.disabled = true;
  try {
    if (!rocketActive) {
      const bet = Math.max(20, Math.floor(Number($('rocketBet').value) || 20));
      $('rocketBet').value = bet;
      // Р Р°СѓРЅРґ СЃС‚Р°РЅРѕРІРёС‚СЃСЏ Р°РєС‚РёРІРЅС‹Рј С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ СЃРµСЂРІРµСЂР°. РўР°Рє
      // РґРІРѕР№РЅРѕР№ С‚Р°Рї РёР»Рё РјРµРґР»РµРЅРЅР°СЏ СЃРµС‚СЊ РЅРµ СЃРѕР·РґР°СЋС‚ В«Р»РѕРєР°Р»СЊРЅСѓСЋВ» Р±РµСЃРєРѕРЅРµС‡РЅСѓСЋ СЂР°РєРµС‚Сѓ.
      $('rocketStatus').textContent = 'РџРѕРґРіРѕС‚Р°РІР»РёРІР°РµРј РЅРѕРІС‹Р№ РЅРµР·Р°РІРёСЃРёРјС‹Р№ СЂР°СѓРЅРґвЂ¦';
      const data = await request('/api/rocket/start', { method: 'POST', body: JSON.stringify({ bet }) });
      rocketRunId += 1;
      rocketActive = true;
      rocketStatusPending = false;
      rocketLastMultiplierText = '';
      render({ first_name: profile.name }, data.profile);
      syncRocketClock(data);
      $('rocketBet').disabled = true;
      playRocketLaunchSound();
      // РџРµСЂРµР·Р°РїСѓСЃРєР°РµРј CSS-РїРѕР»С‘С‚ РїРѕСЃР»Рµ РїРѕР»СѓС‡РµРЅРёСЏ СЃС‚Р°РІРєРё. РћС‚СЂРёС†Р°С‚РµР»СЊРЅР°СЏ Р·Р°РґРµСЂР¶РєР°
      // СЃРѕС…СЂР°РЅСЏРµС‚ РІРµСЂРЅСѓСЋ РїРѕР·РёС†РёСЋ, РµСЃР»Рё РѕС‚РІРµС‚ СЃРµСЂРІРµСЂР° РїСЂРёС€С‘Р» РЅРµ РјРіРЅРѕРІРµРЅРЅРѕ.
      const star = $('rocketStar');
      star.style.removeProperty('--flight-delay');
      $('rocketSky').classList.remove('flying');
      void star.offsetWidth;
      // Р”Р»РёРЅРЅР°СЏ С‚СЂР°РµРєС‚РѕСЂРёСЏ РґРІРёР¶РµС‚СЃСЏ РЅРµРїСЂРµСЂС‹РІРЅРѕ Рё РЅРµ РІРѕР·РІСЂР°С‰Р°РµС‚ Р·РІРµР·РґСѓ СЂРµР·РєРѕ РІ РЅР°С‡Р°Р»Рѕ.
      // РџРѕР»С‘С‚ РѕРґРЅРѕРєСЂР°С‚РЅС‹Р№: РїРѕСЃР»Рµ РєРѕРЅС†Р° С‚СЂР°РµРєС‚РѕСЂРёРё Р·РІРµР·РґР° РѕСЃС‚Р°С‘С‚СЃСЏ РІ РІРµСЂС…РЅРµР№ С‚РѕС‡РєРµ.
      star.style.setProperty('--flight-delay', `-${Math.min(36000, Math.max(0, currentRocketServerTime() - rocketStartedAt))}ms`);
      $('rocketSky').classList.add('flying');
      $('rocketStatus').textContent = 'Р Р°РєРµС‚Р° РЅР°Р±РёСЂР°РµС‚ РІС‹СЃРѕС‚Сѓ. Р—Р°Р±РµСЂРёС‚Рµ РІС‹РёРіСЂС‹С€ РґРѕ РІР·СЂС‹РІР°.';
      playTone(420, .12, .11); playTone(620, .18, .1, .1);
      startRocketAnimation();
    } else {
      const data = await request('/api/rocket/cashout', { method: 'POST' });
      rocketRunId += 1;
      rocketActive = false;
      rocketStatusPending = false;
      stopRocketAnimation();
      $('rocketBet').disabled = false;
      $('rocketSky').classList.remove('flying');
      $('rocketStatus').textContent = `Р’С‹ Р·Р°Р±СЂР°Р»Рё ${data.payout} в­ђ РЅР° ${data.multiplier.toFixed(2)}x!`;
      render({ first_name: profile.name }, data.profile);
      playWinSound();
    }
  } catch (e) {
    // РћС€РёР±РєР° СЃРµС‚Рё РЅРµ РѕР·РЅР°С‡Р°РµС‚ РІР·СЂС‹РІ: СЂР°СѓРЅРґ РѕСЃС‚Р°С‘С‚СЃСЏ РЅР° СЃРµСЂРІРµСЂРµ, Рё РёРіСЂРѕРє РјРѕР¶РµС‚
    // РїРѕРІС‚РѕСЂРёС‚СЊ РІС‹РІРѕРґ РїРѕСЃР»Рµ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ СЃРѕРµРґРёРЅРµРЅРёСЏ.
    if (cashingOut) {
      if (String(e.message).includes('РќРµС‚ Р°РєС‚РёРІРЅРѕР№ СЂР°РєРµС‚С‹') || String(e.message).includes('Р Р°РєРµС‚Р° РІР·РѕСЂРІР°Р»Р°СЃСЊ')) {
        finishRocketCrash('Р Р°РєРµС‚Р° РІР·РѕСЂРІР°Р»Р°СЃСЊ. РЎС‚Р°РІРєР° СЃРіРѕСЂРµР»Р°.');
      } else {
        toast(e.message);
        if (rocketActive) { button.disabled = false; updateRocketButton(); }
      }
    } else {
      // Р›РѕРєР°Р»СЊРЅС‹Р№ РѕС‚СЃС‡С‘С‚ СѓР¶Рµ Р±С‹Р» РїРѕРєР°Р·Р°РЅ, РїРѕСЌС‚РѕРјСѓ РїСЂРё РѕС‚РєР°Р·Рµ СЃРµСЂРІРµСЂР° Р±РµР·СѓСЃР»РѕРІРЅРѕ
      // СЃР±СЂР°СЃС‹РІР°РµРј РІСЃРµ С‚Р°Р№РјРµСЂС‹ Рё РєР»Р°СЃСЃС‹. Р­С‚Рѕ РёСЃРєР»СЋС‡Р°РµС‚ В«РІРµС‡РЅС‹Р№В» РїРѕР»С‘С‚ РїРѕСЃР»Рµ РѕС€РёР±РєРё.
      rocketRunId += 1;
      rocketActive = false;
      rocketStatusPending = false;
      stopRocketAnimation();
      $('rocketSky').classList.remove('flying');
      $('rocketSky').classList.remove('crashed');
      $('rocketStar').style.removeProperty('--flight-delay');
      $('rocketMultiplier').textContent = '1.00x';
      $('rocketStatus').textContent = 'РЎРґРµР»Р°Р№ СЃС‚Р°РІРєСѓ Рё Р·Р°Р±РµСЂРё РІС‹РёРіСЂС‹С€ РґРѕ РІР·СЂС‹РІР°.';
      // РљРѕРЅС„Р»РёРєС‚ РѕР·РЅР°С‡Р°РµС‚, С‡С‚Рѕ СЃРµСЂРІРµСЂРЅС‹Р№ СЂР°СѓРЅРґ СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚ (РЅР°РїСЂРёРјРµСЂ,
      // РѕС‚РІРµС‚ РїСЂРѕС€Р»РѕРіРѕ Р·Р°РїСЂРѕСЃР° РїСЂРёС€С‘Р» СЃ Р·Р°РґРµСЂР¶РєРѕР№). Р’РѕСЃСЃС‚Р°РЅР°РІР»РёРІР°РµРј РёРјРµРЅРЅРѕ РµРіРѕ.
      if (String(e.message).includes('Р Р°РєРµС‚Р° СѓР¶Рµ Р·Р°РїСѓС‰РµРЅР°')) {
        await restoreRocketRound();
        toast('Р’РѕСЃСЃС‚Р°РЅРѕРІР»РµРЅ СѓР¶Рµ РЅР°С‡Р°С‚С‹Р№ СЂР°СѓРЅРґ');
      } else {
        toast(e.message);
      }
    }
  } finally {
    // РџРѕСЃР»Рµ РјРіРЅРѕРІРµРЅРЅРѕРіРѕ РІР·СЂС‹РІР° finishRocketCrash СѓР¶Рµ РІРѕСЃСЃС‚Р°РЅРѕРІРёР» СЃРѕСЃС‚РѕСЏРЅРёРµ UI.
    button.disabled = false;
    updateRocketButton();
  }
};
updateRocketButton();
function rewardEmoji(reward) {
  if (reward?.type === 'bear') return 'рџ§ё';
  if (reward?.type === 'heart') return 'рџ’ќ';
  if (reward?.type === 'rose') return 'рџЊ№';
  if (reward?.type === 'cake') return 'рџЋ‚';
  if (reward?.type === 'bouquet') return 'рџ’ђ';
  if (reward?.type === 'rocket') return 'рџљЂ';
  if (reward?.type === 'ring') return 'рџ’Ќ';
  if (reward?.type === 'cup') return 'рџЏ†';
  if (reward?.type === 'diamond') return 'рџ’Ћ';
  if (reward?.type === 'nft-icecream') return 'рџЌ¦';
  if (reward?.type === 'nft-snake') return 'рџђЌ';
  if (reward?.type === 'nft-doshirak') return 'рџЌњ';
  if (reward?.type === 'nft-lollipop') return 'рџЌ­';
  return 'в­ђ';
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[character]));
}
function rewardName(reward) {
  // Р’ РЅР°Р·РІР°РЅРёСЏС… РїСЂРёР·РѕРІ СѓР¶Рµ РµСЃС‚СЊ emoji. РЈР±РёСЂР°РµРј РµРіРѕ, С‡С‚РѕР±С‹ РЅРµ РїРѕРєР°Р·С‹РІР°С‚СЊ РґРІР°Р¶РґС‹.
  return String(reward?.label || 'РџСЂРёР·').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim();
}

// РљРѕСЂРѕС‚РєРёРµ СЃРёРЅС‚РµР·РёСЂРѕРІР°РЅРЅС‹Рµ Р·РІСѓРєРё РЅРµ С‚СЂРµР±СѓСЋС‚ СЃС‚РѕСЂРѕРЅРЅРёС… С„Р°Р№Р»РѕРІ Рё СЂР°Р±РѕС‚Р°СЋС‚
// РІ Telegram WebView РїРѕСЃР»Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРѕРіРѕ РЅР°Р¶Р°С‚РёСЏ РЅР° РєРЅРѕРїРєСѓ РєРµР№СЃР°.
let audioContext;
function playTone(frequency, duration, volume = 0.05, delay = 0) {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const start = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start); oscillator.stop(start + duration + 0.02);
  } catch (_) { /* Р—РІСѓРє РЅРµРѕР±СЏР·Р°С‚РµР»РµРЅ: РїСЂРёР»РѕР¶РµРЅРёРµ СЂР°Р±РѕС‚Р°РµС‚ Рё Р±РµР· Web Audio. */ }
}
// Р“СЂРѕРјРєРѕСЃС‚СЊ СЌС„С„РµРєС‚РѕРІ Рё С„РѕРЅРѕРІРѕР№ РјРµР»РѕРґРёРё СѓРІРµР»РёС‡РµРЅР° РїСЂРёРјРµСЂРЅРѕ РЅР° 30%.
function playCaseOpenSound() { playTone(240, .16, .111); playTone(380, .18, .098, .13); }
function playReelSound() { playTone(720, .055, .052); }
function playWinSound() { playTone(520, .14, .117); playTone(660, .16, .117, .12); playTone(880, .25, .13, .25); }
function playRocketLaunchSound() {
  // РљРѕСЂРѕС‚РєРёР№ СЃС‚Р°СЂС‚РѕРІС‹Р№ РёРјРїСѓР»СЊСЃ Рё РЅР°СЂР°СЃС‚Р°СЋС‰РёР№ СЃРІРёСЃС‚ РґРІРёРіР°С‚РµР»СЏ.
  playTone(110, .16, .09);
  playTone(175, .24, .075, .07);
  playTone(310, .18, .055, .19);
}
function playRocketFlightSound() {
  // РќРµРЅР°РІСЏР·С‡РёРІС‹Р№ СЃРёРіРЅР°Р» РІС‹СЃРѕС‚С‹: РїСЂРѕРёРіСЂС‹РІР°РµС‚СЃСЏ СЂРµРґРєРѕ, Р° РЅРµ РІ РєР°Р¶РґРѕРј РєР°РґСЂРµ.
  playTone(420, .09, .026);
  playTone(630, .11, .022, .08);
}

// РќРµРЅР°РІСЏР·С‡РёРІР°СЏ С„РѕРЅРѕРІР°СЏ РјРµР»РѕРґРёСЏ: СЃРѕР·РґР°С‘С‚СЃСЏ Р±СЂР°СѓР·РµСЂРѕРј, Р±РµР· Р·Р°РіСЂСѓР·РєРё Р°СѓРґРёРѕС„Р°Р№Р»РѕРІ.
let menuMusicTimer;
let menuMusicStep = 0;
function playMenuMusicNote() {
  if (document.hidden || $('caseModal').classList.contains('visible')) return;
  const notes = [262, 330, 392, 330, 294, 349, 440, 349];
  // Р¤РѕРЅРѕРІР°СЏ РјРµР»РѕРґРёСЏ Р·Р°РјРµС‚РЅРµРµ, РЅРѕ РІСЃС‘ РµС‰С‘ С‚РёС€Рµ РёРіСЂРѕРІС‹С… СЌС„С„РµРєС‚РѕРІ.
  playTone(notes[menuMusicStep++ % notes.length], .34, .03);
}
function startMenuMusic() {
  if (menuMusicTimer) return;
  playMenuMusicNote();
  menuMusicTimer = setInterval(playMenuMusicNote, 720);
}
function stopMenuMusic() {
  clearInterval(menuMusicTimer);
  menuMusicTimer = null;
}
// РђРІС‚РѕРІРѕСЃРїСЂРѕРёР·РІРµРґРµРЅРёРµ Р±Р»РѕРєРёСЂСѓРµС‚СЃСЏ WebView, РїРѕСЌС‚РѕРјСѓ Р·Р°РїСѓСЃРєР°РµРј РјСѓР·С‹РєСѓ РїРѕСЃР»Рµ РїРµСЂРІРѕРіРѕ С‚Р°РїР°.
document.addEventListener('pointerdown', startMenuMusic, { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopMenuMusic(); });
function rewardMarkup(reward) {
  const label=escapeHtml(rewardName(reward));
  // РћРґРёРЅ Р·РЅР°С‡РѕРє Рё РЅР°Р·РІР°РЅРёРµ РѕС‚РѕР±СЂР°Р¶Р°СЋС‚СЃСЏ РІ РѕР±С‰РµР№ СЂРѕРІРЅРѕР№ СЃРµС‚РєРµ.
  return `<span class="reel-placeholder" aria-hidden="true">${rewardEmoji(reward)}</span><span class="reward-name">${label}</span>`;
}
function showCase(item) {
  const rewards=item.rewards.map(reward => `<div class="reward-preview">${rewardMarkup(reward)}</div>`).join('');
  const card=document.createElement('article');
  card.className='case-card';
  // В«Р‘Р°СЂРѕРЅВ» СѓРІРµР»РёС‡РµРЅ РЅР° 5%; РґР»СЏ В«РЈРґР°С‡РёВ» СЃРѕС…СЂР°РЅРµРЅР° РѕС‚РґРµР»СЊРЅР°СЏ РїРѕСЃР°РґРєР° РјРѕРґРµР»Рё.
  // РќРѕРІС‹Рµ РјРѕРґРµР»Рё (Р·РІРµР·РґР°/Р±РѕСЃСЃ/РјР°Р¶РѕСЂ) РїСЂРёС…РѕРґСЏС‚ СЃ РїСЂРѕР·СЂР°С‡РЅС‹РјРё РїРѕР»СЏРјРё Рё СЃР»РµРіРєР°
  // СѓРІРµР»РёС‡РёРІР°СЋС‚СЃСЏ, С‡С‚РѕР±С‹ РІРёР·СѓР°Р»СЊРЅРѕ СЃРѕРІРїР°РґР°С‚СЊ СЃ С…Р°Р»СЏРІРѕР№ Рё Р±Р°СЂРѕРЅРѕРј.
  const imageClass = item.id === 'lucky'
    ? ' case-art-image--lucky'
    : item.id === 'baron'
      ? ' case-art-image--baron'
      : ['star', 'boss', 'major'].includes(item.id)
        ? ` case-art-image--${item.id}`
        : '';
  const caseArt = item.image
    ? `<img class="case-art-image${imageClass}" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">`
    : 'рџЋЃ';
  card.innerHTML=`<div class="case-art">${caseArt}</div><h3>${escapeHtml(item.name)}</h3><div class="case-price">в­ђ ${item.price}</div><div class="reward-preview-list">${rewards}</div><button>РћС‚РєСЂС‹С‚СЊ РєРµР№СЃ</button>`;
  const button=card.querySelector('button');
  button.onclick=()=>openCase(item, button);
  $('cases').append(card);
}
async function openCase(item, button) {
  if (!profile || (profile.caseStars ?? profile.stars ?? 0) < item.price) return toast('РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ Р·РІС‘Р·Рґ РґР»СЏ РѕС‚РєСЂС‹С‚РёСЏ РєРµР№СЃР°');
  button.disabled=true;
  const modal=$('caseModal');
  const reel=$('reel');
  const icon=$('caseIcon');
  modal.classList.add('visible');
  stopMenuMusic();
  $('caseTitle').textContent=item.name;
  $('rewardText').textContent='РљРµР№СЃ РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ...';
  $('closeModal').disabled=true;
  reel.className='reel';
  reel.innerHTML=`<div class="reel-prize"><span>${escapeHtml(item.rewards[0]?.label || 'РџСЂРёР·')}</span></div>`;
  icon.classList.remove('case-opening');
  void icon.offsetWidth;
  icon.classList.add('case-opening');
  playCaseOpenSound();

  try {
    // РџРѕР»СѓС‡Р°РµРј СЂРµР°Р»СЊРЅС‹Р№ РїСЂРёР· РґРѕ РІРёР·СѓР°Р»СЊРЅРѕР№ С‡Р°СЃС‚Рё, РЅРѕ РїРѕРєР°Р·С‹РІР°РµРј РµРіРѕ С‚РѕР»СЊРєРѕ РІ С„РёРЅР°Р»Рµ.
    const data=await request(`/api/cases/${item.id}/open`,{method:'POST'});
    if (!data.reward || !data.profile) throw Error('РЎРµСЂРІРµСЂ РЅРµ РІРµСЂРЅСѓР» РїСЂРёР·');

    // РќР°РґС‘Р¶РЅР°СЏ Р°РЅРёРјР°С†РёСЏ Р±РµР· transform Рё Web Animations API: Р±С‹СЃС‚СЂРѕ РјРµРЅСЏРµРј РєР°СЂС‚РѕС‡РєРё.
    // РћРЅР° СЂР°Р±РѕС‚Р°РµС‚ РґР°Р¶Рµ РІ СЃС‚Р°СЂС‹С… Telegram WebView Рё РЅРµ Р·Р°РІРёСЃРёС‚ РѕС‚ СЂР°Р·РјРµСЂРѕРІ СЌРєСЂР°РЅР°.
    const prize=reel.querySelector('.reel-prize');
    let ticks=0;
    let timer;
    const showNextReward=()=>{
      const reward=item.rewards[ticks % item.rewards.length];
      prize.innerHTML=rewardMarkup(reward);
      prize.classList.remove('prize-tick');
      void prize.offsetWidth;
      prize.classList.add('prize-tick');
      playReelSound();
      ticks+=1;
    };
    showNextReward();
    timer=setInterval(showNextReward, 180);
    await new Promise(resolve=>setTimeout(resolve, 3000));
    clearInterval(timer);

    prize.innerHTML=rewardMarkup(data.reward);
    prize.classList.add('prize-final');
    reel.classList.add('win');
    playWinSound();
    $('rewardText').textContent=`Р’С‹ РїРѕР»СѓС‡РёР»Рё: ${data.reward.label}`;
    render({first_name:profile.name},data.profile);
  } catch(e) {
    $('rewardText').textContent=e.message;
  } finally {
    $('closeModal').disabled=false;
    button.disabled=false;
    if (!modal.classList.contains('visible')) startMenuMusic();
  }
}
$('closeModal').onclick=()=> { $('caseModal').classList.remove('visible'); startMenuMusic(); };
async function restoreRocketRound() {
  try {
    const status = await request('/api/rocket/status');
    if (status.crashed) return finishRocketCrash(`Р Р°РєРµС‚Р° РІР·РѕСЂРІР°Р»Р°СЃСЊ РЅР° ${status.multiplier.toFixed(2)}x`);
    rocketRunId += 1;
    rocketActive = true;
    syncRocketClock(status);
    $('rocketBet').value = status.bet;
    $('rocketBet').disabled = true;
    const star = $('rocketStar');
    star.style.removeProperty('--flight-delay');
    $('rocketSky').classList.remove('flying');
    void star.offsetWidth;
    // Р’РѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРЅС‹Р№ СЂР°СѓРЅРґ РїСЂРѕРґРѕР»Р¶Р°РµС‚СЃСЏ РІ СЃРѕРѕС‚РІРµС‚СЃС‚РІСѓСЋС‰РµР№ С‚РѕС‡РєРµ РґСѓРіРё.
    star.style.setProperty('--flight-delay', `-${Math.min(36000, Math.max(0, currentRocketServerTime() - rocketStartedAt))}ms`);
    $('rocketSky').classList.add('flying');
    $('rocketStatus').textContent = 'Р Р°СѓРЅРґ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅ. Р—Р°Р±РµСЂРёС‚Рµ РІС‹РёРіСЂС‹С€ РґРѕ РІР·СЂС‹РІР°.';
    updateRocketButton(); startRocketAnimation();
  } catch (error) {
    // В«РќРµС‚ Р°РєС‚РёРІРЅРѕР№ СЂР°РєРµС‚С‹В» вЂ” С€С‚Р°С‚РЅС‹Р№ РѕС‚РІРµС‚, Р° РЅРµ РїСЂРѕР±Р»РµРјР° Р·Р°РіСЂСѓР·РєРё.
    if (!String(error.message).includes('РќРµС‚ Р°РєС‚РёРІРЅРѕР№ СЂР°РєРµС‚С‹')) console.warn('РќРµ СѓРґР°Р»РѕСЃСЊ РІРѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ СЂР°РєРµС‚Сѓ:', error);
  }
}

// ============================ РџР›РРќРљРћ ============================
function initPlinko() {
  const canvas = $('plinkoCanvas');
  const ctx = canvas.getContext('2d');
  const betInput = $('plinkoBet');
  const dropButton = $('plinkoButton');
  const resultEl = $('plinkoResult');

  // ============================================================
  // РќРђРЎРўР РћР™РљР РџРћР›РЇ
  // ============================================================

  const ROWS = 8;
  const SLOT_COUNT = 11;
  const PADDING_X = 30;
  const TOP_Y = 22;
  const BOTTOM_MARGIN = 50;
  const BALL_RADIUS = 7;

  // РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё РїРѕРґ ~3.5 СЃРµРє РїСЂРё resize.
  let gravity = 72;

  // РЎС‚РѕР»РєРЅРѕРІРµРЅРёСЏ.
  const RESTITUTION = 0.04;       // РїРѕС‡С‚Рё РЅРѕР»СЊ: Р±РµР· РїСЂСѓР¶РёРЅС‹
  const TANGENT_KEEP = 0.88;      // СЃРѕС…СЂР°РЅСЏРµРј СЃРєРѕР»СЊР¶РµРЅРёРµ РІРґРѕР»СЊ РєРѕР»С‹С€РєР°
  const SUBSTEPS = 6;             // РїРѕРґС€Р°РіРѕРІ/РєР°РґСЂ

  // Р”РѕРІРѕРґ Рє С†РµР»РµРІРѕРјСѓ СЃР»РѕС‚Сѓ вЂ” РїРѕС‡С‚Рё РЅРµР·Р°РјРµС‚РµРЅ.
  const STEER = 0.38;
  const STEER_END = 0.65;

  const SPAWN_DELAY_JITTER = 0.10;

  let pegRadius = 3.5;
  let rowGap = 0;
  let colGap = 0;
  let boardWidth = 300;
  let boardHeight = 360;

  let currentBalls = 1;
  let dropping = false;
  let requestsDone = false;
  let balls = [];
  let animationId = null;
  let lastTime = 0;
  let pendingProfile = null;
  let pendingTotalPayout = 0;

  const PAYOUT_TENTHS = Object.freeze([2, 5, 10, 12, 15, 50, 15, 12, 10, 5, 2]);
  const PAYOUT_VALUES = PAYOUT_TENTHS.map(v => v / 10);
  const PAYOUT_LABELS = PAYOUT_VALUES.map(v => `${v}x`);
  const PAYOUT_COLORS_BY_VALUE = { '5': '#ff4d5e', '1.5': '#ff963d', '1.2': '#ffd84d', '1': '#49e878', '0.5': '#ffffff', '0.2': '#ffffff' };

  // ---- resize --------------------------------------------------------

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    boardWidth = Math.max(200, rect.width || 300);
    boardHeight = Math.max(280, rect.height || 360);
    canvas.width = boardWidth * dpr;
    canvas.height = boardHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rowGap = (boardHeight - TOP_Y - BOTTOM_MARGIN) / ROWS;
    colGap = (boardWidth - PADDING_X * 2) / (ROWS + 1);
    pegRadius = Math.max(2.5, Math.min(3.5, colGap * 0.095));
    const flightHeight = boardHeight - TOP_Y - BOTTOM_MARGIN;
    gravity = 2 * flightHeight / (3.5 * 3.5);
  }

  // ---- РіРµРѕРјРµС‚СЂРёСЏ ------------------------------------------------------

  function pegPositions() {
    const positions = [];
    for (let row = 0; row < ROWS; row += 1) {
      const count = row + 3;
      const width = (count - 1) * colGap;
      const startX = boardWidth / 2 - width / 2;
      for (let col = 0; col < count; col += 1) {
        positions.push({ x: startX + col * colGap, y: TOP_Y + row * rowGap });
      }
    }
    return positions;
  }

  // ---- РѕС‚СЂРёСЃРѕРІРєР° ------------------------------------------------------

  function drawBoard() {
    ctx.clearRect(0, 0, boardWidth, boardHeight);
    ctx.save();
    const sky = ctx.createLinearGradient(0, 0, 0, boardHeight);
    sky.addColorStop(0, 'rgba(10,14,32,0.98)');
    sky.addColorStop(0.55, 'rgba(16,22,46,0.96)');
    sky.addColorStop(1, 'rgba(22,30,58,0.97)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, boardWidth, boardHeight);

    ctx.strokeStyle = 'rgba(120,140,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = PADDING_X; x < boardWidth - PADDING_X; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, boardHeight); ctx.stroke(); }
    for (let y = 0; y < boardHeight; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(boardWidth, y); ctx.stroke(); }

    const slotWidth = boardWidth / SLOT_COUNT;
    const highlightBuckets = new Set(balls.filter(b => b.settled).map(b => b.bucket).filter(Number.isInteger));
    const colors = PAYOUT_VALUES.map(v => PAYOUT_COLORS_BY_VALUE[String(v)]);
    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const x = slotWidth * i;
      const y = boardHeight - BOTTOM_MARGIN + 4;
      ctx.fillStyle = 'rgba(5,9,22,0.92)';
      ctx.fillRect(x, y - 2, slotWidth, BOTTOM_MARGIN - 2);
      ctx.strokeStyle = 'rgba(150,170,255,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y - 2, slotWidth, BOTTOM_MARGIN - 2);
      if (highlightBuckets.has(i) && balls.some(b => b.settled && b.actualBucket === i && b.multiplier > 0)) {
        ctx.fillStyle = 'rgba(100,255,130,0.28)';
        ctx.fillRect(x, y - 2, slotWidth, BOTTOM_MARGIN - 2);
        ctx.fillStyle = 'rgba(100,255,130,0.7)';
        ctx.fillRect(x + 2, y - 2, slotWidth - 4, 3);
      }
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 2, y - 1);
      ctx.lineTo(x + slotWidth - 2, y - 1);
      ctx.stroke();
      ctx.fillStyle = colors[i];
      const fontSize = Math.max(10, Math.min(14, slotWidth * 0.40));
      ctx.font = `900 ${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2.5;
      const labelY = y + (BOTTOM_MARGIN - 2) / 2 + 1;
      ctx.strokeText(PAYOUT_LABELS[i], x + slotWidth / 2, labelY);
      ctx.shadowColor = colors[i];
      ctx.shadowBlur = 10;
      ctx.fillText(PAYOUT_LABELS[i], x + slotWidth / 2, labelY);
      ctx.shadowBlur = 0;
    }

    const pegs = pegPositions();
    ctx.save();
    ctx.fillStyle = 'rgba(140,170,255,0.75)';
    ctx.shadowColor = 'rgba(130,170,255,0.9)';
    ctx.shadowBlur = 6;
    for (const peg of pegs) { ctx.beginPath(); ctx.arc(peg.x, peg.y, pegRadius, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    ctx.restore();
  }

  function renderFrame() {
    drawBoard();
    for (const ball of balls) {
      ctx.save();
      const grad = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, BALL_RADIUS + 1);
      grad.addColorStop(0, '#fff6c8');
      grad.addColorStop(0.45, '#ffd04a');
      grad.addColorStop(1, '#ff9d1f');
      ctx.fillStyle = grad;
      if (!ball.settled) { ctx.shadowColor = 'rgba(255,180,60,0.9)'; ctx.shadowBlur = 12; }
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // =================================================================
  // РЇР”Р Рћ Р¤РР—РРљР
  // =================================================================

  // РЎС‚РѕР»РєРЅРѕРІРµРЅРёРµ СЃ РѕРґРЅРёРј РєРѕР»С‹С€РєРѕРј.
  // РЁР°СЂРёРє РЅРµ РѕС‚СЃРєР°РєРёРІР°РµС‚ вЂ” РѕРЅ СЃРєРѕР»СЊР·РёС‚ РїРѕ РєР°СЃР°С‚РµР»СЊРЅРѕР№, РјРµРЅСЏСЏ РЅР°РїСЂР°РІР»РµРЅРёРµ.
  function resolvePeg(ball, peg, contactR) {
    const dx = ball.x - peg.x;
    const dy = ball.y - peg.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= contactR || dist < 1e-6) return false;

    const nx = dx / dist;
    const ny = dy / dist;
    // Р’С‹С‚Р°Р»РєРёРІР°РЅРёРµ РёР· РєРѕР»С‹С€РєР°.
    ball.x = peg.x + nx * contactR;
    ball.y = peg.y + ny * contactR;

    const vn = ball.vx * nx + ball.vy * ny;
    if (vn >= 0) return true; // СѓР¶Рµ СѓРґР°Р»СЏРµС‚СЃСЏ

    // РўР°РЅРіРµРЅС†РёР°Р»СЊРЅР°СЏ СЃРєРѕСЂРѕСЃС‚СЊ вЂ” СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ РїРѕС‡С‚Рё С†РµР»РёРєРѕРј.
    const tx = -ny, ty = nx;
    const vt = ball.vx * tx + ball.vy * ty;

    // РќРѕСЂРјР°Р»СЊРЅР°СЏ вЂ” РїРѕС‡С‚Рё РїРѕР»РЅРѕСЃС‚СЊСЋ РіР°СЃРёС‚СЃСЏ.
    ball.vx = tx * vt * TANGENT_KEEP - nx * Math.abs(vn) * RESTITUTION;
    ball.vy = ty * vt * TANGENT_KEEP - ny * Math.abs(vn) * RESTITUTION;

    // РЁР°СЂРёРє РІСЃРµРіРґР° РїСЂРѕРґРѕР»Р¶Р°РµС‚ РїР°РґР°С‚СЊ РІРЅРёР·.
    if (ball.vy < 6) ball.vy = 6;
    return true;
  }

  function settleBall(ball) {
    const slotWidth = boardWidth / SLOT_COUNT;
    const bottomY = boardHeight - BOTTOM_MARGIN + 6;
    ball.actualBucket = ball.bucket;
    ball.x = slotWidth * (ball.bucket + 0.5);
    ball.y = bottomY;
    ball.multiplier = Number(ball.multiplier);
    ball.payout = Number(ball.payout);
    ball.vx = 0;
    ball.vy = 0;
    ball.settled = true;
  }

  function updateBall(ball, dt) {
    if (ball.settled) return;
    if (ball.spawnDelay > 0) { ball.spawnDelay -= dt; return; }

    ball.elapsed += dt;
    const targetX = (boardWidth / SLOT_COUNT) * (ball.bucket + 0.5);
    const bottomY = boardHeight - BOTTOM_MARGIN + 6;
    const pegs = pegPositions();
    const contactR = pegRadius + BALL_RADIUS;
    const h = dt / SUBSTEPS;

    for (let s = 0; s < SUBSTEPS; s += 1) {
      ball.vy += gravity * h;

      // РњСЏРіРєРёР№ РґРѕР»РіРѕСЃСЂРѕС‡РЅС‹Р№ РґРѕРІРѕРґ Рє С†РµР»РµРІРѕРјСѓ СЃР»РѕС‚Сѓ.
      const progress = Math.min(1, ball.elapsed / 3.5);
      const steer = STEER + (STEER_END - STEER) * progress;
      ball.vx += (targetX - ball.x) * steer * h;

      // РЎРѕРїСЂРѕС‚РёРІР»РµРЅРёРµ РІРѕР·РґСѓС…Р°.
      ball.vx *= (1 - 0.3 * h);

      // РџРµСЂРµРјРµС‰РµРЅРёРµ.
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;

      // РЎС‚РµРЅС‹.
      if (ball.x < BALL_RADIUS) { ball.x = BALL_RADIUS; ball.vx = Math.abs(ball.vx) * 0.25; }
      if (ball.x > boardWidth - BALL_RADIUS) { ball.x = boardWidth - BALL_RADIUS; ball.vx = -Math.abs(ball.vx) * 0.25; }

      // РЎС‚РѕР»РєРЅРѕРІРµРЅРёСЏ СЃ РєРѕР»С‹С€РєР°РјРё.
      for (const peg of pegs) resolvePeg(ball, peg, contactR);
    }

    if (ball.y >= bottomY) { ball.y = bottomY; settleBall(ball); }
  }

  function dropBall(bucket, multiplier, payout) {
    const bucketIndex = Math.max(0, Math.min(SLOT_COUNT - 1, Math.floor(Number(bucket))));
    const targetX = (boardWidth / SLOT_COUNT) * (bucketIndex + 0.5);

    // РЎРїР°РІРЅ: СЃР»СѓС‡Р°Р№РЅР°СЏ РїРѕР·РёС†РёСЏ СЃ Р»С‘РіРєРёРј СЃРјРµС‰РµРЅРёРµРј Рє С†РµР»Рё.
    const firstRowW = colGap * 2;
    const startX = boardWidth / 2 - firstRowW / 2;
    const norm = bucketIndex / (SLOT_COUNT - 1);
    const randX = startX + Math.random() * firstRowW;
    const biasX = startX + norm * firstRowW;
    const spawnX = randX * 0.45 + biasX * 0.55;

    const startVx = (targetX - spawnX) * 0.22 + (Math.random() - 0.5) * 6;

    const ball = {
      x: spawnX, y: TOP_Y - 16,
      vx: startVx, vy: 0,
      elapsed: 0,
      spawnDelay: Math.random() * SPAWN_DELAY_JITTER,
      settled: false,
      bucket: bucketIndex,
      multiplier,
      payout: Number(payout)
    };
    balls.push(ball);
    return ball;
  }

  // ============================================================
  // ANIMATION LOOP
  // ============================================================

  function animate(time) {
    const dt = Math.min(0.033, (time - lastTime) / 1000 || 0.016);
    lastTime = time;
    for (const ball of balls) { if (!ball.settled) updateBall(ball, dt); }
    renderFrame();
    const moving = balls.filter(b => !b.settled);
    if (moving.length || !requestsDone) {
      animationId = requestAnimationFrame(animate);
      return;
    }
    animationId = null;
    drawBoard();
    const balance = pendingTotalPayout;
    resultEl.textContent = `Р’С‹РёРіСЂС‹С€: +${balance} в­ђ`;
    resultEl.classList.add('show', 'win');
    resultEl.classList.remove('lose');
    setTimeout(() => resultEl.classList.remove('show'), 2600);
    playWinSound();
    if (pendingProfile) {
      render({ first_name: profile.name }, pendingProfile);
      pendingProfile = null;
    }
    dropping = false;
    balls.length = 0;
    renderFrame();
    dropButton.disabled = false;
    updateDropButton();
  }

  function updateDropButton() {
    const bet = Math.max(10, Number(betInput.value) || 10);
    const ballsLabel = currentBalls === 1 ? 'С€Р°СЂРёРє' : 'С€Р°СЂРёРєРѕРІ';
    dropButton.textContent = `рџЋЇ Р‘СЂРѕСЃРёС‚СЊ ${currentBalls} ${ballsLabel} Р·Р° ${bet * currentBalls} в­ђ`;
  }

  const ballsButtons = [...document.querySelectorAll('.plinko-balls-btn')];
  function setBallsCount(count) {
    currentBalls = Math.max(1, Math.min(10, Number(count) || 1));
    ballsButtons.forEach(btn => btn.classList.toggle('active', Number(btn.dataset.balls) === currentBalls));
    updateDropButton();
  }

  dropButton.onclick = async () => {
    if (!profile) return toast('РџРѕРґРѕР¶РґРёС‚Рµ, РїСЂРѕС„РёР»СЊ РµС‰С‘ Р·Р°РіСЂСѓР¶Р°РµС‚СЃСЏ');
    if (dropping) return;
    const bet = Math.max(10, Math.floor(Number(betInput.value) || 10));
    betInput.value = bet;
    dropping = true;
    requestsDone = false;
    dropButton.disabled = true;
    resultEl.classList.remove('show');
    pendingTotalPayout = 0;
    balls = [];
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    renderFrame();
    const ballsToDrop = currentBalls;
    try {
      const data = await request('/api/plinko/drop', {
        method: 'POST',
        body: JSON.stringify({ bet, count: ballsToDrop })
      });
      if (!Array.isArray(data.results) || data.results.length !== ballsToDrop
        || !Number.isFinite(Number(data.totalPayout))) {
        throw Error('РЎРµСЂРІРµСЂ РІРµСЂРЅСѓР» РЅРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ СЂРµР·СѓР»СЊС‚Р°С‚ РџР»РёРЅРєРѕ');
      }
      const expectedPayout = result => {
        const tenths = PAYOUT_TENTHS[Number(result.bucket)];
        const multiplier = Number(result.multiplier);
        const coefficientTenths = Number(result.coefficientTenths);
        const payout = Number(result.payout);
        if (!Number.isInteger(tenths) || coefficientTenths !== tenths
          || multiplier !== tenths / 10
          || payout !== Math.floor(bet * coefficientTenths / 10)) {
          throw Error('РЎРµСЂРІРµСЂ РІРµСЂРЅСѓР» РЅРµСЃРѕРѕС‚РІРµС‚СЃС‚РІСѓСЋС‰РёР№ РєРѕСЌС„С„РёС†РёРµРЅС‚ РџР»РёРЅРєРѕ');
        }
        return payout;
      };
      const checkedTotalPayout = data.results.reduce((sum, r) => sum + expectedPayout(r), 0);
      if (Number(data.totalPayout) !== checkedTotalPayout) {
        throw Error('РЎРµСЂРІРµСЂ РІРµСЂРЅСѓР» РЅРµСЃРѕРѕС‚РІРµС‚СЃС‚РІСѓСЋС‰СѓСЋ РѕР±С‰СѓСЋ РІС‹РїР»Р°С‚Сѓ РџР»РёРЅРєРѕ');
      }
      pendingTotalPayout = checkedTotalPayout;
      pendingProfile = data.profile;
      lastTime = performance.now();
      animationId = requestAnimationFrame(animate);
      for (const [index, result] of data.results.entries()) {
        if (index > 0) await new Promise(resolve => setTimeout(resolve, 450));
        dropBall(result.bucket, result.multiplier, result.payout);
      }
      requestsDone = true;
    } catch (error) {
      requestsDone = true;
      dropping = false;
      pendingProfile = null;
      pendingTotalPayout = 0;
      if (animationId) cancelAnimationFrame(animationId);
      animationId = null;
      balls = [];
      renderFrame();
      toast(error.message);
      dropButton.disabled = false;
      updateDropButton();
    }
  };

  betInput.addEventListener('input', updateDropButton);
  ballsButtons.forEach(btn => btn.addEventListener('click', () => {
    if (!dropping) setBallsCount(btn.dataset.balls);
  }));
  window.addEventListener('resize', () => { resizeCanvas(); drawBoard(); });
  resizeCanvas();
  drawBoard();
  updateDropButton();

}

request('/api/me').then(x=>{ render(x.user,x.profile); return restoreRocketRound(); }).then(()=>initPlinko()).catch(e=>toast(e.message));
request('/api/cases').then(cases=>cases.forEach(showCase)).catch(e=>toast(e.message));
