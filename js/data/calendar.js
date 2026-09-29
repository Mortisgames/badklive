import { dayKey, wdIdx } from '../utils.js';
export function calendarDays(days,start,end){
  if(!days.length&&!start) return [];
  start=start||new Date(Math.min(...days.map(o=>+o.d)));
  end=end||new Date(Math.max(...days.map(o=>+o.d)));
  const by=new Map(days.map(o=>[dayKey(o.d),o]));
  const result=[];
  for(let d=new Date(start);d<=end;d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)){
    result.push(by.get(dayKey(d))||{d:new Date(d),cov:'PENDING_MISSING',a:null,n:null});
  }
  return result;
}
export function wdStats(days,windowDays){
  const a=Array(7).fill(0),n=Array(7).fill(0);
  if(days.length){
    const end=days.at(-1).d,from=new Date(end.getFullYear(),end.getMonth(),end.getDate()-windowDays+1);
    for(const o of days) if(o.d>=from&&o.a!=null&&o.cov&&!/PENDING/.test(o.cov)){const w=wdIdx(o.d);n[w]++;a[w]+=o.a?1:0;}
  }
  return a.map((v,i)=>({a:v,n:n[i],r:n[i]?v/n[i]:null}));
}
