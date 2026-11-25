const CACHE='chochopagos-app-v5';
const ASSETS=['./','./index.html','./manifest.webmanifest','./assets/icon.svg','./assets/css/style.css','./assets/js/api.js','./assets/js/storage.js','./assets/js/sync.js','./assets/js/pwa.js','./assets/js/app.js'];
// Nunca se guardan en caché la API (datos con sesión) ni las herramientas de desarrollo.
const LIVE=/^\/(api|webhooks|dev|health)(\/|$)/;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin||LIVE.test(url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response}).catch(()=>caches.match(event.request)));
});
