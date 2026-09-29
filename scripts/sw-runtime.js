// This runtime is combined with the generated asset manifest by prepare-sw.mjs.
const PREFIX = `badklive-shell:${encodeURIComponent(self.registration.scope)}:`;
const CACHE = PREFIX + REVISION;
const URLS = new Set(SHELL.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  // Do not skip waiting: the page offers activation after the complete release is cached.
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll([...URLS].map(url => new Request(url, { cache: 'reload' })));
    } catch (error) { await caches.delete(CACHE); throw error; }
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Query strings on navigation (e.g. ?pwa) use the same offline entry point.
  if (req.mode === 'navigate') url.search = '';
  if (!URLS.has(url.href)) return;
  // Serve a coherent release: new HTML must never load previous-release modules.
  // Worker updates fetch the next full shell; no untracked background revalidation.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(url.href);
    if (cached) return cached;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try { return await fetch(new Request(req, { signal: controller.signal })); }
      finally { clearTimeout(timer); }
    } catch {
      return new Response('Офлайн-файл недоступний. Відкрийте застосунок із підключенням до інтернету.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
