import { createPlinkoBall, plinkoPegs, stepPlinkoBall } from './plinko-physics.js?v=physics-v10-20260812';

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
    return `<article class="gift-card"><span class="gift-icon">${rewardEmoji(gift)}</span><div><b>${escapeHtml(name)}</b><small>Выбито из кейса</small></div><a class="withdraw-button" href="https://t.me/murarru" target="_blank" rel="noopener">Вывести</a></article>`;
  }).join('') : '<p class="empty-gifts">Пока нет подарков. Откройте кейс — и они появятся здесь.</p>';
}
$('giftsButton').onclick=()=>{ renderGifts(); $('giftsModal').classList.add('visible'); };
$('withdrawStarsButton').onclick=()=>{
  if ((profile?.prizeStars ?? 0) < 50) return toast('Вывод звёзд доступен при балансе от 50 звёзд');
  window.open('https://t.me/murarru', '_blank', 'noopener');
};
$('promoButton').onclick=async()=>{ try { const data=await request('/api/profile/promo',{method:'POST',body:JSON.stringify({code:$('promoCode').value})}); render({first_name:profile.name},data.profile); toast(data.message); } catch(e){toast(e.message)} };
// Ссылка фиксированная и открывается напрямую; кнопки сохранения нет.
$('topupLink').onclick=()=>$('topupLink').select();
// Переключение вкладок Мини-игр: активная панель соответствует выбранной игре.
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
// Номер локального раунда отсекает запоздалые ответы status/start от уже
// завершённой игры: они не смогут вернуть анимацию после взрыва.
let rocketRunId = 0;

function readServerTime(value) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}
function rocketMultiplierForElapsed(seconds) {
  // Та же формула, что и на сервере: клиент показывает только анимацию,
  // окончательный результат всё равно проверяет API.
  return Math.min(20, 1 + .18 * seconds + .04 * seconds ** 2);
}
function syncRocketClock(round) {
  // Точка отсчёта переносится на monotonic performance.now(), который не
  // меняется при ручной смене часов на телефоне. Серверное `now` остаётся
  // источником истины для расчёта следующего кадра.
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
  $('rocketButton').textContent = rocketActive ? 'Забрать выигрыш' : `Запустить за ${bet} ⭐`;
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
  // Инвалидируем все незавершённые сетевые ответы и полностью очищаем полёт.
  rocketRunId += 1;
  rocketActive = false;
  rocketStatusPending = false;
  stopRocketAnimation();
  $('rocketBet').disabled = false;
  $('rocketSky').classList.remove('flying');
  $('rocketStar').style.removeProperty('--flight-delay');
  $('rocketSky').classList.add('crashed');
  $('rocketStatus').textContent = message;
  $('rocketMultiplier').textContent = '💥';
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
    // Импульс запускается только при смене сотой, не на каждом кадре.
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
    if (status.crashed) return finishRocketCrash(`Ракета взорвалась на ${Number(status.multiplier).toFixed(2)}x`);
    // Сервер — источник истины, а requestAnimationFrame отрисовывает все
    // промежуточные сотые между синхронизациями без рывков.
    syncRocketClock(status);
  } catch (error) {
    // После взрыва сервер удаляет раунд. Если ответ о взрыве не дошёл,
    // «Нет активной ракеты» означает завершённый раунд, а не повод лететь дальше.
    if (rocketActive && runId === rocketRunId && String(error.message).includes('Нет активной ракеты')) {
      finishRocketCrash('Ракета взорвалась. Ставка сгорела.');
    }
    // При кратковременном сбое сети не останавливаем уже запущенный раунд.
  } finally {
    if (runId === rocketRunId) rocketStatusPending = false;
  }
}
function startRocketAnimation() {
  stopRocketAnimation();
  rocketLastMultiplierText = '';
  renderRocketFrame(); // плавное обновление на каждом кадре, без дрожания таймеров
  checkRocketStatus();
  // Сервер остаётся источником истины: клиент лишь рисует текущий коэффициент.
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
      // Раунд становится активным только после подтверждения сервера. Так
      // двойной тап или медленная сеть не создают «локальную» бесконечную ракету.
      $('rocketStatus').textContent = 'Подготавливаем новый независимый раунд…';
      const data = await request('/api/rocket/start', { method: 'POST', body: JSON.stringify({ bet }) });
      rocketRunId += 1;
      rocketActive = true;
      rocketStatusPending = false;
      rocketLastMultiplierText = '';
      render({ first_name: profile.name }, data.profile);
      syncRocketClock(data);
      $('rocketBet').disabled = true;
      playRocketLaunchSound();
      // Перезапускаем CSS-полёт после получения ставки. Отрицательная задержка
      // сохраняет верную позицию, если ответ сервера пришёл не мгновенно.
      const star = $('rocketStar');
      star.style.removeProperty('--flight-delay');
      $('rocketSky').classList.remove('flying');
      void star.offsetWidth;
      // Длинная траектория движется непрерывно и не возвращает звезду резко в начало.
      // Полёт однократный: после конца траектории звезда остаётся в верхней точке.
      star.style.setProperty('--flight-delay', `-${Math.min(36000, Math.max(0, currentRocketServerTime() - rocketStartedAt))}ms`);
      $('rocketSky').classList.add('flying');
      $('rocketStatus').textContent = 'Ракета набирает высоту. Заберите выигрыш до взрыва.';
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
      $('rocketStatus').textContent = `Вы забрали ${data.payout} ⭐ на ${data.multiplier.toFixed(2)}x!`;
      render({ first_name: profile.name }, data.profile);
      playWinSound();
    }
  } catch (e) {
    // Ошибка сети не означает взрыв: раунд остаётся на сервере, и игрок может
    // повторить вывод после восстановления соединения.
    if (cashingOut) {
      if (String(e.message).includes('Нет активной ракеты') || String(e.message).includes('Ракета взорвалась')) {
        finishRocketCrash('Ракета взорвалась. Ставка сгорела.');
      } else {
        toast(e.message);
        if (rocketActive) { button.disabled = false; updateRocketButton(); }
      }
    } else {
      // Локальный отсчёт уже был показан, поэтому при отказе сервера безусловно
      // сбрасываем все таймеры и классы. Это исключает «вечный» полёт после ошибки.
      rocketRunId += 1;
      rocketActive = false;
      rocketStatusPending = false;
      stopRocketAnimation();
      $('rocketSky').classList.remove('flying');
      $('rocketSky').classList.remove('crashed');
      $('rocketStar').style.removeProperty('--flight-delay');
      $('rocketMultiplier').textContent = '1.00x';
      $('rocketStatus').textContent = 'Сделай ставку и забери выигрыш до взрыва.';
      // Конфликт означает, что серверный раунд уже существует (например,
      // ответ прошлого запроса пришёл с задержкой). Восстанавливаем именно его.
      if (String(e.message).includes('Ракета уже запущена')) {
        await restoreRocketRound();
        toast('Восстановлен уже начатый раунд');
      } else {
        toast(e.message);
      }
    }
  } finally {
    // После мгновенного взрыва finishRocketCrash уже восстановил состояние UI.
    button.disabled = false;
    updateRocketButton();
  }
};
updateRocketButton();
function rewardEmoji(reward) {
  if (reward?.type === 'bear') return '🧸';
  if (reward?.type === 'heart') return '💝';
  if (reward?.type === 'rose') return '🌹';
  if (reward?.type === 'cake') return '🎂';
  if (reward?.type === 'bouquet') return '💐';
  if (reward?.type === 'rocket') return '🚀';
  if (reward?.type === 'ring') return '💍';
  if (reward?.type === 'cup') return '🏆';
  if (reward?.type === 'diamond') return '💎';
  if (reward?.type === 'nft-icecream') return '🍦';
  if (reward?.type === 'nft-snake') return '🐍';
  if (reward?.type === 'nft-doshirak') return '🍜';
  if (reward?.type === 'nft-lollipop') return '🍭';
  return '⭐';
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[character]));
}
function rewardName(reward) {
  // В названиях призов уже есть emoji. Убираем его, чтобы не показывать дважды.
  return String(reward?.label || 'Приз').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim();
}

// Короткие синтезированные звуки не требуют сторонних файлов и работают
// в Telegram WebView после пользовательского нажатия на кнопку кейса.
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
  } catch (_) { /* Звук необязателен: приложение работает и без Web Audio. */ }
}
// Громкость эффектов и фоновой мелодии увеличена примерно на 30%.
function playCaseOpenSound() { playTone(240, .16, .111); playTone(380, .18, .098, .13); }
function playReelSound() { playTone(720, .055, .052); }
function playWinSound() { playTone(520, .14, .117); playTone(660, .16, .117, .12); playTone(880, .25, .13, .25); }
function playRocketLaunchSound() {
  // Короткий стартовый импульс и нарастающий свист двигателя.
  playTone(110, .16, .09);
  playTone(175, .24, .075, .07);
  playTone(310, .18, .055, .19);
}
function playRocketFlightSound() {
  // Ненавязчивый сигнал высоты: проигрывается редко, а не в каждом кадре.
  playTone(420, .09, .026);
  playTone(630, .11, .022, .08);
}

// Ненавязчивая фоновая мелодия: создаётся браузером, без загрузки аудиофайлов.
let menuMusicTimer;
let menuMusicStep = 0;
function playMenuMusicNote() {
  if (document.hidden || $('caseModal').classList.contains('visible')) return;
  const notes = [262, 330, 392, 330, 294, 349, 440, 349];
  // Фоновая мелодия заметнее, но всё ещё тише игровых эффектов.
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
// Автовоспроизведение блокируется WebView, поэтому запускаем музыку после первого тапа.
document.addEventListener('pointerdown', startMenuMusic, { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopMenuMusic(); });
function rewardMarkup(reward) {
  const label=escapeHtml(rewardName(reward));
  // Один значок и название отображаются в общей ровной сетке.
  return `<span class="reel-placeholder" aria-hidden="true">${rewardEmoji(reward)}</span><span class="reward-name">${label}</span>`;
}
function showCase(item) {
  const rewards=item.rewards.map(reward => `<div class="reward-preview">${rewardMarkup(reward)}</div>`).join('');
  const card=document.createElement('article');
  card.className='case-card';
  // «Барон» увеличен на 5%; для «Удачи» сохранена отдельная посадка модели.
  // Новые модели (звезда/босс/мажор) приходят с прозрачными полями и слегка
  // увеличиваются, чтобы визуально совпадать с халявой и бароном.
  const imageClass = item.id === 'lucky'
    ? ' case-art-image--lucky'
    : item.id === 'baron'
      ? ' case-art-image--baron'
      : ['star', 'boss', 'major'].includes(item.id)
        ? ` case-art-image--${item.id}`
        : '';
  const caseArt = item.image
    ? `<img class="case-art-image${imageClass}" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">`
    : '🎁';
  card.innerHTML=`<div class="case-art">${caseArt}</div><h3>${escapeHtml(item.name)}</h3><div class="case-price">⭐ ${item.price}</div><div class="reward-preview-list">${rewards}</div><button>Открыть кейс</button>`;
  const button=card.querySelector('button');
  button.onclick=()=>openCase(item, button);
  $('cases').append(card);
}
async function openCase(item, button) {
  if (!profile || (profile.caseStars ?? profile.stars ?? 0) < item.price) return toast('Недостаточно звёзд для открытия кейса');
  button.disabled=true;
  const modal=$('caseModal');
  const reel=$('reel');
  const icon=$('caseIcon');
  modal.classList.add('visible');
  stopMenuMusic();
  $('caseTitle').textContent=item.name;
  $('rewardText').textContent='Кейс открывается...';
  $('closeModal').disabled=true;
  reel.className='reel';
  reel.innerHTML=`<div class="reel-prize"><span>${escapeHtml(item.rewards[0]?.label || 'Приз')}</span></div>`;
  icon.classList.remove('case-opening');
  void icon.offsetWidth;
  icon.classList.add('case-opening');
  playCaseOpenSound();

  try {
    // Получаем реальный приз до визуальной части, но показываем его только в финале.
    const data=await request(`/api/cases/${item.id}/open`,{method:'POST'});
    if (!data.reward || !data.profile) throw Error('Сервер не вернул приз');

    // Надёжная анимация без transform и Web Animations API: быстро меняем карточки.
    // Она работает даже в старых Telegram WebView и не зависит от размеров экрана.
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
    $('rewardText').textContent=`Вы получили: ${data.reward.label}`;
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
    if (status.crashed) return finishRocketCrash(`Ракета взорвалась на ${status.multiplier.toFixed(2)}x`);
    rocketRunId += 1;
    rocketActive = true;
    syncRocketClock(status);
    $('rocketBet').value = status.bet;
    $('rocketBet').disabled = true;
    const star = $('rocketStar');
    star.style.removeProperty('--flight-delay');
    $('rocketSky').classList.remove('flying');
    void star.offsetWidth;
    // Восстановленный раунд продолжается в соответствующей точке дуги.
    star.style.setProperty('--flight-delay', `-${Math.min(36000, Math.max(0, currentRocketServerTime() - rocketStartedAt))}ms`);
    $('rocketSky').classList.add('flying');
    $('rocketStatus').textContent = 'Раунд восстановлен. Заберите выигрыш до взрыва.';
    updateRocketButton(); startRocketAnimation();
  } catch (error) {
    // «Нет активной ракеты» — штатный ответ, а не проблема загрузки.
    if (!String(error.message).includes('Нет активной ракеты')) console.warn('Не удалось восстановить ракету:', error);
  }
}

// ============================ ПЛИНКО ============================
function initPlinko() {
  const canvas = $('plinkoCanvas');
  const ctx = canvas.getContext('2d');
  const betInput = $('plinkoBet');
  const dropButton = $('plinkoButton');
  const resultEl = $('plinkoResult');

  // ============================================================
  // НАСТРОЙКИ ПОЛЯ
  // ============================================================

  const ROWS = 8;
  const SLOT_COUNT = 11;
  const PADDING_X = 30;
  const TOP_Y = 22;
  const BOTTOM_MARGIN = 50;
  const BALL_RADIUS = 7;

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
  let physicsAccumulator = 0;
  let pendingProfile = null;
  let pendingTotalPayout = 0;
  const PHYSICS_STEP = 1 / 120;

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
  }

  // ---- геометрия ------------------------------------------------------

  function pegPositions() {
    return plinkoPegs(boardWidth, boardHeight);
  }

  // ---- отрисовка ------------------------------------------------------

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
    const renderBall = ball => {
      ctx.save();
      const radius = ball.radius || BALL_RADIUS;
      const impact = ball.impact || 0;
      ctx.translate(ball.x, ball.y);
      ctx.scale(1 + impact * 0.14, 1 - impact * 0.10);
      ctx.translate(-ball.x, -ball.y);
      const grad = ctx.createRadialGradient(ball.x - radius * 0.28, ball.y - radius * 0.28, 1, ball.x, ball.y, radius + 1);
      grad.addColorStop(0, '#fff6c8');
      grad.addColorStop(0.45, '#ffd04a');
      grad.addColorStop(1, '#ff9d1f');
      ctx.fillStyle = grad;
      if (!ball.settled) { ctx.shadowColor = 'rgba(255,180,60,0.9)'; ctx.shadowBlur = 12; }
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    for (const ball of balls) renderBall(ball);
  }

  // =================================================================
  // ЯДРО ФИЗИКИ
  // Физика выполняется в общем модуле с сервером. Клиент не знает
  // целевой слот заранее и не может искусственно направить шарик к коэффициенту.
  function physicsUpdateBall(ball, dt) {
    if (ball.spawnDelay > 0) {
      ball.spawnDelay -= dt;
      return;
    }
    stepPlinkoBall(ball, ball.physicsWidth || boardWidth, ball.physicsHeight || boardHeight, dt);
    if (ball.settled) {
      ball.bucket = ball.actualBucket;
      ball.multiplier = PAYOUT_VALUES[ball.bucket];
    }
  }

  function physicsDropBall(result, physicsWidth, physicsHeight) {
    const ball = createPlinkoBall(physicsWidth, physicsHeight, result.physicsSeed);
    ball.physicsWidth = physicsWidth;
    ball.physicsHeight = physicsHeight;
    ball.spawnDelay = Math.random() * SPAWN_DELAY_JITTER;
    ball.multiplier = Number(result.multiplier);
    ball.payout = Number(result.payout);
    balls.push(ball);
    return ball;
  }
  // ============================================================
  // ANIMATION LOOP
  // ============================================================

  function animate(time) {
    const dt = Math.min(0.05, (time - lastTime) / 1000 || 0.016);
    lastTime = time;
    physicsAccumulator = Math.min(physicsAccumulator + dt, 0.12);
    while (physicsAccumulator >= PHYSICS_STEP) {
      for (const ball of balls) { if (!ball.settled) physicsUpdateBall(ball, PHYSICS_STEP); }
      physicsAccumulator -= PHYSICS_STEP;
    }
    renderFrame();
    const moving = balls.filter(b => !b.settled);
    if (moving.length || !requestsDone) {
      animationId = requestAnimationFrame(animate);
      return;
    }
    animationId = null;
    drawBoard();
    const balance = pendingTotalPayout;
    resultEl.textContent = `Выигрыш: +${balance} ⭐`;
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
    const ballsLabel = currentBalls === 1 ? 'шарик' : 'шариков';
    dropButton.textContent = `🎯 Бросить ${currentBalls} ${ballsLabel} за ${bet} ⭐`;
  }

  const ballsButtons = [...document.querySelectorAll('.plinko-balls-btn')];
  function setBallsCount(count) {
    currentBalls = Math.max(1, Math.min(10, Number(count) || 1));
    ballsButtons.forEach(btn => btn.classList.toggle('active', Number(btn.dataset.balls) === currentBalls));
    updateDropButton();
  }

  dropButton.onclick = async () => {
    if (!profile) return toast('Подождите, профиль ещё загружается');
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
    physicsAccumulator = 0;
    renderFrame();
    const ballsToDrop = currentBalls;
    try {
      const physicsWidth = boardWidth;
      const physicsHeight = boardHeight;
      const data = await request('/api/plinko/drop', {
        method: 'POST',
        body: JSON.stringify({ bet, count: ballsToDrop, boardWidth: physicsWidth, boardHeight: physicsHeight })
      });
      if (!Array.isArray(data.results) || data.results.length !== ballsToDrop
        || !Number.isFinite(Number(data.totalPayout))) {
        throw Error('Сервер вернул некорректный результат Плинко');
      }
      const expectedPayout = result => {
        const tenths = PAYOUT_TENTHS[Number(result.bucket)];
        const multiplier = Number(result.multiplier);
        const coefficientTenths = Number(result.coefficientTenths);
        const payout = Number(result.payout);
        const physicsSeed = Number(result.physicsSeed);
        if (!Number.isInteger(tenths) || !Number.isInteger(physicsSeed) || physicsSeed < 0
          || coefficientTenths !== tenths
          || multiplier !== tenths / 10
          || payout !== Math.floor(bet * coefficientTenths / (10 * ballsToDrop))) {
          throw Error('Сервер вернул несоответствующий коэффициент Плинко');
        }
        return payout;
      };
      const checkedTotalPayout = data.results.reduce((sum, r) => sum + expectedPayout(r), 0);
      if (Number(data.totalPayout) !== checkedTotalPayout) {
        throw Error('Сервер вернул несоответствующую общую выплату Плинко');
      }
      pendingTotalPayout = checkedTotalPayout;
      pendingProfile = data.profile;
      for (const [index, result] of data.results.entries()) {
        if (index > 0) await new Promise(resolve => setTimeout(resolve, 450));
        physicsDropBall(result, physicsWidth, physicsHeight);
        if (!animationId) {
          lastTime = performance.now();
          animationId = requestAnimationFrame(animate);
        }
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
  window.addEventListener('resize', () => {
    // Во время броска размеры поля являются частью общего физического
    // сценария сервера и клиента. Не меняем их посреди симуляции.
    if (!dropping) { resizeCanvas(); renderFrame(); }
  });
  resizeCanvas();
  renderFrame();
  updateDropButton();

}

request('/api/me').then(x=>{ render(x.user,x.profile); return restoreRocketRound(); }).then(()=>initPlinko()).catch(e=>toast(e.message));
request('/api/cases').then(cases=>cases.forEach(showCase)).catch(e=>toast(e.message));
