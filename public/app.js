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
  $('stars').textContent=data.stars; $('statStars').textContent=data.stars; $('tasks').textContent=data.tasks;
  $('daily').disabled=receivedRecently; $('daily').textContent=receivedRecently?'Получено':'Забрать';
}
$('daily').onclick=async()=>{ try { const data=await request('/api/daily',{method:'POST'}); render({first_name:profile.name},data.profile); toast(data.message); } catch(e){toast(e.message)} };
function rewardImage(reward) {
  return reward.image || reward.imageUrl || reward.imagePath || null;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[character]));
}
function rewardMarkup(reward) {
  const label=escapeHtml(reward?.label || 'Приз');
  const image=rewardImage(reward);
  // Подпись теперь всегда видна: даже если картинка не загрузилась,
  // карточка не будет пустой в Telegram WebView или при отсутствующем asset.
  return image
    ? `<img src="${escapeHtml(image)}" alt="${label}" onerror="this.hidden=true"><span>${label}</span>`
    : `<span>${label}</span>`;
}
function showCase(item) {
  const rewards=item.rewards.map(reward => `<div class="reward-preview">${rewardMarkup(reward)}</div>`).join('');
  const card=document.createElement('article'); card.className='case-card'; card.innerHTML=`<div class="case-art">🎁</div><h3>${item.name}</h3><div class="case-price">⭐ ${item.price}</div><div class="reward-preview-list">${rewards}</div><button>Открыть кейс</button>`;
  const button=card.querySelector('button');
  button.onclick=()=>openCase(item, button); $('cases').append(card);
}
async function openCase(item, button) {
  if (!profile || profile.stars < item.price) return toast('Недостаточно звёзд для открытия кейса');
  button.disabled=true;
  const modal=$('caseModal');
  const reel=$('reel');
  const icon=$('caseIcon');
  modal.classList.add('visible');
  $('caseTitle').textContent=item.name;
  $('rewardText').textContent='Кейс открывается...';
  $('closeModal').disabled=true;
  reel.className='reel';
  reel.innerHTML=`<div class="reel-prize"><span>${escapeHtml(item.rewards[0]?.label || 'Приз')}</span></div>`;
  icon.classList.remove('case-opening');
  void icon.offsetWidth;
  icon.classList.add('case-opening');

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
      ticks+=1;
    };
    showNextReward();
    timer=setInterval(showNextReward, 180);
    await new Promise(resolve=>setTimeout(resolve, 3000));
    clearInterval(timer);

    prize.innerHTML=rewardMarkup(data.reward);
    prize.classList.add('prize-final');
    reel.classList.add('win');
    $('rewardText').textContent=`Вы получили: ${data.reward.label}`;
    render({first_name:profile.name},data.profile);
  } catch(e) {
    $('rewardText').textContent=e.message;
  } finally {
    $('closeModal').disabled=false;
    button.disabled=false;
  }
}
$('closeModal').onclick=()=> $('caseModal').classList.remove('visible');
request('/api/me').then(x=>render(x.user,x.profile)).catch(e=>toast(e.message));
request('/api/cases').then(cases=>cases.forEach(showCase)).catch(e=>toast(e.message));