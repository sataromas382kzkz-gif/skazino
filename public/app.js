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
  const receivedToday=data.lastDaily===new Date().toISOString().slice(0, 10);
  $('name').textContent=name; $('heroName').textContent=name; $('avatar').textContent=(name[0]||'✦').toUpperCase();
  $('stars').textContent=data.stars; $('statStars').textContent=data.stars; $('tasks').textContent=data.tasks;
  $('daily').disabled=receivedToday; $('daily').textContent=receivedToday?'Получено':'Забрать';
}
$('daily').onclick=async()=>{ try { const data=await request('/api/daily',{method:'POST'}); render({first_name:profile.name},data.profile); toast(data.message); } catch(e){toast(e.message)} };
function showCase(item) {
  const card=document.createElement('article'); card.className='case-card'; card.innerHTML=`<div class="case-art">🎁</div><h3>${item.name}</h3><div class="case-price">⭐ ${item.price}</div><button>Открыть кейс</button>`;
  const button=card.querySelector('button');
  button.onclick=()=>openCase(item, button); $('cases').append(card);
}
async function openCase(item, button) {
  if (!profile || profile.stars < item.price) return toast('Недостаточно звёзд для открытия кейса');
  button.disabled=true;
  const modal=$('caseModal'); modal.classList.add('visible'); $('caseTitle').textContent=item.name; $('rewardText').textContent=''; $('closeModal').disabled=true;
  const reel=$('reel'); reel.classList.remove('win');
  const track=[];
  for(let i=0;i<24;i++) track.push(item.rewards[Math.floor(Math.random()*item.rewards.length)]);
  reel.innerHTML='<div class="reel-track"></div>';
  const reelTrack=reel.querySelector('.reel-track');
  track.forEach(reward=>{ const lot=document.createElement('span'); lot.textContent=reward.label; reelTrack.append(lot); });
  reelTrack.animate([{transform:'translateX(0)'},{transform:`translateX(-${(track.length-1)*100}%)`}],{duration:2600,easing:'cubic-bezier(.12,.72,.18,1)',fill:'forwards'});
  await new Promise(resolve=>setTimeout(resolve,2650));
  try { const data=await request(`/api/cases/${item.id}/open`,{method:'POST'}); reelTrack.lastElementChild.textContent=data.reward.label; reel.classList.add('win'); $('rewardText').textContent=`Вы получили: ${data.reward.label}`; render({first_name:profile.name},data.profile); } catch(e){ $('rewardText').textContent=e.message; }
  $('closeModal').disabled=false; button.disabled=false;
}
$('closeModal').onclick=()=> $('caseModal').classList.remove('visible');
request('/api/me').then(x=>render(x.user,x.profile)).catch(e=>toast(e.message));
request('/api/cases').then(cases=>cases.forEach(showCase)).catch(e=>toast(e.message));