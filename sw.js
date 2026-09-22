const CACHE='totime-v190';
const ASSETS=['./','./index.html','./reset.html','./styles.css','./app.js','./src/app-utils.js','./src/dataRepository.js','./src/appDataLoader.js','./src/appDataShape.js','./manifest.webmanifest','./vendor/supabase-js.js','./assets/fonts.css','./assets/fonts/QGYsz_wNahGAdqQ43Rh_c6DptfpA4cD3.woff2','./assets/fonts/QGYsz_wNahGAdqQ43Rh_cqDptfpA4cD3.woff2','./assets/fonts/QGYsz_wNahGAdqQ43Rh_fKDptfpA4Q.woff2','./assets/fonts/V8mDoQDjQSkFtoMM3T6r8E7mPb54C_k3HqUtEw.woff2','./assets/fonts/V8mDoQDjQSkFtoMM3T6r8E7mPb94C_k3HqUtEw.woff2','./assets/fonts/V8mDoQDjQSkFtoMM3T6r8E7mPbF4C_k3HqU.woff2','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable-192.png','./assets/icon-maskable-512.png','./assets/TOTIME_apple_touch.png','./assets/TOTIME_logo_only.png','./assets/TOTIME_logo_only.svg','./assets/TOTIME_logo_only_dark.png','./assets/TOTIME_logo_only_dark.svg','./assets/TOTIME_logo_wordmark.png','./assets/TOTIME_logo_wordmark.svg','./assets/TOTIME_logo_wordmark_dark.png','./assets/TOTIME_logo_wordmark_dark.svg'];

// Il codice dell'app va preso dalla rete quando c'e', e dalla cache
// solo quando manca. Servito sempre dalla cache, un rilascio non
// arriva mai: si resta sulla versione vecchia senza accorgersene, e
// chi segnala che "non funziona ancora" ha ragione due volte.
const eCodice=u=>/\.(?:js|css|html)$/.test(u.pathname)||u.pathname==='/'||u.pathname.endsWith('/');

self.addEventListener('install',e=>{
  // non si mette in coda dietro le schede aperte: la correzione di un
  // guasto non puo' aspettare che l'utente chiuda tutto
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));   // prende in carico subito le schede gia' aperte
});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(url.hostname.includes('supabase.co')){e.respondWith(fetch(e.request));return}
  if(e.request.method!=='GET'){e.respondWith(fetch(e.request));return}
  if(eCodice(url)){
    // prima la rete, con la cache come rete di sicurezza per l'offline
    e.respondWith(fetch(e.request).then(r=>{
      if(r&&r.ok){const copia=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copia))}
      return r;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
    return;
  }
  // caratteri, icone, libreria: non cambiano mai, la cache va benissimo
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
