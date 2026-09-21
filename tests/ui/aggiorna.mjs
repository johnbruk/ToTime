// Prova che la pagina faccia davvero quello che promette: si installa
// il service worker VECCHIO (quello cache-first che non si aggiorna),
// si sporca la cache, poi si apre aggiorna.html e si verifica che
// dopo non resti ne' il service worker ne' la cache.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const base=`http://127.0.0.1:${srv.address().port}`;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
const ctx=await b.newContext();
const pg=await ctx.newPage();
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};

// 1. si mette il browser nello stato in cui e' il suo: sw vecchio + cache
await pg.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
await pg.evaluate(async()=>{
  // il service worker VECCHIO: cache-first, nessuno skipWaiting
  const vecchio=`const CACHE='totime-VECCHIA';
    self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./index.html']))));
    self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));`;
  const url=URL.createObjectURL(new Blob([vecchio],{type:'text/javascript'}));
  try{await navigator.serviceWorker.register(url)}catch(e){}
  const c=await caches.open('totime-VECCHIA');
  await c.put('/finto.js',new Response('vecchio'));
});
await pg.waitForTimeout(1200);
const prima=await pg.evaluate(async()=>({
  sw:(await navigator.serviceWorker.getRegistrations()).length,
  cache:(await caches.keys()).length}));
ok(prima.cache>0,'di partenza il browser ha una cache vecchia',JSON.stringify(prima));

// 2. si apre la pagina di aggiornamento
await pg.goto(base+'/aggiorna.html',{waitUntil:'domcontentloaded'});
await pg.waitForTimeout(2000);
const testo=await pg.evaluate(()=>document.getElementById('stato').textContent);
console.log('  cosa dice la pagina:',JSON.stringify(testo.replace(/\n/g,' | ')));
const dopo=await pg.evaluate(async()=>({
  sw:(await navigator.serviceWorker.getRegistrations()).length,
  cache:(await caches.keys()).length}));
ok(dopo.sw===0,'dopo non resta nessun service worker',JSON.stringify(dopo));
ok(dopo.cache===0,'e nessuna cache');
ok(/Fatto/.test(testo),'e lo dice a chiaro');

// 3. e porta dentro l'app
await pg.waitForTimeout(2500);
ok(/index\.html/.test(pg.url()),'poi apre TOTIME da sola',pg.url().replace(base,''));

await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
