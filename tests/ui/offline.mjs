// Verifica che l'app sia autosufficiente: nessuna richiesta a domini
// esterni, e avvio funzionante con la rete staccata. Era il difetto più
// grave in vista dell'app installata: senza queste due garanzie, aperta
// offline mostrava una schermata bianca.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const served=new Set();
const server=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}served.add(p);s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>server.listen(0,r));
const port=server.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};

console.log('\n=== A. Nessuna dipendenza da domini esterni ===');
const esterne=[];
const pg=await b.newPage();
pg.on('request',r=>{const h=new URL(r.url()).hostname;if(h!=='127.0.0.1'&&h!=='localhost')esterne.push(r.url())});
const errs=[];
pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(800);
ok(esterne.length===0,'la pagina non contatta nessun dominio esterno',esterne.slice(0,3).join(', ')||'0 richieste esterne');
ok(await pg.evaluate(()=>typeof window.go==='function'),'l\'app si è avviata');

console.log("\n=== B/C. La pagina vera, e l'avvio con la rete staccata ===");
const pg2=await b.newPage();
const errs2=[];pg2.on('pageerror',e=>errs2.push(e.message));
// prima visita: il service worker riempie la cache
await pg2.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'networkidle'});
await pg2.waitForTimeout(1500);
ok([...served].some(x=>x.endsWith('.woff2')),'i caratteri sono stati serviti dal repository',[...served].filter(x=>x.endsWith('.woff2')).length+' file');
ok(served.has('/vendor/supabase-js.js'),'la libreria Supabase arriva dal repository');
const font=await pg2.evaluate(async()=>{await document.fonts.ready;return document.fonts.size});
ok(font>0,'i @font-face locali sono stati registrati',font+' facce');
const sw=await pg2.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return !!r});
ok(sw,'il service worker si registra');
const cached=await pg2.evaluate(async()=>{const ks=await caches.keys();if(!ks.length)return 0;const c=await caches.open(ks[0]);return (await c.keys()).length});
ok(cached>25,'la cache contiene tutti gli asset, caratteri e libreria compresi',cached+' voci');
const mancanti=await pg2.evaluate(async()=>{
  const ks=await caches.keys();const c=await caches.open(ks[0]);const k=(await c.keys()).map(r=>new URL(r.url).pathname);
  return ['/vendor/supabase-js.js','/assets/fonts.css','/app.js','/styles.css','/assets/icon-512.png'].filter(x=>!k.includes(x));
});
ok(mancanti.length===0,'in cache ci sono libreria, caratteri, icone e codice',mancanti.join(', ')||'nessuno mancante');

// ora si stacca la rete e si ricarica
await pg2.context().setOffline(true);
await pg2.reload({waitUntil:'domcontentloaded'}).catch(()=>{});
await pg2.waitForTimeout(1200);
const offline=await pg2.evaluate(()=>({
  html:document.getElementById('app')?.innerHTML.length||0,
  supabase:typeof window.supabase,
  css:getComputedStyle(document.body).fontFamily
}));
console.log('  '+JSON.stringify(offline));
ok(offline.html>200,'senza rete la pagina non è bianca: l\'interfaccia c\'è',offline.html+' caratteri di markup');
ok(offline.supabase==='object','la libreria Supabase è disponibile anche offline');
ok(/Work Sans/.test(offline.css),'i caratteri sono applicati anche offline');
ok(errs2.filter(e=>!/Failed to fetch|NetworkError|network/i.test(e)).length===0,'nessun errore JS oltre a quelli di rete attesi',errs2.join(' | ')||'nessuno');
await pg2.context().setOffline(false);

console.log('\n=== D. Icone e manifest ===');
const man=JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.webmanifest'),'utf8'));
ok(man.icons.length===4,'quattro icone dichiarate',String(man.icons.length));
ok(man.icons.some(i=>i.sizes==='192x192'&&i.purpose==='any')&&man.icons.some(i=>i.sizes==='512x512'&&i.purpose==='any'),'ci sono le misure 192 e 512');
ok(man.icons.some(i=>i.purpose==='maskable'),'c\'è una versione mascherabile per l\'icona tonda di Android');
ok(man.theme_color!=='#12BFA5','il colore non è più il verde acqua del vecchio restyle',man.theme_color);
ok(man.theme_color===man.background_color,'colore e sfondo coerenti fra loro',man.theme_color);
for(const i of man.icons) ok(fs.existsSync(path.join(ROOT,i.src)),'esiste il file '+i.src);

console.log('\n=== E. Margini di sicurezza iPhone ===');
const css=fs.readFileSync(path.join(ROOT,'styles.css'),'utf8');
ok(/viewport-fit=cover/.test(fs.readFileSync(path.join(ROOT,'index.html'),'utf8')),'la pagina chiede tutto lo schermo');
ok((css.match(/safe-area-inset/g)||[]).length>=6,'e lascia i margini di notch e barra home',(css.match(/safe-area-inset/g)||[]).length+' regole');
const head=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
ok(/apple-mobile-web-app-capable/.test(head),'iOS sa che deve aprirla come app');
ok(/prefers-color-scheme: dark/.test(head),'la barra di stato segue il tema chiaro o scuro');

await b.close();server.close();
console.log('\n'+(errs.length?('ERRORI JS:\n'+errs.join('\n')):'✓ nessun errore JS'));
console.log(`RISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
