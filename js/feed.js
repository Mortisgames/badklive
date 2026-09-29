import { $, esc, dt, fmtD } from "./utils.js";
import { S } from "./state.js";
import { fetchText, singleFlight } from "./data/loader.js";
const TG_CHANNEL="molfar_info";
const TG_FEED_URL="https://r.jina.ai/https://t.me/s/"+TG_CHANNEL;
const TG_CACHE_KEY="badklive_feed_cache_v1";
const TG_STALE_MS=10*60*1000;

function parseTelegramFeed(md){
  const body=(md.split("Markdown Content:")[1]||md);
  const parts=body.split(/\[_!\[Image \d+\]\([^)]*\)_\]\(https:\/\/t\.me\/[a-zA-Z0-9_]+\)/g);
  const posts=[];
  for(let i=1;i<parts.length;i++){
    let t=parts[i].trim(); if(!t) continue;
    const dm=t.match(/\n?\s*([A-Z][a-z]+ \d{1,2})\s*$/);
    const date=dm?dm[1]:"";
    if(dm) t=t.slice(0,dm.index).trim();
    const pinMatch=t.match(/pinned\s*«([\s\S]*)»\s*$/);
    let pinned=false, text=t;
    if(pinMatch){ pinned=true; text=pinMatch[1].trim(); }
    else text=text.replace(/^\[\]\(https:\/\/t\.me\/[^)]+\)\s*/,"");
    text=text.replace(/^_\*\*.+\*\*_.*$/gm,"").trim();
    text=text.replace(/\n{3,}/g,"\n\n").trim();
    if(!text) continue;
    posts.push({date,pinned,text});
  }
  return posts.reverse(); // newest first
}
function mdInline(raw){
  const clean=raw.replace(/\\([_*[\]()>#+\-.!])/g,"$1");
  let s=esc(clean);
  s=s.replace(/\*\*(.+?)\*\*/g,"<b>$1</b>");
  s=s.replace(/_([^_\n]+)_/g,"<i>$1</i>");
  s=s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}
function renderFeed(){
  const posts=S.feed&&S.feed.posts||[];
  if(!posts.length){ $("#feedList").innerHTML='<p class="note" style="padding:14px">Стрічку ще не завантажено.</p>'; return; }
  $("#feedList").innerHTML=posts.slice(0,40).map(p=>`<div class="feed-post"><div class="fh">${p.pinned?'<span class="pin">Закріплено</span>':""}<span>${esc(p.date)}</span></div>
    <p>${mdInline(p.text)}</p></div>`).join("");
}
function findLatestAnalysis(posts,targetDate){
  for(const p of posts){
    if(p.pinned) continue;
    const m=p.text.match(/^(?:Вечірня|Ранкова|Денна)\s*аналітика,\s*станом на\s*\d{2}:\d{2}\s+(\d{2})\.(\d{2})\.(\d{4})/i);
    if(!m) continue;
    const pd=new Date(+m[3],+m[2]-1,+m[1]);
    if(!targetDate||(pd.getFullYear()===targetDate.getFullYear()&&pd.getMonth()===targetDate.getMonth()&&pd.getDate()===targetDate.getDate())) return {post:p,postDate:pd};
  }
  return null;
}
function extractConclusions(text){
  const clean=text.replace(/\\([_*[\]()>#+\-.!])/g,"$1");
  const short=(clean.match(/Коротко:\s*([^\n]+)/i)||[])[1]||"";
  const catLines=(clean.match(/^.*\d+(?:[.,]\d+)?%,\s*\d+(?:[.,]\d+)?\/10.*$/gm)||[]).map(l=>l.trim());
  const todayMatch=clean.match(/Сьогодні:\**\s*\n?([\s\S]*?)(?=\n\s*\n_?Приймайте|\n_?Приймайте|$)/i);
  const today=todayMatch?todayMatch[1].trim():"";
  return {short,catLines,today};
}
function renderChannelTake(){
  const box=$("#channelTake"); if(!box) return;
  const posts=S.feed&&S.feed.posts;
  if(!posts||!posts.length||!S.dash){ box.innerHTML=""; return; }
  const td=dt(S.dash.head["Цільова дата"]);
  if(!td){ box.innerHTML=""; return; }
  const eve=new Date(td.getFullYear(),td.getMonth(),td.getDate()-1);
  const found=findLatestAnalysis(posts,eve);
  if(!found){ box.innerHTML=""; return; }
  const {post,postDate}=found;
  const {short,catLines,today}=extractConclusions(post.text);
  const hasConclusions=short||catLines.length||today;
  box.innerHTML=`<div class="channel-take panel">
    <div class="ct-h"><span class="ct-src">Оцінка автора каналу @${TG_CHANNEL}</span><span>${esc(fmtD(postDate))}</span></div>
    ${short?`<p class="ct-short">${mdInline(short)}</p>`:""}
    ${catLines.length?`<ul class="ct-conclusions">${catLines.map(l=>`<li>${mdInline(l)}</li>`).join("")}</ul>`:""}
    ${today?`<p class="ct-today"><b>На сьогодні:</b> ${mdInline(today)}</p>`:""}
    ${!hasConclusions?`<p class="ct-full">${mdInline(post.text)}</p>`:""}
    <p class="ct-foot">Незалежна ручна оцінка автора. <a href="https://t.me/${TG_CHANNEL}" target="_blank" rel="noopener">Відкрити канал у Telegram →</a></p>
  </div>`;
}
async function updateFeed(force){
  const cached=(()=>{ try{ return JSON.parse(localStorage.getItem(TG_CACHE_KEY)); }catch(e){ return null; } })();
  if(cached && Number.isFinite(cached.ts) && Array.isArray(cached.posts) && cached.posts.every(p=>p&&typeof p.text==="string"&&typeof p.date==="string") && cached.posts.length && !S.feed) S.feed=cached;
  if(S.feed){ renderFeed(); renderChannelTake(); }
  const fresh = S.feed && (Date.now()-S.feed.ts) < TG_STALE_MS;
  if(fresh && !force) return;
  $("#feedStatus").textContent="Оновлення стрічки…";
  try{
    const md=await fetchText(TG_FEED_URL,{headers:{"X-No-Cache":"true"}});
    const posts=parseTelegramFeed(md);
    if(!posts.length) throw new Error("Не вдалося розпізнати публікації");
    S.feed={ts:Date.now(),posts};
    try{ localStorage.setItem(TG_CACHE_KEY,JSON.stringify(S.feed)); }catch(e){}
    renderFeed(); renderChannelTake();
    $("#feedStatus").textContent="Оновлено "+new Date().toLocaleTimeString("uk-UA",{hour:"2-digit",minute:"2-digit"});
  }catch(e){
    console.error(e);
    if(S.feed&&S.feed.posts&&S.feed.posts.length){
      $("#feedStatus").textContent="Не вдалося оновити ("+e.message+") — показано попередній знімок";
    } else {
      $("#feedList").innerHTML=`<div class="err">Не вдалося завантажити стрічку каналу (${esc(e.message)}). Проксі-читач — сторонній і не гарантований.
        <br><a href="https://t.me/${TG_CHANNEL}" target="_blank" rel="noopener">Відкрити @${TG_CHANNEL} напряму в Telegram →</a></div>`;
      $("#feedStatus").textContent="";
    }
  }
}
export const loadFeed=singleFlight(updateFeed);
$("#feedRefresh").addEventListener("click",()=>loadFeed(true));

