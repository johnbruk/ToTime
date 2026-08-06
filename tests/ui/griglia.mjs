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
await pg.goto(base,{waitUntil:'networkidle'});await pg.waitForTimeout(600);

const goJuly=async page=>{await page.evaluate(()=>{for(let i=0;i<36;i++){if(window.monthLabel&&document.querySelector('.month strong')?.textContent.startsWith('Luglio 2026'))break;window.changeMonth(-1)}});await page.waitForTimeout(300)};

console.log('\n=== A. Accesso e struttura ===');
await pg.evaluate(()=>window.go('timesheet'));await pg.waitForTimeout(300);
await goJuly(pg);
ok(await pg.evaluate(()=>[...document.querySelectorAll('.miniBtn')].some(x=>/Mensile/.test(x.textContent))),'scorciatoia al consuntivo mensile nel timesheet');
await pg.evaluate(()=>window.go('griglia'));await pg.waitForTimeout(400);
ok(/Consuntivo mensile/.test(await pg.evaluate(()=>document.querySelector('h1')?.textContent||'')),'la pagina si apre');
const cols=await pg.evaluate(()=>document.querySelectorAll('table.griglia thead th').length);
ok(cols===33,'31 giorni + commessa + totale = 33 colonne',String(cols));
const rows=await pg.evaluate(()=>[...document.querySelectorAll('table.griglia tbody tr')].map(r=>r.querySelector('.riga .n')?.textContent.trim()));
console.log('  righe:',JSON.stringify(rows));
ok(rows.length===4,'due commesse + riga Assenze + riga Pianificato',String(rows.length));
ok(rows.includes('Pianificato'),'il pianificato è una riga a parte, non mescolato');

console.log('\n=== B. Totali ===');
const tot=await pg.evaluate(()=>({
  righe:[...document.querySelectorAll('tbody tr')].map(r=>r.querySelector('.tot')?.textContent.trim()),
  generale:document.querySelector('tfoot .tot')?.textContent.trim(),
  g14:[...document.querySelectorAll('tfoot td')].map(t=>t.textContent.trim())[14]
}));
console.log('  '+JSON.stringify(tot));
ok(tot.righe[0]==='24','Equans/Beta: 8+8+4+4 = 24 h',tot.righe[0]);
ok(tot.righe[1]==='6','Zeta: 6 h',tot.righe[1]);
ok(tot.generale==='46','totale di piede 46 h: 30 lavorate + 16 di assenze; il pianificato resta fuori',tot.generale);

console.log('\n=== C. Colori dei giorni ===');
const cls=await pg.evaluate(()=>{
  const tds=[...document.querySelectorAll('tbody tr:first-child td.gg')];
  const f=n=>tds[n-1]?.className||'';
  return {g4:f(4),g5:f(5),g11:f(11),g14:f(14)};
});
console.log('  '+JSON.stringify(cls));
ok(/we/.test(cls.g4)&&/we/.test(cls.g5),'sabato e domenica marcati weekend');
ok(/bloccata/.test(cls.g14),'la cella con due voci è bloccata');

console.log('\n=== D. La cella con più voci non si può sovrascrivere ===');
const locked=await pg.evaluate(()=>{const td=document.querySelector('td.gg.bloccata');return {input:!!td.querySelector('input'),btn:!!td.querySelector('.gCell'),txt:td.textContent.trim()}});
ok(!locked.input&&locked.btn,'niente input: solo un collegamento al giorno',JSON.stringify(locked));
await pg.evaluate(()=>document.querySelector('td.gg.bloccata .gCell').click());await pg.waitForTimeout(400);
ok(/14\/07\/2026/.test(await pg.evaluate(()=>document.querySelector('h1')?.textContent||'')),'porta al dettaglio del giorno',await pg.evaluate(()=>document.querySelector('h1')?.textContent));
await pg.evaluate(()=>window.go('griglia'));await pg.waitForTimeout(400);

console.log('\n=== E. Salvataggio: crea, modifica, cancella ===');
const before=await pg.evaluate(()=>window.__stores.timesheet_entries.length);
await pg.evaluate(()=>{
  const set=(row,day,v)=>{const el=document.querySelector(`input[data-row="${row}"][data-day="${day}"]`);el.value=v;};
  const k='c1|p1|a1';
  set(k,'2026-07-10','');      // cancella
  set(k,'2026-07-13','6,5');   // modifica, con la virgola
  set(k,'2026-07-16','8');     // crea
});
dialogs=[];
await pg.evaluate(()=>window.saveGrid());await pg.waitForTimeout(1200);
const after=await pg.evaluate(()=>window.__stores.timesheet_entries.length);
ok(after===before,'una cancellata, una creata: totale invariato',before+' → '+after);
const st=await pg.evaluate(()=>({
  cancellata:!window.__stores.timesheet_entries.some(e=>e.id==='e1'),
  modificata:window.__stores.timesheet_entries.find(e=>e.id==='e2')?.hours,
  creata:window.__stores.timesheet_entries.find(e=>e.entry_date==='2026-07-16')
}));
ok(st.cancellata,'la cella svuotata elimina la voce');
ok(st.modificata===6.5,'la virgola è accettata come decimale',String(st.modificata));
ok(!!st.creata,'la cella nuova crea la voce');
ok(st.creata&&st.creata.daily_rate_snapshot===480&&st.creata.standard_hours_snapshot===8,'la voce creata porta la tariffa del cliente',JSON.stringify(st.creata&&{r:st.creata.daily_rate_snapshot,s:st.creata.standard_hours_snapshot}));
ok(/Griglia salvata/.test(await pg.evaluate(()=>document.querySelector('.toast')?.textContent||'')),'messaggio di conferma');

console.log('\n=== F. Avviso sui giorni non lavorativi ===');
await pg.waitForTimeout(300);
await pg.evaluate(()=>{const el=document.querySelector('input[data-row="c1|p1|a1"][data-day="2026-07-19"]');el.value='4';});
dialogs=[];
await pg.evaluate(()=>window.saveGrid());await pg.waitForTimeout(1200);
ok(dialogs.length===1&&/giorni non lavorativi/.test(dialogs[0]),'chiede conferma prima di scrivere in un weekend',JSON.stringify(dialogs[0]||''));
ok(await pg.evaluate(()=>window.__stores.timesheet_entries.some(e=>e.entry_date==='2026-07-19')),'accettando, la voce viene salvata');

console.log('\n=== G. Validazione ===');
await pg.evaluate(()=>{const el=document.querySelector('input[data-row="c1|p1|a1"][data-day="2026-07-21"]');el.value='99';});
await pg.evaluate(()=>window.saveGrid());await pg.waitForTimeout(700);
ok(/Valore non valido/.test(await pg.evaluate(()=>document.querySelector('.toast')?.textContent||'')),'rifiuta 99 ore in un giorno',await pg.evaluate(()=>document.querySelector('.toast')?.textContent||''));

console.log('\n=== H. Aggiunta di una commessa ===');
await pg.evaluate(()=>window.go('griglia'));await pg.waitForTimeout(400);
await pg.evaluate(()=>{const c=document.getElementById('g-cliente');c.value='c2';c.dispatchEvent(new Event('change'));});
await pg.waitForTimeout(250);
await pg.evaluate(()=>{document.getElementById('g-attivita').value='a1';window.addGridRow()});
await pg.waitForTimeout(400);
const rows2=await pg.evaluate(()=>[...document.querySelectorAll('tbody tr .riga .n')].map(x=>x.textContent.trim()));
ok(rows2.filter(x=>x==='Zeta').length===2,'la nuova commessa compare nella griglia',JSON.stringify(rows2));

console.log('\n=== I. Mobile e accessibilità ===');
const pgm=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
pgm.on('pageerror',e=>errs.push('PAGEERROR(mobile): '+e.message));
await pgm.goto(base,{waitUntil:'networkidle'});await pgm.waitForTimeout(600);
await goJuly(pgm);
await pgm.evaluate(()=>window.go('griglia'));await pgm.waitForTimeout(500);
ok(await pgm.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'nessuno scroll orizzontale di pagina');
ok(await pgm.evaluate(()=>{const s=document.querySelector('.scrollGriglia');return s.scrollWidth<=s.clientWidth+1}),'la griglia ci sta senza scorrere: niente più feritoia da tre giorni');
ok(await pgm.evaluate(()=>[...document.querySelectorAll('td.gg input')].filter(i=>i.offsetParent!==null).every(i=>i.getBoundingClientRect().height>=44)),'le celle visibili sono alte almeno 44px');
ok(await pgm.evaluate(()=>[...document.querySelectorAll('td.gg input')].every(i=>i.getAttribute('aria-label'))),'ogni cella ha un\'etichetta accessibile');
await pgm.close();
const pgd=await b.newPage({viewport:{width:1280,height:900}});
await pgd.goto(base,{waitUntil:'networkidle'});await pgd.waitForTimeout(600);
await goJuly(pgd);
await pgd.evaluate(()=>window.go('griglia'));await pgd.waitForTimeout(500);
ok(await pgd.evaluate(()=>document.querySelectorAll('table.griglia thead th.gg').length===31),'su schermo grande restano tutti e 31 i giorni');
ok(await pgd.evaluate(()=>getComputedStyle(document.querySelector('table.griglia .riga')).position==='sticky'),'e la colonna commessa resta ferma mentre si scorre');
ok(await pgd.evaluate(()=>getComputedStyle(document.querySelector('.settimanaNav')).display==='none'),'la navigazione per settimana non compare dove non serve');
await pgd.close();

console.log('\n=== J. Nuovo consuntivo: solo giornaliero, mensile e una tantum ===');
await pg.evaluate(()=>window.go('newChoice'));await pg.waitForTimeout(350);
const voci=await pg.evaluate(()=>[...document.querySelectorAll('.menuBtn b')].map(x=>x.textContent.trim()));
console.log('  voci:',JSON.stringify(voci));
ok(voci.join('|')==='Consuntivo giornaliero|Consuntivo mensile|Compenso una tantum','tre voci, nell\'ordine giusto',JSON.stringify(voci));
ok(!voci.some(v=>/Impegno continuativo|Rimborso spese|Time & Material|forfettario/i.test(v)),'niente impegno continuativo né rimborso spese qui');
await pg.evaluate(()=>{[...document.querySelectorAll('.menuBtn')].find(x=>/Consuntivo mensile/.test(x.textContent)).click()});
await pg.waitForTimeout(500);
ok(/Consuntivo mensile/.test(await pg.evaluate(()=>document.querySelector('h1')?.textContent||'')),'la voce apre il consuntivo mensile');
ok(await pg.evaluate(()=>!!document.querySelector('table.griglia')),'e la griglia c\'è davvero');
await pg.evaluate(()=>window.go('newChoice'));await pg.waitForTimeout(300);
await pg.evaluate(()=>{[...document.querySelectorAll('.menuBtn')].find(x=>/una tantum/.test(x.textContent)).click()});
await pg.waitForTimeout(400);
ok(/Compenso una tantum/.test(await pg.evaluate(()=>document.querySelector('h1')?.textContent||'')),'la terza voce apre il compenso una tantum',await pg.evaluate(()=>document.querySelector('h1')?.textContent));

console.log('\n=== K. Quello che ho tolto dal menu resta raggiungibile ===');
await pg.evaluate(()=>window.go('tmManage'));await pg.waitForTimeout(400);
ok(/Incarichi continuativi/.test(await pg.evaluate(()=>document.querySelector('h1')?.textContent||'')),'la pagina degli incarichi continuativi c\'è');
const crea=await pg.evaluate(()=>[...document.querySelectorAll('button')].some(b=>/Nuovo incarico continuativo/.test(b.textContent)));
ok(crea,'e ha il pulsante per crearne uno, anche con incarichi già presenti');
await pg.evaluate(()=>{[...document.querySelectorAll('button')].find(b=>/Nuovo incarico continuativo/.test(b.textContent)).click()});
await pg.waitForTimeout(450);
ok(/Impegno continuativo/.test(await pg.evaluate(()=>document.querySelector('h1')?.textContent||'')),'il pulsante apre davvero il form',await pg.evaluate(()=>document.querySelector('h1')?.textContent));
const spese=await pg.evaluate(()=>{const m=window.MENU;return true});
await pg.evaluate(()=>window.go('expenseForm'));await pg.waitForTimeout(400);
ok(/Nuova spesa/.test(await pg.evaluate(()=>document.querySelector('h1')?.textContent||'')),'il rimborso spese resta nella sua sezione Spese');

// il consuntivo mensile aperto dal dettaglio di un giorno si posiziona su quel mese
await pg.evaluate(()=>window.openDay('2026-05-12'));await pg.waitForTimeout(350);
await pg.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Aggiungi consuntivo/.test(x.textContent));b&&b.click()});
await pg.waitForTimeout(350);
await pg.evaluate(()=>{const b=[...document.querySelectorAll('.menuBtn')].find(x=>/Consuntivo mensile/.test(x.textContent));b&&b.click()});
await pg.waitForTimeout(500);
ok((await pg.evaluate(()=>document.querySelector('.month strong')?.textContent||'')).startsWith('Maggio 2026'),'aperto da un giorno, si posiziona sul suo mese',await pg.evaluate(()=>document.querySelector('.month strong')?.textContent.trim()));

console.log('\n=== L. La griglia su telefono: una settimana per volta ===');
const pgw=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
pgw.on('pageerror',e=>errs.push('PAGEERROR(mobile): '+e.message));
pgw.on('dialog',async d=>{await d.accept()});
await pgw.goto(base,{waitUntil:'networkidle'});await pgw.waitForTimeout(600);
await goJuly(pgw);
await pgw.evaluate(()=>window.go('griglia'));await pgw.waitForTimeout(500);
const vis=()=>pgw.evaluate(()=>[...document.querySelectorAll('table.griglia thead th.gg')].filter(t=>t.offsetParent!==null).map(t=>t.textContent.trim()));
let v=await vis();
console.log('  colonne visibili:',JSON.stringify(v));
ok(v.length<=7,'al massimo sette colonne di giorno',v.length+' colonne');
ok(await pgw.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'nessuno scroll orizzontale di pagina');
ok(await pgw.evaluate(()=>{const s=document.querySelector('.scrollGriglia');return s.scrollWidth<=s.clientWidth+1}),'e nemmeno dentro la griglia: ci sta tutto');
ok(await pgw.evaluate(()=>getComputedStyle(document.querySelector('.settimanaNav')).display!=='none'),'compare la navigazione per settimana');
ok(await pgw.evaluate(()=>{const t=[...document.querySelectorAll('.tot')][0];return /Mese/.test(t.textContent)}),'la colonna dei totali dice "Mese", perché conta più della settimana mostrata');
const alt=await pgw.evaluate(()=>[...document.querySelectorAll('.grigliaCard .barra button')].map(b=>Math.round(b.getBoundingClientRect().height)));
ok(new Set(alt).size===1&&alt[0]>=44,'i due pulsanti hanno la stessa altezza',JSON.stringify(alt));
const selH=await pgw.evaluate(()=>[...document.querySelectorAll('.nuovaRiga select,.nuovaRiga button')].map(e=>Math.round(e.getBoundingClientRect().width)));
ok(new Set(selH).size===1,'i selettori sono incolonnati e larghi uguale',JSON.stringify(selH));

await pgw.evaluate(()=>window.gridWeekShift(1));await pgw.waitForTimeout(400);
const v2=await vis();
console.log('  seconda settimana:',JSON.stringify(v2));
ok(v2.length===7&&v2[0]!==v[0],'la freccia cambia settimana',v2[0]);
ok(/2ª settimana/.test(await pgw.evaluate(()=>document.querySelector('.settimanaNav strong')?.textContent||'')),'e l\'indicazione si aggiorna');

console.log('\n=== M. Il salvataggio continua a coprire tutto il mese ===');
// il rischio dell\'approccio: le colonne fuori settimana sono nascoste, non
// rimosse. Se il salvataggio le perdesse, si perderebbero dati.
const primaM=await pgw.evaluate(()=>window.__stores.timesheet_entries.length);
const fuori=await pgw.evaluate(()=>{
  const el=document.querySelector('input[data-row="c1|p1|a1"][data-day="2026-07-28"]');
  if(!el)return 'cella assente';
  const nascosta=el.offsetParent===null;
  el.value='7';
  return nascosta?'nascosta':'visibile';
});
ok(fuori==='nascosta','la cella del 28 luglio è fuori dalla settimana mostrata',fuori);
await pgw.evaluate(()=>window.saveGrid());await pgw.waitForTimeout(1300);
const creata=await pgw.evaluate(()=>window.__stores.timesheet_entries.find(e=>e.entry_date==='2026-07-28'));
ok(!!creata&&Number(creata.hours)===7,'viene salvata lo stesso: nessun dato perso fuori dalla settimana',JSON.stringify(creata&&creata.hours));
ok(await pgw.evaluate(()=>window.__stores.timesheet_entries.length)===primaM+1,'ed è una sola voce in più');
await pgw.screenshot({path:path.join(OUT,'griglia-mobile.png'),fullPage:true});
await pgw.close();

await b.close();server.close();
console.log('\n'+(errs.length?('ERRORI JS:\n'+errs.join('\n')):'✓ nessun errore JS'));
console.log(`RISULTATO: ${pass} OK / ${fail} KO`);
