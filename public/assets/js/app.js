// Study Notebook app — ported from NURS419_Study_Notebook.html.
// Routes: #/                     home (lecture picker)
//         #/<lecture-id>/<tab>   a lecture tab (notes, practice, clinical, cards, qa, map)
'use strict';

const $ = s => document.querySelector(s);
const el = (t, a={}, ...k) => { const e=document.createElement(t); for(const [x,y] of Object.entries(a)){ if(x==='html') e.innerHTML=y; else if(x.startsWith('on')) e.addEventListener(x.slice(2),y); else e.setAttribute(x,y);} for(const c of k) if(c!=null) e.append(c); return e; };
const shuffle = a => { a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };

const TABS = [['notes','Notes'],['practice','Practice Quiz'],['clinical','Clinical Cases'],['cards','Flashcards'],['qa','Asked in Class'],['map','Concept Map']];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];
const fmtDate = iso => { const [y,m,d]=iso.split('-').map(Number); return `${MONTHS[m-1]} ${d}, ${y}`; };

let INDEX = null;          // lectures/index.json
let L = null;              // current lecture (lecture.json + num)
const cache = new Map();   // id -> {lecture, notes, map}

// ---------- loading ----------
async function getJSON(url){ const r=await fetch(url,{credentials:'same-origin'}); if(r.status===401){ location.href='/login?next='+encodeURIComponent(location.pathname+location.hash); throw new Error('auth'); } if(!r.ok) throw new Error(url+' '+r.status); return r.json(); }
async function getText(url){ const r=await fetch(url,{credentials:'same-origin'}); if(r.status===401){ location.href='/login?next='+encodeURIComponent(location.pathname+location.hash); throw new Error('auth'); } if(!r.ok) throw new Error(url+' '+r.status); return r.text(); }
async function loadIndex(){ if(!INDEX) INDEX=await getJSON('lectures/index.json'); return INDEX; }
async function loadLecture(id){
  if(!cache.has(id)) cache.set(id,{});
  const c=cache.get(id);
  if(!c.lecture){
    const idx=await loadIndex(); const entry=idx.lectures.find(x=>x.id===id);
    if(!entry) throw new Error('unknown lecture '+id);
    c.lecture={...await getJSON(`lectures/${id}/lecture.json`), num:entry.num};
  }
  return c.lecture;
}
async function loadPart(id,part,file){ const c=cache.get(id); if(c[part]==null) c[part]=await getText(`lectures/${id}/${file}`); return c[part]; }

// ---------- progress sync (local-first; see netlify/functions/progress.mjs) ----------
const Sync = (() => {
  const recs = new Map();                        // lectureId -> record
  const empty = () => ({ v:1, items:{}, sessions:{} });
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const lsSet = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const LK = id => 'pp:progress:'+id, DK = 'pp:dirty';
  let dirty = lsGet(DK) || {};                   // lectureId -> partial record not yet on the server
  let timer = null, delay = 0;
  function merge(a,b){ const o=empty(); for(const part of ['items','sessions']){ const A=a?.[part]||{}, B=b?.[part]||{}; for(const k of new Set([...Object.keys(A),...Object.keys(B)])){ const x=A[k], y=B[k]; o[part][k]=!x?y:!y?x:(y.t||0)>(x.t||0)?y:x; } } return o; }
  function status(pending){ const e=$('#sync'); if(e) e.hidden=!pending; }
  function rec(id){ if(!recs.has(id)) recs.set(id, merge(lsGet(LK(id)), dirty[id])); return recs.get(id); }
  async function pull(id){
    try { const server=await getJSON('/api/progress/'+encodeURIComponent(id)); recs.set(id, merge(merge(server, rec(id)), dirty[id])); lsSet(LK(id), recs.get(id)); }
    catch(e){ if(e.message==='auth') throw e; }
    return rec(id);
  }
  async function pullAll(){
    try { const all=await getJSON('/api/progress'); for(const [id,r] of Object.entries(all)){ recs.set(id, merge(merge(r, rec(id)), dirty[id])); lsSet(LK(id), recs.get(id)); } }
    catch(e){ if(e.message==='auth') throw e; }
  }
  function put(id, part, key, val){
    const v={...val, t:Date.now()}; const r=rec(id); r[part][key]=v; lsSet(LK(id), r);
    (dirty[id] ||= empty())[part][key]=v; lsSet(DK, dirty); schedule(2000);
  }
  function schedule(ms){ clearTimeout(timer); timer=setTimeout(flush, ms); }
  async function flush(keepalive=false){
    for(const [id,part] of Object.entries(dirty)){
      delete dirty[id];                          // in flight; new changes start a fresh partial
      try{
        const r=await fetch('/api/progress/'+encodeURIComponent(id),{method:'PUT',credentials:'same-origin',keepalive,headers:{'content-type':'application/json'},body:JSON.stringify(part)});
        if(!r.ok) throw new Error('sync '+r.status);
        const merged=await r.json(); recs.set(id, merge(merged, rec(id)));
        lsSet(LK(id), recs.get(id));
      }catch(e){ dirty[id]=merge(part, dirty[id]); lsSet(DK, dirty); status(true); delay=Math.min(60000, (delay||2500)*2); return schedule(delay); }
    }
    lsSet(DK, dirty); delay=0; status(Object.keys(dirty).length>0);
  }
  window.addEventListener('online', ()=>flush());
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden' && Object.keys(dirty).length) flush(true); });
  if(Object.keys(dirty).length){ status(true); schedule(500); }
  return { rec, pull, pullAll, put, item:(id,k)=>rec(id).items[k], session:(id,k)=>{ const s=rec(id).sessions[k]; return s&&!s.fin?s:null; } };
})();

function loading(){ $('main').innerHTML=''; $('main').append(el('section',{class:'page'}, el('p',{class:'lead center',html:'opening the notebook…'}))); }
function failed(retry){
  const m=$('main'); m.innerHTML='';
  m.append(el('section',{class:'page'},
    el('h2',{class:'banner pink',style:'background:var(--pink);color:var(--pink-d)',html:'couldn’t load this page'}),
    el('p',{html:'Check the connection and try again.'}),
    el('div',{class:'qnav',style:'justify-content:flex-start'}, el('button',{class:'btn primary',html:'Try again',onclick:retry}), el('button',{class:'btn ghost',html:'Home',onclick:()=>go('#/')}))));
}

// ---------- routing ----------
const go = h => { if(location.hash===h) route(); else location.hash=h; };
async function route(){
  const [id,tab]=location.hash.replace(/^#\/?/,'').split('/');
  try{
    if(!id){ L=null; loading(); await Promise.all([loadIndex(), Sync.pullAll()]); return home(); }
    const t=TABS.some(([k])=>k===tab)?tab:'notes';
    if(!L||L.id!==id){ loading(); [L]=await Promise.all([loadLecture(id), Sync.pull(id)]); }
    $('#lec').textContent=`${L.num} · ${L.title}`;
    $('#tabs').classList.remove('hidden');
    document.querySelectorAll('#tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.t===t));
    document.title=`${L.title} · ${TABS.find(([k])=>k===t)[1]} · Study Notebook`;
    window.scrollTo(0,0);
    await ({notes,practice,clinical,cards,qa,map})[t]();
  }catch(e){ if(e.message!=='auth'){ console.error(e); failed(route); } }
}
function show(t){ go(`#/${L.id}/${t}`); }

// ---------- home ----------
function home(){
  document.title='Study Notebook';
  $('#lec').textContent=''; $('#tabs').classList.add('hidden');
  const m=$('main'); m.innerHTML='';
  const pg=el('section',{class:'page home'});
  pg.append(el('div',{class:'course',html:INDEX.course}), el('h1',{html:'Study<br>Notebook'}));
  if(!INDEX.lectures.length){ pg.append(el('p',{class:'lead',html:'no lectures yet ✎'})); m.append(pg); return; }
  pg.append(el('p',{class:'lead',html:'pick a lecture ✎'}));
  INDEX.lectures.forEach(l=>{
    const b=el('button',{class:'lecture-card',onclick:()=>go(`#/${l.id}/notes`)});
    b.append(el('div',{class:'t',html:`${l.num} · ${l.title}`}), el('div',{class:'m',html:`${fmtDate(l.date)} · ${l.instructor} · ${l.questions} questions · ${l.cards} cards`}));
    const qs=Object.entries(Sync.rec(l.id).items).filter(([k])=>!k.startsWith('fc-'));
    if(qs.length){ const miss=qs.filter(([,v])=>v.last===0).length; b.append(el('div',{class:'m',html:`<b>${qs.length} / ${l.questions} answered</b> · ${miss ? miss+' to revisit' : 'nothing to revisit ✓'}`})); }
    pg.append(b);
  });
  m.append(pg);
}

// ---------- notes ----------
async function notes(){ const h=await loadPart(L.id,'notes','notes.html'); $('main').innerHTML=h; }

// ---------- quiz engine ----------
function parseAns(a){ return a.split(',').map(s=>s.trim()); }
function runQuiz(items, opts, resume){
  if(!items.length) return;
  const m=$('main'); m.innerHTML='';
  let i=resume?.i||0, sel=[], answered=false, correct=resume?.correct||0, missed=resume?missed0(resume.missed):[];
  function missed0(ids){ const set=new Set(ids); return items.filter(q=>set.has(q.id)); }
  const save=()=>Sync.put(L.id,'sessions',opts.key,{ids:items.map(q=>q.id),i,correct,missed:missed.map(q=>q.id)});
  const wrap=el('div'); m.append(wrap);
  function render(){
    wrap.innerHTML='';
    if(i>=items.length){ return finish(); }
    const q=items[i];
    const card=el('div',{class:'qcard'});
    const pr=el('div',{class:'prog'}); pr.append(el('i',{style:`width:${i/items.length*100}%`}));
    wrap.append(pr);
    if(q.scenario && (i===0 || items[i-1].scenario!==q.scenario)){
      const s=q.scenario; wrap.append(el('div',{class:'scen'}, el('div',{class:'st',html:s.title}), el('div',{class:'setting',html:s.setting}), el('div',{html:s.text.replace(/\n/g,'<br>')})));
    } else if(q.scenario){ wrap.append(el('details',{class:'scen'}, el('summary',{html:`<b>${q.scenario.title}</b> — show scenario`}), el('div',{html:q.scenario.text.replace(/\n/g,'<br>')}))); }
    const typeLabel = q.type==='sata'?'select all that apply':q.type==='order'?'tap the options in priority order':(q.tier?`tier ${q.tier}`:'');
    card.append(el('div',{class:'qmeta'}, el('span',{html:`${i+1} / ${items.length}`}), el('span',{html:typeLabel})));
    card.append(el('div',{class:'qstem',html:q.stem}));
    q.options.forEach((o,k)=>{
      const letter='ABCDEF'[k];
      const b=el('button',{class:'opt','aria-pressed':'false',onclick:()=>pick(letter,b)});
      b.append(el('span',{class:'l',html:letter}), el('span',{html:o}));
      if(q.type==='order') b.append(el('span',{class:'n'}));
      card.append(b);
    });
    const check=el('button',{class:'btn primary',html:'Check',onclick:grade}); check.id='check';
    const nav=el('div',{class:'qnav'}); nav.append(el('button',{class:'btn ghost',html:'← Quit',onclick:opts.back}), check); card.append(nav);
    wrap.append(card); sel=[]; answered=false;
    function pick(letter,b){
      if(answered) return;
      if(q.type==='mc'){ sel=[letter]; card.querySelectorAll('.opt').forEach(x=>x.setAttribute('aria-pressed','false')); b.setAttribute('aria-pressed','true'); }
      else if(q.type==='sata'){ if(sel.includes(letter)){sel=sel.filter(x=>x!==letter); b.setAttribute('aria-pressed','false');} else {sel.push(letter); b.setAttribute('aria-pressed','true');} }
      else { if(sel.includes(letter)) return; sel.push(letter); b.setAttribute('aria-pressed','true'); b.querySelector('.n').textContent=sel.length; }
    }
    function grade(){
      if(!sel.length||answered) return; answered=true;
      const ans=parseAns(q.answer);
      const ok = q.type==='order' ? sel.join()===ans.join() : (sel.length===ans.length && ans.every(a=>sel.includes(a)));
      card.querySelectorAll('.opt').forEach(b=>{ const l=b.querySelector('.l').textContent; b.setAttribute('aria-pressed','false');
        if(q.type==='order'){ const pos=ans.indexOf(l); b.querySelector('.n').textContent=`${sel.indexOf(l)+1} → should be ${pos+1}`; b.classList.add(sel.indexOf(l)===pos?'correct':'wrong'); }
        else if(ans.includes(l)) b.classList.add(sel.includes(l)?'correct':'missed'); else if(sel.includes(l)) b.classList.add('wrong'); });
      if(ok) correct++; else missed.push(q);
      const prev=Sync.item(L.id,q.id)||{};
      Sync.put(L.id,'items',q.id,{a:(prev.a||0)+1,c:(prev.c||0)+(ok?1:0),last:ok?1:0});
      i++; save(); i--;
      const v=el('div',{class:'verdict '+(ok?'ok':'no'),role:'status',html:ok?'That\'s it.':'Not quite — answer: '+q.answer});
      card.append(v, el('div',{class:'rat',html:q.rationale}));
      const next=el('button',{class:'btn primary',html:i===items.length-1?'See score':'Next →',onclick:()=>{i++;render();}});
      check.replaceWith(next); next.focus();
    }
  }
  function finish(){
    Sync.put(L.id,'sessions',opts.key,{fin:1});
    const s=el('div',{class:'qcard score'});
    s.append(el('div',{class:'big-n',html:`${correct} / ${items.length}`}), el('div',{class:'lead',html:correct===items.length?'clean sweep ✎':`${Math.round(correct/items.length*100)}% — ${missed.length} to revisit`}));
    const nav=el('div',{class:'qnav',style:'justify-content:center'});
    if(missed.length) nav.append(el('button',{class:'btn primary',html:'Retry missed only',onclick:()=>runQuiz(missed,opts)}));
    nav.append(el('button',{class:'btn',html:'Restart',onclick:()=>runQuiz(opts.all||items,opts)}), el('button',{class:'btn ghost',html:'Back',onclick:opts.back}));
    s.append(nav); wrap.append(s);
  }
  render();
}
function clinicalItems(){ const all=[]; L.clinical.forEach(s=>s.questions.forEach(q=>all.push({...q,scenario:s}))); return all; }
function done(items){ const n=items.filter(q=>Sync.item(L.id,q.id)).length; return n?` · ${n} answered`:''; }
// "Resume" cards for unfinished quiz sessions whose key starts with prefix.
function resumeCards(pg, prefix, label, back){
  const byId=new Map([...L.practice, ...clinicalItems()].map(q=>[q.id,q]));
  for(const [key,s] of Object.entries(Sync.rec(L.id).sessions)){
    if(s.fin || !key.startsWith(prefix+':')) continue;
    const items=s.ids.map(x=>byId.get(x)).filter(Boolean);
    if(!items.length || s.i>=items.length) continue;
    pg.append(el('button',{class:'lecture-card',style:'background:var(--yel)',onclick:()=>runQuiz(items,{back,all:items,key},s)}, el('div',{class:'t',html:`Resume · ${label(key)||'quiz'}`}), el('div',{class:'m',html:`question ${s.i+1} of ${items.length} · ${s.correct} right so far`})));
  }
}
function practice(){
  const m=$('main'); m.innerHTML='';
  const pg=el('section',{class:'page'});
  pg.append(el('h2',{class:'banner yel',html:'practice quiz'}));
  pg.append(el('p',{html:'One question at a time, immediate feedback with the rationale, then a score. Missed items can be retried on their own. Order is shuffled each run.'}));
  const back=()=>practice();
  const tiers=[['all',`All ${L.practice.length}`], ...Object.entries(L.tiers).map(([t,name])=>[t,`Tier ${t} · ${name}`])];
  resumeCards(pg, 'practice', key=>key==='practice:missed'?'Missed last time':(tiers.find(([t])=>'practice:'+t===key)||[])[1], back);
  const miss=L.practice.filter(q=>Sync.item(L.id,q.id)?.last===0);
  if(miss.length) pg.append(el('button',{class:'lecture-card',onclick:()=>runQuiz(shuffle(miss),{back,all:miss,key:'practice:missed'})}, el('div',{class:'t',html:'Missed last time'}), el('div',{class:'m',html:`${miss.length} questions to revisit`})));
  tiers.forEach(([t,lab])=>{ const items=L.practice.filter(q=>t==='all'||q.tier===t); if(!items.length) return; pg.append(el('button',{class:'lecture-card',onclick:()=>runQuiz(shuffle(items),{back,all:items,key:'practice:'+t})}, el('div',{class:'t',html:lab}), el('div',{class:'m',html:`${items.length} questions${done(items)}`}))); });
  m.append(pg);
}
function clinical(){
  const m=$('main'); m.innerHTML='';
  const pg=el('section',{class:'page'});
  pg.append(el('h2',{class:'banner pink',style:'background:var(--pink);color:var(--pink-d)',html:'clinical cases'}));
  pg.append(el('p',{html:'Unfolding hospital scenarios. Questions stay in order inside each scenario (the cases build). Includes select-all and priority-order items.'}));
  const back=()=>clinical();
  const all=clinicalItems();
  resumeCards(pg, 'clinical', key=>key==='clinical:all'?'All scenarios':key==='clinical:missed'?'Missed last time':L.clinical.find(s=>'clinical:'+s.id===key)?.title, back);
  const miss=all.filter(q=>Sync.item(L.id,q.id)?.last===0);
  if(miss.length) pg.append(el('button',{class:'lecture-card',onclick:()=>runQuiz(miss,{back,all:miss,key:'clinical:missed'})}, el('div',{class:'t',html:'Missed last time'}), el('div',{class:'m',html:`${miss.length} questions to revisit`})));
  pg.append(el('button',{class:'lecture-card',onclick:()=>runQuiz(all,{back,all,key:'clinical:all'})}, el('div',{class:'t',html:'All scenarios'}), el('div',{class:'m',html:`${all.length} questions · ${L.clinical.length} scenarios${done(all)}`})));
  L.clinical.forEach(s=>{ const items=s.questions.map(q=>({...q,scenario:s})); pg.append(el('button',{class:'lecture-card',onclick:()=>runQuiz(items,{back,all:items,key:'clinical:'+s.id})}, el('div',{class:'t',html:s.title}), el('div',{class:'m',html:`${s.setting} · ${items.length} questions${done(items)}`}))); });
  m.append(pg);
}

// ---------- flashcards ----------
function cards(){
  const m=$('main'); m.innerHTML='';
  const pg=el('section',{class:'page'});
  pg.append(el('h2',{class:'banner mint',html:'flashcards'}));
  pg.append(el('p',{html:'Tap a card to flip. <b>Again</b> puts it back a few cards later; <b>Got it</b> retires it for this round. Pick tags to narrow the deck.'}));
  const tags=[...new Set(L.cards.map(c=>c.tag))]; let active=new Set(tags);
  const chips=el('div',{class:'chips'});
  tags.forEach(t=>chips.append(el('button',{class:'chip','aria-pressed':'true',onclick:e=>{ if(active.has(t)) active.delete(t); else active.add(t); e.currentTarget.setAttribute('aria-pressed',active.has(t)); count(); }},t)));
  const cnt=el('div',{class:'m',role:'status',style:'font-family:Kalam,cursive;color:#666'});
  function count(){ cnt.textContent=`${L.cards.filter(c=>active.has(c.tag)).length} cards selected`; }
  count();
  const s=Sync.session(L.id,'cards:deck'), byId=new Map(L.cards.map(c=>[c.id,c]));
  if(s){ const q=s.queue.map(x=>byId.get(x)).filter(Boolean); if(q.length) pg.append(el('button',{class:'lecture-card',style:'background:var(--yel)',onclick:()=>runCards(s.deck.map(x=>byId.get(x)).filter(Boolean),s)}, el('div',{class:'t',html:'Resume deck'}), el('div',{class:'m',html:`${s.done} of ${s.total} cleared · ${q.length} left`}))); }
  const again=L.cards.filter(c=>Sync.item(L.id,c.id)?.s==='again');
  if(again.length) pg.append(el('button',{class:'lecture-card',onclick:()=>runCards(shuffle(again))}, el('div',{class:'t',html:'Marked “Again” last time'}), el('div',{class:'m',html:`${again.length} cards`})));
  pg.append(chips,cnt, el('div',{class:'qnav',style:'justify-content:flex-start'}, el('button',{class:'btn primary',html:'Start',onclick:()=>runCards(L.cards.filter(c=>active.has(c.tag)))}), el('button',{class:'btn',html:'Start shuffled',onclick:()=>runCards(shuffle(L.cards.filter(c=>active.has(c.tag))))})));
  m.append(pg);
}
function runCards(deck, resume){
  if(!deck.length) return;
  const m=$('main'); m.innerHTML='';
  const byId=new Map(L.cards.map(c=>[c.id,c]));
  let queue=resume?resume.queue.map(x=>byId.get(x)).filter(Boolean):deck.slice(), done=resume?.done||0, total=resume?.total||deck.length, again=resume?.again||0;
  const save=()=>Sync.put(L.id,'sessions','cards:deck',queue.length?{deck:deck.map(c=>c.id),queue:queue.map(c=>c.id),done,total,again}:{fin:1});
  const wrap=el('section',{class:'page'}); m.append(wrap);
  function render(){
    wrap.innerHTML='';
    const pr=el('div',{class:'prog'}); pr.append(el('i',{style:`width:${done/total*100}%`})); wrap.append(pr);
    if(!queue.length){ wrap.append(el('div',{class:'score'}, el('div',{class:'big-n',html:`${total}`}), el('div',{class:'lead',html:`cards cleared · ${again} sent back for another look`}), el('div',{class:'qnav',style:'justify-content:center'}, el('button',{class:'btn primary',html:'Again',onclick:()=>runCards(deck)}), el('button',{class:'btn ghost',html:'Back',onclick:()=>cards()})))); return; }
    const c=queue[0];
    wrap.append(el('div',{class:'qmeta'}, el('span',{html:`${done} of ${total} cleared · ${queue.length} left`}), el('button',{class:'btn ghost',style:'min-height:36px;padding:2px 10px',html:'Quit',onclick:()=>cards()})));
    const fc=el('button',{class:'fc','aria-label':'flashcard, tap to flip',onclick:()=>{fc.classList.toggle('flipped'); btns.querySelectorAll('button').forEach(b=>b.disabled=false);}});
    fc.append(el('div',{class:'face front'}, el('span',{class:'lab',html:'Q'}), el('div',{html:c.front}), el('span',{class:'tag',html:c.tag})), el('div',{class:'face back'}, el('span',{class:'lab',html:'A'}), el('div',{html:c.back})));
    const fw=el('div',{class:'fc-wrap'}); fw.append(fc); wrap.append(fw);
    const btns=el('div',{class:'fc-btns'});
    btns.append(el('button',{class:'btn again',disabled:'',html:'Again ↺',onclick:()=>{ queue.shift(); again++; queue.splice(Math.min(3,queue.length),0,c); const p=Sync.item(L.id,c.id)||{}; Sync.put(L.id,'items',c.id,{s:'again',n:(p.n||0)+1}); save(); render(); }}), el('button',{class:'btn got',disabled:'',html:'Got it ✓',onclick:()=>{ queue.shift(); done++; const p=Sync.item(L.id,c.id)||{}; Sync.put(L.id,'items',c.id,{s:'got',n:p.n||0}); save(); render(); }}));
    wrap.append(btns, el('p',{class:'tiny',style:'text-align:center;margin-top:8px',html:'flip first, then rate yourself — that\'s the retrieval step'}));
    fc.focus();
  }
  render();
}

// ---------- asked in class ----------
function qa(){
  const m=$('main'); m.innerHTML='';
  const pg=el('section',{class:'page'});
  pg.append(el('h2',{class:'banner',style:'background:var(--pink);color:var(--pink-d)',html:'every question asked in class'}));
  pg.append(el('p',{html:'In lecture order. Answer out loud <i>before</i> tapping — the instructor\'s questions are the best predictor of the exam.'}));
  pg.append(el('div',{class:'qnav',style:'justify-content:flex-start'}, el('button',{class:'btn ghost',html:'Collapse all',onclick:()=>pg.querySelectorAll('details').forEach(d=>d.open=false)})));
  L.qa.forEach(x=>pg.append(el('details',{class:'qa-item'}, el('summary',{html:x.q}), el('div',{class:'ans',html:x.a}))));
  m.append(pg);
}

// ---------- map ----------
async function map(){
  const svg=await loadPart(L.id,'map','map.svg');
  const m=$('main'); m.innerHTML='';
  const pg=el('section',{class:'page'});
  pg.append(el('h2',{class:'banner mint',html:'concept map'}));
  const w=el('div',{class:'map-wrap',html:svg});
  let zoom=1400;
  const z=el('div',{class:'qnav',style:'justify-content:flex-start'}, el('button',{class:'btn','aria-label':'zoom out',html:'−',onclick:()=>{zoom=Math.max(900,zoom-250);w.style.setProperty('--mapw',zoom+'px');}}), el('button',{class:'btn','aria-label':'zoom in',html:'+',onclick:()=>{zoom=Math.min(3200,zoom+250);w.style.setProperty('--mapw',zoom+'px');}}), el('span',{class:'tiny',style:'align-self:center',html:'scroll to pan · pinch to zoom'}));
  pg.append(z,w); m.append(pg);
}

// ---------- boot ----------
$('#brand').addEventListener('click',()=>go('#/'));
TABS.forEach(([t,lab])=>$('#tabs').append(el('button',{'data-t':t,role:'tab','aria-selected':'false',onclick:()=>show(t)},lab)));
window.addEventListener('hashchange',route);
route();
