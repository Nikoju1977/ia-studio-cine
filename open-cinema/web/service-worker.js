// Cache uniquement le code statique; ne cache jamais les masters ni les réponses API privées.
const CACHE='studio-niko-cinema-engine-v0.4-mobile';
const CORE=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const u=new URL(event.request.url);
  if(event.request.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/api/'))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const c=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,c)).catch(()=>{});}return response;
  }).catch(()=>caches.match(event.request)));
});
