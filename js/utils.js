import { BAND } from "./config.js";
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function num(s){
  if(s==null) return null;
  s=String(s).trim().replace(/\s/g, "");
  if(!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)%?$/.test(s)) return null;
  const v=Number(s.replace("%", "").replace(",", "."));
  return Number.isFinite(v)? (s.endsWith("%")?v/100:v) : null;
}
export function dt(s){
  const value=String(s??"").trim();
  let m=value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const parts=m? [+m[3],+m[2],+m[1]] : (m=value.match(/^(\d{4})-(\d{2})-(\d{2})$/))? [+m[1],+m[2],+m[3]] : null;
  if(!parts) return null;
  const [y,mo,d]=parts, date=new Date(y,mo-1,d);
  return date.getFullYear()===y&&date.getMonth()===mo-1&&date.getDate()===d?date:null;
}
export const fmtD = d => d? d.toLocaleDateString("uk-UA",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";
export const fmtP = (v,dp=1) => v==null? "—" : (v*100).toFixed(dp).replace(".",",")+"%";
export const dayKey = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
export const WD = ["Понеділок","Вівторок","Середа","Четвер","П’ятниця","Субота","Неділя"];
export const WDs = ["ПН","ВТ","СР","ЧТ","ПТ","СБ","НД"];
export const wdIdx = d => (d.getDay()+6)%7;
export const band = v => v==null? "var(--pending)" : v>=BAND.high? "var(--high)" : v>=BAND.mid? "var(--mid)" : "var(--low)";
export const findRow = (rows, pred, from=0) => { for(let i=from;i<rows.length;i++) if(pred(rows[i]||[])) return i; return -1; };
export const cell = (r,i) => (r && r[i]!=null ? String(r[i]).trim() : "");

