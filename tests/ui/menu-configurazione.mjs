// Il menu di configurazione.
//
// «Voci di costo / spesa» stava sotto Anagrafiche, tra «Attività» e
// «Template fattura». Ma non è un'anagrafica della gerarchia Cliente ›
// Progetto › Commessa: è la configurazione delle spese, e stava nel
// posto sbagliato. E di trasferte, nel menu, non si parlava: niente
// veicoli, niente limiti.
//
// Qui si verifica che la sezione nuova ci sia, che le tre voci stiano
// dentro di lei e non più fra le anagrafiche, e — il punto che conta —
// che nessuna voce si sia persa per strada nel riordino.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};

const pg=await b.newPage({viewport:{width:390,height:2400}});
pg.on('dialog',d=>d.accept());
await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(900);
await pg.evaluate(()=>window.go('settings'));
await pg.waitForTimeout(450);

// La struttura come la legge una persona: i titoli di sezione, e sotto
// ognuno le voci che gli appartengono davvero nel DOM.
const struttura=await pg.evaluate(()=>{
  const out=[];let cur=null;
  [...document.querySelectorAll('#app > *, #app .app > *')].forEach(()=>{});
  const app=document.getElementById('app');
  const nodi=[...app.querySelectorAll('h2, .list')];
  nodi.forEach(n=>{
    if(n.tagName==='H2'){cur={sezione:n.textContent.trim(),voci:[]};out.push(cur)}
    else if(cur){
      [...n.querySelectorAll('.row .title')].forEach(t=>cur.voci.push(t.textContent.trim()));
    }
  });
  return out;
});
const sezioni=struttura.map(x=>x.sezione);
const vociDi=nome=>(struttura.find(x=>x.sezione===nome)||{voci:[]}).voci;
const tutte=struttura.flatMap(x=>x.voci);

console.log('\n=== LA SEZIONE NUOVA ===');
ok(sezioni.includes('Trasferte e spese'),'c’è una sezione «Trasferte e spese»',sezioni.join(' | '));
const tr=vociDi('Trasferte e spese');
ok(tr.some(v=>/voci di spesa/i.test(v)),'con le voci di spesa',tr.join(' | '));
ok(tr.some(v=>/veicoli/i.test(v)),'coi veicoli',tr.join(' | '));
ok(tr.some(v=>/policy/i.test(v)),'e con la policy',tr.join(' | '));
ok(tr.length===3,'tre voci, non di più',String(tr.length)+': '+tr.join(' | '));

console.log('\n=== E NON STANNO PIÙ FRA LE ANAGRAFICHE ===');
const an=vociDi('Anagrafiche');
ok(!an.some(v=>/voci di spesa|voci di costo/i.test(v)),
   'le voci di spesa sono uscite dalle Anagrafiche',an.join(' | '));
ok(!an.some(v=>/veicoli|policy/i.test(v)),'e così veicoli e policy',an.join(' | '));
// ...ma la gerarchia è rimasta intera: era quello il senso di quella sezione
ok(an.some(v=>/clienti/i.test(v)),'nelle Anagrafiche restano i Clienti',an.join(' | '));
ok(an.some(v=>/progetti/i.test(v)),'i Progetti',an.join(' | '));
ok(an.some(v=>/attività/i.test(v)),'e le Attività',an.join(' | '));

console.log('\n=== NIENTE SI È PERSO NEL RIORDINO ===');
// L'errore che un riordino fa fare: una voce che sparisce e nessuno se
// ne accorge finche' non la cerca.
for(const voce of ['Profilo e password','Clienti','Attività','Voci di spesa',
                   'Veicoli e rimborso km','Policy rimborsi per cliente',
                   'Template fattura','Configurazione fiscale','Pagamenti fiscali',
                   'Export Timesheet Excel','Importa da CSV','Aspetto / Tema','Database']){
  ok(tutte.some(v=>v.toLowerCase().includes(voce.toLowerCase())),
     '«'+voce+'» c’è ancora');
}

console.log('\n=== E SI APRONO DAVVERO ===');
// Una voce che c'è ma non apre niente è peggio di una che manca.
for(const [voce,atteso] of [['Voci di spesa',/voci di costo|voci di spesa/i],
                            ['Veicoli e rimborso km',/veicoli/i],
                            ['Policy rimborsi per cliente',/policy/i]]){
  await pg.evaluate(()=>window.go('settings'));
  await pg.waitForTimeout(300);
  const fatto=await pg.evaluate(v=>{
    const r=[...document.querySelectorAll('#app .row')]
      .find(x=>x.querySelector('.title')?.textContent.trim()===v);
    if(!r)return false; r.click(); return true;
  },voce);
  await pg.waitForTimeout(500);
  const tit=await pg.evaluate(()=>document.querySelector('#app h1, #app .screenTitle')?.textContent.trim()||'');
  ok(fatto&&atteso.test(tit),'«'+voce+'» apre la sua schermata',tit);
}

await pg.close(); await b.close(); srv.close();
console.log(`\n=== menu configurazione: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
