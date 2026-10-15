/* Відвідуваність і "хто онлайн" — рахується на сервері за IP-адресою
   (scripts/serve-prod.mjs + scripts/stats-store.mjs), сюди лише fetch.
   Сервер сам визначає відвідувача з заголовків запиту, клієнту не треба
   генерувати жоден ідентифікатор. Локальний dev-сервер (scripts/serve.mjs)
   цих маршрутів не має — будь-яка невдача тут мовчки ігнорується,
   застосунок працює й без цього. */
import { $, esc } from "./utils.js";

function renderOnline(n){
  const el = $("#onlineCount"); if(!el) return;
  el.innerHTML = n == null ? "" : `<i class="dot pulse"></i>Онлайн: <b>${n}</b>`;
}

async function ping(){
  try{
    const res = await fetch("/api/ping", { method: "POST" });
    if(!res.ok) return;
    const data = await res.json();
    renderOnline(data.online);
  }catch(e){ /* API недоступне (локальний dev, офлайн) */ }
}
function leave(){
  // sendBeacon fires reliably even as the page is being torn down, unlike a
  // regular fetch which can get cancelled mid-flight on navigation/close.
  try{ navigator.sendBeacon("/api/leave"); }catch(e){}
}

export function initStats(){
  fetch("/api/visit", { method: "POST" }).catch(()=>{});
  ping();
  setInterval(() => { if(document.visibilityState === "visible") ping(); }, 5000);
  document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") ping(); });
  addEventListener("pagehide", leave);
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
function hourTick(k){
  const hour = k.slice(11, 13);
  if(!["00", "06", "12", "18"].includes(hour)) return null;
  return hour === "00" ? k.slice(8, 10) + "." + k.slice(5, 7) : hour + ":00";
}
function dayTick(k, i, n){
  if(i % 5 !== 0 && i !== n - 1) return null;
  return k.slice(8, 10) + "." + k.slice(5, 7);
}
function niceStep(max){
  if(max <= 4) return 1;
  const raw = max / 4, pow = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/* Gridlines + axis labels + rounded bars, matching the style of the other
   SVG charts in the app (wavesChart/wdChart) instead of bare floating rects. */
function barsSvg(entries, color, fmtTip, xTick){
  const w = 1000, h = 190, padL = 30, padR = 6, padT = 10, padB = 26;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  if(!entries.length) return '<p class="note">Немає даних.</p>';
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const step = niceStep(max), gridMax = Math.ceil(max / step) * step;
  let s = `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto" role="img" aria-label="Відвідування">`;
  for(let v = 0; v <= gridMax + 1e-9; v += step){
    const y = padT + plotH - (v / gridMax) * plotH;
    s += `<line x1="${padL}" x2="${w - padR}" y1="${y}" y2="${y}" stroke="var(--soft)"/>`;
    s += `<text x="${padL - 6}" y="${y + 3}" font-size="10" text-anchor="end" fill="var(--muted)">${Math.round(v)}</text>`;
  }
  const bw = plotW / entries.length;
  entries.forEach(([k, v], i) => {
    const bh = v / gridMax * plotH;
    const x = padL + i * bw;
    s += `<rect x="${(x + bw * 0.14).toFixed(1)}" y="${(padT + plotH - bh).toFixed(1)}" width="${Math.max(1, bw * 0.72).toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" rx="1.5" fill="${color}" data-t="${esc(fmtTip(k) + " — " + v)}"/>`;
    const label = xTick(k, i, entries.length);
    if(label) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${esc(label)}</text>`;
  });
  return s + "</svg>";
}

function visitorsWord(n){
  const m10 = n % 10, m100 = n % 100;
  if(m100 >= 11 && m100 <= 14) return "відвідувачів";
  if(m10 === 1) return "відвідувач";
  if(m10 >= 2 && m10 <= 4) return "відвідувачі";
  return "відвідувачів";
}

function renderStatsHTML(hourly, daily){
  const hKeys = lastNHourKeys(48), dKeys = lastNDayKeys(30);
  const hEntries = hKeys.map(k => [k, hourly[k] || 0]);
  const dEntries = dKeys.map(k => [k, daily[k] || 0]);
  const last24 = Math.max(...hKeys.slice(-24).map(k => hourly[k] || 0));
  const today = daily[dKeys[dKeys.length - 1]] || 0;
  return `
    <div class="panel" style="padding:14px 16px;margin:0 0 20px">
      До <b>${last24}</b> ${visitorsWord(last24)} за годину в пікові години останньої доби · <b>${today}</b> ${visitorsWord(today)} сьогодні.
    </div>
    <h2>Погодинно, останні 48 год</h2>
    <div class="panel strip">${barsSvg(hEntries, "var(--low)", hourLabel, hourTick)}</div>
    <h2>По днях, останні 30 днів</h2>
    <div class="panel strip">${barsSvg(dEntries, "var(--mid)", dayLabel, dayTick)}</div>
    <p class="note" style="padding:12px">Унікальні відвідувачі за IP-адресою в межах години/доби (не кількість переглядів). Люди за одним спільним IP — офіс, мобільна мережа — рахуються як один. Наведіть курсор на стовпчик, щоб побачити точне число.</p>`;
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
