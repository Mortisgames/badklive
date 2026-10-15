export async function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  const local = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);
  // Explicit opt-in permits reproducible PWA tests on a local server.
  if (local && !new URL(location.href).searchParams.has('pwa')) return;
  try {
    let controlled = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (controlled && !reloading) { reloading = true; location.reload(); }
      controlled = true;
    });
    const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    let applied = false;
    const offer = () => {
      if (!reg.waiting || !navigator.serviceWorker.controller || applied) return;
      applied = true;
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    };
    const watch = () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', offer);
      offer();
    };
    reg.addEventListener('updatefound', watch);
    watch();
  } catch (e) { console.warn('Офлайн-оболонка недоступна:', e); }
}
