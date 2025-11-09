
const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));
function toast(t,ms=2200){const x=document.createElement('div');x.className='toast';x.textContent=t;document.body.appendChild(x);setTimeout(()=>x.remove(),ms);}

// Data stores (localStorage demo)
const Store = (k,init=[])=>({
  all(){return JSON.parse(localStorage.getItem(k)||JSON.stringify(init));},
  set(v){localStorage.setItem(k,JSON.stringify(v));},
  add(o){const a=this.all();a.unshift(o);this.set(a);}
});
const Leads=Store('fixmate_leads');
const Contractors=Store('fixmate_contractors');
const Reviews=Store('fixmate_reviews');
const Outbox=Store('fixmate_outbox'); // debug: "sent" messages that would go to Telegram

// Contractor helpers
function upsertContractor(c){
  const list = Contractors.all();
  const idx = list.findIndex(x=> (x.email||'').toLowerCase()===(c.email||'').toLowerCase());
  if(idx>=0){ list[idx] = {...list[idx], ...c}; }
  else { list.unshift(c); }
  Contractors.set(list);
}

// Chatbot (available on all pages)
function mountChat(){
  if($('#chat-launcher')) return; // avoid duplicates
  const btn=document.createElement('button');btn.id='chat-launcher';btn.className='btn primary';btn.textContent='Chat';
  btn.onclick=()=>openChat();
  document.body.appendChild(btn);
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
  const S={service:opts.service||'', area:'', name:'', phone:'', notes:''};
  let i=0;
  const steps=[
    ()=>put('bot',`Hi! What service do you need${S.service?` (noted: ${S.service})`:''}?`),
    (m)=>{ if(!S.service) S.service=m; put('bot','What area/suburb are you in?'); i++; },
    (m)=>{ S.area=m; put('bot','Your name?'); i++; },
    (m)=>{ S.name=m; put('bot','Phone (SA 0XXXXXXXXX)?'); i++; },
    (m)=>{ if(!/^0\d{9}$/.test(m.replace(/\s/g,''))){ put('bot','Please send a valid SA number e.g., 0821234567'); return; }
           S.phone=m; put('bot','Any notes for the contractor? (or type "skip")'); i++; },
    (m)=>{ if(m.toLowerCase()!=='skip') S.notes=m;
           const lead={...S,id:crypto.randomUUID(),ts:Date.now(),status:'New',source:'chat'};
           Leads.add(lead); put('bot','Thanks! A contractor will contact you shortly.'); toast('Lead captured');
           // "Send" to Telegram (simulated): push to Outbox with contractor tokens (if any match service)
           const targets = Contractors.all().filter(c=> (c.primary||'').toLowerCase().includes((S.service||'').toLowerCase()) && c.token);
           const payload={lead,targets};
           Outbox.add(payload);
           i++; }
  ];
  steps[0]();
  function send(){ const v=$('#c-in',panel).value.trim(); if(!v) return; $('#c-in',panel).value=''; put('user',v); steps[Math.min(i+1,5)](v); }
}

// Populate services grid
function renderServices(target){
  const wrap=document.createElement('div');
  SERVICE_CATALOG.forEach(g=>{
    const h=document.createElement('div');h.className='section-title';h.textContent=g.cat;wrap.appendChild(h);
    const grid=document.createElement('div');grid.className='grid';
    g.items.forEach(s=>{const b=document.createElement('button');b.className='bubble';b.textContent=s;
      b.onclick=()=>openChat({service:s}); grid.appendChild(b);});
    wrap.appendChild(grid);
  });
  target.innerHTML=''; target.appendChild(wrap);
}

// Reviews
function starControl(container, initial=0){
  let value=initial;
  container.innerHTML=''; for(let i=1;i<=5;i++){
    const span=document.createElement('span'); span.className='star'+(i<=value?' on':'');
    span.textContent='★'; span.onclick=()=>{ value=i; $$('.star',container).forEach((el,idx)=> el.classList.toggle('on', idx<i)); };
    container.appendChild(span);
  }
  return ()=>value;
}
function submitReview(data){
  // data: {contractorEmail, rating, text, clientName, service}
  const r={...data, id:crypto.randomUUID(), ts:Date.now()};
  Reviews.add(r); toast('Review submitted — thank you!');
}

// Auth demo
const Auth={
  login(email,pwd){ const ok=email && pwd && pwd.length>=4; if(ok){localStorage.setItem('fixmate_user', JSON.stringify({email}));} return ok; },
  user(){ return JSON.parse(localStorage.getItem('fixmate_user')||'null');},
  logout(){ localStorage.removeItem('fixmate_user'); }
};

// Utility to format date
function pretty(ts){ return new Date(ts).toLocaleString(); }

// Mount chat on page load
document.addEventListener('DOMContentLoaded', mountChat);
