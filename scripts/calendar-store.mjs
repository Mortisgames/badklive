// Читання власного календаря атак із Postgres (calendar_days) — заповнений
// одноразовим імпортом офіційної історії (scripts/import-sheet-history.mjs)
// і надалі доповнюється автоматично з дослідницького журналу (events із
// confidence A/B — research-store.mjs). Використовується клієнтом для
// незалежного перерахунку R56/R90/R180/R365/бази "тією ж логікою", без
// прив'язки до поточного стану офіційної таблиці.
import pg from 'pg';

const { Pool } = pg;
let pool = null;

function getPool(){
  if(!process.env.DATABASE_URL) return null;
  if(!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function getCalendar(){
  const p = getPool();
  if(!p) return {};
  const { rows } = await p.query(`SELECT city, day, coverage, attack, count FROM calendar_days ORDER BY city, day`);
  const byCity = {};
  for(const r of rows){
    (byCity[r.city] = byCity[r.city] || []).push({
      d: r.day.toISOString().slice(0, 10),
      cov: r.coverage,
      a: r.attack,
      n: r.count,
    });
  }
  return byCity;
}
