// Одноразовий (повторно безпечний — upsert) імпорт повної історії з офіційної
// Google-таблиці в Postgres: календар атак, реєстр епізодів, національні
// хвилі. Ручні індикатори ("Оперативна оцінка") свідомо НЕ імпортуються —
// це єдине, що й далі читається напряму з таблиці, бо це поточний стан
// ручної оцінки, а не історія.
//
// Використання: DATABASE_URL=... node scripts/import-sheet-history.mjs
import pg from 'pg';
import { parseCSV } from '../js/data/csv.js';
import { parseCal, parseReg, parseWaves } from '../js/data/parsers.js';
import { SHEET_ID, GIDS } from '../js/config.js';

const { Pool } = pg;

async function fetchSheet(gid){
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`HTTP ${res.status} для gid=${gid}`);
  return parseCSV(await res.text());
}

async function ensureSchema(pool){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_days (
      city TEXT NOT NULL,
      day DATE NOT NULL,
      coverage TEXT,
      attack BOOLEAN,
      count INT,
      regime TEXT,
      source TEXT NOT NULL DEFAULT 'sheet-import',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (city, day)
    );
    CREATE INDEX IF NOT EXISTS calendar_days_city_idx ON calendar_days (city, day);

    CREATE TABLE IF NOT EXISTS episodes (
      episode_id TEXT PRIMARY KEY,
      city TEXT,
      day DATE,
      confidence TEXT,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS episodes_city_day_idx ON episodes (city, day);

    CREATE TABLE IF NOT EXISTS national_waves (
      day DATE PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function importCalendar(pool){
  const rows = await fetchSheet(GIDS.cal);
  const byCity = parseCal(rows);
  let n = 0;
  for(const city in byCity){
    for(const o of byCity[city]){
      if(!o.d) continue;
      await pool.query(
        `INSERT INTO calendar_days (city, day, coverage, attack, count, regime, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'sheet-import')
         ON CONFLICT (city, day) DO UPDATE SET
           coverage = EXCLUDED.coverage, attack = EXCLUDED.attack, count = EXCLUDED.count,
           regime = EXCLUDED.regime, source = 'sheet-import', updated_at = now()
         WHERE calendar_days.source = 'sheet-import'`,
        [city, o.d.toISOString().slice(0, 10), o.cov || null, o.a == null ? null : !!o.a, o.n ?? null, o.era || null]
      );
      n++;
    }
  }
  console.log(`Календар: ${n} днів по ${Object.keys(byCity).length} містах`);
}

async function importRegistry(pool){
  const rows = await fetchSheet(GIDS.reg);
  const episodes = parseReg(rows);
  let n = 0;
  for(const ep of episodes){
    if(!ep.id) continue;
    await pool.query(
      `INSERT INTO episodes (episode_id, city, day, confidence, data)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (episode_id) DO UPDATE SET
         city = EXCLUDED.city, day = EXCLUDED.day, confidence = EXCLUDED.confidence,
         data = EXCLUDED.data, updated_at = now()`,
      [ep.id, ep.city || null, ep.d ? ep.d.toISOString().slice(0, 10) : null, ep.conf || null, ep]
    );
    n++;
  }
  console.log(`Реєстр епізодів: ${n} записів`);
}

async function importWaves(pool){
  const rows = await fetchSheet(GIDS.waves);
  const { list } = parseWaves(rows);
  let n = 0;
  for(const w of list){
    if(!w.d) continue;
    await pool.query(
      `INSERT INTO national_waves (day, data) VALUES ($1, $2)
       ON CONFLICT (day) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [w.d.toISOString().slice(0, 10), w]
    );
    n++;
  }
  console.log(`Національні хвилі: ${n} днів`);
}

async function main(){
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL не задано');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await ensureSchema(pool);
  await importCalendar(pool);
  await importRegistry(pool);
  await importWaves(pool);
  await pool.end();
  console.log('Готово.');
}
main().catch(e => { console.error(e); process.exit(1); });
