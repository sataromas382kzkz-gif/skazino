const tg = window.Telegram?.WebApp;
tg?.ready(); tg?.expand();
const headers = {'Content-Type':'application/json','x-telegram-init-data':tg?.initData || ''};
const $ = id => document.getElementById(id);
const toast = text => { $('toast').textContent=text; $('toast').classList.add('show'); setTimeout(()=>$('toast').classList.remove('show'),2500); };
let profile;
async function request(url, options={}) { const response=await fetch(url,{...options,headers:{...headers,...options.headers}}); const data=await response.json(); if(!response.ok) throw Error(data.error||'Ошибка'); return data; }
function render(user, data) { profile=data; const name=user.first_name||'друг'; $('name').textContent=name; $('heroName').textContent=name; $('avatar').textContent=(name[0]||'✦').toUpperCase(); $('stars').textContent=data.stars; $('statStars').textContent=data.stars; $('tasks').textContent=data.tasks; $('daily').disabled=data.tasks>0; $('daily').textContent=data.tasks>0?'Получено':'Забрать'; }
$('daily').onclick=async()=>{ try { const data=await request('/api/daily',{method:'POST'}); profile=data.profile; render({first_name:profile.name},profile); toast(data.message); } catch(e){toast(e.message)} };
request('/api/me').then(x=>render(x.user,x.profile)).catch(e=>toast(e.message));
