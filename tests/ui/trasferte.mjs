// La trasferta come oggetto.
//
// Prima di questo, il volo del 25 e il rimborso km del 29 erano la
// stessa trasferta a Catania e l'app non lo sapeva: quattro righe
// slegate, e nessun modo di sapere quanto fosse costata.
//
// Qui si verifica che la trasferta tenga insieme le sue spese, che
// l'elenco piatto resti raggiungibile per chi lo cerca, che le spese
// inserite prima si possano raggruppare con un tocco, e — il punto piu'
// delicato — che eliminare una trasferta NON si porti via le spese.
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
const contiene=async(pg,t)=>(await testo(pg)).toLowerCase().includes(String(t).toLowerCase());

// Il mese di ottobre 2026 con i dati veri della schermata che ha
// mandato: K2 a Catania su due giorni, e una puntata a Geneva.
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'k2',name:'K2',daily_rate:500,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'omni',client_id:'k2',name:'Omnichannel',active:true}];
  S.expense_categories=[
    {id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount'},
    {id:'km',name:'Rimborso KM',active:true,reimbursable:true,calculation_type:'quantity_rate',unit_label:'km',default_unit_rate:0.45},
    {id:'pasti',name:'Pranzo/Cena',active:true,reimbursable:true,calculation_type:'manual_amount'}];
  S.travel_expenses=[
    {id:'s1',expense_date:'2026-10-29',client_id:'k2',project_id:'omni',expense_category_id:'km',work_city:'Catania',amount:94.5,reimbursement_type:'invoice'},
    {id:'s2',expense_date:'2026-10-25',client_id:'k2',project_id:'omni',expense_category_id:'volo',work_city:'Catania',amount:428,reimbursement_type:'invoice'},
    {id:'s3',expense_date:'2026-10-25',client_id:'k2',project_id:'omni',expense_category_id:'km',work_city:'Catania',amount:94.5,reimbursement_type:'invoice'},
    {id:'s4',expense_date:'2026-10-06',client_id:'k2',project_id:'omni',expense_category_id:'pasti',work_city:'Geneva',amount:60,reimbursement_type:'invoice'}];
  S.trips=[];
`;
// Il mese si cambia col pulsante, come lo cambia una persona.
const vaiAOttobre=async pg=>{
  await pg.evaluate(()=>{for(let i=0;i<48;i++){
    if((document.querySelector('.month strong')?.textContent||'').startsWith('Ottobre 2026'))break;
    window.changeMonth(-1)}});
  await pg.waitForTimeout(450);
};
const apri=async(w=390)=>{
  const pg=await b.newPage({viewport:{width:w,height:1800},hasTouch:w<900});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.go('expenses'));
  await pg.waitForTimeout(450);
  await vaiAOttobre(pg);
  return pg;
};
const tocca=async(pg,t)=>{
  const fatto=await pg.evaluate(q=>{
    const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
    const n=norm(q);
    const cerca=sel=>[...document.querySelectorAll(sel)].find(x=>norm(x.textContent).includes(n));
    const el=cerca('#app button')||cerca('#app a')||cerca('#app .row');
    if(!el)return false; el.click(); return true;
  },t);
  await pg.waitForTimeout(600);
  return fatto;
};

console.log('\n=== LE DUE VISTE ===');
{
  const pg=await apri();
  ok(await contiene(pg,'Per trasferta'),'la pagina Spese offre «Per trasferta»');
  ok(await contiene(pg,'Tutte le spese'),'e offre «Tutte le spese»');
  // La vista che si apre per prima e' quella nuova: se il pulsante
  // «Segna pagata» ci ha insegnato qualcosa, e' che conta quale si apre.
  const attiva=await pg.evaluate(()=>document.querySelector('#app .tabs button.active')?.textContent.trim());
  ok(attiva==='Per trasferta','si apre su «Per trasferta»',String(attiva));
  ok(await contiene(pg,'Spese non ancora in una trasferta'),
     'le quattro spese slegate sono segnalate, non ignorate');
  // Due proposte: Catania e Geneva. Non una sola, non quattro.
  const proposte=await pg.evaluate(()=>document.querySelectorAll('#app .propHead').length);
  ok(proposte===2,'due proposte: Catania e Geneva',String(proposte));
  ok(await contiene(pg,'Catania'),'la proposta nomina Catania');
  ok(await contiene(pg,'Geneva'),'la proposta nomina Geneva');
  // Catania: 25/10 – 29/10, tre spese, 617,00 €
  const t=await testo(pg);
  ok(/25\/10\s*–\s*29\/10/.test(t),'la proposta di Catania copre 25/10 – 29/10');
  ok(t.includes('3 spese'),'e raccoglie tre spese');
  ok(t.includes('617,00'),'per 617,00 € — volo 428 + due km da 94,50');
  ok(t.includes('06/10')&&t.includes('1 spesa'),'Geneva e’ una spesa sola il 06/10');
  await pg.close();
}

console.log('\n=== CREARE LA TRASFERTA DA QUELLO CHE C’E’ GIA’ ===');
{
  const pg=await apri();
  ok(await tocca(pg,'Crea la trasferta'),'il pulsante «Crea la trasferta» c’e’ e si tocca');
  await pg.waitForTimeout(500);
  const viaggi=await pg.evaluate(()=>window.__stores.trips.slice());
  ok(viaggi.length===1,'e’ nata una trasferta sola',String(viaggi.length));
  const tr=viaggi[0]||{};
  ok(tr.destination_city==='Catania','con destinazione Catania',String(tr.destination_city));
  ok(tr.start_date==='2026-10-25','dal 25/10, preso dalle spese',String(tr.start_date));
  ok(tr.end_date==='2026-10-29','al 29/10, preso dalle spese',String(tr.end_date));
  ok(tr.client_id==='k2','sul cliente K2',String(tr.client_id));
  ok(tr.project_id==='omni','e sul progetto Omnichannel',String(tr.project_id));
  // Spese rimborsabili -> la trasferta nasce «da riaddebitare», non bozza:
  // e' lo stato che dice che c'e' del lavoro da fare.
  ok(tr.status==='to_recharge','nasce «da riaddebitare», perche’ le spese sono rimborsabili',String(tr.status));
  // Le tre spese di Catania sono agganciate, la quarta no
  const sp=await pg.evaluate(()=>window.__stores.travel_expenses.map(e=>({id:e.id,trip:e.trip_id||null})));
  const agganciate=sp.filter(e=>e.trip===tr.id).map(e=>e.id).sort();
  ok(agganciate.join(',')==='s1,s2,s3','le tre spese di Catania sono agganciate',agganciate.join(','));
  ok(sp.find(e=>e.id==='s4').trip===null,'quella di Geneva e’ rimasta fuori');
  // ...e ora la scheda la racconta
  const t=await testo(pg);
  ok(t.includes('Catania'),'la scheda della trasferta e’ a schermo');
  ok(t.includes('617,00'),'col totale di 617,00 €');
  ok(/Da riaddebitare\s*617,00/.test(t),'e dice quanto c’e’ da riaddebitare');
  ok(t.includes('3 spese'),'e quante spese contiene');
  // resta una proposta sola: Geneva
  const proposte=await pg.evaluate(()=>document.querySelectorAll('#app .propHead').length);
  ok(proposte===1,'resta la sola proposta di Geneva',String(proposte));
  await pg.close();
}

console.log('\n=== COMPRIMERE E RIAPRIRE ===');
{
  const pg=await apri();
  await tocca(pg,'Crea la trasferta');
  const righePrima=await pg.evaluate(()=>document.querySelectorAll('#app .tripRighe .row').length);
  ok(righePrima===3,'aperta, la scheda mostra le tre spese',String(righePrima));
  ok(await tocca(pg,'Catania'),'la testata si tocca');
  const righeDopo=await pg.evaluate(()=>document.querySelectorAll('#app .tripRighe .row').length);
  ok(righeDopo===0,'chiusa, le spese sono nascoste',String(righeDopo));
  // il totale resta leggibile anche a scheda chiusa: e' il numero che
  // serve a colpo d'occhio
  ok(await contiene(pg,'617,00'),'ma il totale resta visibile a scheda chiusa');
  await tocca(pg,'Catania');
  const righeRi=await pg.evaluate(()=>document.querySelectorAll('#app .tripRighe .row').length);
  ok(righeRi===3,'e si riapre',String(righeRi));
  await pg.close();
}

console.log('\n=== L’ELENCO PIATTO NON SE N’E’ ANDATO ===');
{
  const pg=await apri();
  ok(await tocca(pg,'Tutte le spese'),'si passa a «Tutte le spese»');
  const giorni=await pg.evaluate(()=>document.querySelectorAll('#app .dayHead').length);
  ok(giorni===3,'tre blocchi per giorno: 29/10, 25/10, 06/10',String(giorni));
  const t=await testo(pg);
  ok(t.includes('Volo')&&t.includes('Rimborso KM')&&t.includes('Pranzo/Cena'),
     'ci sono tutte e tre le voci');
  // E la scelta si ricorda: e' un'impostazione, non un capriccio
  const salvata=await pg.evaluate(()=>window.__stores.app_settings.find(s=>s.setting_key==='spese_vista')?.setting_value);
  ok(salvata==='tutte','la scelta della vista si salva',String(salvata));
  await pg.close();
}

console.log('\n=== LA SPESA SI AGGANCIA DAL MODULO ===');
{
  const pg=await apri();
  await tocca(pg,'Crea la trasferta');
  ok(await tocca(pg,'+ Spesa in questa trasferta'),'dalla scheda si aggiunge una spesa');
  const titolo=await pg.evaluate(()=>document.querySelector('#app h1')?.textContent.trim());
  ok(titolo==='Nuova spesa','si apre il modulo della spesa',String(titolo));
  // Il campo Trasferta c'e', ed e' gia' sulla trasferta da cui siamo venuti
  const scelta=await pg.evaluate(()=>{
    const sel=document.querySelector('#app select[name=trip_id]');
    return sel?{ci:true,val:sel.value,testo:sel.options[sel.selectedIndex]?.textContent}:{ci:false};
  });
  ok(scelta.ci,'il modulo ha il campo Trasferta');
  ok(scelta.val&&scelta.val!=='','ed e’ gia’ sulla trasferta giusta',String(scelta.testo));
  ok(String(scelta.testo||'').includes('Catania'),'cioe’ Catania',String(scelta.testo));
  // «Spesa singola» deve restare possibile: non tutte le spese sono trasferte
  const prima=await pg.evaluate(()=>document.querySelector('#app select[name=trip_id]')?.options[0]?.textContent||'');
  ok(prima.toLowerCase().includes('singola'),'e si puo’ ancora NON metterla in trasferta',prima.trim());
  await pg.close();
}

console.log('\n=== ELIMINARE LA TRASFERTA NON CANCELLA LE SPESE ===');
{
  const pg=await apri();
  await tocca(pg,'Crea la trasferta');
  ok(await tocca(pg,'Modifica trasferta'),'si apre la modifica della trasferta');
  ok(await contiene(pg,'Catania'),'che parla della trasferta giusta');
  ok(await tocca(pg,'Elimina trasferta'),'e si elimina');
  await pg.waitForTimeout(500);
  const viaggi=await pg.evaluate(()=>window.__stores.trips.length);
  ok(viaggi===0,'la trasferta non c’e’ piu’',String(viaggi));
  // IL PUNTO: le spese devono essere ancora tutte e quattro
  const spese=await pg.evaluate(()=>window.__stores.travel_expenses.slice());
  ok(spese.length===4,'le quattro spese ci sono ancora',String(spese.length));
  ok(spese.every(e=>!e.trip_id),'e sono tornate libere, senza trasferta');
  ok(await contiene(pg,'Spese non ancora in una trasferta'),
     'e si rivedono fra quelle da raggruppare');
  await pg.close();
}

console.log('\n=== NIENTE TRASFERTE, NIENTE DANNI ===');
{
  // Chi non ha lanciato la migrazione non ha la tabella: la pagina deve
  // ricadere sull'elenco di sempre, non mostrare una vista vuota.
  const pg=await b.newPage({viewport:{width:390,height:1400}});
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI);
  // la tabella non esiste: e' il database di chi non ha lanciato la
  // migrazione, e il caricamento se ne deve accorgere da solo
  await pg.evaluate(()=>{window.__tabelleMancanti=['trips'];return window.reload()});
  await pg.waitForTimeout(800);
  await pg.evaluate(()=>window.go('expenses'));
  await pg.waitForTimeout(350);
  await vaiAOttobre(pg);
  const t=await testo(pg);
  ok(!t.includes('Per trasferta'),'senza la tabella non si offre la vista per trasferta');
  const giorni=await pg.evaluate(()=>document.querySelectorAll('#app .dayHead').length);
  ok(giorni===3,'e l’elenco per giorno c’e’ tutto',String(giorni));
  ok(t.includes('428,00'),'con i suoi importi');
  ok(!t.includes('Nuova trasferta'),'e non si propone di crearne una');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== trasferte: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
