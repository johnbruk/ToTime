// Le foto delle ricevute.
//
// Finora l'app non aveva un campo allegato, non una foto, niente. Una
// nota spese senza giustificativi non è una nota spese: è un appunto.
// E dal 2025 la questione non è più solo di ordine.
//
// Questo è il solo pezzo di tutta la serie che aggiunge un SERVIZIO
// nuovo — Supabase Storage, che l'app non usava da nessuna parte — e
// per questo sta da solo: se qualcosa non va, si disattiva senza
// toccare il resto.
//
// Qui si verifica che il caricamento funzioni, che il percorso del file
// cominci con l'id dell'utente (è su quella cartella che le policy
// decidono: senza, uno leggerebbe le ricevute di un altro), che senza
// Storage l'app non si rompa, e che la spunta «la ricevuta ce l'ho» si
// metta da sé quando il file c'è davvero.
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
const testo=pg=>pg.evaluate(()=>document.getElementById('app').innerText.replace(/\s+/g,' '));

const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'k2',name:'K2',daily_rate:500,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'omni',client_id:'k2',name:'Omnichannel',active:true}];
  S.expense_categories=[{id:'cena',name:'Cena',active:true,reimbursable:true,calculation_type:'manual_amount'}];
  S.travel_expenses=[{id:'sp1',expense_date:'2026-10-05',client_id:'k2',project_id:'omni',
    expense_category_id:'cena',amount:48,reimbursement_type:'invoice',
    payment_method:'carta',receipt_kept:false,work_city:'Milano'}];
  S.trips=[];S.vehicles=[];
`;
const apri=async(w=390)=>{
  const pg=await b.newPage({viewport:{width:w,height:1900},hasTouch:w<900});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  return pg;
};
const allaSpesa=async pg=>{
  await pg.evaluate(()=>window.editEntry('sp1','expense'));
  await pg.waitForTimeout(500);
};
// Una foto finta, ma un file vero: il percorso e il tipo contano.
const FOTO=path.join('/tmp/claude-0','ricevuta-finta.png');
fs.writeFileSync(FOTO,Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001','hex'));

console.log('\n=== IL MODULO CHIEDE LA RICEVUTA ===');
{
  const pg=await apri();
  await allaSpesa(pg);
  const c=await pg.evaluate(()=>!!document.querySelector('#app input[type=file][name=receipt_file]'));
  ok(c,'c’è il modo di allegare la foto della ricevuta');
  ok((await testo(pg)).toLowerCase().includes('ricevuta'),'e il modulo ne parla');
  await pg.close();
}

console.log('\n=== SI CARICA, E FINISCE NELLA CARTELLA GIUSTA ===');
{
  const pg=await apri();
  await allaSpesa(pg);
  await pg.setInputFiles('#app input[type=file][name=receipt_file]',FOTO);
  await pg.waitForTimeout(1200);
  const caricati=await pg.evaluate(()=>(window.__storage||[]).slice());
  ok(caricati.length===1,'il file è stato caricato',String(caricati.length));
  const f=caricati[0]||{};
  ok(f.bucket==='ricevute','nel bucket «ricevute»',String(f.bucket));
  // IL PUNTO DI SICUREZZA: la prima cartella deve essere l'id utente,
  // perche' e' su quella che le policy del bucket decidono.
  ok(String(f.path||'').startsWith('u1/'),
     'e in una cartella che comincia con l’id dell’utente: è su quella che le policy decidono',
     String(f.path));
  ok(String(f.path||'').includes('sp1'),'con l’id della spesa nel percorso',String(f.path));
  // Il percorso finisce sulla riga della spesa
  const e=await pg.evaluate(()=>window.__stores.travel_expenses.find(x=>x.id==='sp1'));
  ok(!!e.receipt_path,'e il percorso è scritto sulla spesa',String(e.receipt_path));
  ok(e.receipt_path===f.path,'lo stesso del file caricato',String(e.receipt_path));
  // E la spunta «la ricevuta ce l'ho» si mette da se': il file E' la ricevuta
  ok(e.receipt_kept===true,
     'e la spunta «la ricevuta ce l’ho» si mette da sé: il file è la ricevuta',
     String(e.receipt_kept));
  await pg.close();
}

console.log('\n=== LA RIGA NON È PIÙ «DA SISTEMARE» ===');
{
  const pg=await apri();
  await allaSpesa(pg);
  // prima: carta ma senza ricevuta -> segnalata
  await pg.evaluate(()=>window.go('expenses'));
  await pg.waitForTimeout(350);
  await pg.evaluate(()=>{for(let i=0;i<48;i++){
    if((document.querySelector('.month strong')?.textContent||'').startsWith('Ottobre 2026'))break;
    window.changeMonth(-1)}});
  await pg.waitForTimeout(450);
  const prima=await pg.evaluate(()=>document.querySelectorAll('#app .tagManca').length);
  ok(prima===1,'senza ricevuta la spesa è segnalata',String(prima));
  await allaSpesa(pg);
  await pg.setInputFiles('#app input[type=file][name=receipt_file]',FOTO);
  await pg.waitForTimeout(1200);
  await pg.evaluate(()=>window.go('expenses'));
  await pg.waitForTimeout(500);
  const dopo=await pg.evaluate(()=>document.querySelectorAll('#app .tagManca').length);
  ok(dopo===0,'con la ricevuta caricata la segnalazione sparisce',String(dopo));
  await pg.close();
}

console.log('\n=== SI RIVEDE, E SI PUÒ TOGLIERE ===');
{
  const pg=await apri();
  await allaSpesa(pg);
  await pg.setInputFiles('#app input[type=file][name=receipt_file]',FOTO);
  await pg.waitForTimeout(1200);
  await allaSpesa(pg);
  const t=(await testo(pg)).toLowerCase();
  ok(/ricevuta allegata|guarda la ricevuta|apri la ricevuta/.test(t),
     'riaprendo la spesa, la ricevuta risulta allegata',t.slice(0,220));
  const togli=await pg.evaluate(()=>{
    const b=[...document.querySelectorAll('#app button')].find(x=>/togli la ricevuta/i.test(x.textContent));
    if(!b)return false; b.click(); return true;
  });
  ok(togli,'e c’è il modo di toglierla');
  await pg.waitForTimeout(1000);
  const e=await pg.evaluate(()=>window.__stores.travel_expenses.find(x=>x.id==='sp1'));
  ok(!e.receipt_path,'il percorso è stato cancellato dalla spesa',String(e.receipt_path));
  const rimasti=await pg.evaluate(()=>(window.__storage||[]).length);
  ok(rimasti===0,'e il file è stato cancellato dal bucket, non lasciato lì',String(rimasti));
  await pg.close();
}

console.log('\n=== SENZA STORAGE, NIENTE DANNI ===');
{
  // Chi non ha lanciato la migrazione non ha il bucket: il caricamento
  // deve dire perche' non ce l'ha fatta, e la spesa restare intatta.
  const pg=await apri();
  await pg.evaluate(()=>{window.__storageRifiuta=true});
  await allaSpesa(pg);
  await pg.setInputFiles('#app input[type=file][name=receipt_file]',FOTO);
  await pg.waitForTimeout(1200);
  const msg=await pg.evaluate(()=>document.querySelector('.toast')?.textContent.trim()||'');
  ok(msg.length>0,'qualcosa compare a schermo',msg||'NIENTE: il caricamento resta zitto');
  ok(/non si \u00e8 potuta|non ce l|errore|impossibile/i.test(msg),
     'e dice di NON avercela fatta, non il «carico\u2026» di prima',
     msg||'NIENTE');
  ok(/migrazione|deposito|bucket/i.test(msg),'spiegando cosa manca',msg);
  ok(!/row-level security|violates|policy for table/i.test(msg),'senza il gergo del database',msg);
  const e=await pg.evaluate(()=>window.__stores.travel_expenses.find(x=>x.id==='sp1'));
  ok(!e.receipt_path,'e la spesa non resta con un percorso che non esiste',String(e.receipt_path));
  ok(Math.abs(Number(e.amount)-48)<0.005,'col suo importo intatto',String(e.amount));
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== ricevute: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
