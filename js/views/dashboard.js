import { $, esc, num, dt, fmtD, fmtP, dayKey, WD, WDs, wdIdx, band, findRow, cell } from "../utils.js";
import { BAND } from "../config.js";
import { S } from "../state.js";
import { loadFeed } from "../feed.js";
import { calendarDays, wdStats } from "../data/calendar.js";
let selCity=null;
/* ============ RENDER: head ============ */
function renderHead(){
  const h=S.dash.head; const td=dt(h["Цільова дата"]);
  const phase=h["Фаза"]||"—"; const cap=h.capture||"";
  const pc = /FINAL/.test(phase)?"good": /PREVIEW/.test(phase)?"warn":"";
  const wasOpen=$("#factsDrawer")&&$("#factsDrawer").classList.contains("open");
  $("#nightHead").innerHTML=`
    <div class="when">Ніч ${esc(h["Цільова ніч"]||"")}
      <button class="factsBtn" id="factsBtn" type="button" aria-expanded="${wasOpen?"true":"false"}" aria-controls="factsDrawer">Деталі ночі <span class="dtoggle">▾</span></button>
      <small>цільова дата після 00:00 — ${esc(fmtD(td))}, ${esc((h["День"]||"").toLowerCase())}</small>
    </div>
    <div class="facts-drawer${wasOpen?" open":""}" id="factsDrawer"><div><div class="facts">
      <span>Фаза <span class="badge ${pc}">${esc(phase)}</span></span>
      <span>Знімок <span class="badge ${/WAIT/.test(cap)?"warn":""}">${esc(cap||"—")}</span></span>
      <span>Версія моделі <b>${esc(h["Версія"]||"—")}</b></span>
      <span>Аудит закрито по <b>${esc(h["Audit cutoff"]||"—")}</b></span>
    </div></div></div>`;
  $("#factsBtn").setAttribute("aria-expanded",wasOpen?"true":"false");
  $("#factsBtn").addEventListener("click",()=>{
    const open=$("#factsDrawer").classList.toggle("open");
    $("#factsBtn").setAttribute("aria-expanded",open?"true":"false");
  });
}

/* ============ RENDER: hero (at-a-glance summary) ============ */
function renderHero(){
  const active=S.dash.cities.filter(c=>c.base!=null).sort((a,b)=>b.base-a.base);
  if(!active.length){ $("#hero").innerHTML='<p class="note">Немає оцінок для цієї ночі.</p>'; return; }
  const top=active[0];
  const level = top.base>=BAND.high? "Підвищена загроза" : top.base>=BAND.mid? "Помірна загроза" : "Низька загроза";
  const col = band(top.base);
  const h=S.dash.head;
  $("#hero").innerHTML=`<div class="hero panel" style="border-color:${col}">
    <div class="hero-stat">
      <div class="hero-level" style="color:${col};border-color:${col}">${esc(level)}</div>
      <div class="hero-city">${esc(top.city)} <b style="color:${col}">${fmtP(top.base)}</b></div>
    </div>
    <p class="hero-note">Найвищий орієнтовний показник на ніч ${esc(h["Цільова ніч"]||"")} — за історичними даними. Це не прогноз конкретної атаки, а довгостроковий фон ризику. Пояснення нижче.</p>
  </div>`;
}

/* ============ RENDER: plain-language summary (for non-analysts) ============ */
function levelWord(v){ return v>=BAND.high?"Підвищений":v>=BAND.mid?"Помірний":"Низький"; }
function postureNote(v){
  if(v>=BAND.high) return "Історично підвищений показник для цієї ночі. Варто заздалегідь продумати шлях до укриття й уважніше стежити за офіційними тривогами.";
  if(v>=BAND.mid) return "Помірний історичний показник. Слідкуйте за офіційними попередженнями трохи уважніше, ніж зазвичай.";
  return "Історично спокійний показник для цієї ночі й дня тижня. Це не скасовує звичайну обережність.";
}
function opsRow(label){ return S.ops&&S.ops.rows.find(r=>r.f===label); }
function opsVal(label,cityName){
  const r=opsRow(label); if(!r||!S.ops) return "";
  const idx=S.ops.cities.indexOf(cityName); if(idx<0) return "";
  return (r.vals[idx]||"").trim();
}
function activityPhrase(v24,v72){
  const dirWord=v=>v==="Підвищує"?"підвищує ризик":v==="Знижує"?"знижує ризик":v==="Нейтрально"?"нейтральна":v;
  const parts=[]; if(v24) parts.push("24 год — "+dirWord(v24)); if(v72) parts.push("72 год — "+dirWord(v72));
  return parts.length? "Активність зафіксована: "+parts.join(", ")+"." : "Активність: не зафіксовано.";
}
function renderPlainSummary(){
  const active=S.dash.cities.filter(c=>c.base!=null).sort((a,b)=>b.base-a.base);
  if(!active.length){ $("#plainSummary").innerHTML='<p class="note" style="padding:14px">Немає оцінок для цієї ночі.</p>'; return; }
  $("#plainSummary").innerHTML=active.map(c=>{
    const col=band(c.base);
    const pu=opsVal("Кількість споряджених ПУ",c.city);
    const act24=opsVal("Активність 24 години",c.city), act72=opsVal("Активність 72 години",c.city);
    const comment=opsVal("Коментар / рішення на ніч",c.city);
    const extra=[];
    if(pu!=="") extra.push(`Споряджено <b>${esc(pu)}</b> установок, що потенційно можуть бути задіяні по місту.`);
    extra.push(esc(activityPhrase(act24,act72)));
    return `<div class="plain-city" data-city="${esc(c.city)}" tabindex="0" role="button" aria-label="${esc(c.city)}: детальніше">
      <div class="pc-name">${esc(c.city)}</div>
      <div class="pc-level" style="color:${col};border-color:${col}">${levelWord(c.base)} · ${fmtP(c.base)}</div>
      <div class="pc-note">${esc(postureNote(c.base))}</div>
      <div class="pc-extra">${extra.join(" ")}${comment?` <span class="pc-comment">«${esc(comment)}»</span>`:""}</div>
    </div>`;
  }).join("");
  document.querySelectorAll(".plain-city[data-city]").forEach(el=>{
    const go=()=>{ selCity=el.dataset.city; showView("city"); };
    el.addEventListener("click",go); el.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){e.preventDefault();go();} });
  });
}
function renderOpsPlain(){
  const o=S.ops, box=$("#opsPlain");
  if(!o){ box.innerHTML=""; return; }
  const manualStart=o.rows.findIndex(r=>/Доставка/.test(r.f));
  const manual=o.rows.slice(manualStart>=0?manualStart:0).filter(r=>!/Коментар|Робочий/.test(r.f));
  const activeNames=new Set(S.dash.cities.filter(c=>c.base!=null).map(c=>c.city));
  const flagged=[];
  manual.forEach(r=>{
    const cities=[];
    r.vals.forEach((v,i)=>{ if(v&&/Підвищує|Є|Зафіксовано/.test(v)) cities.push(o.cities[i]); });
    if(cities.length){
      const coversAllActive=[...activeNames].every(n=>cities.includes(n));
      flagged.push({f:r.f,cities,universal:coversAllActive});
    }
  });
  const line=x=> x.universal
    ? `${esc(x.f)} — фонова умова по всій географії спостереження`
    : `${esc(x.f)} — ${x.cities.map(esc).join(", ")}`;
  box.innerHTML = flagged.length
    ? `<div class="ops-plain"><b>Додаткові оперативні фактори, що варто врахувати:</b><ul>${flagged.map(x=>`<li>${line(x)}</li>`).join("")}</ul></div>`
    : `<div class="ops-plain"><b>Додаткові оперативні фактори:</b> <span class="none">на зараз нічого, що явно підвищує ризик, не зафіксовано.</span></div>`;
}

/* ============ RENDER: ladder ============ */
function renderLadder(){
  const L=S.dash.cities; const td=dt(S.dash.head["Цільова дата"]);
  const active=L.filter(c=>c.base!=null).sort((a,b)=>b.base-a.base);
  const off=L.filter(c=>c.base==null);
  const maxV=Math.max(0.1,...active.map(c=>Math.max(c.base,c.r56||0,(num((c.ci.split("–")[1]||""))||0))));
  const top=Math.ceil(maxV*10)/10; S.scaleTop=top;
  const ticks=[]; for(let v=0;v<=top+1e-9;v+=top<=0.3?0.05:0.1) ticks.push(v);
  $("#axisScale").innerHTML=`<svg viewBox="0 0 1000 14" preserveAspectRatio="none" style="width:100%;height:14px;overflow:visible">${ticks.map(v=>`<text x="${v/top*1000}" y="11" font-size="11" fill="currentColor" text-anchor="${v===0?"start":v>=top-1e-9?"end":"middle"}" style="font-size:11px">${Math.round(v*100)}%</text>`).join("")}</svg>`;
  const x=v=>Math.max(0,Math.min(1,v/top))*1000;
  const rung=c=>{
    const [lo,hi]=(c.ci||"").split("–").map(num);
    const days = c.last&&td? Math.round((td-c.last)/864e5) : null;
    const match = c.domMatch==="Так";
    return `<div class="rung" tabindex="0" data-city="${esc(c.city)}" role="button" aria-label="${esc(c.city)}: ${fmtP(c.base)}">
      <div class="city">${esc(c.city)}<small>${days!=null?`остання атака ${days} дн. тому`:"атак не зафіксовано"}</small></div>
      <div class="pct" style="color:${band(c.base)}">${fmtP(c.base)}</div>
      <div class="scale"><svg viewBox="0 0 1000 46" preserveAspectRatio="none">
        ${ticks.map(v=>`<line x1="${x(v)}" x2="${x(v)}" y1="4" y2="42" stroke="var(--soft)" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join("")}
        <rect x="0" y="16" width="${x(c.base)}" height="14" rx="2" fill="${band(c.base)}" opacity=".9"/>
        ${lo!=null&&hi!=null?`<line x1="${x(lo)}" x2="${x(hi)}" y1="40" y2="40" stroke="var(--muted)" stroke-width="2" vector-effect="non-scaling-stroke"/>
          <line x1="${x(lo)}" x2="${x(lo)}" y1="36" y2="44" stroke="var(--muted)" stroke-width="2" vector-effect="non-scaling-stroke"/>
          <line x1="${x(hi)}" x2="${x(hi)}" y1="36" y2="44" stroke="var(--muted)" stroke-width="2" vector-effect="non-scaling-stroke"/>`:""}
        ${c.r365!=null?`<line x1="${x(c.r365)}" x2="${x(c.r365)}" y1="11" y2="35" stroke="var(--ink)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`:""}
        ${c.r56!=null?`<path d="M${x(c.r56)-9},2 L${x(c.r56)+9},2 L${x(c.r56)},13 Z" fill="var(--high)"/>`:""}
      </svg></div>
      <div class="meta">R56 <b>${fmtP(c.r56)}</b> · R90 ${fmtP(c.r90)} · R180 ${fmtP(c.r180)} · R365 <b>${fmtP(c.r365)}</b><br>
        Домінантний день: <b>${esc(c.dom||"—")}</b>${c.domStr!=null&&c.domStr>0?` (${fmtP(c.domStr,0)})`:""}${match?` <span class="badge bad">= цільовий</span>`:""}${c.shift&&c.shift!=="—"?` · зсув: ${esc(c.shift)}`:""}<br>
        Support ${esc(c.support||"—")} · ${esc(c.evidence)}</div>
    </div>`;
  };
  $("#ladder").innerHTML = active.map(rung).join("") + off.map(c=>`<div class="rung off"><div class="city">${esc(c.city)}<small>${c.last?"остання атака "+fmtD(c.last):"онбординг"}</small></div>
      <div class="pct">не рахується</div><div class="meta" style="grid-column:span 2">${esc(c.dom)} — ${esc(c.evidence)}. Місто додане до спостереження, історія за 365 днів ще добирається.</div></div>`).join("");
  $("#bandNote").textContent=`Кольори: < ${BAND.mid*100}% / ${BAND.mid*100}–${BAND.high*100}% / ≥ ${BAND.high*100}% — візуальні пороги дашборду, не частина моделі`;
  document.querySelectorAll(".rung[data-city]").forEach(el=>{
    const go=()=>{ selCity=el.dataset.city; showView("city"); };
    el.addEventListener("click",go); el.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){e.preventDefault();go();} });
  });
}

/* ============ RENDER: ops ============ */
function renderOps(){
  const o=S.ops; if(!o?.rows.length){ $("#opsTbl").innerHTML='<p class="note" style="padding:14px">Немає даних оперативної оцінки.</p>'; return; }
  const manualStart=o.rows.findIndex(r=>/Доставка/.test(r.f));
  const manual=o.rows.slice(manualStart>=0?manualStart:0).filter(r=>!/Коментар|Робочий/.test(r.f));
  const filled=o.cities.map((c,ci)=>manual.filter(r=>r.vals[ci]).length);
  const manualSet=new Set(manual.map(r=>r.f));
  const fmtV=(v,f)=>{ if(!v) return '<span class="na">Н/Д</span>';
    if(/%$/.test(v)) return `<b>${esc(v)}</b>`;
    if(!manualSet.has(f)) return esc(v);
    const col=/Підвищує|Є|Зафіксовано/.test(v)?"var(--high)":/Знижує|Немає|Не зафіксовано/.test(v)?"var(--ok)":"";
    return col?`<span style="color:${col};font-weight:600">${esc(v)}</span>`:esc(v); };
  $("#opsTbl").innerHTML=`<table class="tbl"><thead><tr><th>Фактор</th>${o.cities.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>
    ${o.rows.map(r=>`<tr><td title="${esc(r.note)}">${esc(r.f)}</td>${r.vals.map(v=>`<td>${fmtV(v,r.f)}</td>`).join("")}</tr>`).join("")}
    <tr><td><b>Заповнено ручних факторів</b></td>${filled.map(n=>`<td><span class="badge ${n===manual.length?"good":n?"warn":""}">${n}/${manual.length}</span></td>`).join("")}</tr>
    </tbody></table>`;
}

/* ============ RENDER: cycle & layers ============ */
function renderCycle(){
  $("#cycle").innerHTML=S.dash.cycle.slice(0,4).map(r=>`<div><div class="k">${esc(r[0])}</div><div class="v">${esc(r[1])} — ${esc(r[2])}</div><div class="d">${esc(r[4])}${r[5]?". "+esc(r[5]):""}</div></div>`).join("");
  $("#layers").innerHTML=`<table class="tbl"><thead><tr><th>Шар моделі</th><th>Версія</th><th>Стан</th><th class="n">Live-ночей</th><th>Умова переходу</th><th>Доказовість</th></tr></thead><tbody>
    ${S.dash.layers.map(r=>`<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td><span class="badge ${/VALID|ACTIVE/.test(r[2])?"good":"warn"}">${esc(r[2])}</span></td><td class="n">${esc(r[3])}</td><td>${esc(r[4])}</td><td>${esc(r[5])}</td></tr>`).join("")}</tbody></table>`;
}

/* ============ SVG: calendar strip ============ */
function calStrip(days, opt={}){
  // days: [{d,cov,a,n}] sorted asc. Layout: columns = weeks, rows = weekdays
  if(!days||!days.length) return '<p class="note">Немає даних календаря.</p>';
  days=calendarDays(days);
  const cs=opt.cs||13, gap=2, first=days[0].d; const off=wdIdx(first);
  const weeks=Math.ceil((days.length+off)/7); const W=40+weeks*(cs+gap), H=18+7*(cs+gap);
  let s=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;min-width:${W}px" role="img" aria-label="Календар атак"><defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="var(--soft)"/><line x1="0" y1="0" x2="0" y2="4" stroke="var(--pending)" stroke-width="2"/></pattern></defs>`;
  WDs.forEach((w,i)=>{ if(i%2===0) s+=`<text x="0" y="${18+i*(cs+gap)+cs-2}" font-size="10" fill="var(--muted)">${w}</text>`; });
  let lastM=-1;
  days.forEach((o,k)=>{ const p=k+off, col=Math.floor(p/7), row=p%7; const x=40+col*(cs+gap), y=18+row*(cs+gap);
    if(o.d.getMonth()!==lastM && row<=6 && o.d.getDate()<=7){ lastM=o.d.getMonth(); s+=`<text x="${x}" y="11" font-size="10" fill="var(--muted)">${o.d.toLocaleDateString("uk-UA",{month:"short"})}</text>`; }
    const fill = (!o.cov||/PENDING/.test(o.cov)||o.a==null)?"url(#hatch)": o.a? "var(--attack)":"var(--soft)";
    s+=`<rect x="${x}" y="${y}" width="${cs}" height="${cs}" rx="2" fill="${fill}" data-t="${esc(fmtD(o.d)+" "+WD[wdIdx(o.d)]+" — "+((!o.cov||/PENDING/.test(o.cov)||o.a==null)?"не перевірено":o.a?("атака, епізодів: "+(o.n??"—")):"атак немає"))}"/>`; });
  return s+"</svg>";
}
function calMatrix(){
  const by=S.cal; const cities=S.dash.cities.map(c=>c.city).filter(c=>by[c]?.length);
  if(!cities.length) return '<p class="note">Немає даних календаря.</p>';
  const all=cities.flatMap(c=>by[c]);
  const timeline=calendarDays(all);
  const aligned=Object.fromEntries(cities.map(c=>[c,calendarDays(by[c],timeline[0].d,timeline.at(-1).d)]));
  const n=timeline.length; const cw=5, rh=20, lw=96;
  const W=lw+n*cw+10, H=cities.length*(rh+6)+22;
  let s=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;min-width:${W}px" role="img" aria-label="Матриця атак за містами">`;
  // month ticks
  let lm=timeline[0].d.getDate()>20?timeline[0].d.getMonth():-1; timeline.forEach((o,k)=>{ if(o.d.getMonth()!==lm){ lm=o.d.getMonth(); s+=`<line x1="${lw+k*cw}" x2="${lw+k*cw}" y1="14" y2="${H}" stroke="var(--soft)"/><text x="${lw+k*cw+2}" y="11" font-size="10" fill="var(--muted)">${o.d.toLocaleDateString("uk-UA",{month:"short"})}</text>`; } });
  cities.forEach((c,i)=>{ const y=20+i*(rh+6); const tot=by[c].filter(o=>o.a&&o.cov&&!/PENDING/.test(o.cov)).length;
    s+=`<text x="0" y="${y+13}" font-size="12" fill="var(--ink)">${esc(c)}</text><text x="${lw-6}" y="${y+13}" font-size="10" text-anchor="end" fill="var(--muted)">${tot}</text>`;
    aligned[c].forEach((o,k)=>{ if((!o.cov||/PENDING/.test(o.cov)||o.a==null)) s+=`<rect x="${lw+k*cw}" y="${y+6}" width="${cw}" height="${rh-12}" fill="var(--pending)" opacity=".6"/>`;
      else if(o.a) s+=`<rect x="${lw+k*cw}" y="${y}" width="${cw-0.4}" height="${rh}" fill="var(--attack)" data-t="${esc(c+" — "+fmtD(o.d)+", "+WD[wdIdx(o.d)])}"/>`; });
  });
  return s+"</svg>";
}
function wdChart(city){
  const days=S.cal[city]; if(!days?.length) return '<p class="note">Немає даних.</p>';
  const s56=wdStats(days,56), s365=wdStats(days,365); const td=dt(S.dash.head["Цільова дата"]); const tw=td?wdIdx(td):-1;
  const mx=Math.max(0.1,...s56.map(o=>o.r||0),...s365.map(o=>o.r||0)); const W=780,H=220,bw=30,g=100;
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Частота атак за днем тижня">`;
  for(let v=0;v<=mx+1e-9;v+=mx>0.3?0.1:0.05){ const y=180-v/mx*150; s+=`<line x1="40" x2="${W}" y1="${y}" y2="${y}" stroke="var(--soft)"/><text x="34" y="${y+4}" font-size="11" text-anchor="end" fill="var(--muted)">${Math.round(v*100)}%</text>`; }
  WDs.forEach((w,i)=>{ const x=60+i*g;
    if(i===tw) s+=`<rect x="${x-8}" y="20" width="${bw*2+22}" height="186" fill="var(--soft)" rx="4"/>`;
    const b=(o,dx,col)=>{ const h=(o.r||0)/mx*150; return `<rect x="${x+dx}" y="${180-h}" width="${bw}" height="${h}" fill="${col}" rx="2" data-t="${esc(WD[i]+": "+o.a+" з "+o.n+" ("+fmtP(o.r)+")")}"/><text x="${x+dx+bw/2}" y="${176-h}" font-size="11" text-anchor="middle" fill="var(--ink)">${o.n?Math.round(o.r*100)+"%":"—"}</text>`; };
    s+=b(s56[i],0,"var(--high)")+b(s365[i],bw+6,"var(--low)");
    s+=`<text x="${x+bw+3}" y="198" font-size="12" text-anchor="middle" fill="var(--ink)" font-weight="${i===tw?700:400}">${w}${i===tw?" ◂ ціль":""}</text>`;
  });
  s+=`<rect x="${W-230}" y="4" width="10" height="10" fill="var(--high)"/><text x="${W-215}" y="13" font-size="11" fill="var(--muted)">останні 56 днів</text><rect x="${W-120}" y="4" width="10" height="10" fill="var(--low)"/><text x="${W-105}" y="13" font-size="11" fill="var(--muted)">365 днів</text>`;
  return s+"</svg>";
}

/* ============ RENDER: city ============ */
function renderCity(){
  const names=S.dash.cities.map(c=>c.city); if(!selCity||!names.includes(selCity)) selCity=names[0];
  $("#citySel").innerHTML=names.map(n=>`<option ${n===selCity?"selected":""}>${esc(n)}</option>`).join("");
  if(!names.length){ $("#cityBody").innerHTML='<p class="note">Немає даних міст.</p>'; return; }
  const c=S.dash.cities.find(x=>x.city===selCity); const tac=S.tactics.filter(t=>t.city===selCity);
  const eps=S.reg.filter(r=>r.city===selCity||r.zone===selCity).slice(0,12);
  const tacRows=[["Балістика","bal","var(--high)"],["Крилаті/ракетні","cruise","var(--mid)"],["БпЛА","uav","var(--low)"],["Онікс","onyx","var(--muted)"],["Бандероль","band","var(--muted)"],["Інші ракети","other","var(--muted)"]];
  const maxEp=Math.max(1,...tac.map(t=>t.ep||0));
  $("#cityBody").innerHTML=`
    <div class="night" style="padding-top:6px"><div class="when" style="color:${band(c.base)}">${fmtP(c.base)}<small>${esc(c.city)} — історична база на ${esc(S.dash.head["Цільова ніч"]||"")}${c.base==null?" (місто в онбордингу)":""}</small></div>
      <div class="facts"><span>R56 <b>${fmtP(c.r56)}</b></span><span>R90 <b>${fmtP(c.r90)}</b></span><span>R180 <b>${fmtP(c.r180)}</b></span><span>R365 <b>${fmtP(c.r365)}</b></span><span>95% CI R365 <b>${esc(c.ci||"—")}</b></span><span>A-only R365 <b>${fmtP(c.aOnly)}</b></span><span>Остання атака <b>${fmtD(c.last)}</b></span></div></div>
    <h2>Календар 365 днів</h2><div class="panel strip cal">${calStrip(S.cal[selCity])}</div>
    <p class="cal-hint on">Проведіть пальцем по календарю вбік, щоб побачити інші дати.</p>
    <div class="grid2">
      <div><h2>День тижня: 56 проти 365 днів</h2><div class="panel strip">${wdChart(selCity)}</div></div>
      <div><h2>Тактика атак</h2><p class="lead">Кількість епізодів за вікном і які засоби в них фіксувалися (один епізод може містити кілька засобів).</p>
        <div class="panel scroll"><table class="tbl"><thead><tr><th>Засіб</th>${tac.map(t=>`<th class="n">${t.win} дн.</th>`).join("")}</tr></thead><tbody>
        <tr><td><b>Епізодів</b></td>${tac.map(t=>`<td class="n"><b>${t.ep??"—"}</b></td>`).join("")}</tr>
        ${tacRows.map(([l,k,col])=>`<tr><td>${l}</td>${tac.map(t=>`<td class="n"><span style="display:inline-block;height:8px;width:${(t[k]||0)/maxEp*60}px;background:${col};border-radius:2px;margin-right:6px;vertical-align:middle"></span>${t[k]??"—"}</td>`).join("")}</tr>`).join("")}
        <tr><td>Комбіновані</td>${tac.map(t=>`<td class="n">${t.comb??"—"} (${fmtP(t.share,0)})</td>`).join("")}</tr>
        <tr><td>Статус історії</td>${tac.map(t=>`<td class="n"><span class="badge ${t.status==="READY"?"good":"warn"}">${esc(t.status)}</span></td>`).join("")}</tr>
        </tbody></table></div></div>
    </div>
    ${!tac.length?'<p class="note">Немає даних тактики.</p>':""}
    <h2>Останні епізоди в реєстрі</h2>
    <div class="panel">${eps.length?eps.map(epHTML).join(""):'<p class="note" style="padding:14px">Епізодів немає.</p>'}</div>`;
}
function epHTML(r){
  const src=[r.s1,r.s2].filter(Boolean).map(u=>{ let h=u; try{h=new URL(u).hostname.replace("www.","");}catch(e){} return `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(h)}</a>`; }).join(" · ");
  return `<div class="episode"><div class="h"><b>${fmtD(r.d)}</b><span>${esc(r.city)}</span>${r.time?`<span class="note">${esc(r.time)}</span>`:""}
    <span class="chip">${esc(r.type||r.cat)}</span>${r.prof?`<span class="chip">${esc(r.prof)}</span>`:""}<span class="chip">${esc((r.conf||"").split("—")[0].trim()||"—")}</span>
    <span class="note">${esc(r.id)} · ${esc(r.use)}</span></div>
    <p>${esc(r.desc)}</p>${r.note?`<p class="note">${esc(r.note)}</p>`:""}${src?`<div class="src">Джерела: ${src}</div>`:""}</div>`;
}

/* ============ RENDER: calendar tab ============ */
function renderCal(){
  $("#calAll").innerHTML=calMatrix();
  const names=S.dash.cities.map(c=>c.city).filter(c=>S.cal[c]);
  const selected=$("#wdCity").value; const cur=names.includes(selected)?selected:names[0];
  $("#wdCity").innerHTML=names.map(n=>`<option ${n===cur?"selected":""}>${esc(n)}</option>`).join("");
  $("#wdChart").innerHTML=wdChart(cur);
}

/* ============ RENDER: registry ============ */
function fillSel(sel, vals, keep){ const cur=sel.value; const first=sel.options[0].outerHTML;
  sel.innerHTML=first+[...new Set(vals.filter(Boolean))].sort().map(v=>`<option ${v===cur?"selected":""}>${esc(v)}</option>`).join(""); }
function renderReg(){
  fillSel($("#fCity"),S.reg.map(r=>r.city)); fillSel($("#fUse"),S.reg.map(r=>r.use)); fillSel($("#fEra"),S.reg.map(r=>r.era));
  const fc=$("#fCity").value, fu=$("#fUse").value, fe=$("#fEra").value, q=$("#fQ").value.toLowerCase().trim();
  const L=S.reg.filter(r=>(!fc||r.city===fc)&&(!fu||r.use===fu)&&(!fe||r.era===fe)&&(!q||[r.desc,r.type,r.id,r.note,r.prof,r.audit].join(" ").toLowerCase().includes(q)));
  $("#regCount").textContent=`${L.length} з ${S.reg.length} епізодів`;
  $("#regList").innerHTML=L.slice(0,300).map(epHTML).join("")||'<p class="note" style="padding:14px">Нічого не знайдено — змініть фільтри.</p>';
}

/* ============ RENDER: waves ============ */
function renderWaves(){
  const w=S.waves; const L=w.list; if(!L.length){ $("#wavesChart").innerHTML='<p class="note">Немає даних.</p>'; $("#wavesTbl").innerHTML=""; $("#wavesLead").textContent=""; return; }
  $("#wavesLead").innerHTML=`Загальноукраїнський тижневий цикл: <b>${esc(w.cycle||"—")}</b>. Контекстний шар — не змінює % автоматично. ${esc(w.meta||"")}`;
  const t0=L[0].d, t1=L[L.length-1].d, span=(t1-t0)||1; const mx=Math.max(1,...L.map(o=>o.uav||0)); const W=1000,H=240;
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Хвилі БпЛА">`;
  for(let v=0;v<=mx;v+=200){ const y=200-v/mx*170; s+=`<line x1="40" x2="${W}" y1="${y}" y2="${y}" stroke="var(--soft)"/><text x="34" y="${y+4}" font-size="11" text-anchor="end" fill="var(--muted)">${v}</text>`; }
  let lm=t0.getDate()>20?t0.getMonth():-1; for(let d=new Date(t0);d<=t1;d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)){ if(d.getMonth()!==lm){ lm=d.getMonth(); const x=40+(d-t0)/span*(W-60); s+=`<text x="${x}" y="222" font-size="10" fill="var(--muted)">${d.toLocaleDateString("uk-UA",{month:"short"})}</text>`; } }
  L.forEach(o=>{ const x=40+(o.d-t0)/span*(W-60); const h=(o.uav||0)/mx*170; const anchor=/ANCHOR/.test(o.cls);
    s+=`<rect x="${x-3}" y="${200-h}" width="6" height="${h}" fill="${anchor?"var(--high)":"var(--low)"}" rx="1" data-t="${esc(fmtD(o.d)+" "+o.wd+" — "+o.comp)}"/>`;
    if(/Так/.test(o.bal)) s+=`<circle cx="${x}" cy="${196-h}" r="3" fill="var(--ink)"/>`; });
  s+=`<rect x="${W-360}" y="4" width="10" height="10" fill="var(--low)"/><text x="${W-345}" y="13" font-size="11" fill="var(--muted)">контекстна хвиля</text><rect x="${W-230}" y="4" width="10" height="10" fill="var(--high)"/><text x="${W-215}" y="13" font-size="11" fill="var(--muted)">weekly anchor</text><circle cx="${W-95}" cy="9" r="4" fill="var(--ink)"/><text x="${W-86}" y="13" font-size="11" fill="var(--muted)">є балістика</text>`;
  $("#wavesChart").innerHTML=s+"</svg>";
  $("#wavesTbl").innerHTML=`<table class="tbl"><thead><tr><th>Дата після 00:00</th><th>День</th><th class="n">БпЛА</th><th>Балістика</th><th>Склад</th><th>Клас</th><th>Джерело</th></tr></thead><tbody>
    ${[...L].reverse().map(o=>`<tr><td>${fmtD(o.d)}</td><td>${esc(o.wd)}</td><td class="n">${o.uav??"—"}</td><td>${esc(o.bal)}</td><td>${esc(o.comp)}</td><td><span class="chip">${esc(o.cls)}</span></td><td>${o.src?`<a href="${esc(o.src)}" target="_blank" rel="noopener">відкрити</a>`:""}</td></tr>`).join("")}</tbody></table>`;
}

/* ============ RENDER: model ============ */
function renderModel(){
  const c=S.control;
  const tbl=(H,R,hl)=>`<table class="tbl"><thead><tr>${H.map((h,i)=>`<th class="${i?"n":""}">${esc(h)}</th>`).join("")}</tr></thead><tbody>${R.map(r=>`<tr>${r.map((v,i)=>`<td class="${i?"n":""}" ${hl&&hl(r)?'style="background:var(--soft);font-weight:700"':""}>${esc(i&&num(v)!=null&&!Number.isInteger(num(v))&&Math.abs(num(v))<1&&!/%|…/.test(v)?num(v).toFixed(4).replace(".",","):v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  $("#liveScore").innerHTML=c.live? tbl(c.liveH,c.live) + (c.rule?`<p class="note" style="padding:0 12px 12px">${esc(c.rule)}</p>`:"") : '<p class="note" style="padding:14px">Блок не знайдено.</p>';
  $("#wfTbl").innerHTML=c.wf? tbl(c.wfH,c.wf,r=>r[0]===c.cur)+(c.wfNote?`<p class="note" style="padding:0 12px 12px">${esc(c.wfNote)}</p>`:"") : '<p class="note" style="padding:14px">Блок не знайдено.</p>';
  $("#tuneTbl").innerHTML=c.tune? tbl(c.tuneH,c.tune)+`<p class="note" style="padding:0 12px 12px">${esc(c["Правило"]||"")} <b>${esc(c["Статус"]||"")}</b></p>` : '<p class="note" style="padding:14px">Блок не знайдено.</p>';
  $("#methodKv").innerHTML=S.dash.notes.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
}

/* ============ VIEW SWITCH ============ */
function showView(v){
  document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.v===v));
  document.querySelectorAll("section.view").forEach(s=>s.classList.toggle("on",s.id==="v-"+v));
  if(S.dash){ if(v==="city") renderCity(); if(v==="cal") renderCal(); if(v==="reg") renderReg(); if(v==="waves") renderWaves(); if(v==="model") renderModel(); }
  if(v==="feed") loadFeed(false);
  hideTip(); tipPinnedEl=null;
  window.scrollTo({top:0});
}
document.querySelectorAll("nav.tabs button").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.v)));
function syncTabsFade(){ const n=$("#tabsNav"); $("#tabsWrap").classList.toggle("scrollable", n.scrollWidth-n.scrollLeft>n.clientWidth+4); }
$("#tabsNav").addEventListener("scroll",syncTabsFade); addEventListener("resize",syncTabsFade); syncTabsFade();
function syncScrollFades(){
  document.querySelectorAll(".scroll").forEach(el=>{
    const on=el.scrollWidth-el.scrollLeft>el.clientWidth+4;
    el.classList.toggle("fadeR",on);
    if(!el.dataset.fadeBound){ el.dataset.fadeBound="1"; el.addEventListener("scroll",syncScrollFades); }
  });
}
new MutationObserver(()=>syncScrollFades()).observe($("main"),{childList:true,subtree:true});
addEventListener("resize",syncScrollFades);
$("#citySel").addEventListener("change",e=>{ if(S.dash){selCity=e.target.value; renderCity();} });
$("#wdCity").addEventListener("change",()=>{if(S.dash) renderCal();});
["#fCity","#fUse","#fEra"].forEach(s=>$(s).addEventListener("change",()=>{if(S.dash) renderReg();}));
$("#fQ").addEventListener("input",()=>{if(S.dash) renderReg();});

/* tooltip */
const tip=$("#tip");
function placeTip(x,y,text){
  tip.textContent=text; tip.style.display="block";
  const w=tip.offsetWidth||280, h=tip.offsetHeight||24;
  tip.style.left=Math.max(8,Math.min(x+12,innerWidth-w-8))+"px";
  tip.style.top=Math.max(8,Math.min(y+14,innerHeight-h-8))+"px";
}
function hideTip(){ tip.style.display="none"; }
document.addEventListener("mousemove",e=>{ const t=e.target.closest&&e.target.closest("[data-t]"); if(!t){hideTip();return;}
  placeTip(e.clientX,e.clientY,t.getAttribute("data-t")); });
/* touch: tap a marked element to show its tooltip pinned near the tap; tap elsewhere (or the same element again) to dismiss */
let tipPinnedEl=null;
document.addEventListener("touchstart",e=>{
  const touch=e.touches[0]; const t=touch.target.closest&&touch.target.closest("[data-t]");
  if(!t){ hideTip(); tipPinnedEl=null; return; }
  if(t===tipPinnedEl){ hideTip(); tipPinnedEl=null; return; }
  tipPinnedEl=t; placeTip(touch.clientX,touch.clientY,t.getAttribute("data-t"));
},{passive:true});


export function renderDashboard(){
  renderHead(); renderHero(); renderPlainSummary(); renderOpsPlain(); renderLadder(); renderOps(); renderCycle();
  const cur=document.querySelector("nav.tabs button[aria-selected=true]").dataset.v;
  if(cur!=="night") showView(cur);
}
