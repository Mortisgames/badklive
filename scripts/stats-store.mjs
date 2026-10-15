// Visit/online counters for the Railway production server. "Online" is
// in-memory only (inherently live, fine to lose on restart); hourly/daily
// visit counts persist to STATS_DIR so they survive redeploys when that
// directory is a mounted Railway Volume. Falls back to a local folder (and,
// if even that can't be written, to memory-only) without ever throwing.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const STATS_DIR = process.env.STATS_DIR || resolve(process.cwd(), '.data');
const STATS_FILE = resolve(STATS_DIR, 'stats.json');
const ONLINE_WINDOW_MS = 60_000;
const HOURLY_KEEP = 24 * 14;
const DAILY_KEEP = 180;

const online = new Map();
let stats = { hourly: {}, daily: {} };
let loaded = false;
let saving = null;

const hourKey = (d = new Date()) => d.toISOString().slice(0, 13);
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

function prune(obj, keep){
  const keys = Object.keys(obj).sort();
  if(keys.length > keep) for(const k of keys.slice(0, keys.length - keep)) delete obj[k];
}

async function load(){
  if(loaded) return;
  loaded = true;
  try{
    const parsed = JSON.parse(await readFile(STATS_FILE, 'utf8'));
    if(parsed && typeof parsed === 'object') stats = { hourly: parsed.hourly || {}, daily: parsed.daily || {} };
  }catch{ /* no file yet, or STATS_DIR not writable — start fresh in memory */ }
}
function persist(){
  if(saving) return saving;
  saving = (async () => {
    try{
      await mkdir(STATS_DIR, { recursive: true });
      await writeFile(STATS_FILE, JSON.stringify(stats));
    }catch(e){ console.warn('Не вдалося зберегти статистику відвідувань:', e.message); }
    saving = null;
  })();
  return saving;
}

export function pruneOnline(){
  const cutoff = Date.now() - ONLINE_WINDOW_MS;
  for(const [id, ts] of online) if(ts < cutoff) online.delete(id);
}
export function heartbeat(id){
  online.set(id, Date.now());
  pruneOnline();
  return online.size;
}
export function onlineCount(){
  pruneOnline();
  return online.size;
}
export async function recordVisit(){
  await load();
  const now = new Date();
  const hk = hourKey(now), dk = dayKey(now);
  stats.hourly[hk] = (stats.hourly[hk] || 0) + 1;
  stats.daily[dk] = (stats.daily[dk] || 0) + 1;
  prune(stats.hourly, HOURLY_KEEP);
  prune(stats.daily, DAILY_KEEP);
  await persist();
}
export async function getStats(){
  await load();
  return stats;
}
