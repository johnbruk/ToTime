const CACHE='totime-v120';
const ASSETS=['./','./index.html','./styles.css','./app.js','./src/app-utils.js','./manifest.webmanifest','./assets/TOTIME_logo_only.png','./assets/TOTIME_logo_only.svg','./assets/TOTIME_logo_wordmark.png','./assets/TOTIME_logo_wordmark.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(url.hostname.includes('supabase.co') || url.hostname.includes('jsdelivr.net')){
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
