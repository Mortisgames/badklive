// Паралельна дослідницька база — не частина офіційної моделі й нічого в неї
// не пише. Два типи записів в одному append-only журналі:
//   "ops-snapshot" — точковий знімок ручних індикаторів ("Оперативна оцінка")
//     і базових % по містах у момент, коли вони змінились. Офіційна таблиця
//     перезаписується в місці, тож без цього історія того, що саме було
//     заповнено на момент конкретної ночі, губиться назавжди.
//   "event"        — конкретна атака/епізод з часом, знайдений через пошук
//     або повідомлений користувачем, з рівнем підтвердження (A/B/C, як і в
//     офіційному реєстрі) та приміткою про джерело.
// Персистентно на тому ж STATS_DIR (Railway Volume), що й stats-store.mjs.
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DIR = process.env.STATS_DIR || resolve(process.cwd(), '.data');
const LOG_FILE = resolve(DIR, 'research-log.jsonl');
const MAX_ENTRY_BYTES = 20000;

let lastOpsSig = null;
let loaded = false;
let writing = Promise.resolve();

function opsSignature(entry){
  return JSON.stringify([entry.targetDate, entry.ops, entry.cities]);
}

async function ensureLoaded(){
  if(loaded) return;
  loaded = true;
  try{
    const raw = await readFile(LOG_FILE, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    for(let i = lines.length - 1; i >= 0; i--){
      const e = JSON.parse(lines[i]);
      if(e.type === 'ops-snapshot'){ lastOpsSig = opsSignature(e); break; }
    }
  }catch{ /* no log yet */ }
}

export async function recordEntry(entry){
  if(!entry || typeof entry !== 'object' || !entry.type) throw new Error('invalid entry');
  const json = JSON.stringify(entry);
  if(json.length > MAX_ENTRY_BYTES) throw new Error('entry too large');
  await ensureLoaded();
  if(entry.type === 'ops-snapshot'){
    const s = opsSignature(entry);
    if(s === lastOpsSig) return { stored: false, reason: 'unchanged' };
    lastOpsSig = s;
  }
  const line = JSON.stringify({ ts: Date.now(), ...entry }) + '\n';
  writing = writing.then(async () => {
    try{ await mkdir(DIR, { recursive: true }); await appendFile(LOG_FILE, line); }
    catch(e){ console.warn('Не вдалося дописати дослідницький журнал:', e.message); }
  });
  await writing;
  return { stored: true };
}

export async function readEntries({ limit = 500, type } = {}){
  try{
    const raw = await readFile(LOG_FILE, 'utf8');
    let lines = raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    if(type) lines = lines.filter(e => e.type === type);
    return lines.slice(-limit);
  }catch{ return []; }
}
