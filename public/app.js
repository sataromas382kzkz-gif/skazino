const tg = window.Telegram?.WebApp;
tg?.ready(); tg?.expand();
const headers = {'Content-Type':'application/json','x-telegram-init-data':tg?.initData || ''};
const $ = id => document.getElementById(id);
const toast = text => { $('toast').textContent=text; $('toast').classList.add('show'); setTimeout(()=>$('toast').classList.remove('show'),2500); };
let profile;
async function request(url, options={}) { const response=await fetch(url,{...options,headers:{...headers,...options.headers}}); const data=await response.json(); if(!response.ok) throw Error(data.error||'Ошибка'); return data; }
function render(user, data) {
  profile=data;
  const name=user.first_name||'друг';
  const receivedRecently=data.lastDailyAt && Date.now()-data.lastDailyAt < 24*60*60*1000;
  $('name').textContent=name; $('heroName').textContent=name; $('avatar').textContent=(name[0]||'✦').toUpperCase();
  $('stars').textContent=data.caseStars ?? data.stars ?? 0; $('statStars').textContent=data.caseStars ?? data.stars ?? 0;
  if ($('profileCaseStars')) $('profileCaseStars').textContent=data.caseStars ?? data.stars ?? 0;
  if ($('profilePrizeStars')) $('profilePrizeStars').textContent=data.prizeStars ?? 0;
  if ($('profileRegistered')) $('profileRegistered').textContent=data.registeredAt ? new Date(data.registeredAt).toLocaleDateString('ru-RU') : '—';
  $('daily').disabled=receivedRecently; $('daily').textContent=receivedRecently?'Получено':'Забрать';
}
$('daily').onclick=async()=>{ try { const data=await request('/api/daily',{method:'POST'}); render({first_name:profile.name},data.profile); toast(data.message); } catch(e){toast(e.message)} };
const TOPUP_LINK='https://playerok.com/profile/SaharOK086/products';
$('profileButton').onclick=()=>{ $('profileModal').classList.add('visible'); $('promoCode').value=''; $('topupLink').value=TOPUP_LINK; $('topupLinkOpen').href=TOPUP_LINK; };
$('profileModal').addEventListener('click', event=>{ if (event.target === $('profileModal')) $('profileModal').classList.remove('visible'); });
$('giftsModal').addEventListener('click', event=>{ if (event.target === $('giftsModal')) $('giftsModal').classList.remove('visible'); });
$('closeGifts').onclick=()=> $('giftsModal').classList.remove('visible');
function renderGifts() {
  // У старых профилей giftItems формируется сервером из уже накопленных gifts.
  const gifts = profile?.giftItems || [];
  $('giftsList').innerHTML = gifts.length ? gifts.slice().reverse().map(gift => {
    const fallbackNames = { bear: 'Мишка Telegram', rose: 'Роза Telegram', cake: 'Торт Telegram', bouquet: 'Букет Telegram', rocket: 'Ракета Telegram' };
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
function rewardEmoji(reward) {
  if (reward?.type === 'bear') return '🧸';
  if (reward?.type === 'rose') return '🌹';
  if (reward?.type === 'cake') return '🎂';
  if (reward?.type === 'bouquet') return '💐';
  if (reward?.type === 'rocket') return '🚀';
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
function playCaseOpenSound() { playTone(240, .16, .085); playTone(380, .18, .075, .13); }
function playReelSound() { playTone(720, .055, .04); }
function playWinSound() { playTone(520, .14, .09); playTone(660, .16, .09, .12); playTone(880, .25, .1, .25); }

// Ненавязчивая фоновая мелодия: создаётся браузером, без загрузки аудиофайлов.
let menuMusicTimer;
let menuMusicStep = 0;
function playMenuMusicNote() {
  if (document.hidden || $('caseModal').classList.contains('visible')) return;
  const notes = [262, 330, 392, 330, 294, 349, 440, 349];
  playTone(notes[menuMusicStep++ % notes.length], .34, .012);
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
  const caseArt = item.image
    ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">`
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
  }
}
$('closeModal').onclick=()=> { $('caseModal').classList.remove('visible'); startMenuMusic(); };
request('/api/me').then(x=>render(x.user,x.profile)).catch(e=>toast(e.message));
request('/api/cases').then(cases=>cases.forEach(showCase)).catch(e=>toast(e.message));