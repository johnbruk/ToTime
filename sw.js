const CACHE='totime-v139';
const ASSETS=['./','./index.html','./reset.html','./styles.css','./app.js','./src/app-utils.js','./src/dataRepository.js','./src/appDataLoader.js','./src/appDataShape.js','./manifest.webmanifest','./assets/TOTIME_apple_touch.png','./assets/TOTIME_logo_only.png','./assets/TOTIME_logo_only.svg','./assets/TOTIME_logo_only_dark.png','./assets/TOTIME_logo_only_dark.svg','./assets/TOTIME_logo_wordmark.png','./assets/TOTIME_logo_wordmark.svg','./assets/TOTIME_logo_wordmark_dark.png','./assets/TOTIME_logo_wordmark_dark.svg'];
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
