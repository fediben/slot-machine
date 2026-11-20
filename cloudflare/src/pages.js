export function joinPage(token, siteKey) {
  const safeToken = /^[A-Za-z0-9_-]{30,100}$/.test(token) ? token : "";
  const safeSiteKey = /^[A-Za-z0-9_-]{10,150}$/.test(siteKey) ? siteKey : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Slot Kiosk · Event Check-in</title>
<style>
:root{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#edf1fa;background:#0a1020}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 0,#263a67,#0a1020 65%)}
main{width:min(100%,460px);padding:36px;border:1px solid #3e5176;border-radius:24px;background:#101b31;box-shadow:0 24px 80px #0007}
small{letter-spacing:.17em;text-transform:uppercase;color:#d6b876;font-weight:700}h1{font-size:2rem;margin:12px 0}
p{color:#bcc8dc;line-height:1.5}label{display:block;margin:18px 0 7px}input{width:100%;padding:14px;border-radius:12px;color:white;background:#0a1020;border:1px solid #4f6080;font:inherit}
button{border:0;border-radius:12px;background:#e4ba69;color:#171921;font:700 1rem system-ui;padding:15px;width:100%;cursor:pointer;margin-top:22px}
button:disabled{opacity:.4}#notice{margin-top:20px;min-height:44px}footer{color:#8697b2;margin-top:22px;font-size:.84rem}
</style></head>
<body><main><small>Event Competition</small><h1>Join the game</h1>
<p id="event">Checking the QR link…</p>
<form id="form"><label for="name">Your leaderboard name</label><input id="name" name="name" autocomplete="nickname" minlength="3" maxlength="24" required placeholder="Your name">
<label for="pin">Your 6–12 digit player PIN</label><input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{6,12}" minlength="6" maxlength="12" required placeholder="Create or enter your PIN">
<p>Existing players: use the same name and PIN. This is an event-only profile. Your display name appears on the leaderboard.</p>
${safeSiteKey ? `<div class="cf-turnstile" data-sitekey="${safeSiteKey}"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : ""}
<button id="submit" type="submit">Check in</button></form>
<div id="notice" role="status" aria-live="polite"></div>
<footer>QR links expire after 90 seconds. No cash-out or monetary gambling.</footer>
</main>
<script>
const route = '/api/join/${safeToken}', form = document.getElementById('form'), notice = document.getElementById('notice');
(async()=>{try{const r=await fetch(route);const j=await r.json();if(!r.ok)throw Error('This QR code has expired. Ask for a new one.');document.getElementById('event').textContent=j.event+' · '+j.machine;}
catch(e){document.getElementById('event').textContent=e.message;form.hidden=true;}})();
form.addEventListener('submit',async e=>{e.preventDefault();const button=document.getElementById('submit');button.disabled=true;notice.textContent='Signing in…';
try{const data={name:document.getElementById('name').value,pin:document.getElementById('pin').value,turnstile:window.turnstile&&window.turnstile.getResponse()||''};
const r=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();if(!r.ok)throw Error(j.error||'Check-in failed');
notice.textContent='Welcome '+j.name+'! Return to the kiosk to play.';form.hidden=true;
}catch(e){notice.textContent=e.message;button.disabled=false;if(window.turnstile)window.turnstile.reset();}});
</script></body></html>`;
}
export function adminPage() {
return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Slot Kiosk · Event Control</title><style>
:root{font-family:system-ui,Segoe UI,sans-serif;color:#eff3fa;background:#0a1020}*{box-sizing:border-box}
body{margin:0;padding:28px;max-width:1300px;margin:auto}header{display:flex;align-items:center;justify-content:space-between}
h1{font-size:2.2rem}small{color:#b4c0d7}section{border:1px solid #334564;background:#142039;border-radius:18px;padding:22px;margin:20px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}
input,select{background:#081224;color:white;border:1px solid #435675;padding:11px;border-radius:8px;width:100%;font:inherit;margin:6px 0}
button{background:#e1bc75;color:#152034;border:0;border-radius:9px;padding:11px 18px;font-weight:750;cursor:pointer;margin:8px 4px 8px 0}
button.off{background:#e27675}button:disabled{opacity:.5}
table{border-collapse:collapse;width:100%;font-size:.92rem}td,th{border-bottom:1px solid #324360;padding:12px;text-align:left}
#status{color:#e1bc75;min-height:1.6rem}.muted{color:#aabbd3}code{word-break:break-all}
</style></head><body><header><div><small>EVENT OPERATIONS</small><h1>Slot Kiosk Control</h1></div><div>Cloudflare Access protected</div></header>
<p class="muted">Manage events, register kiosks, view scores and disable machines. This is a development dashboard; complete hardware and identity validation before live use.</p>
<div id="status" role="status" aria-live="polite"></div>
<section><label for="devToken">Local development token (leave empty when using Cloudflare Access)</label><input id="devToken" type="password" placeholder="Only needed in local development"><button id="reload">Refresh dashboard</button></section>
<div class="grid"><section><h2>New event</h2><form id="eventForm"><label>Title<input name="name" required minlength="3" placeholder="Geneva Demo Night"></label><label>Slug<input name="slug" required minlength="3" placeholder="geneva-demo-night"></label><label>Opening credits<input name="starting_credits" type="number" min="0" max="50000" value="500"></label><label>Sessions per player<input name="max_sessions_per_profile" type="number" min="1" max="100" value="1"></label><button>Create event</button></form></section>
<section><h2>Selected event</h2><select id="events"><option value="">Select event</option></select><div id="eventInfo"></div><h3>Register a machine</h3><form id="machineForm"><label>Machine name<input name="name" required minlength="3" placeholder="Kiosk C2"></label><button>Add kiosk</button></form><p id="provision" class="muted"></p></section></div>
<section><h2>Machines</h2><p class="muted">Disable commands block new sessions and play tokens; kiosks must acknowledge the command.</p><table><thead><tr><th>Machine</th><th>Control</th><th>Command / Ack</th><th>Last seen</th></tr></thead><tbody id="machines"></tbody></table></section>
<section><h2>Latest scores</h2><p class="muted">Provisional results: Unity scores are not yet independently recalculated.</p><table><thead><tr><th>Player</th><th>Machine</th><th>Award</th><th>Review flag</th></tr></thead><tbody id="scores"></tbody></table></section>
<script>
let currentEvents=[];
const $=id=>document.getElementById(id),say=t=>$('status').textContent=t;
async function api(path,method='GET',data){
const token=$('devToken').value;const headers={};if(token)headers.Authorization='Bearer '+token;
if(data)headers['Content-Type']='application/json';
const r=await fetch(path,{method,headers,body:data?JSON.stringify(data):undefined});const j=await r.json();if(!r.ok)throw Error(j.error||'API error');return j;}
function cell(tr,text){const td=document.createElement('td');td.textContent=String(text??'—');tr.appendChild(td);return td;}
async function refreshEvents(){
const {events}=await api('/api/admin/events');currentEvents=events;const el=$('events'),old=el.value;
el.replaceChildren(new Option('Select event',''));events.forEach(x=>el.add(new Option(x.name+' · '+x.slug,x.id)));
if(events.some(x=>x.id===old))el.value=old;else if(events.length)el.value=events[0].id;
await refreshSelected();
}
async function refreshSelected(){
const id=$('events').value;$('machines').replaceChildren();$('scores').replaceChildren();$('eventInfo').textContent='';
if(!id)return;const ev=currentEvents.find(x=>x.id===id);$('eventInfo').textContent=ev?'Status: '+ev.state+' | leaderboard: /api/events/'+ev.slug+'/leaderboard':'';
const [{machines},{scores}]=await Promise.all([api('/api/admin/machines?event_id='+encodeURIComponent(id)),api('/api/admin/scores?event_id='+encodeURIComponent(id))]);
machines.forEach(m=>{const tr=document.createElement('tr');cell(tr,m.name);const control=document.createElement('td'),button=document.createElement('button');button.textContent=m.enabled?'Disable':'Enable';if(m.enabled)button.className='off';
button.onclick=async()=>{try{await api('/api/admin/machines/'+m.id,'PATCH',{enabled:!m.enabled});await refreshSelected();say('Command sent. Wait for acknowledgement.');}catch(e){say(e.message)}};control.append(button);tr.append(control);
cell(tr,m.command_seq+' / '+m.ack_seq+(m.command_seq===m.ack_seq?' ✓':' pending'));
cell(tr,m.last_seen_at?new Date(m.last_seen_at).toLocaleString():'Never');$('machines').append(tr)});
scores.forEach(s=>{const tr=document.createElement('tr');cell(tr,s.display_name);cell(tr,s.machine);cell(tr,s.award);cell(tr,s.flagged?'Review':'—');$('scores').append(tr)});
}
$('reload').onclick=()=>refreshEvents().catch(e=>say(e.message));$('events').onchange=()=>refreshSelected().catch(e=>say(e.message));
$('eventForm').onsubmit=async e=>{e.preventDefault();try{const f=new FormData(e.target);const item=Object.fromEntries(f);item.starting_credits=Number(item.starting_credits);item.max_sessions_per_profile=Number(item.max_sessions_per_profile);
await api('/api/admin/events','POST',item);say('Event created');await refreshEvents();}catch(e){say(e.message)}};
$('machineForm').onsubmit=async e=>{e.preventDefault();try{const name=new FormData(e.target).get('name');const event_id=$('events').value;if(!event_id)throw Error('Select an event');
const r=await api('/api/admin/machines','POST',{name,event_id});
$('provision').textContent='SAVE NOW — Machine ID: '+r.id+' | machine key (shown once): '+r.machine_key;
say('Kiosk registered. Copy its key into secure machine configuration.');await refreshSelected();}catch(e){say(e.message)}};
refreshEvents().catch(e=>say('Access unavailable: '+e.message));
</script></body></html>`;
}
