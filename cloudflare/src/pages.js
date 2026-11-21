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
button:disabled{opacity:.4}button:focus-visible,input:focus-visible{outline:3px solid #e4ba69;outline-offset:3px}
#notice{margin-top:20px;min-height:44px;line-height:1.5}footer{color:#a9b6cd;margin-top:22px;font-size:.88rem}
@media(max-width:520px){body{padding:12px}main{padding:22px;border-radius:18px}h1{font-size:1.8rem}}
</style></head>
<body><main><small>Event Competition</small><h1>Join the game</h1>
<p id="event">Checking the QR link…</p><p id="timer" role="timer" aria-live="off"></p>
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
(async()=>{try{const r=await fetch(route);const j=await r.json();if(!r.ok)throw Error('This QR code has expired. Ask for a new one.');document.getElementById('event').textContent=j.event+' · '+j.machine;
const expire=Number(j.expires_at);const timer=document.getElementById('timer');
const countdown=()=>{const left=Math.max(0,Math.ceil((expire-Date.now())/1000));
timer.textContent=left>0?'QR expires in '+left+' seconds':'QR expired — request a new code at the kiosk';
if(left===0){form.hidden=true;clearInterval(countdownInterval);}};
const countdownInterval=setInterval(countdown,1000);countdown();}
catch(e){document.getElementById('event').textContent=e.message;form.hidden=true;}})();
form.addEventListener('submit',async e=>{e.preventDefault();const button=document.getElementById('submit');button.disabled=true;notice.textContent='Signing in…';
try{const data={name:document.getElementById('name').value,pin:document.getElementById('pin').value,turnstile:window.turnstile&&window.turnstile.getResponse()||''};
const r=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();if(!r.ok){const messages={
'QR_LINK_EXPIRED':'This QR has expired. Ask the kiosk for a new one.',
'PROFILE_PIN_INVALID':'Incorrect PIN for this player name.',
'PROFILE_ALREADY_EXISTS':'That name is already registered. Try your existing PIN.',
'EVENT_SESSION_LIMIT_REACHED':'You have already used the allowed sessions for this event.',
'CHECKIN_CHALLENGE_FAILED':'Security check failed. Complete the verification and retry.',
'CHECKIN_ATTEMPT_LIMIT':'Too many attempts on this QR. Ask the kiosk for a fresh code.',
'MACHINE_BUSY_OR_LINK_USED':'This kiosk is already busy or the QR was used. Ask for a new code.',
'CHECKIN_SECURITY_NOT_CONFIGURED':'Check-in is not ready yet. Please contact event staff.'
};throw Error(messages[j.error]||'Check-in unavailable. Please ask event staff.');}
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
button.off{background:#e27675}button:disabled{opacity:.5}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #e1bc75;outline-offset:2px}
#summary{display:flex;flex-wrap:wrap;gap:12px;align-items:center;color:#d5e1f3}
#summary span{border:1px solid #445776;border-radius:12px;padding:10px 16px;background:#111a2b}
@media(max-width:650px){body{padding:12px}header{align-items:flex-start;gap:12px;flex-direction:column}
h1{font-size:1.65rem}section{padding:15px;border-radius:12px}table{min-width:560px}section:has(table){overflow-x:auto}
button{min-height:44px}}
table{border-collapse:collapse;width:100%;font-size:.92rem}td,th{border-bottom:1px solid #324360;padding:12px;text-align:left}
#status{color:#e1bc75;min-height:1.6rem}.muted{color:#aabbd3}code{word-break:break-all}
</style></head><body><header><div><small>EVENT OPERATIONS</small><h1>Slot Kiosk Control</h1></div><div>Cloudflare Access protected</div></header>
<p class="muted">Manage events, register kiosks, view scores and disable machines. This is a development dashboard; complete hardware and identity validation before live use.</p>
<div id="status" role="status" aria-live="polite"></div><div id="summary" aria-label="Event overview" aria-live="polite"></div>
<section><label for="devToken">Local development token (leave empty when using Cloudflare Access)</label><input id="devToken" type="password" placeholder="Only needed in local development"><button id="reload">Refresh dashboard</button></section>
<div class="grid"><section><h2>New event</h2><form id="eventForm"><label>Title<input name="name" required minlength="3" placeholder="Geneva Demo Night"></label><label>Slug<input name="slug" required minlength="3" placeholder="geneva-demo-night"></label><label>Opening credits<input name="starting_credits" type="number" min="0" max="50000" value="500"></label><label>Sessions per player<input name="max_sessions_per_profile" type="number" min="1" max="100" value="1"></label><button>Create event</button></form></section>
<section><h2>Selected event</h2><select id="events"><option value="">Select event</option></select><div id="eventInfo"></div>
<form id="eventSettingsForm">
<label>Event status<select id="eventState"><option value="active">Active</option><option value="closed">Closed</option></select></label>
<label>Starting gameplay credits<input id="eventCredits" type="number" min="0" max="50000" required></label>
<label>Max sessions per profile<input id="eventLimit" type="number" min="1" max="100" required></label>
<label>Score cap per spin<input id="eventMaxAward" type="number" min="0" max="50000" required></label>
<button>Save event rules</button>
</form><h3>Register a machine</h3><form id="machineForm"><label>Machine name<input name="name" required minlength="3" placeholder="Kiosk C2"></label><button>Add kiosk</button></form><p id="provision" class="muted"></p></section></div>
<section><h2>Machines</h2><p class="muted">Disable commands block new sessions and play tokens; kiosks must acknowledge the command.</p><table><thead><tr><th>Machine</th><th>Control</th><th>Command / Ack</th><th>Last seen</th></tr></thead><tbody id="machines"></tbody></table></section>
<section><h2>Event standings</h2><table><thead><tr><th>Player</th><th>Credits left</th><th>Points</th><th>Status</th></tr></thead><tbody id="standings"></tbody></table></section>
<section><h2>Latest scores</h2><button id="exportCsv">Download event scores CSV</button><p class="muted">Provisional results: Unity scores are not yet independently recalculated.</p><table><thead><tr><th>Player</th><th>Machine</th><th>Award</th><th>Review flag</th></tr></thead><tbody id="scores"></tbody></table></section>
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
const id=$('events').value;$('machines').replaceChildren();$('scores').replaceChildren();$('standings').replaceChildren();$('eventInfo').textContent='';
if(!id){$('summary').replaceChildren();return;}const ev=currentEvents.find(x=>x.id===id);$('eventInfo').textContent=ev?'Status: '+ev.state+' | leaderboard: /api/events/'+ev.slug+'/leaderboard':'';
if(ev){$('eventState').value=ev.state;$('eventCredits').value=ev.starting_credits;$('eventLimit').value=ev.max_sessions_per_profile;$('eventMaxAward').value=ev.max_award_per_spin;}
const [{machines},{scores},{standings}]=await Promise.all([api('/api/admin/machines?event_id='+encodeURIComponent(id)),api('/api/admin/scores?event_id='+encodeURIComponent(id)),api('/api/admin/leaderboard?event_id='+encodeURIComponent(id))]);
const activeKiosks=machines.filter(m=>m.enabled&&m.last_seen_at&&Date.now()-m.last_seen_at<20000).length;
$('summary').replaceChildren();
[machines.length+' kiosk(s)',activeKiosks+' online',standings.length+' sessions',scores.length+' recent scores'].forEach(t=>{const span=document.createElement('span');span.textContent=t;$('summary').append(span)});
machines.forEach(m=>{const tr=document.createElement('tr');cell(tr,m.name);const control=document.createElement('td'),button=document.createElement('button');button.textContent=m.enabled?'Disable':'Enable';if(m.enabled)button.className='off';
button.onclick=async()=>{if(m.enabled&&!confirm('Disable '+m.name+'? New check-ins and spins will stop; an in-progress spin may still submit its score.'))return;
button.disabled=true;try{await api('/api/admin/machines/'+m.id,'PATCH',{enabled:!m.enabled});await refreshSelected();say('Command sent. Confirm the kiosk acknowledgement below.');}catch(e){say(e.message)}finally{button.disabled=false}};control.append(button);tr.append(control);
cell(tr,m.command_seq+' / '+m.ack_seq+(m.command_seq===m.ack_seq?' ✓':' pending'));
cell(tr,m.last_seen_at?(Date.now()-m.last_seen_at>20000?'OFFLINE · ':'ONLINE · ')+new Date(m.last_seen_at).toLocaleString():'Never connected');$('machines').append(tr)});
standings.forEach(s=>{const tr=document.createElement('tr');cell(tr,s.display_name);cell(tr,s.credits);cell(tr,s.total_score);cell(tr,s.state);$('standings').append(tr)});
scores.forEach(s=>{const tr=document.createElement('tr');cell(tr,s.display_name);cell(tr,s.machine);cell(tr,s.award);cell(tr,s.flagged?'Review':'—');$('scores').append(tr)});
}
$('reload').onclick=()=>refreshEvents().catch(e=>say(e.message));$('events').onchange=()=>refreshSelected().catch(e=>say(e.message));
$('eventForm').onsubmit=async e=>{e.preventDefault();try{const f=new FormData(e.target);const item=Object.fromEntries(f);item.starting_credits=Number(item.starting_credits);item.max_sessions_per_profile=Number(item.max_sessions_per_profile);
await api('/api/admin/events','POST',item);say('Event created');await refreshEvents();}catch(e){say(e.message)}};
$('eventSettingsForm').onsubmit=async e=>{e.preventDefault();const id=$('events').value;if(!id)return;
const selected=currentEvents.find(ev=>ev.id===id);
if(selected&&selected.state!=='closed'&&$('eventState').value==='closed'&&!confirm('Close this event? New player check-ins and spins will stop.'))return;
try{await api('/api/admin/events/'+id,'PATCH',{state:$('eventState').value,starting_credits:Number($('eventCredits').value),max_sessions_per_profile:Number($('eventLimit').value),max_award_per_spin:Number($('eventMaxAward').value)});
say('Event rules updated');await refreshEvents();}catch(e){say(e.message);}};
$('exportCsv').onclick=async()=>{const id=$('events').value;if(!id)return;
try{const {scores}=await api('/api/admin/scores?event_id='+encodeURIComponent(id));
const safe=v=>{let t=String(v??'');if(/^[=+@-]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';};
const rows=[['Player','Machine','Award','Flagged','Received UTC'],...scores.map(s=>[s.display_name,s.machine,s.award,s.flagged,new Date(s.received_at).toISOString()])];
const csv=rows.map(row=>row.map(safe).join(',')).join('\\r\\n');
const object=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
const link=document.createElement('a');link.href=object;link.download='slot-scores-'+id+'.csv';link.click();
setTimeout(()=>URL.revokeObjectURL(object),5000);say('CSV export created');}catch(e){say(e.message);}};
$('machineForm').onsubmit=async e=>{e.preventDefault();try{const name=new FormData(e.target).get('name');const event_id=$('events').value;if(!event_id)throw Error('Select an event');
const r=await api('/api/admin/machines','POST',{name,event_id});
$('provision').textContent='SAVE NOW — Machine ID: '+r.id+' | machine key (shown once): '+r.machine_key;
say('Kiosk registered. Copy its key into secure machine configuration.');await refreshSelected();}catch(e){say(e.message)}};
if(!['localhost','127.0.0.1'].includes(location.hostname)){
  $('devToken').closest('section').querySelector('label').hidden=true;
  $('devToken').hidden=true;
}
refreshEvents().catch(e=>say('Access unavailable: '+e.message));
</script></body></html>`;
}
