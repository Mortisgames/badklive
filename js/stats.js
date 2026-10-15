/* Відвідуваність і "хто онлайн" — рахується на сервері (scripts/serve-prod.mjs
   + scripts/stats-store.mjs), сюди лише fetch. Локальний dev-сервер
   (scripts/serve.mjs) цих маршрутів не має — будь-яка невдача тут мовчки
   ігнорується, застосунок працює й без цього. */
import { $, esc } from "./utils.js";

const ID_KEY = "badklive_visitor_id";
function visitorId(){
  try{
    let id = sessionStorage.getItem(ID_KEY);
    if(!id){ id = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem(ID_KEY, id); }
    return id;
  }catch(e){ return "anon-" + Math.random().toString(36).slice(2); }
}

function renderOnline(n){
  const el = $("#onlineCount"); if(!el) return;
  el.textContent = n == null ? "" : `🟢 Онлайн: ${n}`;
}

async function ping(){
  try{
    const res = await fetch(`/api/ping?id=${encodeURIComponent(visitorId())}`, { method: "POST" });
    if(!res.ok) return;
    const data = await res.json();
    renderOnline(data.online);
  }catch(e){ /* API недоступне (локальний dev, офлайн) */ }
}

export function initStats(){
  fetch("/api/visit", { method: "POST" }).catch(()=>{});
  ping();
  setInterval(() => { if(document.visibilityState === "visible") ping(); }, 20000);
  document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") ping(); });
}

function lastNHourKeys(n){
  const out = [], now = new Date();
  for(let i = n - 1; i >= 0; i--) out.push(new Date(now.getTime() - i * 3600000).toISOString().slice(0, 13));
  return out;
}
function lastNDayKeys(n){
  const out = [], now = new Date();
  for(let i = n - 1; i >= 0; i--) out.push(new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10));
  return out;
}
function hourLabel(k){ const [d, h] = k.split("T"); const [y, mo, da] = d.split("-"); return `${da}.${mo} ${h}:00`; }
function dayLabel(k){ const [y, mo, da] = k.split("-"); return `${da}.${mo}.${y}`; }

function barsSvg(entries, color, fmtLabel){
  const w = 1000, h = 130;
  if(!entries.length) return '<p class="note">Немає даних.</p>';
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const bw = w / entries.length;
  let s = `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto" role="img" aria-label="Відвідування">`;
  entries.forEach(([k, v], i) => {
    const bh = v / max * (h - 18);
    const x = i * bw;
    s += `<rect x="${x + 0.5}" y="${h - 14 - bh}" width="${Math.max(1, bw - 1)}" height="${Math.max(0, bh)}" fill="${color}" data-t="${esc(fmtLabel(k) + " — " + v)}"/>`;
  });
  return s + "</svg>";
}

function loadsWord(n){
  const m10 = n % 10, m100 = n % 100;
  if(m100 >= 12 && m100 <= 14) return "завантажень";
  if(m10 === 1) return "завантаження";
  if(m10 >= 2 && m10 <= 4) return "завантаження";
  return "завантажень";
}

function renderStatsHTML(hourly, daily){
  const hKeys = lastNHourKeys(48), dKeys = lastNDayKeys(30);
  const hEntries = hKeys.map(k => [k, hourly[k] || 0]);
  const dEntries = dKeys.map(k => [k, daily[k] || 0]);
  const last24 = hKeys.slice(-24).reduce((s, k) => s + (hourly[k] || 0), 0);
  const today = daily[dKeys[dKeys.length - 1]] || 0;
  return `
    <div class="panel" style="padding:14px 16px;margin:0 0 20px">
      <b>${last24}</b> ${loadsWord(last24)} сторінки за останні 24 год · <b>${today}</b> сьогодні.
    </div>
    <h2>Погодинно, останні 48 год</h2>
    <div class="panel strip">${barsSvg(hEntries, "var(--low)", hourLabel)}</div>
    <h2>По днях, останні 30 днів</h2>
    <div class="panel strip">${barsSvg(dEntries, "var(--mid)", dayLabel)}</div>
    <p class="note" style="padding:12px">Рахуються завантаження сторінки, не унікальні люди. Наведіть курсор на стовпчик, щоб побачити точне число.</p>`;
}

export async function renderVisitStats(){
  const box = $("#statsBody"); if(!box) return;
  box.innerHTML = '<p class="note" style="padding:14px">Завантаження статистики…</p>';
  try{
    const res = await fetch("/api/stats");
    if(!res.ok) throw new Error("HTTP " + res.status);
    const { hourly, daily } = await res.json();
    box.innerHTML = renderStatsHTML(hourly || {}, daily || {});
  }catch(e){
    box.innerHTML = `<p class="note" style="padding:14px">Статистика недоступна (${esc(e.message)}). На локальному dev-сервері цього API немає — це очікувано.</p>`;
  }
}
