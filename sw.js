const CACHE='brick-breaker-v2';
const ASSETS=['./','./index.html','./style.css','./app.js','./engine.js','./icon.svg','./icon-192.png','./icon-512.png','./icon-maskable.png','./manifest.webmanifest','./fonts.css','./fonts/font-1.ttf','./fonts/font-2.ttf','./fonts/font-3.ttf','./fonts/font-4.ttf','./fonts/font-5.ttf','./fonts/font-6.ttf','./fonts/font-7.ttf','./fonts/font-8.ttf'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith('prism-rush-')||key.startsWith('brick-breaker-'))&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 const target=new URL(event.request.url);const allowed=new Set(ASSETS.map(path=>new URL(path,self.registration.scope).pathname));if(!allowed.has(target.pathname)||target.search)return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(async()=>await caches.match(event.request)|| (event.request.mode==='navigate'?await caches.match('./index.html'):Response.error())));
});
