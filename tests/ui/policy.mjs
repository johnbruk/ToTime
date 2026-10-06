// I limiti della policy del cliente.
//
// L'editor della policy esisteva, ma faceva una cosa sola: per ogni
// voce di spesa, una tendina coi tre tipi di rimborso. Nessun LIMITE:
// niente «pasto max 35 €», niente «hotel max 150 € a notte». I limiti
// sono la sostanza di qualsiasi travel policy — i regolamenti trasferte
// pubblici sono fatti quasi solo di quelli — e stavano in fondo al
// modulo di modifica cliente, senza una riga che spiegasse cosa si
// stesse impostando.
//
// Qui si verifica che i limiti si possano mettere, che l'app avvisi
// MENTRE si inserisce e non a fattura emessa, che lo spezzare in due
// righe funzioni, e — il punto piu' insidioso — che la policy non venga
// cancellata salvando il cliente da un modulo che non la contiene.
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
const campo=(pg,n)=>pg.evaluate(x=>{
  const el=document.querySelector(`#app [name="${x}"]`);
  if(!el)return null;
  return {val:el.value,readonly:!!el.readOnly,hidden:!!el.closest('[hidden]'),checked:!!el.checked};
},n);
const scrivi=async(pg,n,v)=>{
  await pg.evaluate(([x,y])=>{
    const el=document.querySelector(`#app [name="${x}"]`);
    el.value=y;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  },[n,v]);
  await pg.waitForTimeout(300);
};
const spunta=async(pg,n,v=true)=>{
  await pg.evaluate(([x,y])=>{
    const el=document.querySelector(`#app [name="${x}"]`);
    el.checked=y; el.dispatchEvent(new Event('change',{bubbles:true}));
  },[n,v]);
  await pg.waitForTimeout(300);
};

// K2 con una policy vera: pasti fino a 35 €, albergo fino a 150 € a
// notte, voli in fattura senza tetto.
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'k2',name:'K2',daily_rate:500,standard_hours:8,compensation_type:'daily_rate_8h',active:true,
    base_city:'Milano',
    expense_policy:[
      {category_id:'pasti',category:'Pranzo/Cena',type:'invoice',cap:35,per_unit:false},
      {category_id:'notti',category:'Albergo',type:'invoice',cap:150,per_unit:true},
      {category_id:'volo',category:'Volo',type:'invoice'}]}];
  S.projects=[{id:'omni',client_id:'k2',name:'Omnichannel',active:true}];
  S.expense_categories=[
    {id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount'},
    {id:'pasti',name:'Pranzo/Cena',active:true,reimbursable:true,calculation_type:'manual_amount'},
    {id:'notti',name:'Albergo',active:true,reimbursable:true,calculation_type:'quantity_rate',unit_label:'notte',default_unit_rate:120}];
  S.travel_expenses=[];S.trips=[];S.vehicles=[];
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
const alModulo=async pg=>{await pg.evaluate(()=>window.go('expenseForm'));await pg.waitForTimeout(450)};

console.log('\n=== LA POLICY HA UNA PAGINA SUA, CON I LIMITI ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.go('policyRimborsi'));
  await pg.waitForTimeout(500);
  const t=await testo(pg);
  ok(/policy/i.test(await pg.evaluate(()=>document.querySelector('#app h1, #app .screenTitle')?.textContent||'')),
     'c’è una pagina della policy');
  ok(t.includes('K2'),'che parla del cliente');
  const tl=t.toLowerCase();
  ok(tl.includes('pranzo/cena')&&tl.includes('albergo')&&tl.includes('volo'),
     'con tutte le voci di spesa');
  // I limiti: il pezzo che prima non c'era
  ok(!!(await campo(pg,'cap_pasti')),'e un campo per il limite del pasto');
  ok((await campo(pg,'cap_pasti')).val==='35','già a 35',String((await campo(pg,'cap_pasti')).val));
  ok((await campo(pg,'cap_notti')).val==='150','e l’albergo a 150',String((await campo(pg,'cap_notti')).val));
  ok(!!(await campo(pg,'perunit_notti')),'con la distinzione fra limite a spesa e limite a unità');
  ok((await campo(pg,'perunit_notti')).val==='true','l’albergo è a notte',String((await campo(pg,'perunit_notti')).val));
  ok(/spiega|limite|massimo|tetto/i.test(t),'e una riga che spiega cosa si sta impostando');
  await pg.close();
}

console.log('\n=== IL LIMITE SI CAMBIA E SI SALVA ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.go('policyRimborsi'));
  await pg.waitForTimeout(500);
  await scrivi(pg,'cap_pasti','40');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(700);
  const pol=await pg.evaluate(()=>{
    const c=(window.__stores.clients||[])[0];
    return Array.isArray(c.expense_policy)?c.expense_policy:JSON.parse(c.expense_policy||'[]');
  });
  const pasti=pol.find(r=>r.category_id==='pasti');
  ok(pasti&&Number(pasti.cap)===40,'il limite del pasto è passato a 40',String(pasti&&pasti.cap));
  const notti=pol.find(r=>r.category_id==='notti');
  ok(notti&&Number(notti.cap)===150,'e quello dell’albergo è rimasto 150',String(notti&&notti.cap));
  ok(notti&&notti.per_unit===true,'ancora a notte',String(notti&&notti.per_unit));
  await pg.close();
}

console.log('\n=== L’APP AVVISA MENTRE SI INSERISCE ===');
{
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','pasti');
  await scrivi(pg,'amount','30');
  ok(!(await testo(pg)).toLowerCase().includes('oltre il limite'),
     'sotto il limite non si avvisa: 30 € su 35 va bene');
  await scrivi(pg,'amount','60');
  const t=await testo(pg);
  ok(t.toLowerCase().includes('oltre il limite'),'sopra il limite si avvisa subito, non a fattura emessa');
  ok(t.includes('35,00'),'dicendo quanto è il limite',t.slice(0,220));
  ok(t.includes('25,00'),'e quanto si è sforato: 60 − 35 = 25',t.slice(0,220));
  // Torna sotto: l'avviso deve sparire
  await scrivi(pg,'amount','20');
  ok(!(await testo(pg)).toLowerCase().includes('oltre il limite'),'e tornando sotto l’avviso sparisce');
  await pg.close();
}

console.log('\n=== IL LIMITE A UNITÀ SI MOLTIPLICA ===');
{
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','notti');
  await scrivi(pg,'quantity','3');
  await scrivi(pg,'unit_rate','140');
  // 3 notti x 140 = 420, limite 150 a notte = 450: dentro
  ok(!(await testo(pg)).toLowerCase().includes('oltre il limite'),
     '3 notti a 140 stanno sotto i 150 a notte: nessun avviso');
  await scrivi(pg,'unit_rate','170');
  // 3 x 170 = 510 contro 450
  const t=await testo(pg);
  ok(t.toLowerCase().includes('oltre il limite'),'a 170 a notte si sfora');
  ok(t.includes('450,00'),'e il limite mostrato è 150 × 3 = 450',t.slice(0,240));
  await pg.close();
}

console.log('\n=== SPEZZARE IN DUE RIGHE ===');
{
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','pasti');
  await scrivi(pg,'amount','60');
  ok(!!(await campo(pg,'spezza')),'c’è il modo di spezzare in due righe');
  await spunta(pg,'spezza');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(900);
  const righe=await pg.evaluate(()=>(window.__stores.travel_expenses||[]).slice());
  ok(righe.length===2,'sono nate due righe, non una',String(righe.length));
  const inFattura=righe.find(r=>r.reimbursement_type==='invoice');
  const aCarico=righe.find(r=>r.reimbursement_type==='own');
  ok(inFattura&&Math.abs(Number(inFattura.amount)-35)<0.005,'35 € in fattura, fino al limite',
     String(inFattura&&inFattura.amount));
  ok(aCarico&&Math.abs(Number(aCarico.amount)-25)<0.005,'e 25 € a mio carico, l’eccedenza',
     String(aCarico&&aCarico.amount));
  ok(aCarico&&/eccedenz|oltre/i.test(String(aCarico.description||aCarico.notes||'')),
     'e la riga a carico dice perché',String(aCarico&&(aCarico.description||aCarico.notes)));
  ok(righe.every(r=>r.client_id==='k2'),'entrambe sullo stesso cliente');
  await pg.close();
}

console.log('\n=== SENZA SPEZZARE, SI SALVA UNA RIGA SOLA ===');
{
  // Sforare deve restare possibile: l'avviso informa, non impedisce.
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','pasti');
  await scrivi(pg,'amount','60');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(800);
  const righe=await pg.evaluate(()=>(window.__stores.travel_expenses||[]).slice());
  ok(righe.length===1,'una riga sola: l’avviso informa, non impedisce',String(righe.length));
  ok(Math.abs(Number(righe[0].amount)-60)<0.005,'coi 60 € interi',String(righe[0].amount));
  await pg.close();
}

console.log('\n=== SALVARE IL CLIENTE NON CANCELLA LA POLICY ===');
{
  // Il punto insidioso: l'editor della policy e' uscito dal modulo
  // cliente. Se il salvataggio del cliente continuasse a ricostruire la
  // policy dai campi del modulo, non trovandone nemmeno uno la
  // scriverebbe vuota — e tre limiti sparirebbero senza un avviso.
  const pg=await apri();
  await pg.evaluate(()=>window.editClient('k2'));
  await pg.waitForTimeout(500);
  ok(!(await campo(pg,'policy_pasti')),
     'il modulo cliente non contiene piu’ l’editor della policy');
  ok((await testo(pg)).toLowerCase().includes('policy'),
     'ma dice dove si trova');
  await scrivi(pg,'name','K2 Spa');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(800);
  const c=await pg.evaluate(()=>(window.__stores.clients||[])[0]);
  ok(c.name==='K2 Spa','il cliente si salva',String(c.name));
  const pol=Array.isArray(c.expense_policy)?c.expense_policy:JSON.parse(c.expense_policy||'[]');
  ok(pol.length===3,'E LA POLICY È ANCORA TUTTA LÌ: tre righe',String(pol.length));
  ok(pol.some(r=>r.category_id==='pasti'&&Number(r.cap)===35),'col limite del pasto intatto');
  await pg.close();
}

console.log('\n=== SENZA POLICY, NIENTE AVVISI ===');
{
  const pg=await apri();
  await pg.evaluate(()=>{window.__stores.clients[0].expense_policy=[];return window.reload()});
  await pg.waitForTimeout(600);
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','pasti');
  await scrivi(pg,'amount','900');
  ok(!(await testo(pg)).toLowerCase().includes('oltre il limite'),
     'nessun limite impostato, nessun avviso: 900 € passano');
  ok(!(await campo(pg,'spezza')),'e niente da spezzare');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== policy: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
