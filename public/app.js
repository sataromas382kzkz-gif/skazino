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
  if ($('profilePrizeStars')) $('profilePrizeStars').textContent=rocketStars;
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
  if ((profile?.caseStars ?? profile?.stars ?? 0) < 50) return toast('Вывод звёзд доступен при балансе от 50 звёзд');
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

  // Пирамида начинается с 3 точек и заканчивается 10 точками.
  // Восемь рядов делают поле компактным и ускоряют игровой процесс.
  const ROWS = 8;
  const SLOT_COUNT = 11;
  const PADDING_X = 30;
  const TOP_Y = 22;
  // Компактная зона слотов: 50 px высота, слоты заполняют всю ширину без зазоров.
  const BOTTOM_MARGIN = 50;
  const BALL_RADIUS = 7;
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

  // Коэффициент и цвет определяются одним и тем же индексом слота.
  const PAYOUT_VALUES = [0.2, 0.5, 1.0, 1.2, 1.5, 5.0, 1.5, 1.2, 1.0, 0.5, 0.2];
  const PAYOUT_LABELS = PAYOUT_VALUES.map(value => `${value}x`);
  const PAYOUT_COLORS_BY_VALUE = {
    '5': '#ff4d5e',
    '1.5': '#ff963d',
    '1.2': '#ffd84d',
    '1': '#49e878',
    '0.5': '#ffffff',
    '0.2': '#ffffff'
  };

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    boardWidth = Math.max(200, rect.width || 300);
    boardHeight = Math.max(280, rect.height || 360);
    canvas.width = boardWidth * dpr;
    canvas.height = boardHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rowGap = (boardHeight - TOP_Y - BOTTOM_MARGIN) / ROWS;
    // В нижнем ряду 10 точек образуют 11 широких слотов. Точки занимают
    // всю ширину игрового поля с девятью равными промежутками.
    colGap = (boardWidth - PADDING_X * 2) / (ROWS + 1);
    pegRadius = Math.max(2.5, Math.min(3.5, colGap * 0.095));
  }

  function pegPositions() {
    const positions = [];
    // Каждый следующий ряд шире на одну точку: 3, 4, 5 ... 10.
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
    for (let x = PADDING_X; x < boardWidth - PADDING_X; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, boardHeight); ctx.stroke();
    }
    for (let y = 0; y < boardHeight; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(boardWidth, y); ctx.stroke();
    }

    // PAYOUT_LABELS — плоский массив строк. Индексация [0] оставляла
    // только строку «0.2x», поэтому canvas показывал отдельные символы
    // вместо коэффициентов в слотах.
    const labels = PAYOUT_LABELS;
    const colors = PAYOUT_VALUES.map(value => PAYOUT_COLORS_BY_VALUE[String(value)]);
    const slotCount = SLOT_COUNT;
    // Слоты заполняют всю ширину канваса без полей и зазоров.
    const slotWidth = boardWidth / slotCount;
    // Серверный bucket — единственный источник результата. Не вычисляем
    // подсветку повторно по x: физическая анимация может попасть на границу
    // соседней визуальной зоны и показать неверный множитель.
    // Не показываем серверный bucket заранее: это раскрывает результат ещё
    // до падения шарика. Подсветка появляется только после приземления.
    const highlightBuckets = new Set(
      balls.filter(ball => ball.settled).map(ball => ball.bucket).filter(Number.isInteger)
    );
    for (let i = 0; i < slotCount; i += 1) {
      const x = slotWidth * i;
      const y = boardHeight - BOTTOM_MARGIN + 4;
      if (highlightBuckets.has(i) && balls.some(ball => ball.settled && ball.actualBucket === i && ball.multiplier > 0)) {
        ctx.fillStyle = 'rgba(100,255,130,0.28)';
        ctx.fillRect(x, y - 2, slotWidth, BOTTOM_MARGIN - 2);
        ctx.fillStyle = 'rgba(100,255,130,0.7)';
        ctx.fillRect(x + 2, y - 2, slotWidth - 4, 3);
      }
      // Компактный слот: тёмный фон, чёткая рамка, яркая полоса сверху.
      ctx.fillStyle = 'rgba(5, 9, 22, 0.92)';
      ctx.fillRect(x, y - 2, slotWidth, BOTTOM_MARGIN - 2);
      ctx.strokeStyle = 'rgba(150,170,255,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y - 2, slotWidth, BOTTOM_MARGIN - 2);
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 2, y - 1);
      ctx.lineTo(x + slotWidth - 2, y - 1);
      ctx.stroke();
      ctx.fillStyle = colors[i];
      // Шрифт подбирается автоматически: крупный на широких слотах,
      // уменьшается на узких, чтобы текст не вылезал за рамки.
      const fontSize = Math.max(10, Math.min(14, slotWidth * 0.40));
      ctx.font = `900 ${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2.5;
      ctx.strokeText(labels[i], x + slotWidth / 2, y + (BOTTOM_MARGIN - 2) / 2 + 1);
      ctx.shadowColor = colors[i];
      ctx.shadowBlur = 10;
      ctx.fillText(labels[i], x + slotWidth / 2, y + (BOTTOM_MARGIN - 2) / 2 + 1);
      ctx.shadowBlur = 0;
    }

    const pegs = pegPositions();
    ctx.save();
    ctx.fillStyle = 'rgba(140,170,255,0.75)';
    ctx.shadowColor = 'rgba(130,170,255,0.9)';
    ctx.shadowBlur = 6;
    for (const peg of pegs) {
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, pegRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  function renderFrame() {
    drawBoard();
    for (const ball of balls) {
      if (!ball.settled) {
        ctx.save();
        const gradient = ctx.createRadialGradient(
          ball.x - 2, ball.y - 2, 1,
          ball.x, ball.y, BALL_RADIUS + 1
        );
        gradient.addColorStop(0, '#fff6c8');
        gradient.addColorStop(0.45, '#ffd04a');
        gradient.addColorStop(1, '#ff9d1f');
        ctx.fillStyle = gradient;
        ctx.shadowColor = 'rgba(255,180,60,0.9)';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function updateBall(ball, dt) {
    if (ball.settled) return;
    const gravity = 420;
    ball.vy = Math.min(300, (ball.vy || 0) + gravity * dt);
    ball.x = Math.min(boardWidth - BALL_RADIUS, Math.max(BALL_RADIUS, ball.x + ball.vx * dt));
    ball.y += ball.vy * dt;

    const pegs = pegPositions();
    for (const peg of pegs) {
      const dx = ball.x - peg.x;
      const dy = ball.y - peg.y;
      const dist = Math.hypot(dx, dy);
      const minDist = pegRadius + BALL_RADIUS - 1;
      if (dist < minDist && dist > 0.001) {
        const nx = dx / dist;
        const ny = dy / dist;
        ball.x = peg.x + nx * minDist;
        ball.y = peg.y + ny * minDist;
        ball.vy *= -0.28;
        // После контакта отталкиваем шарик мягче: при узком угле он не
        // застревает между двумя соседними точками.
        ball.vx = nx * 28 + (Math.random() - 0.5) * 16;
        ball.vy += 24;
        playTone(500 + Math.random() * 300, 0.03, 0.018);
      }
    }

    const bottomY = boardHeight - BOTTOM_MARGIN + 6;
    // Небольшая постоянная коррекция удерживает шарик в выбранной зоне.
    // Она начинается сразу, поэтому нет резкого рывка внизу, но физика не
    // может увести серверский результат в соседний визуальный слот.
    if (Number.isInteger(ball.bucket)) {
      const slotWidth = boardWidth / SLOT_COUNT;
      const targetX = slotWidth * (ball.bucket + 0.5);
      const distance = targetX - ball.x;
      ball.vx += Math.max(-90, Math.min(90, distance * 1.8)) * dt;
      ball.vx *= 0.985;
      if (ball.y > bottomY - 34) {
        ball.x += distance * Math.min(1, dt * 5);
      }
    }
    if (ball.y >= bottomY) {
      ball.y = bottomY;
      const slotWidth = boardWidth / SLOT_COUNT;
      // Коэффициент и выплата приходят одной парой с сервера. Фиксируем
      // шарик в том же слоте, чтобы надпись на поле не расходилась с выплатой.
      ball.actualBucket = ball.bucket;
      ball.x = slotWidth * (ball.bucket + 0.5);
      ball.multiplier = Number(ball.multiplier) || 0;
      ball.x = Math.max(BALL_RADIUS, Math.min(boardWidth - BALL_RADIUS, ball.x));
      ball.vy = 0;
      ball.vx = 0;
      ball.settled = true;
    }
  }

  function dropBall(bucket, multiplier, payout) {
    // Сервер выбирает bucket до запуска. Стартуем уже в его верхней зоне,
    // поэтому во время полёта не требуется резко притягивать шарик к финишу.
    const slotWidth = boardWidth / SLOT_COUNT;
    const bucketIndex = Math.max(0, Math.min(SLOT_COUNT - 1, Math.floor(Number(bucket))));
    const centerX = slotWidth * (bucketIndex + 0.5);
    const x = Math.max(BALL_RADIUS, Math.min(boardWidth - BALL_RADIUS,
      centerX + (Math.random() - 0.5) * slotWidth * 0.28));
    const ball = {
      x, y: TOP_Y, vx: (Math.random() - 0.5) * 22, vy: 0,
      settled: false, bucket: bucketIndex, multiplier, payout: Number(payout)
    };
    balls.push(ball);
    return ball;
  }

  function animate(time) {
    const dt = Math.min(0.033, (time - lastTime) / 1000 || 0.016);
    lastTime = time;
    updateAllBalls(dt);
    renderFrame();
    const moving = balls.filter(ball => !ball.settled);
    if (moving.length || !requestsDone) {
      // Запросы на следующие шарики могут ещё выполняться. Не завершаем
      // раунд после первого долетевшего шарика.
      animationId = requestAnimationFrame(animate);
    } else {
      animationId = null;
      // Завершённая попытка: финальная подсветка уже отрисована drawBoard().
      drawBoard();
      // Выплата приходит с сервера и уже рассчитана по тому же bucket.
      // Нельзя пересчитывать её через локальный input: при нескольких шариках
      // или изменении ставки во время раунда это давало неверный итог.
      const balance = balls.reduce((sum, ball) => sum + (Number.isFinite(ball.payout) ? ball.payout : 0), 0);
      // Выплата каждого шарика уже рассчитана сервером по его bucket и
      // коэффициенту. Показываем только общую сумму начисления.
      resultEl.textContent = `Выигрыш: +${balance} ⭐`;
      resultEl.classList.add('show');
      resultEl.classList.add('win');
      resultEl.classList.remove('lose');
      setTimeout(() => resultEl.classList.remove('show'), 2600);
      playWinSound();
      // Теперь обновляем баланс: все шарики уже долетели, анимация завершена.
      if (pendingProfile) {
        render({ first_name: profile.name }, pendingProfile);
        pendingProfile = null;
      }
      // После показа результата полностью очищаем сцену. Иначе settled-шары
      // могли сохраниться и попасть в следующую попытку.
      dropping = false;
      balls.length = 0;
      renderFrame();
      dropButton.disabled = false;
      updateDropButton();
    }
  }

  function updateAllBalls(dt) {
    for (const ball of balls) {
      if (!ball.settled) updateBall(ball, dt);
    }
  }

  function updateDropButton() {
    const bet = Math.max(10, Number(betInput.value) || 10);
    const ballsLabel = currentBalls === 1 ? 'шарик' : 'шариков';
    dropButton.textContent = `🎯 Бросить ${currentBalls} ${ballsLabel} за ${bet * currentBalls} ⭐`;
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
    // Новая попытка: убираем шарики предыдущей попытки с доски.
    balls = [];
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    renderFrame();
    const ballsToDrop = currentBalls;
    let lastProfile = null;
    try {
      // Один запрос атомарно обрабатывает весь набор шариков. Сервер возвращает
      // отдельный результат для каждого шарика, поэтому коэффициенты не смешиваются.
      const data = await request('/api/plinko/drop', {
        method: 'POST',
        body: JSON.stringify({ bet, count: ballsToDrop })
      });
      lastProfile = data.profile;
      pendingProfile = lastProfile;
      // Запускаем анимацию до добавления шариков и выпускаем их с интервалом.
      // Так шарики не появляются и не падают одновременно.
      lastTime = performance.now();
      animationId = requestAnimationFrame(animate);
      for (const [index, result] of data.results.entries()) {
        if (index > 0) await new Promise(resolve => setTimeout(resolve, 360));
        dropBall(result.bucket, result.multiplier, result.payout);
      }
      // Ждём, пока последний шарик долетит: после этого animate сам разблокирует
      // кнопку и обновит баланс через render().
      requestsDone = true;
    } catch (error) {
      // При ошибке одного из запросов останавливаем текущую анимацию и
      // очищаем уже полученные шарики. Иначе requestsDone остаётся false,
      // requestAnimationFrame продолжает работать бесконечно, а старая
      // попытка видна при следующем броске.
      requestsDone = true;
      dropping = false;
      pendingProfile = null;
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
// ============================ КОНЕЦ ПЛИНКО ============================

request('/api/me').then(x=>{ render(x.user,x.profile); return restoreRocketRound(); }).then(()=>initPlinko()).catch(e=>toast(e.message));
request('/api/cases').then(cases=>cases.forEach(showCase)).catch(e=>toast(e.message));