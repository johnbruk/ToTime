// Cercare fra i consuntivi.
//
// La lista di un mese pieno e' lunga e si poteva solo scorrere. Il
// filtro cerca su tutto quello che la riga mostra — cliente, progetto,
// attivita', descrizione, note, sede, data — perche' cercare in un
// campo solo obbliga a ricordare dove si era scritta una cosa.
//
// Due punti delicati, ed e' su quelli che insiste questo file: il campo
// viene ricostruito a ogni lettera, quindi senza rimetterci il fuoco si
// scriverebbe una lettera sola; e nella griglia il salvataggio legge le
// caselle presenti a schermo, quindi filtrare non deve far sparire le
// ore delle righe nascoste.
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

const apri=async w=>{
  const pg=await b.newPage({viewport:{width:w,height:1000},hasTouch:w<900});
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(()=>{for(let i=0;i<36;i++){
    if((document.querySelector('.month strong')?.textContent||'').startsWith('Luglio 2026'))break;
    window.changeMonth(-1)}});
  await pg.waitForTimeout(400);
  return pg;
};
// l'elenco dei consuntivi ora e' spezzato in un gruppo per cliente:
// si contano le righe di tutti i gruppi, non quelle dell'ultima lista
// della pagina (che sarebbe solo l'ultimo cliente). La scheda
// «Per cliente» resta fuori: non si filtra.
const quante=pg=>pg.evaluate(()=>document.querySelectorAll('#app .cliGruppo .row').length);
const righeElenco=pg=>pg.evaluate(()=>[...document.querySelectorAll('#app .cliGruppo .row')].map(r=>r.innerText));

console.log('\n=== A. Nel Timesheet ===');
const pg=await apri(1280);
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.evaluate(()=>window.go('timesheet'));await pg.waitForTimeout(400);
const tutte=await quante(pg);
ok(tutte>1,'il mese di prova ha piu\' righe',tutte+' righe');
ok(await pg.evaluate(()=>!!document.getElementById('cercaBox')),'c\'è il campo di ricerca');

// si scrive lettera per lettera, come una persona
await pg.click('#cercaBox');
await pg.type('#cercaBox','seconda',{delay:50});
await pg.waitForTimeout(350);
ok(await pg.evaluate(()=>document.getElementById('cercaBox')?.value)==='seconda',
   'il campo tiene tutto quello che si scrive, lettera dopo lettera',
   await pg.evaluate(()=>JSON.stringify(document.getElementById('cercaBox')?.value)));
ok(await pg.evaluate(()=>document.activeElement&&document.activeElement.id==='cercaBox'),
   'e non perde il fuoco a ogni ridisegno');
const dopo=await quante(pg);
ok(dopo<tutte,'la lista si restringe',`${tutte} → ${dopo}`);
ok((await righeElenco(pg)).every(t=>/seconda/i.test(t)),
   'e restano solo le righe che contengono quel testo');
ok(/1 riga su/.test(await pg.evaluate(()=>document.querySelector('.cercaEsito')?.textContent||'')),
   'con scritto quante ne sono rimaste',await pg.evaluate(()=>document.querySelector('.cercaEsito')?.textContent));

console.log('\n=== B. Cerca su tutto quello che la riga mostra ===');
for(const [q,cosa] of [['equans','il cliente'],['beta','il progetto'],['14/07','la data']]){
  await pg.evaluate(v=>window.cambiaCerca(v),q);await pg.waitForTimeout(300);
  const n=await quante(pg);
  ok(n>0&&n<=tutte,`cercando «${q}» trova per ${cosa}`,n+' righe');
}
// le note: si scrive una nota e la si cerca
await pg.evaluate(async()=>{
  const e=window.__stores.timesheet_entries.find(x=>String(x.entry_date).startsWith('2026-07'));
  if(e)e.notes='parolachiaveunica';
  await window.reload();
});
await pg.waitForTimeout(700);
await pg.evaluate(()=>window.go('timesheet'));await pg.waitForTimeout(300);
await pg.evaluate(()=>window.cambiaCerca('parolachiaveunica'));await pg.waitForTimeout(350);
ok(await quante(pg)===1,'e trova anche dentro le note',await quante(pg)+' righe');

console.log('\n=== C. Svuotare riporta tutto ===');
await pg.evaluate(()=>window.cambiaCerca('zzzznonesiste'));await pg.waitForTimeout(300);
ok(await quante(pg)===0,'una ricerca senza risultati non mostra righe a caso',await quante(pg)+' righe');
const vuoto=await pg.evaluate(()=>document.querySelector('#app .empty')?.innerText.replace(/\s+/g,' ')||'');
ok(/Nessun consuntivo con/.test(vuoto),'lo dice, invece di sembrare rotta',vuoto.slice(0,70));
await pg.evaluate(()=>{const b=document.querySelector('#app .empty button');b&&b.click()});
await pg.waitForTimeout(350);
ok(await quante(pg)===tutte,'e il comando per svuotare riporta tutte le righe',await quante(pg)+' righe');

console.log('\n=== D. Nella griglia, e senza perdere niente ===');
// Il punto delicato: saveGrid legge le caselle presenti a schermo. Se
// filtrare facesse sparire le righe dal conto, salvando si
// cancellerebbero le ore che non si stavano guardando.
await pg.evaluate(()=>window.go('griglia'));await pg.waitForTimeout(500);
const righeG=pg2=>pg2.evaluate(()=>document.querySelectorAll('table.griglia tbody tr').length);
const tutteG=await righeG(pg);
ok(tutteG>1,'la griglia ha piu\' righe',tutteG+' righe');
await pg.evaluate(()=>window.cambiaCerca('alfa'));await pg.waitForTimeout(400);
const dopoG=await righeG(pg);
ok(dopoG<tutteG,'il filtro vale anche qui',`${tutteG} → ${dopoG}`);

const primaDelSalvataggio=await pg.evaluate(()=>window.__stores.timesheet_entries.map(e=>e.id+':'+e.hours).sort().join(','));
// si cambia una casella visibile e si salva, col filtro acceso
await pg.evaluate(()=>{const i=[...document.querySelectorAll('table.griglia td.gg input')]
  .filter(x=>x.offsetParent!==null&&x.value!=='')[0];
  if(i){i.value='5';i.dispatchEvent(new Event('change',{bubbles:true}))}});
await pg.evaluate(()=>window.saveGrid());
await pg.waitForTimeout(1500);
const dopoIlSalvataggio=await pg.evaluate(()=>window.__stores.timesheet_entries.map(e=>e.id+':'+e.hours).sort().join(','));
const perse=await pg.evaluate(()=>window.__stores.timesheet_entries.length);
ok(perse>0,'dopo il salvataggio le registrazioni ci sono ancora',perse+' registrazioni');
ok(primaDelSalvataggio!==dopoIlSalvataggio,'la modifica è stata scritta','qualcosa è cambiato');
const cancellate=await pg.evaluate(()=>{
  const ids=new Set(window.__stores.timesheet_entries.map(e=>e.id));
  return ['e1','e2','e3','e3b','e7','e9'].filter(x=>!ids.has(x));});
ok(cancellate.length===0,'e nessuna riga nascosta dal filtro è stata cancellata',
   cancellate.length?'perse: '+cancellate.join(', '):'tutte al loro posto');
ok(errs.length===0,'nessun errore JS',errs.slice(0,2).join(' | ')||'nessuno');
await pg.close();

console.log('\n=== E. Sul telefono ===');
const pm=await apri(390);
await pm.evaluate(()=>window.go('timesheet'));await pm.waitForTimeout(400);
const m=await pm.evaluate(()=>{
  const i=document.getElementById('cercaBox');
  const r=i?i.getBoundingClientRect():null;
  return {h:r?Math.round(r.height):0,px:i?parseFloat(getComputedStyle(i).fontSize):0,
          ovf:document.documentElement.scrollWidth>document.documentElement.clientWidth+1};});
ok(m.h>=44,'il campo è alto abbastanza per il dito',m.h+'px');
ok(m.px>=16,'e non fa ingrandire la pagina toccandolo',m.px+'px');
ok(!m.ovf,'niente scorre di lato');
await pm.evaluate(()=>window.cambiaCerca('equans'));await pm.waitForTimeout(350);
const x=await pm.evaluate(()=>{const b=document.querySelector('.cercaX');
  return b?Math.round(b.getBoundingClientRect().height):0});
ok(x>=44,'e la ✕ per svuotare pure',x+'px');
await pm.close();

await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
