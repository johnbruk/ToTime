// Il contratto, letto per la fatturazione.
//
// Si carica il PDF del contratto nella scheda cliente e l'app ne legge
// il testo per proporre i dati della fattura mensile. La fixture e' un
// SOA inventato, costruito qui con pdf-lib con la stessa impaginazione
// a due colonne di uno vero: etichetta a sinistra, valore a destra.
// Nessun contratto vero entra nel repository.
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

const pg=await b.newPage({viewport:{width:390,height:2400},hasTouch:true});
pg.on('dialog',d=>d.accept());
await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(800);
await pg.evaluate(()=>{
  const S=window.__stores;
  S.clients=[{id:'k2',name:'Agenzia',code:'AGE',daily_rate:400,standard_hours:8,compensation_type:'daily_rate_8h',active:true,invoice_language:'it'}];
  S.projects=[];S.timesheet_entries=[];S.travel_expenses=[];S.billing_headers=[];
});
await pg.evaluate(()=>window.reload());
await pg.waitForTimeout(700);

// Il SOA inventato, in base64
const pdf=await pg.evaluate(async()=>{
  await new Promise(r=>{const t=document.createElement('script');t.src='/vendor/pdf-lib.min.js';t.onload=r;document.head.appendChild(t)});
  const {PDFDocument,StandardFonts}=window.PDFLib;
  const doc=await PDFDocument.create();const f=await doc.embedFont(StandardFonts.Helvetica);
  const p=doc.addPage([595,842]);
  const t=(x,y,s)=>p.drawText(s,{x,y,size:9,font:f});
  t(40,800,'Acme Partners SA');t(200,800,'Rue de Test 1, 1200 Geneve, Switzerland');t(420,800,'invoices@acme-partners.example');
  t(40,780,'UID: CHE-123.456.789');
  t(40,740,'Assumed duration of the Project/ Time Schedule:');t(300,740,'1/10/2026 - 30/3/2029');
  t(40,720,'Description of the Services/Project:');t(300,720,'SAP and Omnichannel Project manager');
  t(300,708,'Overseeing and coordinating the team');
  t(40,680,'Client:');t(300,680,'Mega Retail Group');
  t(40,660,'Standard Hours:');t(300,660,'8 Hours per Day ,5 Days per Week');
  t(40,640,'Standard Fee Rate:');t(300,640,'EUR 550.00 all inclusive remote rate Daily');
  t(40,620,'The consultant shall comply with the terms of the agreement and the travel policy.');
  t(40,40,'SOA ID: _ ACME Geneve_X1Y2Z3');t(300,40,'Geneve - 21/09/26');
  return await doc.saveAsBase64();
});

console.log('\n=== SI LEGGE QUELLO CHE SERVE ALLA FATTURA ===');
const r=await pg.evaluate(async b64=>{
  const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  return await window.estraiContratto(bin.buffer);
},pdf);
ok(r.oggetto==='SAP and Omnichannel Project manager','l’oggetto',r.oggetto);
ok(r.clienteFinale==='Mega Retail Group','il cliente finale',r.clienteFinale);
ok(r.riferimento==='SOA ACME Geneve_X1Y2Z3','il riferimento',r.riferimento);
ok(r.tariffa===550&&r.tariffaGiornaliera,'la tariffa giornaliera',String(r.tariffa));
ok(r.ore===8,'le ore al giorno',String(r.ore));
ok(r.periodo&&r.periodo.da==='2026-10-01'&&r.periodo.a==='2029-03-30','il periodo',JSON.stringify(r.periodo));
ok(r.intestatario==='Acme Partners SA','a chi si intesta la fattura',r.intestatario);
ok(r.partitaIva==='CHE-123.456.789','la UID',r.partitaIva);
ok(r.email[0]==='invoices@acme-partners.example','il contatto per le fatture',r.email.join(' '));
ok(r.lingua==='en','e la lingua: inglese',r.lingua);

console.log('\n=== NELLA SCHEDA CLIENTE COMPILA I CAMPI, E NON SALVA IL FILE ===');
await pg.evaluate(()=>window.editClient('k2'));
await pg.waitForTimeout(500);
const tmp=path.join(ROOT,'tests/ui/.contratto-prova.pdf');
fs.writeFileSync(tmp,Buffer.from(pdf,'base64'));
await pg.setInputFiles('input[type=file][accept*=pdf]',tmp);
fs.unlinkSync(tmp);
await pg.waitForFunction(()=>/Oggetto/.test(document.getElementById('contrattoEsito')?.innerText||''),null,{timeout:15000});
const campi=await pg.evaluate(()=>Object.fromEntries(['invoice_subject','invoice_end_client','invoice_reference','daily_rate','standard_hours','vat_number'].map(n=>[n,document.querySelector(`#app form [name=${n}]`)?.value])));
ok(campi.invoice_subject==='SAP and Omnichannel Project manager','oggetto compilato',campi.invoice_subject);
ok(campi.invoice_end_client==='Mega Retail Group','cliente finale compilato',campi.invoice_end_client);
ok(campi.invoice_reference==='SOA ACME Geneve_X1Y2Z3','riferimento compilato',campi.invoice_reference);
ok(Number(campi.daily_rate)===550,'tariffa compilata',campi.daily_rate);
const en=await pg.evaluate(()=>document.querySelector('[name=invoice_language][value=en]').checked);
ok(en,'e la lingua passa a English');
const esito=await pg.evaluate(()=>document.getElementById('contrattoEsito').innerText);
ok(/invoices@acme-partners\.example/.test(esito),'i contatti si vedono');
ok(/non è stato salvato/.test(esito),'e dice che il PDF non è stato salvato');
await pg.evaluate(()=>document.querySelector('#app form').requestSubmit());
await pg.waitForTimeout(900);
const c=await pg.evaluate(()=>window.__stores.clients[0]);
ok(c.invoice_subject==='SAP and Omnichannel Project manager'&&c.invoice_language==='en'&&Number(c.daily_rate)===550,
   'salvando, i dati restano nel cliente',`${c.invoice_subject} · ${c.invoice_language} · ${c.daily_rate}`);
const negozi=await pg.evaluate(()=>JSON.stringify(window.__stores));
ok(!negozi.includes('%PDF')&&!negozi.includes('JVBER'),'il file non finisce da nessuna parte');

await b.close();srv.close();
console.log(`\n${pass} OK, ${fail} KO`);
process.exit(fail?1:0);
