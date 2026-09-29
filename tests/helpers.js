import { readFileSync } from 'node:fs';
import { GIDS } from '../js/config.js';
export const fixtureTexts = () => Object.fromEntries(Object.keys(GIDS).map(k => [k, readFileSync(new URL(`./fixtures/${k}.csv`, import.meta.url), 'utf8')]));
export function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
export const csv = rows => rows.map(row => row.map(v => '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\n');
