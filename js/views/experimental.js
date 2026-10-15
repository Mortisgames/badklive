/* Експериментальний аналітичний шар — лише для спостереження на staging.
   Рахується на клієнті поверх вже завантажених даних, нічого не записує
   назад у таблицю і не впливає на production-формулу (вона лишається
   у dashboard.js незмінною). Мета: дати живо порівняти, чи рухомий сигнал
   (momentum/national-overlay/LR-комбінація індикаторів) точніший за
   поточну заморожену базу + адитивний ручний шар. */
import { $, esc, num, dt, fmtP, band } from "../utils.js";
import { S } from "../state.js";

const STAGING = /staging/.test(location.hostname) || location.hostname === "localhost" || location.hostname === "127.0.0.1";

/* Ілюстративні likelihood ratio для ручних індикаторів з аркуша «Оперативна
   оцінка». НЕ каліброві на історії (для цього немає історичного логу значень
   індикаторів по дням) — це орієнтовні ваги для перевірки самого підходу
   (мультиплікативна комбінація очевидності замість поточного адитивного
   ±п.п. у проді). */
const ILLUSTRATIVE_LR = {
  "Підвищує": 1.25, "Знижує": 0.8, "Є": 1.3, "Зафіксовано": 1.2,
  "Немає": 0.85, "Не зафіксовано": 0.85, "Нейтрально": 1
};

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function odds(p){ const c = clamp(p, 0.0005, 0.9995); return c / (1 - c); }
function probFromOdds(o){ return o / (1 + o); }

/* Той самий дух, що і заморожена база моделі (експоненційне згасання за
   half-life), але рахований самостійно з сирого календаря — швидкий сигнал
   (HL=14дн/вікно 60дн) проти вже наявного замороженого c.base як «повільного». */
function decayRate(days, targetDate, halfLifeDays, windowDays){
  if(!days || !days.length) return null;
  const lambda = Math.log(2) / halfLifeDays;
  const cutoff = new Date(targetDate.getTime() - windowDays * 86400000);
  let num = 0, den = 0;
  for(const o of days){
    if(o.d < cutoff || o.d >= targetDate) continue;
    if(!o.cov || /PENDING/.test(o.cov) || o.a == null) continue;
    const age = (targetDate - o.d) / 86400000;
    const w = Math.exp(-lambda * age);
    den += w; if(o.a) num += w;
  }
  return den > 1e-6 ? num / den : null;
}
/* Той самий розрахунок, агрегований по всіх містах — чи зараз "гаряче"
   по країні в цілому, незалежно від конкретного міста. */
function nationalDecayRate(halfLifeDays, windowDays, targetDate){
  const lambda = Math.log(2) / halfLifeDays;
  const cutoff = new Date(targetDate.getTime() - windowDays * 86400000);
  let n = 0, den = 0;
  for(const city in S.cal){
    for(const o of S.cal[city]){
      if(o.d < cutoff || o.d >= targetDate) continue;
      if(!o.cov || /PENDING/.test(o.cov) || o.a == null) continue;
      const age = (targetDate - o.d) / 86400000;
      const w = Math.exp(-lambda * age);
      den += w; if(o.a) n += w;
    }
  }
  return den > 1e-6 ? n / den : null;
}

function opsRowVal(label, cityName){
  const r = S.ops && S.ops.rows.find(r => r.f === label); if(!r || !S.ops) return "";
  const idx = S.ops.cities.indexOf(cityName); if(idx < 0) return "";
  return (r.vals[idx] || "").trim();
}
function effectiveProdPct(c){
  const raw = opsRowVal("Робочий % - після індикаторів", c.city);
  const work = raw !== "" ? num(raw) : null;
  return work != null ? { pct: work, isWork: true } : { pct: c.base, isWork: false };
}
function opsLR(cityName){
  const o = S.ops; if(!o) return 1;
  const manualStart = o.rows.findIndex(r => /Доставка/.test(r.f));
  const manual = o.rows.slice(manualStart >= 0 ? manualStart : 0).filter(r => !/Коментар|Робочий/.test(r.f));
  const idx = o.cities.indexOf(cityName); if(idx < 0) return 1;
  let lr = 1;
  manual.forEach(r => { const v = (r.vals[idx] || "").trim(); if(v && ILLUSTRATIVE_LR[v] != null) lr *= ILLUSTRATIVE_LR[v]; });
  return clamp(lr, 0.4, 3);
}

function computeExperimental(c, td){
  if(c.base == null) return null;
  const days = S.cal[c.city] || [];
  const fast = decayRate(days, td, 14, 60);
  const slow = c.base;
  const natFast = nationalDecayRate(14, 60, td);
  const natSlow = nationalDecayRate(90, 365, td);
  const momRatio = (fast != null && slow > 0.001) ? clamp(fast / slow, 0.3, 3) : 1;
  const momMul = Math.pow(momRatio, 0.6);
  const natRatio = (natFast != null && natSlow != null && natSlow > 0.001) ? clamp(natFast / natSlow, 0.5, 2) : 1;
  const natMul = Math.pow(natRatio, 0.3);
  const afterMomentum = probFromOdds(odds(slow) * momMul * natMul);
  const lr = opsLR(c.city);
  const final = clamp(probFromOdds(odds(afterMomentum) * lr), 0.001, 0.98);
  return { fast, slow, momRatio, momMul, natRatio, natMul, lr, final };
}

export function renderExperimental(){
  const box = $("#expBody"); if(!box) return;
  if(!S.dash){ box.innerHTML = ""; return; }
  const td = dt(S.dash.head["Цільова дата"]);
  if(!td){ box.innerHTML = '<p class="note" style="padding:14px">Немає цільової дати.</p>'; return; }
  const rows = S.dash.cities.filter(c => c.base != null)
    .map(c => ({ c, prod: effectiveProdPct(c), exp: computeExperimental(c, td) }))
    .filter(x => x.exp);
  if(!rows.length){ box.innerHTML = '<p class="note" style="padding:14px">Немає даних для розрахунку.</p>'; return; }
  rows.sort((a, b) => b.exp.final - a.exp.final);
  box.innerHTML = `<table class="tbl"><thead><tr>
    <th>Місто</th><th class="n">База (прод, застигла)</th><th class="n">Прод зараз${rows.some(r=>r.prod.isWork)?" <small>(з ручним шаром)</small>":""}</th><th class="n">Тест (нова, авто)</th><th class="n">Δ п.п.</th><th>Розбивка тестової</th>
  </tr></thead><tbody>${rows.map(({ c, prod, exp }) => {
    const delta = (exp.final - prod.pct) * 100;
    const deltaStr = (delta >= 0 ? "+" : "") + delta.toFixed(1);
    const breakdown = `момент ×${exp.momMul.toFixed(2)} (швидкі 60дн ${fmtP(exp.fast)} проти бази ${fmtP(exp.slow)})`
      + ` · нац.шар ×${exp.natMul.toFixed(2)}`
      + ` · LR індикаторів ×${exp.lr.toFixed(2)}`;
    return `<tr>
      <td>${esc(c.city)}</td>
      <td class="n">${fmtP(c.base)}</td>
      <td class="n" style="color:${band(prod.pct)}"><b>${fmtP(prod.pct)}</b></td>
      <td class="n" style="color:${band(exp.final)}"><b>${fmtP(exp.final)}</b></td>
      <td class="n">${deltaStr} п.п.</td>
      <td class="note">${esc(breakdown)}</td>
    </tr>`;
  }).join("")}</tbody></table>
  <p class="note" style="padding:12px">Відсортовано за тестовим показником. Порівнюйте з фактичними атаками самостійно протягом кількох тижнів — цей шар ще не має власного бектесту.</p>`;
}

export function initExperimental(){
  if(!STAGING) return;
  if($("#v-exp")) return;
  const nav = $("#tabsNav");
  if(nav){
    const btn = document.createElement("button");
    btn.type = "button"; btn.setAttribute("role", "tab"); btn.dataset.v = "exp"; btn.setAttribute("aria-selected", "false");
    btn.textContent = "🧪 Тест";
    nav.appendChild(btn);
  }
  const main = document.querySelector("main");
  if(main){
    const sec = document.createElement("section");
    sec.className = "view"; sec.id = "v-exp";
    sec.innerHTML = `
      <h2>🧪 Тестова модель аналітики (лише staging)</h2>
      <div class="disclaimer">
        <b>Експериментальний шар, не production-модель.</b> Рахується на клієнті поверх вже завантажених даних, нічого не записує в таблицю й не змінює формулу на вкладці «Ніч». Мета — пожити з цим якийсь час і подивитись, чи ближче він до фактичних обстрілів.<br><br>
        Що реалізовано: 1) момент/дивергенція — швидкий сигнал (half-life 14 дн, вікно 60 дн) проти замороженої бази (half-life 90 дн) по кожному місту; 2) загальнонаціональний шар збудження — той самий розрахунок, агрегований по всій географії спостереження, тобто чи зараз «гаряче» по країні в цілому; 3) ілюстративна баєсівська комбінація ручних оперативних індикаторів через множення правдоподібностей (LR), замість поточного адитивного ±п.п. у проді — ваги LR орієнтовні й <b>не каліброві на історії</b> (бракує логу значень індикаторів за минулі дні), це чесно позначено, не видається за готовий результат.<br><br>
        Що свідомо не реалізовано: ансамбль з висновком автора каналу @molfar_info — у живій стрічці блок з відсотками по містах найчастіше буквально повторює ці самі числа з BADK («Історична база BADK на ніч…»), тож усереднення моделі з самою собою дало б фальшиве відчуття підтвердження, а не нову інформацію; погода та добір PENDING-днів аудиту — немає потрібних даних на клієнті.
      </div>
      <div id="expBody"></div>`;
    main.appendChild(sec);
  }
}
