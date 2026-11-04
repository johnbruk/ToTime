// La policy del cliente, letta dal PDF.
//
// Nella pagina della policy si carica il PDF della travel policy (o se
// ne incolla il testo) e l'app propone i limiti voce per voce. Qui si
// verifica che li trovi, che li abbini alle voci giuste, che non metta
// quello che non deve (i franchi, la tariffa al km), che non salvi
// niente da sola e che i campi restino modificabili. La fixture e' una
// policy inventata, costruita con pdf-lib: nessun documento vero entra
// nel repository.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};

// Le voci come le ha Giovanni, piu' un «Albergo» con l'unita' notte per
// provare il massimo a notte.
const SEMI=()=>{
  const S=window.__stores;
  S.clients=[{id:'k2',name:'Agenzia',code:'AGE',daily_rate:400,standard_hours:8,compensation_type:'daily_rate_8h',active:true,
    expense_policy:[{category_id:'volo',category:'Volo',type:'invoice'}]},
    {id:'altro',name:'Altro',code:'ALT',daily_rate:300,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[];S.timesheet_entries=[];S.travel_expenses=[];S.billing_headers=[];S.trips=[];S.vehicles=[];
  S.expense_categories=[
    {id:'pasti',name:'Pranzo / Cena',active:true,reimbursable:true,calculation_type:'manual_amount'},
    {id:'hotel',name:'Hotel',active:true,reimbursable:true,calculation_type:'manual_amount'},
    {id:'notti',name:'Albergo',active:true,reimbursable:true,calculation_type:'quantity_rate',unit_label:'notte',default_unit_rate:120},
    {id:'taxi',name:'Taxi',active:true,reimbursable:true,calculation_type:'manual_amount'},
    {id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount'},
    {id:'km',name:'Rimborso KM',active:true,reimbursable:true,calculation_type:'manual_amount'},
    {id:'park',name:'Parcheggio Aeroporto',active:true,reimbursable:true,calculation_type:'manual_amount'},
    {id:'ped',name:'Pedaggio',active:true,reimbursable:true,calculation_type:'manual_amount'}];
};
const pg=await b.newPage({viewport:{width:390,height:2600},hasTouch:true});
pg.on('dialog',d=>d.accept());
await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(800);
await pg.evaluate(SEMI);
await pg.evaluate(()=>window.reload());
await pg.waitForTimeout(700);

const POLICY=[
  'Travel and Expense Policy',
  'Meals: lunch up to EUR 35 per person, dinner up to EUR 50 per person.',
  'Hotel accommodation shall not exceed EUR 150 per night.',
  'Taxi: maximum EUR 40 per ride. Flights: economy class only, up to CHF 400.',
  'Mileage is reimbursed at EUR 0.50 per km.',
  'Laundry up to EUR 20.',
  'Parking at the airport is not reimbursed.',
  'The flight to Geneva usually costs EUR 400.'
];

console.log('\n=== SI LEGGONO I LIMITI, VOCE PER VOCE ===');
const r=await pg.evaluate(righe=>window.leggiPolicy(righe,window.__stores.expense_categories),POLICY);
const v=id=>r.voci.find(x=>x.category_id===id);
ok(v('pasti')&&v('pasti').cap===50&&v('pasti').altri.includes(35),'pranzo 35 e cena 50 sulla stessa voce: si tiene il più alto, e si dicono tutti e due',JSON.stringify(v('pasti')&&[v('pasti').cap,v('pasti').altri]));
ok(v('hotel')&&v('hotel').cap===150&&v('hotel').perUnita,'hotel 150 € a notte',JSON.stringify(v('hotel')&&[v('hotel').cap,v('hotel').perUnita]));
ok(v('notti')&&v('notti').cap===150&&v('notti').haUnita,'anche sulla voce che si conta a notti');
ok(v('taxi')&&v('taxi').cap===40,'taxi 40 €',String(v('taxi')&&v('taxi').cap));
ok(v('volo')&&v('volo').valuta==='CHF'&&!v('volo').applicabile,'il volo in franchi si dice, ma non si mette');
ok(!v('km'),'la tariffa al km non è un tetto: non si propone');
ok(v('park')&&v('park').esclusa,'il parcheggio non rimborsato diventa a carico tuo');
ok(!v('ped'),'il pedaggio, di cui la policy non parla, resta com’è');
const ns=await pg.evaluate(()=>window.leggiPolicy(['Hotel no-show fees will not be reimbursed.','Mini-bar is not reimbursed.'],window.__stores.expense_categories));
ok(!ns.voci.some(x=>x.esclusa),'«le penali di no-show dell’hotel non si rimborsano» non rende l’hotel a tuo carico',JSON.stringify(ns.voci));
ok(r.scartati.some(s=>/Laundry/.test(s.fonte)),'la lavanderia, voce che non hai, si segnala a parte');
ok(!r.voci.some(x=>x.cap===400&&x.valuta==='EUR'),'«il volo costa 400 €» non è un limite');

console.log('\n=== IN ITALIANO, INCOLLANDO IL TESTO ===');
const it=await pg.evaluate(()=>window.leggiPolicy(['Pranzo o cena: massimo 30,00 € a pasto. Albergo fino a 120 € a notte.','I pedaggi autostradali sono rimborsati entro 25 euro al giorno.'],window.__stores.expense_categories));
const vi=id=>it.voci.find(x=>x.category_id===id);
ok(vi('pasti')&&vi('pasti').cap===30,'pasti 30 €',String(vi('pasti')&&vi('pasti').cap));
ok(vi('notti')&&vi('notti').cap===120&&vi('notti').perUnita,'albergo 120 € a notte');
ok(vi('ped')&&vi('ped').cap===25,'pedaggi 25 €',String(vi('ped')&&vi('ped').cap));

console.log('\n=== NELLA PAGINA DELLA POLICY: COMPILA, NON SALVA ===');
await pg.evaluate(()=>window.apriPolicy('k2'));
await pg.waitForTimeout(500);
const pdf=await pg.evaluate(async righe=>{
  await new Promise(r=>{const t=document.createElement('script');t.src='/vendor/pdf-lib.min.js';t.onload=r;document.head.appendChild(t)});
  const {PDFDocument,StandardFonts}=window.PDFLib;
  const doc=await PDFDocument.create();const f=await doc.embedFont(StandardFonts.Helvetica);
  const p=doc.addPage([595,842]);
  righe.forEach((s,i)=>p.drawText(s,{x:40,y:800-i*20,size:9,font:f}));
  return await doc.saveAsBase64();
},POLICY);
const tmp=path.join(ROOT,'tests/ui/.policy-prova.pdf');
fs.writeFileSync(tmp,Buffer.from(pdf,'base64'));
await pg.setInputFiles('input[type=file][accept*=pdf]',tmp);
fs.unlinkSync(tmp);
await pg.waitForFunction(()=>/dalla policy/i.test(document.getElementById('app')?.innerText||''),null,{timeout:15000});
const campo=n=>pg.evaluate(x=>{const el=document.querySelector(`#app [name="${x}"]`);return el?{val:el.value,seg:el.classList.contains('daContratto'),ro:el.readOnly||el.disabled}:null},n);
const capP=await campo('cap_pasti'),tipoP=await campo('policy_pasti');
ok(capP.val==='50'&&capP.seg&&!capP.ro,'il massimo dei pasti è compilato, segnato, e modificabile',JSON.stringify(capP));
ok(tipoP.val==='invoice','con un tetto, la voce passa a «Rimborso in fattura»',tipoP.val);
ok((await campo('perunit_notti')).val==='true','sulla voce a notti il massimo vale per ogni notte');
ok((await campo('cap_volo')).val===''&&(await campo('policy_volo')).val==='invoice','il volo in franchi non si tocca: resta com’era');
ok((await campo('policy_park')).val==='own','il parcheggio passa a tuo carico');
const testo=await pg.evaluate(()=>document.getElementById('app').innerText.replace(/\s+/g,' '));
ok(/in franchi/.test(testo),'si dice perché il volo non è stato messo');
ok(/non è stato salvato/.test(testo)&&/Finché non salvi/.test(testo),'si dice che niente è salvato, e che il file non resta');
let salvato=await pg.evaluate(()=>JSON.stringify(window.__stores.clients[0].expense_policy));
ok(!/"cap":50/.test(salvato),'prima del «Salva», la policy salvata non cambia',salvato);

console.log('\n=== SI CAMBIA A MANO, E SI SALVA ===');
await pg.evaluate(()=>{const el=document.querySelector('#app [name="cap_pasti"]');el.value='45';el.dispatchEvent(new Event('input',{bubbles:true}))});
await pg.evaluate(()=>document.querySelector('#app form').requestSubmit());
await pg.waitForTimeout(900);
const pol=await pg.evaluate(()=>window.__stores.clients[0].expense_policy);
const pp=id=>(Array.isArray(pol)?pol:JSON.parse(pol)).find(x=>x.category_id===id);
ok(pp('pasti')&&pp('pasti').cap===45,'vale il valore cambiato a mano, non quello letto',JSON.stringify(pp('pasti')));
ok(pp('hotel')&&pp('hotel').cap===150&&pp('taxi')&&pp('taxi').cap===40,'gli altri limiti letti sono salvati');
ok(!pp('park')||pp('park').type==='own','il parcheggio è a tuo carico');
const dopo=await pg.evaluate(()=>document.getElementById('app').innerText);
ok(!/dalla policy/i.test(dopo),'dopo il salvataggio non resta niente «da controllare»');
const negozi=await pg.evaluate(()=>JSON.stringify(window.__stores));
ok(!negozi.includes('%PDF')&&!negozi.includes('JVBER'),'il file non finisce da nessuna parte');

console.log('\n=== LASCIARE COM’ERA ===');
await pg.evaluate(()=>window.apriPolicy('altro'));
await pg.waitForTimeout(400);
await pg.evaluate(()=>{document.querySelector('details').open=true;document.getElementById('policyTesto').value='Taxi: max 60 €.'});
await pg.evaluate(()=>window.policyTestoIncollato('altro'));
await pg.waitForTimeout(400);
ok((await campo('cap_taxi')).val==='60','dal testo incollato: taxi 60 €');
await pg.evaluate(()=>window.annullaPropostaPolicy());
await pg.waitForTimeout(400);
ok((await campo('cap_taxi')).val==='','«Lascia la policy com’era» toglie la proposta');

console.log('\n=== DAL CONTRATTO: I LIMITI ARRIVANO NELLA POLICY ===');
await pg.evaluate(()=>window.editClient('altro'));
await pg.waitForTimeout(500);
const pdf2=await pg.evaluate(async()=>{
  const {PDFDocument,StandardFonts}=window.PDFLib;
  const doc=await PDFDocument.create();const f=await doc.embedFont(StandardFonts.Helvetica);
  const p=doc.addPage([595,842]);const t=(x,y,s)=>p.drawText(s,{x,y,size:9,font:f});
  t(40,780,'Description of the Services:');t(300,780,'Project manager');
  t(40,760,'Expenses: hotel up to EUR 140 per night, meals up to EUR 30.');
  return await doc.saveAsBase64();
});
const tmp2=path.join(ROOT,'tests/ui/.contratto-policy-prova.pdf');
fs.writeFileSync(tmp2,Buffer.from(pdf2,'base64'));
await pg.setInputFiles('input[type=file][accept*=pdf]',tmp2);
fs.unlinkSync(tmp2);
await pg.waitForFunction(()=>/Oggetto/.test(document.getElementById('contrattoEsito')?.innerText||''),null,{timeout:15000});
const es=await pg.evaluate(()=>document.getElementById('contrattoEsito').innerText);
ok(/anche 3 limiti di spesa/.test(es),'il contratto dice che ci sono anche dei limiti',es.split('\n').slice(-1)[0]);
await pg.evaluate(()=>window.apriPolicy('altro'));
await pg.waitForTimeout(500);
ok((await campo('cap_hotel')).val==='140'&&(await campo('cap_pasti')).val==='30','e nella policy sono già compilati, da controllare');
ok(!(await pg.evaluate(()=>window.__stores.clients[1].expense_policy)),'ma nessuno li ha salvati');

console.log('\n=== UNA POLICY SCANSIONATA: SI DICE, NON SI TACE ===');
// Le policy firmate in DocuSign spesso sono una foto: il testo c'e' solo
// nell'intestazione aggiunta dopo. Rispondere «nessun limite» farebbe
// credere che la policy non ne abbia.
await pg.evaluate(()=>window.apriPolicy('altro'));
await pg.waitForTimeout(400);
const pdf3=await pg.evaluate(async()=>{
  const {PDFDocument,StandardFonts}=window.PDFLib;
  const doc=await PDFDocument.create();const f=await doc.embedFont(StandardFonts.Helvetica);
  const p=doc.addPage([595,842]);const t=(x,y,s)=>p.drawText(s,{x,y,size:9,font:f});
  t(40,800,'Acme Partners SA');t(300,800,'Rue de Test 1, Geneve');t(40,40,'SOA ID: _ ACME_X1');t(500,40,'Page 13');
  return await doc.saveAsBase64();
});
const tmp3=path.join(ROOT,'tests/ui/.policy-scansione.pdf');
fs.writeFileSync(tmp3,Buffer.from(pdf3,'base64'));
await pg.setInputFiles('input[type=file][accept*=pdf]',tmp3);
fs.unlinkSync(tmp3);
await pg.waitForFunction(()=>/Non riesco a leggere/.test(document.getElementById('policyEsito')?.innerText||''),null,{timeout:15000}).catch(()=>{});
const sc=await pg.evaluate(()=>document.getElementById('policyEsito').innerText);
ok(/Non riesco a leggere/.test(sc)&&/scansione/.test(sc),'dice che è una scansione',sc.slice(0,80));
ok(await pg.evaluate(()=>document.querySelector('details').open),'e apre il riquadro per incollare il testo');

await b.close();srv.close();
console.log(`\n${pass} OK, ${fail} KO`);
process.exit(fail?1:0);
