// Unique-visitor counters for the Railway production server, keyed by client
// IP (not a client-supplied id) — multiple tabs/devices behind the same IP
// collapse into one person. "Online" is in-memory only (inherently live,
// fine to lose on restart); hourly/daily unique-visitor sets persist to
// STATS_DIR so they survive redeploys when that path is a mounted Railway
// Volume. IPs are never stored in the clear — each is hashed with a
// per-deployment random salt before it touches memory or disk.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';

const STATS_DIR = process.env.STATS_DIR || resolve(process.cwd(), '.data');
const STATS_FILE = resolve(STATS_DIR, 'stats.json');
const SALT_FILE = resolve(STATS_DIR, 'salt.txt');
const ONLINE_WINDOW_MS = 15_000;
const HOURLY_KEEP = 24 * 14;
const DAILY_KEEP = 180;

const online = new Map(); // hashed ip -> last heartbeat timestamp
let stats = { hourly: {}, daily: {} }; // bucket key -> array of hashed ips seen in it
let salt = null;
let loaded = false;
let saving = null;

const hourKey = (d = new Date()) => d.toISOString().slice(0, 13);
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

function prune(obj, keep){
  const keys = Object.keys(obj).sort();
  if(keys.length > keep) for(const k of keys.slice(0, keys.length - keep)) delete obj[k];
}

async function ensureSalt(){
  if(salt) return salt;
  try{
    const existing = (await readFile(SALT_FILE, 'utf8')).trim();
    if(existing){ salt = existing; return salt; }
  }catch{ /* no salt file yet */ }
  salt = randomBytes(16).toString('hex');
  try{ await mkdir(STATS_DIR, { recursive: true }); await writeFile(SALT_FILE, salt); }
  catch(e){ console.warn('Не вдалося зберегти сіль для хешування IP (рахунок працюватиме лише в пам\'яті цього процесу):', e.message); }
  return salt;
}
async function hashIp(ip){
  const s = await ensureSalt();
  return createHash('sha256').update(s + '|' + ip).digest('hex').slice(0, 20);
}

async function load(){
  if(loaded) return;
  loaded = true;
  try{
    const parsed = JSON.parse(await readFile(STATS_FILE, 'utf8'));
    if(parsed && typeof parsed === 'object'){
      const norm = v => Object.fromEntries(Object.entries(v || {}).map(([k, arr]) => [k, Array.isArray(arr) ? arr : []]));
      stats = { hourly: norm(parsed.hourly), daily: norm(parsed.daily) };
    }
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
export async function heartbeat(ip){
  online.set(await hashIp(ip), Date.now());
  pruneOnline();
  return online.size;
}
export function onlineCount(){
  pruneOnline();
  return online.size;
}
export async function leave(ip){
  online.delete(await hashIp(ip));
  pruneOnline();
  return online.size;
}
export async function recordVisit(ip){
  await load();
  const h = await hashIp(ip);
  const now = new Date();
  const hk = hourKey(now), dk = dayKey(now);
  stats.hourly[hk] = stats.hourly[hk] || [];
  if(!stats.hourly[hk].includes(h)) stats.hourly[hk].push(h);
  stats.daily[dk] = stats.daily[dk] || [];
  if(!stats.daily[dk].includes(h)) stats.daily[dk].push(h);
  prune(stats.hourly, HOURLY_KEEP);
  prune(stats.daily, DAILY_KEEP);
  await persist();
}
export async function getStats(){
  await load();
  const counts = v => Object.fromEntries(Object.entries(v).map(([k, arr]) => [k, arr.length]));
  return { hourly: counts(stats.hourly), daily: counts(stats.daily) };
}
