const tg = window.Telegram?.WebApp;
tg?.ready(); tg?.expand();
const headers = {'Content-Type':'application/json','x-telegram-init-data':tg?.initData || ''};
const $ = id => document.getElementById(id);
const toast = text => { $('toast').textContent=text; $('toast').classList.add('show'); setTimeout(()=>$('toast').classList.remove('show'),2500); };
let profile;
async function request(url, options={}) { const response=await fetch(url,{...options,headers:{...headers,...options.headers}}); const data=await response.json(); if(!response.ok) throw Error(data.error||'Ошибка'); return data; }
function render(user, data) { profile=data; const name=user.first_name||'друг'; $('name').textContent=name; $('heroName').textContent=name; $('avatar').textContent=(name[0]||'✦').toUpperCase(); $('stars').textContent=data.stars; $('statStars').textContent=data.stars; $('tasks').textContent=data.tasks; $('daily').disabled=data.tasks>0; $('daily').textContent=data.tasks>0?'Получено':'Забрать'; }
$('daily').onclick=async()=>{ try { const data=await request('/api/daily',{method:'POST'}); render({first_name:profile.name},data.profile); toast(data.message); } catch(e){toast(e.message)} };
function showCase(item) {
  const rewards = item.rewards.map(reward => `<div class="reward-row"><span>${reward.label}</span><b>${reward.chance}%</b></div>`).join('');
  const card=document.createElement('article'); card.className='case-card'; card.innerHTML=`<div class="case-art">🎁</div><h3>${item.name}</h3><div class="case-price">⭐ ${item.price}</div><div class="reward-list">${rewards}</div><button>Открыть кейс</button>`;
  card.querySelector('button').onclick=()=>openCase(item); $('cases').append(card);
}
async function openCase(item) {
  const modal=$('caseModal'); modal.classList.add('visible'); $('caseTitle').textContent=item.name; $('rewardText').textContent=''; $('closeModal').disabled=true;
  const reel=$('reel'); reel.classList.remove('win'); reel.textContent='🎁';
  for(let i=0;i<12;i++){ reel.textContent=item.rewards[i%item.rewards.length].label; await new Promise(resolve=>setTimeout(resolve,90+i*12)); }
  try { const data=await request(`/api/cases/${item.id}/open`,{method:'POST'}); reel.textContent=data.reward.label; reel.classList.add('win'); $('rewardText').textContent=`Вы получили: ${data.reward.label}`; render({first_name:profile.name},data.profile); } catch(e){ $('rewardText').textContent=e.message; }
  $('closeModal').disabled=false;
}
$('closeModal').onclick=()=> $('caseModal').classList.remove('visible');
request('/api/me').then(x=>render(x.user,x.profile)).catch(e=>toast(e.message));
request('/api/cases').then(cases=>cases.forEach(showCase)).catch(e=>toast(e.message));