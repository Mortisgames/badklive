import { columnIndex } from "./columns.js";
import {num,dt,findRow,cell} from "../utils.js";
export function parseDash(R){
  const d={cities:[],cycle:[],layers:[],notes:[],head:{}};
  const h=R[findRow(R,r=>cell(r,0)==="Цільова дата")]||[];
  for(let i=0;i<h.length-1;i++){ const k=cell(h,i); if(k) d.head[k]=cell(h,i+1); }
  d.head.capture = h.filter(Boolean).slice(-1)[0] || "";
  const hi=findRow(R,r=>cell(r,0)==="Місто"&&cell(r,1)==="R56");
  if(hi>=0){
    const H=R[hi].map(x=>x.trim()); const ix=n=>H.indexOf(n);
    for(let i=hi+1;i<R.length;i++){
      const r=R[i]; const c=cell(r,0); if(!c||["Метод","Режим"].includes(c)) break;
      d.cities.push({ city:c, r56:num(r[ix("R56")]), r90:num(r[ix("R90")]), r180:num(r[ix("R180")]), r365:num(r[ix("R365")]),
        base:num(r[ix("Історична база")]), dom:cell(r,ix("Домінантний день режиму")), domStr:num(r[ix("Сила домінанти")]),
        shift:cell(r,ix("Зсув режиму")), domMatch:cell(r,ix("Домінантний день = цільовому?")), ops:num(r[ix("Оперативний %")]),
        last:dt(cell(r,ix("Остання атака"))), support:cell(r,ix("Support R56 • R365")), ci:cell(r,ix("95% CI R365")),
        aOnly:num(r[ix("A-only R365")]), evidence:cell(r,ix("Evidence")) });
    }
  }
  ["Метод","Режим","Невизначеність","Evidence","Walk-forward","Global cycle","Версія"].forEach(k=>{
    const i=findRow(R,r=>cell(r,0)===k&&cell(r,1).length>25); if(i>=0) d.notes.push([k,cell(R[i],1)]);
  });
  const li=findRow(R,r=>cell(r,0)==="Layer"); if(li>=0) for(let i=li+1;i<R.length&&cell(R[i],0)&&cell(R[i],0)!=="DAILY CYCLE";i++) d.layers.push(R[i].slice(0,6).map(x=>x.trim()));
  const ci=findRow(R,r=>cell(r,0)==="Крок"); if(ci>=0) for(let i=ci+1;i<R.length&&cell(R[i],0);i++) d.cycle.push(R[i].slice(0,6).map(x=>x.trim()));
  return d;
}
export function parseOps(R){
  const hi=findRow(R,r=>cell(r,0)==="Фактор"); if(hi<0) return null;
  const H=R[hi]; const cities=[]; let noteCol=-1;
  H.forEach((x,i)=>{ x=x.trim(); if(i>0&&x&&x!=="Примітка") cities.push([x,i]); if(x==="Примітка") noteCol=i; });
  const rows=[]; for(let i=hi+1;i<R.length;i++){ const f=cell(R[i],0); if(!f) continue; rows.push({f, vals:cities.map(([,ci])=>cell(R[i],ci)), note:noteCol>=0?cell(R[i],noteCol):""}); }
  return {cities:cities.map(c=>c[0]), rows};
}
export function parseTactics(R){
  const H=(R[0]||[]).map(x=>x.trim()); const ix=n=>columnIndex(H,n);
  return R.slice(1).filter(r=>cell(r,ix("Місто"))).map(r=>({city:cell(r,ix("Місто")),win:num(r[ix("Вікно")]),ep:num(r[ix("Епізодів")]),bal:num(r[ix("Балістика")]),
    cruise:num(r[ix("Крилаті")]),uav:num(r[ix("БпЛА")]),onyx:num(r[ix("Онікс")]),band:num(r[ix("Бандероль")]),other:num(r[ix("Інші ракети")]),
    comb:num(r[ix("Комбіновані")]),share:num(r[ix("Частка")]),status:cell(r,ix("History status"))}));
}
export function parseCal(R){
  const H=(R[0]||[]).map(x=>x.trim()); const ix=n=>columnIndex(H,n);
  const iD=ix("Дата"),iC=ix("Місто"),iCov=ix("Покриття"),iA=ix("Балістична атака"),iN=ix("К-сть"),iE=ix("Regime");
  const by=Object.create(null);
  R.slice(1).forEach(r=>{ const d=dt(cell(r,iD)); const c=cell(r,iC); if(!d||!c) return;
    (by[c]=by[c]||[]).push({d,cov:cell(r,iCov),a:num(r[iA]),n:num(r[iN]),era:cell(r,iE)}); });
  Object.values(by).forEach(a=>a.sort((x,y)=>x.d-y.d)); return by;
}
export function parseReg(R){
  const H=(R[0]||[]).map(x=>x.trim()); const ix=n=>columnIndex(H,n);
  const m={id:ix("ID епізоду"),city:ix("Місто"),cat:ix("Категорія"),date:ix("Дата балістичної"),type:ix("Тип ракети"),comb:ix("Комбінована"),
    conf:ix("Рівень підтвердження"),desc:ix("Короткий опис"),s1:ix("Джерело 1"),s2:ix("Джерело 2"),note:ix("Примітка"),zone:ix("Зона моделі"),
    audit:ix("Статус аудиту"),prof:ix("Профіль атаки"),era:ix("Період режиму"),use:ix("Використання в моделі"),time:ix("Час балістичної"),
    geo:ix("Географія"),nb:ix("Балістичних ракет")};
  return R.slice(1).filter(r=>cell(r,m.city)).map(r=>{ const o={}; for(const k in m) o[k]=m[k]>=0?cell(r,m[k]):""; o.d=dt(o.date); return o; })
    .sort((a,b)=>(b.d||0)-(a.d||0));
}
export function parseWaves(R){
  const H=(R[0]||[]).map(x=>x.trim()), ix=n=>columnIndex(H,n);
  const list=R.slice(1).filter(r=>dt(cell(r,ix("Дата після 00:00")))).map(r=>({
    d:dt(cell(r,ix("Дата після 00:00"))),wd:cell(r,ix("День")),uav:num(r[ix("БпЛА")]),
    bal:cell(r,ix("Балістична складова")),comp:cell(r,ix("Склад")),src:cell(r,ix("Джерело")),
    inc:num(r[ix("Include")]),cls:cell(r,ix("Клас"))}));
  let cycle=""; const gi=findRow(R,r=>r.some(x=>x.trim()==="Global cycle"));
  if(gi>=0){ const r=R[gi]; const k=r.findIndex(x=>x.trim()==="Global cycle"); cycle=cell(r,k+1); }
  list.sort((a,b)=>a.d-b.d);
  return {list, cycle, meta:cell(R[0],12)};
}
export function parseControl(R){
  const o={};
  const li=findRow(R,r=>cell(r,0)==="Місто"&&cell(r,1).startsWith("N STAT"));
  if(li>=0){ o.liveH=R[li].slice(0,9); o.live=[]; for(let i=li+1;i<R.length&&cell(R[i],0)&&!cell(R[i],0).startsWith("КАЛІБР");i++) o.live.push(R[i].slice(0,9)); }
  const wi=findRow(R,r=>cell(r,0)==="Model"&&cell(r,1));
  if(wi>=0){ o.wfH=R[wi].slice(0,7); o.wf=[]; for(let i=wi+1;i<R.length;i++){ const k=cell(R[i],0); if(!k) break; if(/^(WD|ALL|SHRINK)/.test(k)) o.wf.push(R[i].slice(0,7).map(x=>x.trim())); if(k==="Висновок") o.wfNote=cell(R[i],1);}
    const cm=findRow(R,r=>cell(r,0)==="Current model",wi); if(cm>=0) o.cur=cell(R[cm],1);
    if(!o.wfNote){ const vi=findRow(R,r=>cell(r,0)==="Висновок"); if(vi>=0) o.wfNote=cell(R[vi],1); } }
  const ti=findRow(R,r=>cell(r,0)==="City"&&cell(r,1)==="N days");
  if(ti>=0){ o.tuneH=R[ti].slice(0,10); o.tune=[]; for(let i=ti+1;i<R.length&&cell(R[i],0);i++){ if(["Правило","Статус"].includes(cell(R[i],0))){ o[cell(R[i],0)]=cell(R[i],1); continue;} o.tune.push(R[i].slice(0,10)); } }
  const ri=findRow(R,r=>cell(r,0)==="Правило"); if(ri>=0) o.rule=cell(R[ri],1);
  return o;
}

