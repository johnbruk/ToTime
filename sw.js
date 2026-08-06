const CACHE='totime-v169';
const ASSETS=['./','./index.html','./reset.html','./styles.css','./app.js','./src/app-utils.js','./src/dataRepository.js','./src/appDataLoader.js','./src/appDataShape.js','./manifest.webmanifest','./vendor/supabase-js.js','./assets/fonts.css','./assets/fonts/QGYsz_wNahGAdqQ43Rh_c6DptfpA4cD3.woff2','./assets/fonts/QGYsz_wNahGAdqQ43Rh_cqDptfpA4cD3.woff2','./assets/fonts/QGYsz_wNahGAdqQ43Rh_fKDptfpA4Q.woff2','./assets/fonts/V8mDoQDjQSkFtoMM3T6r8E7mPb54C_k3HqUtEw.woff2','./assets/fonts/V8mDoQDjQSkFtoMM3T6r8E7mPb94C_k3HqUtEw.woff2','./assets/fonts/V8mDoQDjQSkFtoMM3T6r8E7mPbF4C_k3HqU.woff2','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable-192.png','./assets/icon-maskable-512.png','./assets/TOTIME_apple_touch.png','./assets/TOTIME_logo_only.png','./assets/TOTIME_logo_only.svg','./assets/TOTIME_logo_only_dark.png','./assets/TOTIME_logo_only_dark.svg','./assets/TOTIME_logo_wordmark.png','./assets/TOTIME_logo_wordmark.svg','./assets/TOTIME_logo_wordmark_dark.png','./assets/TOTIME_logo_wordmark_dark.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(url.hostname.includes('supabase.co')){
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
