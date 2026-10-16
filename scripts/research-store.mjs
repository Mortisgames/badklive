// Паралельна дослідницька база — не частина офіційної моделі й нічого в неї
// не пише. Postgres (окремий сервіс на Railway, DATABASE_URL), бо на
// відміну від лічильників відвідуваності (stats-store.mjs) це дані, які
// з часом потребують реальних запитів (по місту, даті, рівню
// підтвердження), а не просто ключ→число.
//
// Два типи записів у одній таблиці research_entries (type-дискримінатор):
//   "ops-snapshot" — точковий знімок ручних індикаторів ("Оперативна
//     оцінка") і базових % по містах у момент, коли вони змінились.
//     Офіційна таблиця перезаписується в місці, тож без цього історія
//     того, що саме було заповнено на момент конкретної ночі, губиться
//     назавжди.
//   "event" — конкретна атака/епізод з часом, знайдений через пошук або
//     повідомлений користувачем, з рівнем підтвердження (A/B/C, як і в
//     офіційному реєстрі) та приміткою про джерело.
import pg from 'pg';

const { Pool } = pg;
let pool = null;
let schemaReady = null;

function getPool(){
  if(!process.env.DATABASE_URL) return null;
  if(!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

function ensureSchema(){
  const p = getPool();
  if(!p) return Promise.resolve(false);
  if(!schemaReady){
    schemaReady = p.query(`
      CREATE TABLE IF NOT EXISTS research_entries (
        id BIGSERIAL PRIMARY KEY,
        ts TIMESTAMPTZ NOT NULL DEFAULT now(),
        type TEXT NOT NULL,
        ops_signature TEXT,
        data JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS research_entries_type_ts_idx ON research_entries (type, ts DESC);
      CREATE INDEX IF NOT EXISTS research_entries_ops_sig_idx ON research_entries (type, ops_signature);
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
    `).then(() => true);
  }
  return schemaReady;
}

function opsSignature(entry){
  return JSON.stringify([entry.targetDate, entry.ops, entry.cities]);
}

// Confirmed research events (A/B only — C is single-source/unconfirmed)
// extend the independently-sourced calendar going forward, past whatever
// the sheet import backfilled. A sheet-imported day for the same date takes
// priority if one already exists (WHERE source <> 'sheet-import' on the
// conflict branch) — the official audit outranks an automated search hit.
async function upsertCalendarFromEvent(p, entry){
  if(entry.confidence !== 'A' && entry.confidence !== 'B') return;
  if(!entry.city || !entry.datetime) return;
  const day = String(entry.datetime).slice(0, 10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  await p.query(
    `INSERT INTO calendar_days (city, day, coverage, attack, source)
     VALUES ($1, $2, 'RESEARCH_CONFIRMED', true, 'research')
     ON CONFLICT (city, day) DO UPDATE SET
       attack = true, coverage = 'RESEARCH_CONFIRMED', source = 'research', updated_at = now()
     WHERE calendar_days.source <> 'sheet-import'`,
    [entry.city, day]
  );
}

export async function recordEntry(entry){
  if(!entry || typeof entry !== 'object' || !entry.type) throw new Error('invalid entry');
  const json = JSON.stringify(entry);
  if(json.length > 20000) throw new Error('entry too large');
  const p = getPool();
  if(!p) throw new Error('DATABASE_URL not configured');
  await ensureSchema();

  if(entry.type === 'ops-snapshot'){
    const sig = opsSignature(entry);
    const { rows } = await p.query(
      `SELECT ops_signature FROM research_entries WHERE type = 'ops-snapshot' ORDER BY ts DESC LIMIT 1`
    );
    if(rows[0]?.ops_signature === sig) return { stored: false, reason: 'unchanged' };
    await p.query(`INSERT INTO research_entries (type, ops_signature, data) VALUES ($1, $2, $3)`, [entry.type, sig, entry]);
    return { stored: true };
  }

  await p.query(`INSERT INTO research_entries (type, data) VALUES ($1, $2)`, [entry.type, entry]);
  if(entry.type === 'event') await upsertCalendarFromEvent(p, entry);
  return { stored: true };
}

export async function readEntries({ limit = 500, type } = {}){
  const p = getPool();
  if(!p) return [];
  await ensureSchema();
  const { rows } = type
    ? await p.query(`SELECT ts, data FROM research_entries WHERE type = $1 ORDER BY ts ASC LIMIT $2`, [type, limit])
    : await p.query(`SELECT ts, data FROM research_entries ORDER BY ts ASC LIMIT $1`, [limit]);
  return rows.map(r => ({ ts: +r.ts, ...r.data }));
}
