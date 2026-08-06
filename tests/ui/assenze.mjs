import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,''),OUT=process.env.SHOT_DIR||'/tmp';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>server.listen(0,r));
const base=`http://127.0.0.1:${server.address().port}/tests/ui/mock.html`;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
const errs=[];const pg=await b.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2});
pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/404/.test(m.text()))errs.push('CONSOLE: '+m.text());});
let dialogs=[];pg.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};
const goJuly=async page=>{await page.evaluate(()=>{for(let i=0;i<36;i++){if(document.querySelector('.month strong')?.textContent.startsWith('Luglio 2026'))break;window.changeMonth(-1)}});await page.waitForTimeout(300)};
await pg.goto(base,{waitUntil:'networkidle'});await pg.waitForTimeout(600);

console.log('\n=== A. IL PREGRESSO — dati salvati dalla v1.6 ===');
await pg.evaluate(()=>window.go('calendario'));await pg.waitForTimeout(300);await goJuly(pg);
const apri=async page=>{await page.evaluate(()=>{const d=document.querySelector('.card details.moreFields');if(d)d.open=true});await page.waitForTimeout(150)};
await apri(pg);
const legacy=await pg.evaluate(()=>({
  chiaviSalvate:window.__stores.app_settings.map(s=>s.setting_key),
  lette:window.assenzeList?null:'non esposta'
}));
console.log('  chiavi in app_settings:',JSON.stringify(legacy.chiaviSalvate));
const listaMese=await pg.evaluate(()=>[...document.querySelectorAll('.card .list .row .title')].map(x=>x.textContent.trim()));
ok(listaMese.length===2&&listaMese.every(x=>/Ferie/.test(x)),'i 2 giorni off della v1.6 compaiono come Ferie',JSON.stringify(listaMese));
const oreLegacy=await pg.evaluate(()=>[...document.querySelectorAll('.card .list .row .value')].map(x=>x.textContent.trim().split(' ')[0]));
ok(oreLegacy.every(x=>x==='8'),'valorizzati 8 ore, come una giornata piena',JSON.stringify(oreLegacy));
const celle=await pg.evaluate(()=>[...document.querySelectorAll('.calCell.ferie .calNum')].map(x=>x.textContent.trim()));
ok(celle.includes('6')&&celle.includes('7'),'restano colorati nel calendario',JSON.stringify(celle));
ok(await pg.evaluate(()=>window.__stores.app_settings.length===1),'finché non tocco nulla, non riscrivo niente sul database');

console.log('\n=== B. Segnare una singola assenza ===');
await pg.evaluate(()=>{const f=document.querySelector('form.assForm');f.day.value='2026-07-08';f.kind.value='malattia';f.hours.value='8';f.note.value='influenza';f.requestSubmit()});
await pg.waitForTimeout(900);await apri(pg);
const dopo=await pg.evaluate(()=>[...document.querySelectorAll('.card .list .row .title')].map(x=>x.textContent.trim()));
ok(dopo.some(x=>/Malattia/.test(x)),'la malattia compare in elenco',JSON.stringify(dopo));
const salvato=await pg.evaluate(()=>{const m={};window.__stores.app_settings.forEach(s=>m[s.setting_key]=s.setting_value);return m});
ok(!!salvato['assenze_2026'],'scritta la chiave nuova assenze_2026');
ok(JSON.parse(salvato['assenze_2026']).length===3,'contiene tutte e 3 le assenze, non solo la nuova',String(JSON.parse(salvato['assenze_2026']||'[]').length));
ok(JSON.parse(salvato['ferie_2026']).length===3,'la chiave vecchia resta aggiornata: si può tornare indietro di versione',salvato['ferie_2026']);
ok(JSON.parse(salvato['assenze_2026']).find(a=>a.d==='2026-07-08').n==='influenza','la nota viene salvata');

console.log('\n=== C. Tipi e ore parziali ===');
await pg.evaluate(()=>{const f=document.querySelector('form.assForm');f.day.value='2026-07-09';f.kind.value='permesso';f.hours.value='4';f.note.value='';f.requestSubmit()});
await pg.waitForTimeout(900);await apri(pg);
const perm=await pg.evaluate(()=>{const a=JSON.parse(window.__stores.app_settings.find(s=>s.setting_key==='assenze_2026').setting_value);return a.find(x=>x.d==='2026-07-09')});
ok(perm&&perm.k==='permesso'&&perm.h===4,'permesso di 4 ore salvato correttamente',JSON.stringify(perm));
ok(await pg.evaluate(()=>[...document.querySelectorAll('.card .list .row .value')].some(x=>x.textContent.trim().startsWith('4'))),'in elenco si leggono 4 h');

console.log('\n=== D. Periodo con tipo e ore ===');
await apri(pg);
await pg.evaluate(()=>{document.getElementById('ferieFrom').value='2026-07-20';document.getElementById('ferieTo').value='2026-07-24';document.getElementById('ferieKind').value='ferie';document.getElementById('ferieHours').value='8';});
dialogs=[];
await pg.evaluate(()=>window.ferieRange('add'));await pg.waitForTimeout(1100);
const anno=await pg.evaluate(()=>JSON.parse(window.__stores.app_settings.find(s=>s.setting_key==='assenze_2026').setting_value));
ok(anno.filter(a=>a.d>='2026-07-20'&&a.d<='2026-07-24').length===5,'5 giorni feriali segnati',String(anno.filter(a=>a.d>='2026-07-20'&&a.d<='2026-07-24').length));
ok(anno.filter(a=>a.d==='2026-07-20')[0].k==='ferie','il tipo scelto viene applicato al periodo');
ok(!anno.some(a=>a.d==='2026-07-25'||a.d==='2026-07-26'),'il weekend è escluso dal periodo');

console.log('\n=== E. La griglia mostra le assenze senza farle riscrivere ===');
await pg.evaluate(()=>window.go('griglia'));await pg.waitForTimeout(500);await goJuly(pg);
await pg.evaluate(()=>window.go('griglia'));await pg.waitForTimeout(500);
const gr=await pg.evaluate(()=>{
  const r=[...document.querySelectorAll('tbody tr')].map(t=>t.querySelector('.riga .n')?.textContent.trim());
  const ass=[...document.querySelectorAll('tr.assRiga td.gg .ass')].map(x=>x.textContent.trim()).filter(Boolean);
  return {righe:r,ass,totAss:document.querySelector('tr.assRiga .tot')?.textContent.trim(),
          inputNellaRiga:document.querySelectorAll('tr.assRiga input').length};
});
console.log('  '+JSON.stringify(gr));
ok(gr.righe.includes('Assenze'),'c\'è la riga Assenze');
ok(gr.inputNellaRiga===0,'non è compilabile: nessun campo di inserimento');
ok(gr.ass.length===9,'9 giorni di assenza a luglio: 2 pregressi + malattia + permesso + 5 di ferie',String(gr.ass.length));
ok(gr.totAss==='68','totale assenze 68 h: 8 giornate piene più un permesso di 4 h',gr.totAss);
const tot=await pg.evaluate(()=>({giorno8:[...document.querySelectorAll('tfoot td')][8]?.textContent.trim(),generale:document.querySelector('tfoot .tot')?.textContent.trim()}));
ok(tot.giorno8==='8','il totale del giorno comprende l\'assenza',tot.giorno8);
ok(/Assenze 68 h/.test(await pg.evaluate(()=>document.querySelector('.metricLine')?.textContent||'')),'il riepilogo distingue consuntivato e assenze',await pg.evaluate(()=>document.querySelector('.metricLine')?.textContent.replace(/\s+/g,' ')||''));

console.log('\n=== F. Le assenze non sporcano il consuntivato ===');
await pg.evaluate(()=>window.go('timesheet'));await pg.waitForTimeout(400);
const ts=await pg.evaluate(()=>[...document.querySelectorAll('.kpiGrid strong')].map(x=>x.textContent.trim()));
ok(ts[0]==='30,0 h','il timesheet conta solo le ore lavorate, non le assenze',ts[0]);
await pg.evaluate(()=>window.go('pivot'));await pg.waitForTimeout(500);
const pv=await pg.evaluate(()=>[...document.querySelectorAll('.kpiGrid strong')].map(x=>x.textContent.trim()));
ok(pv[0]==='30,0 h','nemmeno l\'analisi consuntivi le conta',pv[0]);

console.log('\n=== G. Avviso quando si consuntiva in un giorno di assenza ===');
await pg.evaluate(()=>window.go('dailyForm'));await pg.waitForTimeout(400);
dialogs=[];
await pg.evaluate(()=>{const f=document.querySelector('form.form');f.entry_date.value='2026-07-08';f.hours.value='4';f.requestSubmit()});
await pg.waitForTimeout(800);
ok(dialogs.length===1&&/malattia/i.test(dialogs[0]),'l\'avviso dice di che assenza si tratta',JSON.stringify(dialogs[0]||''));
ok(/8 h/.test(dialogs[0]||''),'e quante ore vale');

console.log('\n=== H. Dettaglio giorno e rimozione ===');
await pg.evaluate(()=>window.openDay('2026-07-09'));await pg.waitForTimeout(400);
ok(/Permesso/.test(await pg.evaluate(()=>document.querySelector('.sub')?.textContent||'')),'il dettaglio giorno mostra tipo e ore',await pg.evaluate(()=>document.querySelector('.sub')?.textContent.trim()||''));
await pg.evaluate(()=>window.go('calendario'));await pg.waitForTimeout(400);await goJuly(pg);await apri(pg);
const prima=await pg.evaluate(()=>document.querySelectorAll('.card .list .row').length);
dialogs=[];
await pg.evaluate(()=>window.removeAssenza('2026-07-09'));await pg.waitForTimeout(900);
ok(dialogs.length===1&&/permesso/i.test(dialogs[0]),'chiede conferma nominando l\'assenza',JSON.stringify(dialogs[0]||''));
ok(await pg.evaluate(()=>document.querySelectorAll('.card .list .row').length)===prima-1,'la rimozione funziona');
ok(!await pg.evaluate(()=>JSON.parse(window.__stores.app_settings.find(s=>s.setting_key==='ferie_2026').setting_value).includes('2026-07-09')),'tolta anche dalla chiave vecchia');

console.log('\n=== I. Robustezza ===');
const bad=await pg.evaluate(()=>{
  window.__stores.app_settings.find(s=>s.setting_key==='assenze_2026').setting_value='non è json';
  try{window.go('calendario');return 'regge'}catch(e){return 'crash: '+e.message}
});
ok(bad==='regge','un valore corrotto non fa cadere la vista',bad);
await pg.waitForTimeout(300);
ok(await pg.evaluate(()=>document.querySelectorAll('.calCell.ferie').length>0),'e il pregresso continua a essere letto');

console.log('\n=== J. Mobile ===');
const pgm=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
pgm.on('pageerror',e=>errs.push('PAGEERROR(mobile): '+e.message));
await pgm.goto(base,{waitUntil:'networkidle'});await pgm.waitForTimeout(600);
await pgm.evaluate(()=>window.go('calendario'));await pgm.waitForTimeout(400);await goJuly(pgm);
await pgm.evaluate(()=>{const d=document.querySelector('.card details.moreFields');if(d)d.open=true});await pgm.waitForTimeout(200);
ok(await pgm.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'nessuno scroll orizzontale');
ok(await pgm.evaluate(()=>[...document.querySelectorAll('.assForm input,.assForm select,.assForm button,.frRow input,.frRow select,.frRow button')].every(e=>e.getBoundingClientRect().height>=44)),'tutti i controlli ≥44px');
ok(await pgm.evaluate(()=>[...document.querySelectorAll('.assForm input,.assForm select')].every(e=>e.getAttribute('aria-label'))),'ogni campo ha un\'etichetta accessibile');
const alt=await pgm.evaluate(()=>{const d=document.querySelector('.card details.moreFields');d.open=false;return Math.round(document.body.scrollHeight/window.innerHeight*10)/10});
ok(alt<2.6,'a moduli chiusi la pagina resta corta',alt+' schermate');
await pgm.screenshot({path:path.join(OUT,'assenze-mobile.png'),fullPage:true});
await pgm.close();

await b.close();server.close();
console.log('\n'+(errs.length?('ERRORI JS:\n'+errs.join('\n')):'✓ nessun errore JS'));
console.log(`RISULTATO: ${pass} OK / ${fail} KO`);
