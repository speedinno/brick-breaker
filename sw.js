// Retire the previous web game's service worker. This site serves only public
// policies and support pages; it does not install a new offline application.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith('brick-breaker-') || name.startsWith('prism-rush-')).map(name => caches.delete(name)));
  await self.clients.claim();
  await self.registration.unregister();
})()));
