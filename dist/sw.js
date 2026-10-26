const CACHE='brick-breaker-v3.2.0-privacy-offline-r1';
const ASSETS=['./','./index.html','./style.css','./viewport.js','./fonts.css','./fonts/font-1.ttf','./fonts/font-2.ttf','./fonts/font-3.ttf','./fonts/font-4.ttf','./fonts/font-5.ttf','./fonts/font-6.ttf','./fonts/font-7.ttf','./fonts/font-8.ttf','./app.js','./audio.js','./engine.js','./physics.js','./controls.js','./control-events.js','./assistance.js','./assistance-ui.js','./generated.js','./difficulty.js','./catalog.js','./progress.js','./mastery.js','./purchase-recovery.js','./purchases.js','./web-purchases.js','./purchases-ui.js','./session.js','./storage.js','./cloud.js','./cloud-config.js','./journey-ui.js','./account-ui.js','./vendor/supabase.js','./vendor/native.js','./icon.svg','./icon-192.png','./icon-512.png','./icon-maskable.png','./manifest.webmanifest','./privacy.html','./terms.html','./delete-account.html','./legal.js','./legal.css','./THIRD-PARTY-NOTICES.txt','./account-privacy.js','./ad-consent.js','./ad-runtime.js','./rewarded-adapters.js','./rewarded-ui.js','./rewarded.js','./vendor/ads.js','./vendor/purchases.js','./wallet-snapshots.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith('prism-rush-')||key.startsWith('brick-breaker-'))&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const target=new URL(event.request.url),scope=new URL(self.registration.scope);
  if(target.origin!==scope.origin)return;
  const allowed=new Set(ASSETS.map(path=>new URL(path,scope).pathname));
  if(!allowed.has(target.pathname))return;
  const navigation=event.request.mode==='navigate';if(target.search&&!navigation)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok&&!target.search){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(async()=>{target.search='';return await caches.match(target.href)||(navigation?await caches.match(new URL('./index.html',scope).href):Response.error());}));
});
