// Salvare un'impostazione due volte di fila.
//
// Il caso vero: si toglie il flag «Fattura anche il pianificato», si
// prova a rimetterlo, e compare
//
//   La scelta non si è salvata: duplicate key value violates unique
//   constraint "app_settings_user_id_setting_key_key"
//
// Il flag resta inchiodato sul valore scritto la prima volta.
//
// La causa: saveSetting decideva fra insert e update guardando solo la
// copia in memoria delle impostazioni. Chi salva senza ricaricare — il
// flag del pianificato, i gruppi chiusi del timesheet — scriveva la
// riga nel database e lasciava la copia in memoria senza. Alla
// scrittura dopo la riga non si trovava e si tentava un secondo
// insert, che il database rifiuta.
//
// Il mock rifiuta i doppioni come fa il database vero: senza quel
// vincolo nessun test avrebbe mai visto l'errore.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};
const pg=await b.newPage({viewport:{width:1280,height:1100}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(`http://127.0.0.1:${srv.address().port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(900);
await pg.evaluate(()=>{for(let i=0;i<36;i++){
  if((document.querySelector('.month strong')?.textContent||'').startsWith('Luglio 2026'))break;
  window.changeMonth(-1)}});
await pg.waitForTimeout(300);

const toast=()=>pg.evaluate(()=>document.querySelector('#app .toast')?.textContent||'');
const righeImpostazione=k=>pg.evaluate(key=>(window.__stores.app_settings||[])
  .filter(x=>x.setting_key===key).map(x=>x.setting_value),k);
const flag=()=>pg.evaluate(()=>{
  const i=[...document.querySelectorAll('#app input[type=checkbox]')]
    .find(x=>/pianificato/i.test(x.closest('label')?.textContent||''));
  return i?i.checked:null});
const premiFlag=async()=>{
  await pg.evaluate(()=>{const i=[...document.querySelectorAll('#app input[type=checkbox]')]
    .find(x=>/pianificato/i.test(x.closest('label')?.textContent||''));i.click()});
  await pg.waitForTimeout(700);
};

console.log('\n=== A. Il flag del pianificato si toglie e si rimette ===');
await pg.evaluate(()=>window.go('billing'));await pg.waitForTimeout(500);
ok(await flag()===true,'si parte col flag messo',String(await flag()));

await premiFlag();
ok(await flag()===false,'si toglie',String(await flag()));
ok((await righeImpostazione('fattura_pianificato')).join()==='false',
   'e la scelta finisce nel database',JSON.stringify(await righeImpostazione('fattura_pianificato')));

// Qui si rompeva: il secondo salvataggio non trovava la riga in memoria
// e tentava un secondo insert.
await premiFlag();
ok(await flag()===true,'si rimette — ed è questo che prima non si poteva più fare',String(await flag()));
const t1=await toast();
ok(!/duplicate key|unique constraint|non si è salvata/i.test(t1),
   'senza nessun errore a schermo',t1||'nessun messaggio');
ok((await righeImpostazione('fattura_pianificato')).length===1,
   'e nel database resta UNA riga per quella impostazione, non due',
   JSON.stringify(await righeImpostazione('fattura_pianificato')));
ok((await righeImpostazione('fattura_pianificato')).join()==='true',
   'col valore nuovo',JSON.stringify(await righeImpostazione('fattura_pianificato')));

console.log('\n=== B. E regge il quarto, il quinto, il sesto giro ===');
// un flag si preme molte volte: non deve rompersi alla seconda
for(let i=0;i<4;i++)await premiFlag();
const t2=await toast();
ok(!/duplicate key|unique constraint|non si è salvata/i.test(t2),
   'quattro giri in più, nessun errore',t2||'nessun messaggio');
ok((await righeImpostazione('fattura_pianificato')).length===1,
   'e sempre una riga sola',JSON.stringify(await righeImpostazione('fattura_pianificato')));
ok((await righeImpostazione('fattura_pianificato')).join()==='true',
   'col valore che si vede a schermo',
   (await righeImpostazione('fattura_pianificato')).join()+' · a schermo '+String(await flag()));
// Salvata, l'app deve gia' leggere il valore nuovo senza ricaricare:
// e' la copia in memoria che resta allineata. Se non lo fosse, ogni
// altra schermata continuerebbe a disegnare il valore vecchio fino al
// prossimo ricaricamento — ed e' da li' che nasceva il doppione.
const letto=await pg.evaluate(async()=>{
  await window.saveSetting('prova_allineamento','primo');
  const a=window.settingValue('prova_allineamento');
  await window.saveSetting('prova_allineamento','secondo');
  return {a,b:window.settingValue('prova_allineamento')};
});
ok(letto.a==='primo','appena salvata, l\'app legge gia\' il valore nuovo',
   'ha letto '+JSON.stringify(letto.a));
ok(letto.b==='secondo','e anche al secondo salvataggio',
   'ha letto '+JSON.stringify(letto.b));
ok((await righeImpostazione('prova_allineamento')).length===1,
   'con una riga sola nel database',
   JSON.stringify(await righeImpostazione('prova_allineamento')));

console.log('\n=== C. Lo stesso vale per i gruppi chiusi del timesheet ===');
await pg.evaluate(()=>window.go('timesheet'));await pg.waitForTimeout(500);
const toccaGruppo=async()=>{
  await pg.evaluate(()=>{const t=document.querySelector('#app .cliToggle');if(t)t.click()});
  await pg.waitForTimeout(700);
};
await toccaGruppo();await toccaGruppo();await toccaGruppo();
const t3=await toast();
ok(!/duplicate key|unique constraint|non si è salvata/i.test(t3),
   'chiudere e riaprire tre volte non rompe niente',t3||'nessun messaggio');
ok((await righeImpostazione('ts_chiusi')).length===1,
   'e anche qui una riga sola',JSON.stringify(await righeImpostazione('ts_chiusi')));

console.log('\n=== D. La riga scritta da fuori viene ritrovata, non duplicata ===');
// la riga c'e' nel database ma non nella copia in memoria: e' il caso
// di chi ha due dispositivi aperti
await pg.evaluate(()=>{
  window.__stores.app_settings.push({id:'esterna',setting_key:'dash_full',setting_value:'0'});
});
await pg.evaluate(()=>{const i=(window.data&&window.data.appSettings)||[];return i.length});
const res=await pg.evaluate(async()=>{
  // si scrive senza che la copia in memoria sappia della riga
  const r=await window.saveSetting('dash_full','1');
  return {errore:r&&r.error?String(r.error.message||r.error):''};
});
ok(!res.errore,'scrivendo una chiave già presente nel database non si fallisce',res.errore||'nessun errore');
ok((await righeImpostazione('dash_full')).length===1,
   'non si crea una seconda riga',JSON.stringify(await righeImpostazione('dash_full')));
ok((await righeImpostazione('dash_full')).join()==='1',
   'e il valore e\' quello nuovo',JSON.stringify(await righeImpostazione('dash_full')));

ok(errs.length===0,'nessun errore JS',errs.slice(0,2).join(' | ')||'nessuno');
await pg.close();await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
