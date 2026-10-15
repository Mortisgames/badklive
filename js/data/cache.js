import { buildSnapshot } from './snapshot.js';
export const CACHE_KEY = 'badklive_cache_v2';
const LEGACY_KEY = 'badklive_cache_v1';
// CSV preserves local calendar dates. Always revalidate before restoring a snapshot.
export function saveCache({ texts, receivedAt }, storage) {
  try {
    (storage ?? localStorage).setItem(CACHE_KEY, JSON.stringify({ version: 2, receivedAt, texts }));
    return true;
  } catch { return false; }
}
export function readCache(storage) {
  try { storage ??= localStorage; } catch { return null; }
  for (const key of [CACHE_KEY, LEGACY_KEY]) {
    try {
      const raw = JSON.parse(storage.getItem(key));
      const c = key === LEGACY_KEY ? { version: 2, receivedAt: raw?.ts, texts: raw?.texts } : raw;
      if (c?.version !== 2 || !Number.isFinite(c.receivedAt) || c.receivedAt <= 0 || c.receivedAt > Date.now()) continue;
      const snapshot = buildSnapshot(c.texts);
      if (key === LEGACY_KEY) saveCache(c, storage);
      return { ...c, snapshot };
    } catch { /* Try the previous format if the current cache is damaged. */ }
  }
  return null;
}
