// «Non vedo piu' il progetto o cliente finale.»
//
// I livelli della gerarchia con una scelta sola restano nascosti: non
// c'e' niente da scegliere, e un menu con una voce e' rumore. Ma
// nascondere il MENU faceva sparire anche l'INFORMAZIONE: con un
// progetto solo non si vedeva piu' su quale progetto — cioe' su quale
// cliente finale — si stesse scaricando il lavoro. Restava il codice
// WBS, SOL-EQU-2026-001-10, che lo sa leggere chi lo ha scritto.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};
// Il cliente non si propone piu': ogni percorso che arriva al modulo
// deve sceglierlo, come fa una persona.
const scegliCliente=async(pg,id)=>{
  await pg.evaluate(c=>{
    const f=document.querySelector('#app form.form');
    f.client_id.value=c; window.refreshProjectsForForm(f);
  },id);
  await pg.waitForTimeout(400);
};
const testo=pg=>pg.evaluate(()=>document.getElementById('app').innerText.replace(/\s+/g,' '));

// Un cliente con UN SOLO progetto e UNA SOLA commessa: e' il caso in cui
// la cascata sparisce tutta, ed e' quello segnalato.
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'sol',name:'Solution',code:'SOL',daily_rate:500,standard_hours:8,
    compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'equ',client_id:'sol',code:'SOL-EQU',name:'Equans',end_client_name:'Equans',active:true,status:'active'}];
  S.engagements=[{id:'e1',project_id:'equ',code:'SOL-EQU-2026-001',name:'Incarico 2026',status:'active'}];
  S.wbs_items=[{id:'w10',engagement_id:'e1',activity_code:'10',code:'SOL-EQU-2026-001-10',
    name:'AMS - Incident',kind:'activity',status:'active',billable:true,activity_id:'a1'}];
  S.activities=[{id:'a1',name:'Analisi',active:true}];
  S.timesheet_entries=[];S.manual_entries=[];S.monthly_compensations=[];
  S.travel_expenses=[];S.trips=[];S.vehicles=[];S.billing_headers=[];S.expense_categories=[];
`;
const apri=async(extra='')=>{
  const pg=await b.newPage({viewport:{width:390,height:1800},hasTouch:true});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI+extra);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  return pg;
};

console.log('\n=== CON UN PROGETTO SOLO, IL PROGETTO SI VEDE LO STESSO ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  await scegliCliente(pg,'sol');
  const prjNascosto=await pg.evaluate(()=>{
    const e=document.getElementById('prjField');return !e||e.hidden;
  });
  ok(prjNascosto,'il MENU del progetto resta fuori: non c’è niente da scegliere');
  const t=await testo(pg);
  ok(/Equans/.test(t),'ma il nome di chi si serve si legge comunque',
     (t.match(/Equans[^·]{0,40}/)||[''])[0]||'NON SI LEGGE');
  ok(/Incarico 2026/.test(t),'e anche la commessa');
  ok(/SOL-EQU-2026-001-10/.test(t),'col codice, come prima');
  await pg.close();
}

console.log('\n=== NON È SOLO IL CODICE: C’È IL NOME ===');
{
  // Il codice da solo lo sa leggere chi lo ha scritto. Il punto della
  // segnalazione era proprio questo: sapere su QUALE cliente finale
  // stanno andando le ore.
  const pg=await apri();
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  await scegliCliente(pg,'sol');
  const riga=await pg.evaluate(()=>document.getElementById('wbsHint')?.textContent.trim()||'');
  ok(/^Equans/.test(riga),'la riga sotto la commessa comincia dal cliente finale',riga);
  ok(riga.split('·').length===3,'cliente finale · commessa · codice',riga);
  ok(!/Equans · Equans/.test(riga),'e il nome non si ripete quando progetto e cliente coincidono',riga);
  await pg.close();
}

console.log('\n=== QUANDO SONO DIVERSI, VIENE PRIMA IL CLIENTE FINALE ===');
{
  // «Il cliente finale e' piu' importante del progetto»: e' per lui che
  // si lavora, ed e' il nome che si riconosce al volo.
  const pg=await apri(`S.projects[0].name='Commessa quadro'; S.projects[0].end_client_name='Equans Italia';`);
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  await scegliCliente(pg,'sol');
  const riga=await pg.evaluate(()=>document.getElementById('wbsHint')?.textContent.trim()||'');
  ok(/^Equans Italia/.test(riga),'la riga comincia dal cliente finale',riga);
  ok(/Commessa quadro/.test(riga),'e il progetto resta, dopo',riga);
  ok(riga.indexOf('Equans Italia')<riga.indexOf('Commessa quadro'),
     'in quest\'ordine: prima per chi, poi su cosa',riga);
  await pg.close();
}

console.log('\n=== CAMBIANDO COMMESSA, LA RIGA SEGUE ===');
{
  // La riga si aggiorna in due punti diversi del codice: quando il
  // modulo si disegna e quando cambi commessa. Erano due copie, e due
  // copie divergono.
  const pg=await apri(`
    S.wbs_items.push({id:'w20',engagement_id:'e1',activity_code:'20',code:'SOL-EQU-2026-001-20',
      name:'Change',kind:'activity',status:'active',billable:false,activity_id:'a1'});`);
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  await scegliCliente(pg,'sol');
  await pg.evaluate(()=>{
    const f=document.querySelector('#app form.form');
    f.wbs_id.value='w20';
    window.hierChanged(f,'wbs');
  });
  await pg.waitForTimeout(300);
  const riga=await pg.evaluate(()=>document.getElementById('wbsHint')?.textContent.trim()||'');
  ok(/Equans/.test(riga)&&/SOL-EQU-2026-001-20/.test(riga),
     'anche dopo il cambio si legge il progetto, non solo il codice',riga);
  ok(/non fatturabile/.test(riga),'e che quella commessa non è fatturabile',riga);
  await pg.close();
}

console.log('\n=== SENZA CLIENTE FINALE, SI RIPETE QUELLO DELL’ANAGRAFICA ===');
{
  // I progetti vecchi non ce l'hanno: non devono restare senza nome.
  const pg=await apri(`delete S.projects[0].end_client_name; S.projects[0].name='Commessa quadro';`);
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  await scegliCliente(pg,'sol');
  const riga=await pg.evaluate(()=>document.getElementById('wbsHint')?.textContent.trim()||'');
  ok(/^Solution/.test(riga),'ripiega sul cliente che paga',riga);
  await pg.close();
}

console.log('\n=== IL CLIENTE FINALE È VINCOLANTE, E SI PUÒ COMPILARE ===');
{
  // Vincolante: senza, il progetto non si salva. Ma il campo dev'essere
  // RAGGIUNGIBILE: obbligatorio dentro un blocco «Altri dettagli»
  // chiuso, il browser rifiuta l'invio senza dire niente e il modulo
  // sembra solo non funzionare.
  const pg=await apri();
  await pg.evaluate(()=>window.go('clients'));
  await pg.waitForTimeout(400);
  await pg.evaluate(()=>window.nuovoProgettoDi('sol'));
  await pg.waitForTimeout(600);
  const stato=await pg.evaluate(()=>{
    const i=document.querySelector('#app form.form [name=end_client_name]');
    if(!i)return 'assente';
    if(!i.required)return 'non obbligatorio';
    const chiuso=i.closest('details');
    if(chiuso&&!chiuso.open)return 'obbligatorio ma dentro un blocco chiuso';
    // e non basta: un hidden sul campo stesso, o un genitore invisibile,
    // lo rendono altrettanto impossibile da mettere a fuoco — e il
    // browser rifiuta l'invio senza dire niente
    if(i.hidden||i.offsetParent===null)return 'obbligatorio ma invisibile';
    return 'obbligatorio e raggiungibile';
  });
  ok(stato==='obbligatorio e raggiungibile','è obbligatorio e si vede',stato);
  const pieno=await pg.evaluate(()=>document.querySelector('#app form.form [name=end_client_name]')?.value||'');
  ok(pieno==='Solution','e parte già pieno col cliente, da correggere se diverso',pieno);
  await pg.close();
}

console.log('\n=== NIENTE PIÙ CAMPI NASCOSTI DIETRO «ALTRI DETTAGLI» ===');
{
  // Un campo che non si vede non si riempie. E uno obbligatorio che non
  // si vede fa rifiutare l'invio SENZA DIRE NIENTE: il browser non può
  // mettere a fuoco un campo dentro un blocco chiuso, e il modulo
  // sembra solo non funzionare.
  const pg=await apri();
  for(const [vista,nome] of [['dailyForm','consuntivo giornaliero'],['manualForm','compenso una tantum']]){
    await pg.evaluate(v=>window.go(v),vista);
    await pg.waitForTimeout(500);
    const chiusi=await pg.evaluate(()=>
      [...document.querySelectorAll('#app form.form details')]
        .filter(d=>!d.open)
        .flatMap(d=>[...d.querySelectorAll('[name]')].map(e=>e.name)));
    ok(chiusi.length===0,`nel ${nome} non ci sono campi dentro blocchi chiusi`,
       chiusi.join(', ')||'nessuno');
  }
  await pg.evaluate(()=>window.nuovoProgettoDi('sol'));
  await pg.waitForTimeout(500);
  const chiusiPrj=await pg.evaluate(()=>
    [...document.querySelectorAll('#app form.form details')]
      .filter(d=>!d.open)
      .flatMap(d=>[...d.querySelectorAll('[name]')].map(e=>e.name)));
  ok(chiusiPrj.length===0,'e nemmeno nel nuovo progetto',chiusiPrj.join(', ')||'nessuno');
  const visibili=await pg.evaluate(()=>
    [...document.querySelectorAll('#app form.form [name]')].map(e=>e.name));
  ok(visibili.includes('end_client_name')&&visibili.includes('billing_unit')&&visibili.includes('start_date'),
     'i campi che stavano sotto «Altri dettagli» ci sono tutti',visibili.join(', '));
  await pg.close();
}

console.log('\n=== IL BLOCCO NOMINA UN CAMPO CHE PUOI TOCCARE ===');
{
  // «Scegli su quale attività della commessa registrare le ore», con
  // quel menu NASCOSTO perché senza progetto non ha niente dentro.
  // Due progetti: il menu del progetto si vede, gli altri due no.
  const pg=await apri(`
    S.projects.push({id:'alt',client_id:'sol',code:'SOL-ALT',name:'Altro',end_client_name:'Altro',active:true,status:'active'});
    S.engagements.push({id:'e2',project_id:'alt',code:'SOL-ALT-2026-001',name:'Incarico',status:'active'});
    S.wbs_items.push({id:'w99',engagement_id:'e2',activity_code:'10',code:'SOL-ALT-2026-001-10',
      name:'Analisi',kind:'activity',status:'active',billable:true,activity_id:'a1'});`);
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  await scegliCliente(pg,'sol');
  const visibili=await pg.evaluate(()=>['prjField','engField','wbsField']
    .filter(id=>{const e=document.getElementById(id);return e&&!e.hidden}));
  ok(visibili.includes('prjField'),'col progetto da scegliere, il suo menu si vede',visibili.join(', '));
  ok(!visibili.includes('wbsField'),'e quello dell’attività no: non ha niente dentro',visibili.join(', '));
  const prjVuoto=await pg.evaluate(()=>document.querySelector('[name=hier_project_id]')?.value||'');
  ok(prjVuoto==='','il progetto parte non scelto: due sono due',`«${prjVuoto}»`);
  await pg.evaluate(()=>{
    const f=document.querySelector('#app form.form');
    f.entry_date.value='2026-10-07'; if(f.hours)f.hours.value='8';
    f.requestSubmit();
  });
  await pg.waitForTimeout(900);
  const t=await testo(pg);
  ok(/Scegli il progetto/.test(t),'il blocco nomina il PROGETTO, che è quello che vedi',
     (t.match(/Scegli [^.]{0,70}/)||[''])[0]);
  ok(!/attività della commessa registrare/.test(t),
     'e non un menu che a schermo non c’è',(t.match(/Scegli [^.]{0,70}/)||[''])[0]);
  // e il modulo NON si svuota: un messaggio non porta via quello che
  // stai scrivendo. Prima setMsg ridisegnava tutto, e con la data, le
  // ore e il cliente spariva anche la voglia di riprovare.
  ok(await pg.evaluate(()=>{
    const f=document.querySelector('#app form.form');
    return !!(f&&f.client_id&&f.client_id.value==='sol'&&f.entry_date&&f.entry_date.value==='2026-10-07');
  }),'e quello che avevi scritto resta nel modulo');
  // scelto il progetto, la catena si completa da sé e si salva
  await pg.evaluate(()=>{
    const f=document.querySelector('#app form.form');
    f.hier_project_id.value='equ';
    window.hierChanged(f,'project');
  });
  await pg.waitForTimeout(400);
  await pg.evaluate(()=>{
    const f=document.querySelector('#app form.form');
    f.entry_date.value='2026-10-07'; if(f.hours)f.hours.value='8';
    f.requestSubmit();
  });
  await pg.waitForTimeout(1200);
  const righe=await pg.evaluate(()=>(window.__stores.timesheet_entries||[]).length);
  ok(righe===1,'e scelto il progetto, il consuntivo si salva',String(righe));
  await pg.close();
}

console.log('\n=== LE SPESE STANNO IN UNA LISTA A PARTE ===');
{
  // Erano mescolate alle ore, ordinate per data: «7 voci · 8,0 h»,
  // sette righe per un giorno solo di lavoro. Un rimborso non è
  // lavoro prodotto: è denaro anticipato.
  const pg=await apri(`
    S.expense_categories=[{id:'taxi',name:'Taxi',active:true,reimbursable:true,calculation_type:'manual_amount'}];
    S.timesheet_entries=[{id:'g1',entry_date:'2026-10-07',client_id:'sol',project_id:'equ',
      activity_id:'a1',wbs_id:'w10',hours:8}];
    S.travel_expenses=[
      {id:'s1',expense_date:'2026-10-07',client_id:'sol',project_id:'equ',expense_category_id:'taxi',
       work_city:'Milano',amount:30,reimbursement_type:'invoice'},
      {id:'s2',expense_date:'2026-10-07',client_id:'sol',project_id:'equ',expense_category_id:'taxi',
       work_city:'Milano',amount:20,reimbursement_type:'invoice'}];
  `);
  await pg.evaluate(()=>window.go('timesheet'));
  await pg.waitForTimeout(700);
  const liste=await pg.evaluate(()=>
    [...document.querySelectorAll('#app .cliGruppo .list')].map(l=>l.children.length));
  ok(liste.length===2,'dentro il cliente ci sono DUE elenchi, non uno',liste.join(' + '));
  ok(liste[0]===1&&liste[1]===2,'uno con la giornata, l’altro con le due spese',liste.join(' + '));
  const t=await testo(pg);
  ok(/Spese di trasferta/.test(t),'e il secondo si chiama col suo nome');
  ok(/1 voce/.test(t),'il conteggio in testa parla del lavoro: 1 voce, non 3',
     (t.match(/\d+ vo[cn][ei][^·]{0,30}/)||[''])[0]);
  ok(/50,00 €/.test(t),'e le spese hanno il loro totale',(t.match(/Spese di trasferta[^·]{0,30}/)||[''])[0]);
  await pg.close();
}

console.log('\n=== I CLIENTI SI APRONO SULLA LISTA, NON SUL MODULO ===');
{
  // La pagina si apriva col modulo in cima, e la lista — che è quello
  // che si viene a vedere nove volte su dieci — cominciava sotto
  // cinque campi vuoti.
  const pg=await apri();
  await pg.evaluate(()=>window.go('clients'));
  await pg.waitForTimeout(600);
  const subito=await pg.evaluate(()=>!!document.querySelector('#app form.form [name=name]'));
  ok(!subito,'niente modulo all’apertura',subito?'c’è':'non c’è');
  const t=await testo(pg);
  ok(/Solution/.test(t),'e la lista dei clienti si vede subito');
  ok(/Nuovo cliente/.test(t),'col pulsante per aggiungerne uno');
  await pg.evaluate(()=>window.apriNuovoCliente());
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(()=>!!document.querySelector('#app form.form [name=name]')),
     'che apre il modulo quando lo chiedi');
  await pg.close();
}

console.log('\n=== UN CONSUNTIVO NEL PASSATO SI VEDE DOPO AVERLO SALVATO ===');
{
  // Si registrava un 19 febbraio e l'app tornava al Timesheet di
  // OTTOBRE, dove quella riga non c'è: «0,00 gg», come se il
  // salvataggio non fosse avvenuto. Era avvenuto — stava in un mese che
  // non si stava guardando, e per trovarlo bisognava già sapere che
  // c'era.
  const pg=await apri();
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  await scegliCliente(pg,'sol');
  await pg.evaluate(()=>{
    const f=document.querySelector('#app form.form');
    f.entry_date.value='2026-02-19';
    if(f.hours)f.hours.value='8';
    f.requestSubmit();
  });
  await pg.waitForTimeout(1400);
  const salvate=await pg.evaluate(()=>(window.__stores.timesheet_entries||[]).length);
  ok(salvate===1,'la riga si salva',String(salvate));
  const t=await testo(pg);
  ok(/Febbraio 2026/.test(t),'e l’app va a Febbraio 2026, dove la riga sta',
     (t.match(/Timesheet[^›]{0,40}/)||[''])[0]);
  ok(/8,0 h/.test(t),'col suo conteggio, invece di un mese vuoto',
     (t.match(/CONSUNTIVATE[^A-Z]{0,30}/)||[''])[0]);
  await pg.close();
}

console.log('\n=== IL CLIENTE SI SCEGLIE, NON SI PROPONE ===');
{
  // Era il primo in ordine alfabetico, poi l'ultimo usato: in tutti e
  // due i casi un consuntivo poteva finire sul cliente sbagliato
  // semplicemente non guardando quel campo.
  const pg=await apri();
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  const scelto=await pg.evaluate(()=>document.querySelector('#app form.form [name=client_id]')?.value||'');
  ok(scelto==='','nessun cliente proposto all’apertura',`«${scelto}»`);
  const t0=await testo(pg);
  ok(/scegli il cliente/i.test(t0),'e il menu lo dice',(t0.match(/—[^—]{0,30}—/)||[''])[0]);
  await pg.evaluate(()=>{
    const f=document.querySelector('#app form.form');
    f.entry_date.value='2026-10-07'; if(f.hours)f.hours.value='8';
    f.requestSubmit();
  });
  await pg.waitForTimeout(1000);
  const t=await testo(pg);
  ok(/Scegli il cliente/.test(t),'e senza sceglierlo non si salva, dicendolo',
     (t.match(/Scegli il cliente[^.]{0,50}/)||[''])[0]);
  ok(await pg.evaluate(()=>(window.__stores.timesheet_entries||[]).length)===0,
     'niente riga scritta a caso');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== dove vanno le ore: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
