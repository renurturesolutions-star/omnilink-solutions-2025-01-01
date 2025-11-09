const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));
function toast(t,ms=2200){const x=document.createElement('div');x.className='toast';x.textContent=t;document.body.appendChild(x);setTimeout(()=>x.remove(),ms);}

// ---- seed 50 demo reviews (once)
const DEMO_REVIEWS = Array.from({length:50}).map((_,i)=> ({
  id: crypto.randomUUID(),
  contractorEmail: ["proplumb@fix.co.za","sparkyelec@fix.co.za","coolair@hvac.co.za","handymax@hm.co.za"][i%4],
  rating: (i%5)+1,
  text: ["Excellent service.","Affordable and quick.","Neat and professional.","Came on time and solved the issue.","Would recommend."][i%5],
  clientName: ["Thandi","Michael","Lerato","Sizwe","Caitlin"][i%5],
  service: ["Plumbing","Electrical","HVAC","Handyman","Cleaning"][i%5],
  ts: Date.now()- (i*86400000)
}));
if(!localStorage.getItem('fixmate_reviews')){
  localStorage.setItem('fixmate_reviews', JSON.stringify(DEMO_REVIEWS));
}

// ---- stores
const Store = (k,init=[])=>({
  all(){return JSON.parse(localStorage.getItem(k)||JSON.stringify(init));},
  set(v){localStorage.setItem(k,JSON.stringify(v));},
  add(o){const a=this.all();a.unshift(o);this.set(a);}
});
const Leads=Store('fixmate_leads');
const Contractors=Store('fixmate_contractors');
const Reviews=Store('fixmate_reviews');
const Outbox=Store('fixmate_outbox'); // simulated send queue

function upsertContractor(c){
  const list = Contractors.all();
  const idx = list.findIndex(x=> (x.email||'').toLowerCase()===(c.email||'').toLowerCase());
  if(idx>=0){ list[idx] = {...list[idx], ...c}; }
  else { list.unshift(c); }
  Contractors.set(list);
}

// ---- chat launcher on all pages
function mountChat(){
  if($('#chat-launcher')) return;
  const btn=document.createElement('button');btn.id='chat-launcher';btn.className='btn primary';btn.textContent='Chat';
  btn.onclick=()=>openChat(); document.body.appendChild(btn);
}

// sweeper / typing indicator
function showSweeper(parent){
  const wrap=document.createElement('div'); wrap.className='typing';
  wrap.innerHTML=`<svg class="sweeper" width="32" height="24" viewBox="0 0 64 32" xmlns="http://www.w3.org/2000/svg">
    <g><rect x="2" y="18" width="40" height="6" rx="3" fill="#7b61ff"/>
    <rect x="8" y="24" width="18" height="4" rx="2" fill="#9b83ff"/>
    <circle cx="50" cy="20" r="6" fill="#7b61ff"/></g></svg><span>FixMate is typing…</span>`;
  parent.appendChild(wrap); return wrap;
}

function openChat(opts={}){
  const panel=document.createElement('div');panel.className='chat';
  panel.innerHTML=`<div class="chat-h"><strong>FixMate Lead Bot</strong><button class="btn small" id="c-close">Close</button></div>
  <div class="chat-b" id="c-body"></div>
  <div class="chat-f"><input id="c-in" class="input-rounded" placeholder="Type…" /><button class="btn primary" id="c-send">Send</button></div>`;
  document.body.appendChild(panel);
  $('#c-close',panel).onclick=()=>panel.remove();
  $('#c-send',panel).onclick=()=>send();
  $('#c-in',panel).addEventListener('keydown',e=>{if(e.key==='Enter')send();});
  const body=$('#c-body',panel);
  const put=(cls,txt)=>{const d=document.createElement('div');d.className='msg '+cls;d.textContent=txt;body.appendChild(d);body.scrollTop=body.scrollHeight;}
  const waitBot=(text, cb)=>{ const typ=showSweeper(body); setTimeout(()=>{ typ.remove(); put('bot', text); if(cb) cb(); }, 900+Math.random()*600); };

  const S={service:opts.service||'', area:'', name:'', phone:'', notes:'', contractor:''};
  let i=0;
  const step = ()=>{
    if(i===0){ waitBot(`Hi! What service do you need${S.service?` (noted: ${S.service})`:''}?`); }
    if(i===1){ waitBot('What area/suburb are you in?'); }
    if(i===2){ waitBot('Your name?'); }
    if(i===3){ waitBot('Phone (SA 0XXXXXXXXX)?'); }
    if(i===4){ waitBot('Any notes for the contractor? (or type "skip")'); }
    if(i===5){
      // choose contractor
      const matches = Contractors.all().filter(c=> (c.primary||'').toLowerCase().includes((S.service||'').toLowerCase()) && c.token);
      if(matches.length){
        waitBot('Who would you like to choose for this job? Reply with a number:\n' + matches.map((c,idx)=>`${idx+1}. ${c.biz||c.email} (${c.areas||''})`).join('\n') + '\nOr type "best" to assign best available.');
      }else{
        waitBot('We will assign the best available contractor. Type "best" to confirm.');
      }
    }
    if(i===6){
      // complete: store lead + queue notifications
      const lead={...S,id:crypto.randomUUID(),ts:Date.now(),status:'New',source:'chat'};
      Leads.add(lead);
      const matches = Contractors.all().filter(c=> (c.primary||'').toLowerCase().includes((S.service||'').toLowerCase()) && c.token);
      let chosen=null;
      if(S.contractor && /^\d+$/.test(S.contractor)){ const idx=Number(S.contractor)-1; if(matches[idx]) chosen=matches[idx]; }
      if(S.contractor==='best' && matches[0]) chosen=matches[0];
      const adminMsg={type:'admin', lead, chosen, note:'Notify admin'};
      const contractorMsg={type:'contractor', to: chosen? chosen.email : (matches[0]?.email||null), token: chosen? chosen.token : (matches[0]?.token||null), lead, telegramId: chosen? chosen.telegram : (matches[0]?.telegram||null)};
      Outbox.add(adminMsg); Outbox.add(contractorMsg);
      waitBot('Thanks! Your request has been sent. A contractor will contact you shortly.');
      toast('Lead captured'); i++;
    }
  };
  step();

  function send(){
    const v=$('#c-in',panel).value.trim(); if(!v) return; $('#c-in',panel).value=''; put('user',v);
    if(i===0){ if(!S.service) S.service=v; i=1; step(); return; }
    if(i===1){ S.area=v; i=2; step(); return; }
    if(i===2){ S.name=v; i=3; step(); return; }
    if(i===3){ if(!/^0\d{9}$/.test(v.replace(/\s/g,''))){ waitBot('Please send a valid SA number (e.g., 0821234567)'); return; } S.phone=v; i=4; step(); return; }
    if(i===4){ if(v.toLowerCase()!=='skip') S.notes=v; i=5; step(); return; }
    if(i===5){ S.contractor = v.toLowerCase(); i=6; step(); return; }
  }
}

// render services with icons
function renderServices(target){
  const wrap=document.createElement('div');
  SERVICE_CATALOG.forEach(g=>{
    const h=document.createElement('div');h.className='section-title';h.textContent=g.cat;wrap.appendChild(h);
    const grid=document.createElement('div');grid.className='grid';
    g.items.forEach(([name,icon])=>{
      const b=document.createElement('button');b.className='bubble'; b.innerHTML=`<span class="icon">${icon}</span><span>${name}</span>`;
      b.onclick=()=>openChat({service:name}); grid.appendChild(b);
    });
    wrap.appendChild(grid);
  });
  target.innerHTML=''; target.appendChild(wrap);
}

// reviews widgets
function starControl(container, initial=0){
  let value=initial;
  container.innerHTML=''; for(let i=1;i<=5;i++){
    const span=document.createElement('span'); span.className='star'+(i<=value?' on':'');
    span.textContent='★'; span.onclick=()=>{ value=i; $$('.star',container).forEach((el,idx)=> el.classList.toggle('on', idx<i)); };
    container.appendChild(span);
  }
  return ()=>value;
}
function submitReview(data){ const r={...data,id:crypto.randomUUID(),ts:Date.now()}; Reviews.add(r); toast('Review submitted — thank you!'); }

const Auth={ login(e,p){ const ok=e&&p&&p.length>=4; if(ok) localStorage.setItem('fixmate_user',JSON.stringify({email:e})); return ok; }, user(){ return JSON.parse(localStorage.getItem('fixmate_user')||'null');}, logout(){ localStorage.removeItem('fixmate_user'); } };
function pretty(ts){ return new Date(ts).toLocaleString(); }

// credits (approved contractors show logos)
function renderCredits(target){
  const approved = Contractors.all().filter(c=> c.token && c.logoData);
  target.innerHTML = approved.length ? approved.map(c=>`<div class="logo-card"><img src="${c.logoData}" alt="${c.biz||c.email} logo"><div class="small">${c.biz||c.email}</div></div>`).join('')
  : '<div class="small">Approved contractor logos will appear here.</div>';
}

document.addEventListener('DOMContentLoaded', mountChat);
