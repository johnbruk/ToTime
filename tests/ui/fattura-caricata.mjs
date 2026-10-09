// La fattura emessa e' la verita'.
//
// Fin qui l'app PROPONEVA i dati per la fattura. Ma una volta emessa e
// trasmessa allo SdI, e' la fattura che fa fede: se i due non
// concordano, a sbagliare e' il consuntivo. Quindi si carica la
// fattura, si legge, e si dice DOVE l'app non tornava.
//
// Si legge l'XML, non il PDF: i campi sono gia' separati e certificati,
// e non si rompe se l'emittente cambia il layout del documento.
//
// La fixture e' una copia della fattura vera con gli identificativi
// sostituiti — P.IVA, codice fiscale, IBAN, email, nomi. Gli importi
// sono quelli originali, altrimenti i conti non proverebbero niente.
// Il file vero non entra nel repository: un IBAN committato ci resta
// per sempre.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json','.xml':'application/xml'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};
const testo=pg=>pg.evaluate(()=>document.getElementById('app').innerText.replace(/\s+/g,' '));
const XML=fs.readFileSync(path.join(ROOT,'tests/ui/fixtures/fattura-esempio.xml'),'utf8');

// Il consuntivo che l'app ha: 1 giorno a febbraio e 5,5 a marzo, a
// 460 €/g, cioe' esattamente quello che la fattura dichiara. Da qui si
// parte, e poi lo si guasta un pezzo per volta.
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'sol',name:'Cliente Esempio',vat_number:'22222222222',
    daily_rate:460,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'p1',client_id:'sol',name:'Progetto',active:true}];
  S.activities=[{id:'a1',name:'Analisi',active:true}];
  S.expense_categories=[{id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount'}];
  S.timesheet_entries=[
    {id:'f1',entry_date:'2026-02-10',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m1',entry_date:'2026-03-02',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m2',entry_date:'2026-03-03',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m3',entry_date:'2026-03-04',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m4',entry_date:'2026-03-05',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m5',entry_date:'2026-03-06',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m6',entry_date:'2026-03-09',client_id:'sol',project_id:'p1',activity_id:'a1',hours:4}];
  S.user_profiles=[{id:'u1',user_id:'u1',first_name:'G',last_name:'B',vat_number:'11111111111'}];
  S.monthly_compensations=[];S.manual_entries=[];S.travel_expenses=[];
  S.trips=[];S.vehicles=[];S.billing_headers=[];
  S.tax_settings=[{id:'t1',fiscal_year:2026,regime:'forfettario',profitability_coefficient:78,
    substitute_tax_rate:5,inps_gs_rate:26.07,inps_recharge_rate:4,inps_recharge_enabled:true,
    stamp_duty_enabled:true,stamp_duty_amount:2}];
`;
const apri=async(extra='')=>{
  const pg=await b.newPage({viewport:{width:390,height:1600},hasTouch:true});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI+extra);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  return pg;
};
const leggi=(pg,xml)=>pg.evaluate(x=>window.leggiFatturaXML(x),xml);
const confronta=(pg,xml)=>pg.evaluate(x=>{
  const f=window.leggiFatturaXML(x);
  const r=window.confrontaFattura(f);
  return {f,esiti:r.esiti,cliente:r.cliente?r.cliente.id:null,mesi:r.mesi,abbinamento:r.abbinamento};
},xml);

console.log('\n=== SI LEGGE TUTTO QUELLO CHE SERVE ===');
{
  const pg=await apri();
  const f=await leggi(pg,XML);
  ok(f.numero==='1/2026','il numero',String(f.numero));
  ok(f.data==='2026-04-08','la data',String(f.data));
  ok(f.clientePiva==='22222222222','la P.IVA del cliente',String(f.clientePiva));
  ok(f.righe.length===2,'le due righe',String(f.righe.length));
  ok(f.righe[0].mese==='2026-02'&&f.righe[1].mese==='2026-03',
     'e il mese che ognuna fattura, letto dalla descrizione',
     f.righe.map(r=>r.mese).join(' · '));
  ok(f.righe[0].giorni===1&&f.righe[1].giorni===5.5,
     'coi giorni: 1,0 e 5,5',f.righe.map(r=>r.giorni).join(' · '));
  ok(Math.abs(f.imponibile-2990)<0.005,'l’imponibile 2.990,00',String(f.imponibile));
  ok(Math.abs(f.rivalsaImporto-119.6)<0.005&&f.rivalsaAliquota===4,
     'la rivalsa 4% = 119,60',`${f.rivalsaAliquota}% ${f.rivalsaImporto}`);
  ok(f.bolloVirtuale&&Math.abs(f.bolloImporto-2)<0.005,'il bollo virtuale da 2,00');
  ok(Math.abs(f.totale-3109.6)<0.005,'e il totale 3.109,60',String(f.totale));
  ok(f.scadenza==='2026-05-31','la scadenza',String(f.scadenza));
  await pg.close();
}

console.log('\n=== QUANDO TUTTO TORNA, NON INVENTA SCOSTAMENTI ===');
{
  const pg=await apri();
  const r=await confronta(pg,XML);
  ok(r.cliente==='sol','il cliente si riconosce dalla P.IVA, senza sceglierlo');
  const gravi=r.esiti.filter(e=>e.liv!=='nota');
  ok(gravi.length===0,'e nessuno scostamento: il consuntivo concorda',
     gravi.map(e=>e.titolo).join(' · ')||'nessuno');
  ok(r.mesi.join(',')==='2026-02,2026-03','i mesi coperti sono due',r.mesi.join(','));
  ok(r.esiti.some(e=>/piu’ mesi/.test(e.titolo)),
     'e che siano due lo dice, invece di lasciarlo scoprire dopo');
  ok(r.esiti.some(e=>/Bollo a tuo carico/.test(e.titolo)),
     'così come dice che i 2 € di bollo li paghi tu');
  await pg.close();
}

console.log('\n=== SE HO LAVORATO MENO DI QUANTO HO FATTURATO, LO DICE ===');
{
  // E' l'incrocio che conta davvero: tolgo mezza giornata di marzo, e
  // la fattura resta ferma a 5,5.
  const pg=await apri(`S.timesheet_entries=S.timesheet_entries.filter(e=>e.id!=='m6');`);
  const r=await confronta(pg,XML);
  const g=r.esiti.find(e=>/Giorni diversi/.test(e.titolo));
  ok(!!g,'lo scostamento sui giorni compare',g?g.titolo:'nessuno');
  ok(!!g&&/5,50 gg/.test(g.dettaglio)&&/5,00 gg/.test(g.dettaglio),
     'con i due numeri a confronto: 5,50 fatturati contro 5,00 consuntivati',
     g?g.dettaglio.slice(0,90):'');
  ok(!!g&&/piu’ di quanto risulta lavorato/.test(g.dettaglio),
     'e dice da che parte pende');
  await pg.close();
}

console.log('\n=== E SE IL CLIENTE NON SI RICONOSCE, NON TIRA A INDOVINARE ===');
{
  // Serve che NON combacino ne' la P.IVA ne' il nome: col solo nome
  // diverso il ripiego lo troverebbe lo stesso, ed e' giusto cosi'.
  const pg=await apri(`S.clients[0].vat_number='99999999999'; S.clients[0].name='Altro Cliente Diverso';`);
  const r=await confronta(pg,XML);
  ok(r.cliente===null,'nessun cliente abbinato');
  const b=r.esiti.find(e=>e.liv==='blocco');
  ok(!!b&&/Cliente non riconosciuto/.test(b.titolo),'e lo segnala come blocco',b?b.titolo:'nessuno');
  ok(!!b&&/22222222222/.test(b.dettaglio),'dicendo quale partita IVA cercava',b?b.dettaglio.slice(0,80):'');
  await pg.close();
}

console.log('\n=== UNA FATTURA CHE NON TORNA CON SE STESSA SI FERMA SUBITO ===');
{
  // Se il documento non quadra, confrontarlo col consuntivo non ha senso.
  const rotto=XML.replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>9999.00');
  const pg=await apri();
  const r=await confronta(pg,rotto);
  const b=r.esiti.find(e=>e.liv==='blocco'&&/totale non torna/i.test(e.titolo));
  ok(!!b,'il totale che non torna è un blocco',b?b.titolo:'nessuno');
  ok(!!b&&/3\.109,60/.test(b.dettaglio),'e dice quanto avrebbe dovuto fare',b?b.dettaglio.slice(0,90):'');
  await pg.close();
}

console.log('\n=== UN FILE CHE NON È UNA FATTURA NON PASSA ===');
{
  const pg=await apri();
  const r=await confronta(pg,'<xml>niente</xml>');
  ok(r.esiti.length===1&&r.esiti[0].liv==='blocco','si ferma, con un solo blocco');
  ok(/FatturaElettronicaBody/.test(r.esiti[0].dettaglio),'dicendo cosa manca',r.esiti[0].dettaglio);
  await pg.close();
}

console.log('\n=== DALLA DASHBOARD FINO AL CONFRONTO A SCHERMO ===');
{
  // La regola: una funzione nuova non e' finita finche' non c'e' un
  // percorso che la raggiunge partendo dalla Dashboard, con tocchi veri.
  const pg=await apri();
  await pg.evaluate(()=>{
    const bt=[...document.querySelectorAll('button')].find(x=>/☰/.test(x.textContent));
    bt.click();
  });
  await pg.waitForTimeout(400);
  await pg.evaluate(()=>{
    const f=[...document.querySelectorAll('.topMenu button')].find(x=>/Fatturazione/.test(x.textContent));
    if(!f)throw new Error('voce Fatturazione non trovata nel menu');
    f.click();
  });
  await pg.waitForTimeout(500);
  ok((await pg.evaluate(()=>document.documentElement.getAttribute('data-view')))==='billing',
     'dal menu si arriva alla Fatturazione');
  const c=await pg.evaluate(()=>{
    const b=[...document.querySelectorAll('#app button')].find(x=>/Carica fattura emessa/.test(x.textContent));
    if(!b)return false; b.click(); return true;
  });
  ok(c,'e li’ c’è il pulsante per caricare la fattura');
  await pg.waitForTimeout(500);
  ok((await pg.evaluate(()=>document.documentElement.getAttribute('data-view')))==='fatturaCarica',
     'che porta alla schermata di caricamento');
  const t0=await testo(pg);
  ok(/Non viene salvato niente/i.test(t0),'la quale dice subito che non salva niente');
  // si sceglie il file, con un vero input[type=file]
  const tmp=path.join(ROOT,'tests/ui/fixtures/fattura-esempio.xml');
  await pg.setInputFiles('#app input[type=file]',tmp);
  await pg.waitForTimeout(900);
  const t=await testo(pg);
  ok(/1\/2026/.test(t),'letta la fattura, compare il suo numero');
  ok(/Cliente Esempio/.test(t),'e il cliente riconosciuto dalla P.IVA');
  ok(/2\.990,00/.test(t)&&/119,60/.test(t)&&/3\.109,60/.test(t),
     'con imponibile, rivalsa e totale');
  ok(/Febbraio 2026/.test(t)&&/Marzo 2026/.test(t),'le due righe coi loro mesi');
  ok(/31\/05\/2026/.test(t),'e la scadenza');
  ok(/Il confronto coi tuoi dati/.test(t),'poi il confronto');
  ok(/piu’ mesi/.test(t),'che segnala i due mesi coperti');
  ok(/Niente è stato salvato/.test(t),'e ripete in fondo che non ha salvato niente');
  // e davvero non ha scritto nulla
  const scritture=await pg.evaluate(()=>(window.__ins||[]).length);
  ok(scritture===0,'nessuna scrittura sul database, verificata',String(scritture));
  await pg.close();
}

console.log('\n=== SENZA LA PARTITA IVA IN ANAGRAFICA, RIPIEGA SUL NOME E LO DICE ===');
{
  // Il campo P.IVA sul cliente non esisteva: la prima versione di
  // questa funzione sarebbe nata morta, perche' in produzione nessun
  // cliente ne ha una e ogni fattura avrebbe risposto «non
  // riconosciuto». Il test precedente non lo vedeva perche' la fixture
  // il campo se lo inventava — lo stesso errore gia' fatto altrove:
  // provare il proprio disegno invece della realta'.
  const pg=await apri(`delete S.clients[0].vat_number; S.clients[0].name='Cliente Esempio SRL';`);
  const r=await confronta(pg,XML);
  ok(r.cliente==='sol','il cliente si trova lo stesso, dal nome');
  ok(r.abbinamento==='nome','e l’app sa che è un ripiego',String(r.abbinamento));
  const n=r.esiti.find(e=>/dal nome, non dalla partita IVA/.test(e.titolo));
  ok(!!n,'che dichiara a schermo, invece di far credere a un abbinamento certo');
  ok(!!n&&/22222222222/.test(n.dettaglio),'dicendo quale P.IVA scrivere per renderlo certo');
  await pg.close();
}

console.log('\n=== DUE CLIENTI CON LO STESSO NOME: NON SCEGLIE LUI ===');
{
  const pg=await apri(`delete S.clients[0].vat_number; S.clients[0].name='Cliente Esempio SRL';
    S.clients.push({id:'due',name:'Cliente Esempio SRL',daily_rate:460,standard_hours:8,
      compensation_type:'daily_rate_8h',active:true});`);
  const r=await confronta(pg,XML);
  ok(r.cliente===null,'non abbina nessuno');
  ok(r.esiti.some(e=>e.liv==='blocco'&&/stesso nome/.test(e.titolo)),
     'e si ferma, chiedendo la partita IVA');
  await pg.close();
}

console.log('\n=== UNA NOTA DI CREDITO NON SI CONFRONTA COME UNA FATTURA ===');
{
  // TD04 ha gli importi positivi e il segno glielo da' il tipo:
  // trattarla come una fattura direbbe che hai fatturato quello che
  // invece hai stornato.
  const nc=XML.replace('<TipoDocumento>TD01','<TipoDocumento>TD04');
  const pg=await apri();
  const r=await confronta(pg,nc);
  const b=r.esiti.find(e=>e.liv==='blocco');
  ok(!!b&&/Tipo di documento non trattato/.test(b.titolo),'si ferma subito',b?b.titolo:'nessuno');
  ok(!!b&&/nota di credito/.test(b.dettaglio),'dicendo che è una nota di credito');
  ok(r.esiti.length===1,'e non aggiunge confronti che non avrebbero senso');
  await pg.close();
}

console.log('\n=== UNA FATTURA IN ALTRA VALUTA NON SI CONFRONTA IN EURO ===');
{
  const usd=XML.replace('<Divisa>EUR','<Divisa>USD');
  const pg=await apri();
  const r=await confronta(pg,usd);
  const b=r.esiti.find(e=>e.liv==='blocco');
  ok(!!b&&/Valuta diversa/.test(b.titolo),'si ferma',b?b.titolo:'nessuno');
  ok(!!b&&/USD/.test(b.dettaglio),'dicendo quale valuta ha trovato');
  await pg.close();
}

console.log('\n=== PIÙ FATTURE IN UN FILE SOLO: NON NE LEGGE UNA E TACE ===');
{
  // Leggerne una e dire «fatto» nasconderebbe le altre.
  const doppia=XML.replace('</FatturaElettronicaBody>',
    '</FatturaElettronicaBody><FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Numero>2/2026</Numero></DatiGeneraliDocumento></DatiGenerali></FatturaElettronicaBody>');
  const pg=await apri();
  const r=await confronta(pg,doppia);
  const b=r.esiti.find(e=>e.liv==='blocco');
  ok(!!b&&/2 fatture/.test(b.dettaglio),'dice quante ne ha trovate',b?b.dettaglio.slice(0,60):'nessuno');
  await pg.close();
}

console.log('\n=== IL BOLLO: CHI LO PAGA SI DEDUCE DALLA QUADRATURA ===');
{
  // «BolloVirtuale SI» dice COME si paga, non A CHI tocca. Dedurne che
  // non e' addebitato bloccava come «totale che non torna» una fattura
  // sanissima che invece il bollo lo addebita.
  const pg=await apri();
  const r0=await confronta(pg,XML);
  ok(!r0.esiti.some(e=>/totale non torna/i.test(e.titolo)),
     'la fattura che NON addebita il bollo quadra');
  ok(r0.esiti.some(e=>/Bollo a tuo carico/.test(e.titolo)),'e il bollo risulta a tuo carico');
  // la stessa fattura, ma col bollo dentro il totale
  const conBollo=XML.replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>3111.60');
  const r1=await confronta(pg,conBollo);
  ok(!r1.esiti.some(e=>/totale non torna/i.test(e.titolo)),
     'e anche quella che lo addebita quadra: non si blocca piu’ a torto');
  ok(r1.esiti.some(e=>/Bollo addebitato al cliente/.test(e.titolo)),
     'e stavolta dice che l’ha pagato il cliente');
  await pg.close();
}

console.log('\n=== GIORNATE NON DA OTTO ORE: NIENTE SCOSTAMENTI FALSI ===');
{
  // Chi ha la giornata da 7,5 ore: 7,5 ore sono UN giorno in tutta
  // l'app, e dividendo per 8 fisse diventavano 0,94.
  const pg=await apri(`
    S.clients[0].standard_hours=7.5;
    S.timesheet_entries=[
      {id:'f1',entry_date:'2026-02-10',client_id:'sol',project_id:'p1',activity_id:'a1',hours:7.5,standard_hours_snapshot:7.5},
      {id:'x1',entry_date:'2026-03-02',client_id:'sol',project_id:'p1',activity_id:'a1',hours:7.5,standard_hours_snapshot:7.5},
      {id:'x2',entry_date:'2026-03-03',client_id:'sol',project_id:'p1',activity_id:'a1',hours:7.5,standard_hours_snapshot:7.5},
      {id:'x3',entry_date:'2026-03-04',client_id:'sol',project_id:'p1',activity_id:'a1',hours:7.5,standard_hours_snapshot:7.5},
      {id:'x4',entry_date:'2026-03-05',client_id:'sol',project_id:'p1',activity_id:'a1',hours:7.5,standard_hours_snapshot:7.5},
      {id:'x5',entry_date:'2026-03-06',client_id:'sol',project_id:'p1',activity_id:'a1',hours:7.5,standard_hours_snapshot:7.5},
      {id:'x6',entry_date:'2026-03-09',client_id:'sol',project_id:'p1',activity_id:'a1',hours:3.75,standard_hours_snapshot:7.5}];
  `);
  const r=await confronta(pg,XML);
  const g=r.esiti.find(e=>/Giorni diversi/.test(e.titolo));
  ok(!g,'1 e 5,5 giornate da 7,5 ore sono 1 e 5,5 giorni: nessuno scostamento',
     g?g.dettaglio.slice(0,80):'nessuno');
  await pg.close();
}

console.log('\n=== PIÙ RIGHE SULLO STESSO MESE SI SOMMANO PRIMA DI CONFRONTARE ===');
{
  // Il flusso di fatturazione emette righe separate per consulenza e
  // spese: confrontare OGNI riga col totale del mese produceva uno
  // scostamento falso per ognuna.
  const terza='<DettaglioLinee><NumeroLinea>3</NumeroLinea><Descrizione>Spese di trasferta - Marzo 2026</Descrizione><Quantita>1.00</Quantita><PrezzoUnitario>200.00</PrezzoUnitario><PrezzoTotale>200.00</PrezzoTotale><AliquotaIVA>0.00</AliquotaIVA><Natura>N2.2</Natura></DettaglioLinee>';
  // La consulenza resta 2.530 e si AGGIUNGE la riga spese da 200: cosi'
  // marzo in fattura fa 2.730, che e' esattamente quello che l'app si
  // aspetta (lavoro + rimborsi). Totale documento adeguato, altrimenti
  // sarebbe la fattura a non quadrare e il test proverebbe altro.
  const spezzata=XML
    .replace('<DatiRiepilogo>',terza+'<DatiRiepilogo>')
    .replace('<ImponibileImporto>3109.60','<ImponibileImporto>3309.60')
    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>3309.60');
  const pg=await apri(`S.travel_expenses=[{id:'s1',expense_date:'2026-03-20',client_id:'sol',
    project_id:'p1',expense_category_id:'volo',work_city:'Citta',amount:200,reimbursement_type:'invoice'}];`);
  const r=await confronta(pg,spezzata);
  ok(r.f.righe.length===3,'la fattura ha tre righe',String(r.f.righe.length));
  const sc=r.esiti.filter(e=>/Importo diverso/.test(e.titolo));
  ok(sc.length===0,'e nessuno scostamento: le due righe di marzo si sommano',
     sc.map(e=>e.dettaglio).join(' | ').slice(0,110)||'nessuno');
  await pg.close();
}

console.log('\n=== LA RIVALSA SI GUARDA IN TUTTI E DUE I VERSI ===');
{
  // C'e' in fattura ma e' spenta in configurazione, oppure manca in
  // fattura ma e' accesa: prima nessuno dei due casi diceva niente.
  const pg=await apri(`S.tax_settings[0].inps_recharge_enabled=false;`);
  const r=await confronta(pg,XML);
  ok(r.esiti.some(e=>/Rivalsa in fattura ma disattivata/.test(e.titolo)),
     'rivalsa in fattura con la configurazione spenta: lo dice');
  await pg.close();
  const senza=XML.replace(/<DatiCassaPrevidenziale>[\s\S]*?<\/DatiCassaPrevidenziale>/,'')
                 .replace('<ImponibileImporto>3109.60','<ImponibileImporto>2990.00')
                 .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>2990.00');
  const pg2=await apri();
  const r2=await confronta(pg2,senza);
  ok(r2.esiti.some(e=>/Rivalsa attiva in configurazione ma assente/.test(e.titolo)),
     'e viceversa: configurazione accesa e fattura senza rivalsa');
  await pg2.close();
}

console.log('\n=== L’IVA FA PARTE DEL TOTALE: NON SOLO FORFETTARI ===');
{
  // L'app supporta anche ordinario e semplificato. Una fattura da
  // 1.000 + 220 di IVA risultava «non quadrata» solo perche' l'imposta
  // non veniva sommata.
  const conIva=XML
    .replace(/<DatiCassaPrevidenziale>[\s\S]*?<\/DatiCassaPrevidenziale>/,'')
    .replace('<ImponibileImporto>3109.60','<ImponibileImporto>2990.00')
    .replace('<Imposta>0.00','<Imposta>657.80')
    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>3647.80');
  const pg=await apri();
  const r=await confronta(pg,conIva);
  ok(Math.abs(r.f.imposta-657.8)<0.005,'l’IVA si legge dai riepiloghi',String(r.f.imposta));
  ok(!r.esiti.some(e=>/totale non torna/i.test(e.titolo)),
     'e 2.990 + 657,80 = 3.647,80 quadra: niente blocco a torto',
     (r.esiti.find(e=>/totale/i.test(e.titolo))||{}).dettaglio||'nessuno');
  await pg.close();
}

console.log('\n=== IL CONTROLLO DI QUADRATURA ADESSO PUÒ DAVVERO FALLIRE ===');
{
  // Confrontava le righe con la somma delle righe stesse: non poteva
  // fallire mai, pur essendo annunciato a schermo come fatto.
  const bugiarda=XML.replace('<ImponibileImporto>3109.60','<ImponibileImporto>5000.00')
                    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>5000.00');
  const pg=await apri();
  const r=await confronta(pg,bugiarda);
  const b=r.esiti.find(e=>/non torna con se stessa/.test(e.titolo));
  ok(!!b,'righe e riepiloghi che non concordano: ora si vede',b?b.titolo:'nessuno');
  ok(!!b&&/5\.000,00/.test(b.dettaglio),'coi due numeri a confronto',b?b.dettaglio.slice(0,100):'');
  await pg.close();
}

console.log('\n=== UN TOTALE NON DICHIARATO NON È UN TOTALE A ZERO ===');
{
  const senzaTot=XML.replace(/<ImportoTotaleDocumento>[^<]*<\/ImportoTotaleDocumento>/,'');
  const pg=await apri();
  const r=await confronta(pg,senzaTot);
  ok(!r.esiti.some(e=>/totale non torna/i.test(e.titolo)),
     'non lo dichiara come sbagliato: è un campo facoltativo');
  ok(r.esiti.some(e=>/non dichiara un totale/.test(e.titolo)),
     'ma dice che manca, invece di mostrare 0,00 senza spiegazione');
  await pg.close();
}

console.log('\n=== PAGAMENTO A RATE: NON SPACCIA LA PRIMA PER L’UNICA ===');
{
  const aRate=XML.replace('</DatiPagamento>',
    '<DettaglioPagamento><ModalitaPagamento>MP05</ModalitaPagamento><DataScadenzaPagamento>2026-06-30</DataScadenzaPagamento><ImportoPagamento>1554.80</ImportoPagamento></DettaglioPagamento></DatiPagamento>');
  const pg=await apri();
  const r=await confronta(pg,aRate);
  ok(r.f.rate.length===2,'legge tutte le rate',String(r.f.rate.length));
  const n=r.esiti.find(e=>/più rate/i.test(e.titolo));
  ok(!!n,'e lo segnala',n?n.titolo:'nessuno');
  ok(!!n&&/30\/06\/2026/.test(n.dettaglio),'elencando anche la seconda scadenza',n?n.dettaglio.slice(0,90):'');
  await pg.close();
}

console.log('\n=== SIGLE COL PUNTO: «Acme S.r.l.» È «Acme SRL» ===');
{
  const conPunti=XML.replace('<Denominazione>CLIENTE ESEMPIO SRL','<Denominazione>Cliente Esempio S.r.l.');
  const pg=await apri(`delete S.clients[0].vat_number; S.clients[0].name='Cliente Esempio SRL';`);
  const r=await confronta(pg,conPunti);
  ok(r.cliente==='sol','il cliente si trova lo stesso',String(r.cliente));
  ok(r.abbinamento==='nome','dal nome, togliendo la sigla anche se puntata');
  await pg.close();
}

console.log('\n=== DUE CLIENTI CON LA STESSA PARTITA IVA: NON SCEGLIE ===');
{
  const pg=await apri(`S.clients.push({id:'bis',name:'Doppione',vat_number:'22222222222',
    daily_rate:460,standard_hours:8,compensation_type:'daily_rate_8h',active:true});`);
  const r=await confronta(pg,XML);
  ok(r.cliente===null,'non ne sceglie uno a caso');
  ok(r.esiti.some(e=>e.liv==='blocco'&&/stessa partita IVA/.test(e.titolo)),
     'e dice che la P.IVA sta su più schede');
  await pg.close();
}

console.log('\n=== LE ORE NON FATTURABILI NON ENTRANO NELLE ATTESE ===');
{
  // Una commessa non fatturabile: prospettoProgetto ne azzera gia' il
  // da fatturare. Contandole qui, una fattura emessa correttamente
  // risultava corta di tutto il lavoro interno.
  const pg=await apri(`
    S.wbs_items=[{id:'w1',project_id:'p1',code:'INT',name:'Interno',kind:'activity',billable:false,status:'active'}];
    S.timesheet_entries.push({id:'int1',entry_date:'2026-03-11',client_id:'sol',project_id:'p1',
      activity_id:'a1',hours:8,wbs_id:'w1'});
  `);
  const r=await confronta(pg,XML);
  const g=r.esiti.find(e=>/Giorni diversi/.test(e.titolo));
  ok(!g,'il giorno interno non conta come fatturabile: nessuno scostamento',
     g?g.dettaglio.slice(0,80):'nessuno');
  const i=r.esiti.find(e=>/Importo diverso/.test(e.titolo));
  ok(!i,'e nemmeno sull’importo',i?i.dettaglio.slice(0,80):'nessuno');
  await pg.close();
}

console.log('\n=== SE IL DATABASE NON HA ANCORA LA COLONNA, LO DICE ===');
{
  // Senza la migrazione la scrittura passa lo stesso, ma senza la
  // partita IVA. Dire «salvato» e basta farebbe credere che ci sia, e
  // poi il riconoscimento della fattura non funzionerebbe senza che si
  // capisca perche'.
  const pg=await apri();
  await pg.evaluate(()=>{window.__colonneMancanti=['vat_number']});
  await pg.evaluate(()=>window.go('clients'));
  await pg.waitForTimeout(500);
  // la pagina si apre sulla LISTA: il modulo si chiede
  await pg.evaluate(()=>window.apriNuovoCliente());
  await pg.waitForTimeout(300);
  await pg.evaluate(()=>{
    const f=document.querySelector('#app form.form');
    f.name.value='Nuovo Cliente';
    if(f.vat_number)f.vat_number.value='12345678901';
    f.requestSubmit();
  });
  await pg.waitForTimeout(1200);
  const t=await testo(pg);
  ok(/non ha ancora dove mettere/.test(t),'avvisa che il dato non è stato scritto',t.slice(0,110));
  ok(/partita IVA/i.test(t),'nominando la partita IVA');
  ok(/2026-10-08_partita-iva-cliente\.sql/.test(t),'e la migrazione da lanciare');
  await pg.close();
}

console.log('\n=== IL CAMPO C’È ANCHE QUANDO SI CREA IL CLIENTE ===');
{
  // Chiesto esplicitamente: poterla inserire gia' alla creazione, non
  // solo modificando dopo.
  const pg=await apri();
  await pg.evaluate(()=>window.go('clients'));
  await pg.waitForTimeout(500);
  // la pagina si apre sulla LISTA: il modulo si chiede
  await pg.evaluate(()=>window.apriNuovoCliente());
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(()=>!!document.querySelector('#app form.form [name=vat_number]')),
     'il modulo di creazione ha il campo Partita IVA');
  await pg.evaluate(()=>{
    const f=document.querySelector('#app form.form');
    f.name.value='Cliente Nuovo'; f.vat_number.value='98765432109'; f.requestSubmit();
  });
  await pg.waitForTimeout(1200);
  const c=await pg.evaluate(()=>(window.__stores.clients||[]).find(x=>x.name==='Cliente Nuovo'));
  ok(!!c,'il cliente si crea');
  ok(!!c&&c.vat_number==='98765432109','con la sua partita IVA salvata',String(c&&c.vat_number));
  await pg.close();
}

console.log('\n=== IL NOME COMBACIA MA LA PARTITA IVA NO: NON ABBINA ===');
{
  // Due societa' con la stessa ragione sociale esistono davvero. Il
  // ripiego sul nome le confondeva anche quando l'anagrafica aveva
  // GIA' un'altra partita IVA: la fattura dell'una finiva confrontata
  // coi timesheet dell'altra, e gli scostamenti venivano da dati di un
  // cliente diverso.
  const pg=await apri(`S.clients[0].vat_number='99999999999';`);
  const r=await confronta(pg,XML);
  ok(r.cliente===null,'non abbina',String(r.cliente));
  const b=r.esiti.find(e=>e.liv==='blocco'&&/partita IVA no/.test(e.titolo));
  ok(!!b,'e dice perché',b?b.titolo:(r.esiti.map(e=>e.titolo).join(' | ')||'nessuno'));
  ok(!!b&&/99999999999/.test(b.dettaglio)&&/22222222222/.test(b.dettaglio),
     'mettendo a confronto le due partite IVA',b?b.dettaglio.slice(0,130):'');
  ok(!r.esiti.some(e=>/Giorni diversi|Importo diverso/.test(e.titolo)),
     'e non confronta la fattura con le ore di quel cliente',
     r.esiti.map(e=>e.titolo).join(' | '));
  await pg.close();
  // Ma se la P.IVA in anagrafica non c'e', il ripiego sul nome resta:
  // e' il caso di chi non l'ha ancora riempita, cioe' quasi tutti.
  const pg2=await apri(`delete S.clients[0].vat_number;`);
  const r2=await confronta(pg2,XML);
  ok(r2.cliente==='sol'&&r2.abbinamento==='nome',
     'con la casella vuota il nome basta ancora',`${r2.cliente} · ${r2.abbinamento}`);
  await pg2.close();
}

console.log('\n=== FATTURA CHE NON QUADRA CON SÉ: IL CONFRONTO SI FERMA ===');
{
  // Prima proseguiva: dichiarava inattendibili gli importi della
  // fattura e poi li usava per dare la colpa ai consuntivi.
  // Qui il consuntivo e' ANCHE guasto (manca mezza giornata di marzo),
  // cosi' si vede che lo scostamento sui giorni sarebbe arrivato e
  // invece non arriva.
  const bugiarda=XML.replace('<ImponibileImporto>3109.60','<ImponibileImporto>5000.00')
                    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>5000.00');
  const pg=await apri(`S.timesheet_entries=S.timesheet_entries.filter(e=>e.id!=='m6');`);
  // prima la prova che quel consuntivo guasto SI VEDE, su una fattura sana
  const sano=await confronta(pg,XML);
  ok(sano.esiti.some(e=>/Giorni diversi/.test(e.titolo)),
     'col documento sano lo scostamento sui giorni c’è');
  const r=await confronta(pg,bugiarda);
  ok(r.esiti.some(e=>/non torna con se stessa/.test(e.titolo)),'il blocco interno c’è');
  ok(r.esiti.some(e=>/si ferma qui/.test(e.titolo)),
     'e dice che il confronto si ferma, invece di tacere');
  ok(!r.esiti.some(e=>/Giorni diversi|Importo diverso/.test(e.titolo)),
     'nessuno scostamento sui consuntivi con numeri inattendibili',
     r.esiti.map(e=>e.titolo).join(' | '));
  ok(!r.esiti.some(e=>/totale non torna/i.test(e.titolo)),
     'e nemmeno sul totale, che si appoggia agli stessi numeri');
  ok(r.mesi.length===0,'nessun mese dichiarato coperto',String(r.mesi.length));
  await pg.close();
}

console.log('\n=== SCONTO DI DOCUMENTO: NON È UNA FATTURA CHE NON QUADRA ===');
{
  // ScontoMaggiorazione sotto DatiGeneraliDocumento: l'imponibile del
  // riepilogo e' piu' basso della somma delle righe, ed e' corretto che
  // lo sia. Senza leggerlo, la fattura risultava guasta e — adesso che
  // il confronto si ferma sul guasto — non si sarebbe confrontato piu'
  // niente.
  const pg=await apri();
  const sconto=XML
    .replace('<ImportoTotaleDocumento>','<ScontoMaggiorazione><Tipo>SC</Tipo><Importo>90.00</Importo></ScontoMaggiorazione><ImportoTotaleDocumento>')
    .replace('<ImponibileImporto>3109.60','<ImponibileImporto>3019.60')
    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>3019.60');
  const r=await confronta(pg,sconto);
  ok(Math.abs(r.f.sconto+90)<0.005,'lo sconto si legge col suo segno',String(r.f.sconto));
  ok(Math.abs(r.f.imponibile-2900)<0.005,'e l’imponibile scende a 2.900',String(r.f.imponibile));
  ok(Math.abs(r.f.righeSomma-2990)<0.005,'mentre le righe restano 2.990',String(r.f.righeSomma));
  ok(!r.esiti.some(e=>/non torna con se stessa/.test(e.titolo)),
     '2.990 − 90 + 119,60 = 3.019,60: la fattura quadra',
     (r.esiti.find(e=>/non torna con se stessa/.test(e.titolo))||{}).dettaglio||'nessuno');
  ok(!r.esiti.some(e=>/totale non torna/i.test(e.titolo)),'e il totale pure');
  // Con la sola percentuale, senza importo: 3% di 2.990 = 89,70.
  const perc=XML
    .replace('<ImportoTotaleDocumento>','<ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>3.00</Percentuale></ScontoMaggiorazione><ImportoTotaleDocumento>')
    .replace('<ImponibileImporto>3109.60','<ImponibileImporto>3019.90')
    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>3019.90');
  const r2=await confronta(pg,perc);
  ok(Math.abs(r2.f.sconto+89.7)<0.005,'la percentuale si applica alle righe',String(r2.f.sconto));
  ok(!r2.esiti.some(e=>/non torna con se stessa/.test(e.titolo)),'e quadra anche così');
  // E una MAGGIORAZIONE alza: il segno non è scritto nel codice.
  const magg=XML
    .replace('<ImportoTotaleDocumento>','<ScontoMaggiorazione><Tipo>MG</Tipo><Importo>50.00</Importo></ScontoMaggiorazione><ImportoTotaleDocumento>')
    .replace('<ImponibileImporto>3109.60','<ImponibileImporto>3159.60')
    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>3159.60');
  const r3=await confronta(pg,magg);
  ok(Math.abs(r3.f.sconto-50)<0.005,'una maggiorazione alza, non abbassa',String(r3.f.sconto));
  ok(!r3.esiti.some(e=>/non torna con se stessa/.test(e.titolo)),'e quadra',
     (r3.esiti.find(e=>/non torna con se stessa/.test(e.titolo))||{}).dettaglio||'nessuno');
  // Due sconti si applicano IN SEQUENZA: il 10% e poi il 5% su quel che
  // resta fanno 2.990 → 2.691 → 2.556,45, non 2.990 − 15%.
  const dueSconti=XML
    .replace('<ImportoTotaleDocumento>','<ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>10.00</Percentuale></ScontoMaggiorazione><ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>5.00</Percentuale></ScontoMaggiorazione><ImportoTotaleDocumento>')
    .replace('<ImponibileImporto>3109.60','<ImponibileImporto>2676.05')
    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>2676.05');
  const r5=await confronta(pg,dueSconti);
  ok(Math.abs(r5.f.imponibile-2556.45)<0.005,
     'due sconti si applicano in sequenza, non sommando le percentuali',String(r5.f.imponibile));
  ok(!r5.esiti.some(e=>/non torna con se stessa/.test(e.titolo)),
     'e 2.556,45 + 119,60 = 2.676,05 quadra',
     (r5.esiti.find(e=>/non torna con se stessa/.test(e.titolo))||{}).dettaglio||'nessuno');
  // Lo sconto di RIGA invece è già dentro PrezzoTotale: sommarlo di
  // nuovo lo conterebbe due volte e romperebbe una fattura sana.
  const diRiga=XML.replace('<PrezzoTotale>460.00</PrezzoTotale>',
    '<ScontoMaggiorazione><Tipo>SC</Tipo><Importo>40.00</Importo></ScontoMaggiorazione><PrezzoTotale>460.00</PrezzoTotale>');
  const r4=await confronta(pg,diRiga);
  ok(r4.f.sconto===0,'lo sconto di riga non si tocca',String(r4.f.sconto));
  ok(!r4.esiti.some(e=>/non torna con se stessa/.test(e.titolo)),'e la fattura resta quadrata');
  await pg.close();
}

console.log('\n=== L’ARROTONDAMENTO SPOSTA IL TOTALE, E VA LETTO ===');
{
  // Arrotondamento sotto DatiGeneraliDocumento: senza leggerlo, una
  // fattura arrotondata di qualche centesimo risultava col «totale che
  // non torna» — e quei centesimi non sono un errore dei consuntivi.
  const arr=XML
    .replace('<ImportoTotaleDocumento>','<Arrotondamento>0.40</Arrotondamento><ImportoTotaleDocumento>')
    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>3110.00');
  const pg=await apri();
  const r=await confronta(pg,arr);
  ok(Math.abs(r.f.arrotondamento-0.4)<0.005,'l’arrotondamento si legge',String(r.f.arrotondamento));
  ok(!r.esiti.some(e=>/totale non torna/i.test(e.titolo)),
     'e 3.109,60 + 0,40 = 3.110,00: il totale quadra',
     (r.esiti.find(e=>/totale non torna/i.test(e.titolo))||{}).dettaglio||'nessuno');
  ok(!r.esiti.some(e=>/non torna con se stessa/.test(e.titolo)),
     'mentre l’imponibile resta quello delle righe: non lo sposta');
  await pg.close();
}

console.log('\n=== DUE CASSE PREVIDENZIALI: SI SOMMANO, NON SI SCARTA LA SECONDA ===');
{
  // La FatturaPA ne ammette piu' di una (cassa di categoria e
  // contributo integrativo). Tenendo solo la prima, la rivalsa
  // risultava piu' bassa del vero e la quadratura dell'imponibile
  // falliva su un documento sanissimo.
  const seconda='<DatiCassaPrevidenziale><TipoCassa>TC01</TipoCassa><AlCassa>2.00</AlCassa><ImportoContributoCassa>59.80</ImportoContributoCassa><ImponibileCassa>2990.00</ImponibileCassa><AliquotaIVA>0.00</AliquotaIVA><Natura>N2.2</Natura></DatiCassaPrevidenziale>';
  const due=XML
    .replace('</DatiCassaPrevidenziale>','</DatiCassaPrevidenziale>'+seconda)
    .replace('<ImponibileImporto>3109.60','<ImponibileImporto>3169.40')
    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>3169.40');
  const pg=await apri();
  const r=await confronta(pg,due);
  ok(r.f.casse&&r.f.casse.length===2,'legge entrambi i blocchi',String(r.f.casse&&r.f.casse.length));
  ok(Math.abs(r.f.rivalsaImporto-179.4)<0.005,'e somma 119,60 + 59,80 = 179,40',String(r.f.rivalsaImporto));
  ok(!r.esiti.some(e=>/non torna con se stessa/.test(e.titolo)),
     '2.990 + 179,40 = 3.169,40: quadra',
     (r.esiti.find(e=>/non torna con se stessa/.test(e.titolo))||{}).dettaglio||'nessuno');
  ok(!r.esiti.some(e=>/totale non torna/i.test(e.titolo)),'e il totale pure');
  const n=r.esiti.find(e=>/contributi previdenziali/.test(e.titolo));
  ok(!!n,'e dice che sono due, invece di mostrarne una sola',n?n.titolo:'nessuno');
  ok(!!n&&/TC22/.test(n.dettaglio)&&/TC01/.test(n.dettaglio),'nominandole',n?n.dettaglio.slice(0,110):'');
  await pg.close();
  // Ognuna si verifica sulla SUA aliquota: un'aliquota media non
  // starebbe scritta in nessun documento.
  const storta=due.replace('<AlCassa>2.00</AlCassa>','<AlCassa>5.00</AlCassa>');
  const pg2=await apri();
  const r2=await confronta(pg2,storta);
  const sc=r2.esiti.find(e=>/rivalsa non torna con la sua aliquota/.test(e.titolo));
  ok(!!sc,'la cassa col conto sbagliato si vede',sc?sc.titolo:'nessuna');
  ok(!!sc&&/TC01/.test(sc.titolo),'e si capisce quale delle due',sc?sc.titolo:'');
  await pg2.close();
}

console.log('\n=== IL BOLLO: E\' DOVUTO, E CHI LO PAGA ===');
{
  // Un interruttore solo diceva due cose insieme — che il bollo e'
  // dovuto e che lo si addebita — e chi lo mette in fattura pagandolo
  // di tasca sua non aveva modo di dirlo. Adesso sono tre scelte, e i
  // controlli seguono quella giusta.
  const pg=await apri(`S.tax_settings[0].stamp_duty_mode='none';`);
  const r=await confronta(pg,XML);
  ok(r.esiti.some(e=>/Bollo in fattura, ma in configurazione non si applica/.test(e.titolo)),
     'bollo in fattura con «non si applica»: lo dice',
     r.esiti.map(e=>e.titolo).join(' | '));
  await pg.close();
  const senzaBollo=XML.replace(/<DatiBollo>[\s\S]*?<\/DatiBollo>/,'');
  const pg2=await apri(`S.tax_settings[0].stamp_duty_mode='charged';`);
  const r2=await confronta(pg2,senzaBollo);
  const b=r2.esiti.find(e=>/Manca il bollo, che qui e' dovuto/.test(e.titolo));
  ok(!!b,'e viceversa: bollo dovuto e fattura che non lo dichiara',
     b?b.titolo:r2.esiti.map(e=>e.titolo).join(' | '));
  ok(!!b&&/77,47/.test(b.dettaglio),'citando la soglia oltre cui è dovuto',b?b.dettaglio.slice(0,140):'');
  await pg2.close();
  // Pagandolo tu il bollo e' dovuto LO STESSO: la fattura lo deve
  // dichiarare, e se non c'e' il controllo deve scattare. Prima,
  // spegnendo l'interruttore per non addebitarlo, questo controllo si
  // spegneva con lui — proprio quando serviva.
  const pgMio=await apri(`S.tax_settings[0].stamp_duty_mode='mine';`);
  const rMio=await confronta(pgMio,senzaBollo);
  const bMio=rMio.esiti.find(e=>/Manca il bollo, che qui e' dovuto/.test(e.titolo));
  ok(!!bMio,'e vale anche quando il bollo lo paghi tu',
     bMio?bMio.titolo:rMio.esiti.map(e=>e.titolo).join(' | '));
  ok(!!bMio&&/anche quando lo paghi tu/.test(bMio.dettaglio),
     'dicendolo per esteso',bMio?bMio.dettaglio.slice(0,150):'');
  await pgMio.close();
  // E il verso che prima non si poteva nemmeno dire: la fattura somma
  // il bollo al totale, ma in configurazione risulta a tuo carico.
  const pgAdd=await apri(`S.tax_settings[0].stamp_duty_mode='mine';`);
  const rAdd=await confronta(pgAdd,XML);
  const bAdd=rAdd.esiti.find(e=>/Bollo addebitato al cliente, ma qui lo paghi tu/.test(e.titolo));
  ok(!!bAdd||!rAdd.f.bolloAddebitato,
     'e se la fattura lo addebita mentre lo paghi tu, lo dice',
     bAdd?bAdd.titolo:'la fattura non lo addebita, quindi non c’è niente da dire');
  await pgAdd.close();
  const pg3=await apri(`S.tax_settings[0].stamp_duty_amount=3;`);
  const r3=await confronta(pg3,XML);
  ok(r3.esiti.some(e=>/Importo del bollo diverso/.test(e.titolo)),
     'e se l’importo non è quello configurato, pure',
     r3.esiti.map(e=>e.titolo).join(' | '));
  await pg3.close();
  // Prima della migrazione comanda il vecchio interruttore: chi
  // aggiorna l'app prima del database non deve vedere i controlli
  // sparire.
  const pgVecchio=await apri(`delete S.tax_settings[0].stamp_duty_mode;S.tax_settings[0].stamp_duty_enabled=false;`);
  const rVecchio=await confronta(pgVecchio,XML);
  ok(rVecchio.esiti.some(e=>/Bollo in fattura, ma in configurazione non si applica/.test(e.titolo)),
     'e senza la colonna nuova comanda il vecchio interruttore',
     rVecchio.esiti.map(e=>e.titolo).join(' | '));
  await pgVecchio.close();
  // Sotto i 77,47 € di importi esenti il bollo NON è dovuto: senza la
  // soglia, ogni fatturina piccola risulterebbe «senza il bollo».
  const piccola=senzaBollo
    .replace('<PrezzoTotale>460.00','<PrezzoTotale>10.00')
    .replace('<PrezzoTotale>2530.00','<PrezzoTotale>30.00')
    .replace('<ImportoContributoCassa>119.60','<ImportoContributoCassa>1.60')
    .replace('<ImponibileCassa>2990.00','<ImponibileCassa>40.00')
    .replace('<ImponibileImporto>3109.60','<ImponibileImporto>41.60')
    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>41.60');
  const pg4=await apri();
  const r4=await confronta(pg4,piccola);
  ok(Math.abs(r4.f.baseEsente-41.6)<0.005,'la base esente si legge dai riepiloghi',String(r4.f.baseEsente));
  ok(!r4.esiti.some(e=>/Bollo attivo in configurazione ma assente/.test(e.titolo)),
     'e sotto la soglia non pretende il bollo',
     (r4.esiti.find(e=>/Bollo/.test(e.titolo))||{}).titolo||'nessuno');
  await pg4.close();
  // Con l'IVA invece il bollo non c'entra: niente importi esenti,
  // niente bollo da pretendere.
  const conIva=senzaBollo
    .replace(/<DatiCassaPrevidenziale>[\s\S]*?<\/DatiCassaPrevidenziale>/,'')
    .replace(/(<DatiRiepilogo>[\s\S]*?)<AliquotaIVA>0\.00<\/AliquotaIVA>/,'$1<AliquotaIVA>22.00</AliquotaIVA>')
    .replace('<ImponibileImporto>3109.60','<ImponibileImporto>2990.00')
    .replace('<Imposta>0.00','<Imposta>657.80')
    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>3647.80');
  const pg5=await apri();
  const r5=await confronta(pg5,conIva);
  ok(r5.f.baseEsente===0,'una fattura con IVA non ha importi esenti',String(r5.f.baseEsente));
  ok(!r5.esiti.some(e=>/Bollo attivo in configurazione ma assente/.test(e.titolo)),
     'e il bollo non si pretende');
  await pg5.close();
}

// Una fattura di un mese solo, coerente: serve dove il confronto ha
// bisogno di sapere A QUALE mese appartiene (la testata salvata).
const SOLO_MARZO=XML
  .replace(/<DettaglioLinee>[\s\S]*?Febbraio[\s\S]*?<\/DettaglioLinee>/,'')
  .replace('<ImportoContributoCassa>119.60','<ImportoContributoCassa>101.20')
  .replace('<ImponibileCassa>2990.00','<ImponibileCassa>2530.00')
  .replace('<ImponibileImporto>3109.60','<ImponibileImporto>2631.20')
  .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>2631.20');

console.log('\n=== IL PIANIFICATO SEGUE L’IMPOSTAZIONE, NON È ESCLUSO SEMPRE ===');
{
  // groupSummary mette il pianificato nella PROPOSTA quando «Fattura
  // anche il pianificato» è acceso, e lo è per difetto. Escluderlo
  // sempre dal confronto voleva dire che una fattura emessa proprio da
  // quella proposta risultava sempre più alta del consuntivo.
  const seme=`S.timesheet_entries.push({id:'pian',entry_date:'2026-03-10',client_id:'sol',
    project_id:'p1',activity_id:'a1',hours:8,status:'planned'});`;
  // la fattura emessa DALLA PROPOSTA: marzo fa 6,5 gg e 2.990 €
  const conPian=XML
    .replace('Marzo 2026 | Giorni: 5,5','Marzo 2026 | Giorni: 6,5')
    .replace('<Quantita>5.50</Quantita>','<Quantita>6.50</Quantita>')
    .replace('<PrezzoTotale>2530.00','<PrezzoTotale>2990.00')
    .replace('<ImportoContributoCassa>119.60','<ImportoContributoCassa>138.00')
    .replace('<ImponibileCassa>2990.00','<ImponibileCassa>3450.00')
    .replace('<ImponibileImporto>3109.60','<ImponibileImporto>3588.00')
    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>3588.00');
  const pg=await apri(seme);
  const r=await confronta(pg,conPian);
  const g=r.esiti.find(e=>/Giorni diversi/.test(e.titolo));
  ok(!g,'con l’impostazione accesa il pianificato entra nelle attese: nessuno scostamento',
     g?g.dettaglio.slice(0,90):'nessuno');
  ok(r.esiti.some(e=>/entra anche il pianificato/.test(e.titolo)),
     'e lo dice, invece di lasciarlo scoprire');
  await pg.close();
  // Spenta l’impostazione, quella stessa fattura È in eccesso.
  const pg2=await apri(seme+`S.app_settings.push({id:'sp',setting_key:'fattura_pianificato',setting_value:'false'});`);
  const r2=await confronta(pg2,conPian);
  const g2=r2.esiti.find(e=>/Giorni diversi/.test(e.titolo));
  ok(!!g2,'spenta l’impostazione, lo scostamento compare: l’impostazione si legge davvero',
     g2?g2.dettaglio.slice(0,90):'nessuno');
  await pg2.close();
}

console.log('\n=== LA CONFIGURAZIONE DELLA SINGOLA FATTURA HA LA PRECEDENZA ===');
{
  // billingCalc dà la precedenza al billing_header su cliente e mese:
  // lì rivalsa e bollo si accendono o spengono per quella fattura.
  // Guardando solo le impostazioni dell’anno, una fattura emessa
  // ESATTAMENTE come la proposta risultava con la rivalsa di troppo.
  const testata=`S.billing_headers=[{id:'h1',client_id:'sol',year:2026,month:3,
    inps_recharge_enabled:true,inps_recharge_rate:4,stamp_duty_enabled:true,stamp_duty_amount:2,
    status:'invoice_issued'}];`;
  const pg=await apri(`S.tax_settings[0].inps_recharge_enabled=false;`+testata);
  const r=await confronta(pg,SOLO_MARZO);
  ok(r.mesi.length===1,'la fattura copre un mese solo',r.mesi.join(','));
  ok(!r.esiti.some(e=>/Rivalsa in fattura ma disattivata/.test(e.titolo)),
     'rivalsa accesa nella fattura salvata: nessun falso allarme, anche se l’anno la dà spenta',
     r.esiti.map(e=>e.titolo).join(' | '));
  await pg.close();
  // E al contrario: la testata la dà spenta, la fattura ce l’ha.
  const pg2=await apri(testata.replace('inps_recharge_enabled:true','inps_recharge_enabled:false'));
  const r2=await confronta(pg2,SOLO_MARZO);
  const sc=r2.esiti.find(e=>/Rivalsa in fattura ma disattivata/.test(e.titolo));
  ok(!!sc,'e se la fattura salvata la dà spenta, lo scostamento c’è',
     sc?sc.titolo:r2.esiti.map(e=>e.titolo).join(' | '));
  ok(!!sc&&/fattura salvata di Marzo/.test(sc.dettaglio),
     'dicendo che guarda quella, non la configurazione dell’anno',sc?sc.dettaglio.slice(0,120):'');
  await pg2.close();
}

console.log('\n=== L’ARROTONDAMENTO DEL RIEPILOGO CONCORRE ALL’IMPONIBILE ===');
{
  // È un campo diverso dall’Arrotondamento di documento: questo entra
  // in ImponibileImporto. Senza leggerlo, un centesimo di
  // arrotondamento bloccava la fattura come guasta — e adesso che il
  // blocco ferma tutto il confronto, costa caro.
  const arr=SOLO_MARZO
    .replace('<ImponibileImporto>2631.20','<Arrotondamento>0.40</Arrotondamento><ImponibileImporto>2631.60')
    .replace('<ImportoTotaleDocumento>2631.20','<ImportoTotaleDocumento>2631.60');
  const pg=await apri();
  const r=await confronta(pg,arr);
  ok(Math.abs(r.f.arrotondamentoRiepiloghi-0.4)<0.005,
     'l’arrotondamento del riepilogo si legge',String(r.f.arrotondamentoRiepiloghi));
  ok(!r.esiti.some(e=>/non torna con se stessa/.test(e.titolo)),
     '2.530 + 0,40 + 101,20 = 2.631,60: la fattura quadra',
     (r.esiti.find(e=>/non torna con se stessa/.test(e.titolo))||{}).dettaglio||'nessuno');
  await pg.close();
}

console.log('\n=== IL BOLLO NON LO SCONTA OGNI OPERAZIONE A IVA ZERO ===');
{
  // Inversione contabile (N6.*) e carenza di territorialità (N2.1)
  // hanno aliquota zero ma il bollo non è dovuto: pretenderlo avrebbe
  // segnalato come mancante un bollo che non deve esserci.
  const senzaBollo=XML.replace(/<DatiBollo>[\s\S]*?<\/DatiBollo>/,'');
  const inversione=senzaBollo
    .replace(/(<DatiRiepilogo>[\s\S]*?)<Natura>N2\.2<\/Natura>/,'$1<Natura>N6.1</Natura>');
  const pg=await apri();
  const r=await confronta(pg,inversione);
  ok(r.f.baseEsente===0,'in inversione contabile la base del bollo è zero',String(r.f.baseEsente));
  ok(!r.esiti.some(e=>/Manca il bollo, che qui e' dovuto/.test(e.titolo)),
     'e il bollo non si pretende',
     (r.esiti.find(e=>/Bollo/.test(e.titolo))||{}).titolo||'nessuno');
  await pg.close();
  // Mentre su un’operazione esente (N4) il bollo è dovuto e manca.
  const esente=senzaBollo
    .replace(/(<DatiRiepilogo>[\s\S]*?)<Natura>N2\.2<\/Natura>/,'$1<Natura>N4</Natura>');
  const pg2=await apri();
  const r2=await confronta(pg2,esente);
  ok(r2.esiti.some(e=>/Manca il bollo, che qui e' dovuto/.test(e.titolo)),
     'su un’operazione esente invece sì: la distinzione è vera, non un modo per tacere',
     r2.esiti.map(e=>e.titolo).join(' | '));
  await pg2.close();
}

console.log('\n=== UNA RIGA SENZA MESE FERMA IL CONFRONTO MENSILE ===');
{
  // La riga orfana può appartenere a uno qualunque dei mesi in fattura:
  // confrontare gli altri darebbe un ammanco che viene dalla
  // descrizione non riconosciuta, non dai dati.
  const orfana='<DettaglioLinee><NumeroLinea>3</NumeroLinea><Descrizione>Rimborso taxi</Descrizione><Quantita>1.00</Quantita><PrezzoUnitario>100.00</PrezzoUnitario><PrezzoTotale>100.00</PrezzoTotale><AliquotaIVA>0.00</AliquotaIVA><Natura>N2.2</Natura></DettaglioLinee>';
  const conOrfana=XML
    .replace('<DatiRiepilogo>',orfana+'<DatiRiepilogo>')
    .replace('<ImponibileImporto>3109.60','<ImponibileImporto>3209.60')
    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>3209.60');
  // l'app si aspetta 100 € di rimborsi a marzo: senza lo stop, marzo
  // risulterebbe corto esattamente di quei 100 €
  const pg=await apri(`S.travel_expenses=[{id:'t1',expense_date:'2026-03-20',client_id:'sol',
    project_id:'p1',expense_category_id:'volo',work_city:'Citta',amount:100,reimbursement_type:'invoice'}];`);
  const r=await confronta(pg,conOrfana);
  ok(r.esiti.some(e=>/Riga senza mese riconoscibile/.test(e.titolo)),'dice qual è la riga orfana');
  const n=r.esiti.find(e=>/non si fa/.test(e.titolo));
  ok(!!n,'e che per questo il confronto mensile non si fa',n?n.titolo:'nessuno');
  ok(!r.esiti.some(e=>/Importo diverso|Giorni diversi/.test(e.titolo)),
     'niente ammanco inventato su marzo',
     r.esiti.map(e=>e.titolo).join(' | '));
  await pg.close();
  // Con il mese scritto nella descrizione, il confronto riparte e torna.
  const sistemata=conOrfana.replace('Rimborso taxi','Rimborso taxi - Marzo 2026');
  const pg2=await apri(`S.travel_expenses=[{id:'t1',expense_date:'2026-03-20',client_id:'sol',
    project_id:'p1',expense_category_id:'volo',work_city:'Citta',amount:100,reimbursement_type:'invoice'}];`);
  const r2=await confronta(pg2,sistemata);
  ok(!r2.esiti.some(e=>/non si fa/.test(e.titolo)),'col mese scritto il confronto riparte');
  ok(!r2.esiti.some(e=>/Importo diverso/.test(e.titolo)),'e torna: 2.530 + 100 è quello che l’app si aspetta',
     (r2.esiti.find(e=>/Importo diverso/.test(e.titolo))||{}).dettaglio||'nessuno');
  await pg2.close();
}

console.log('\n=== LA PARTITA IVA PORTA CON SÉ IL SUO PAESE ===');
{
  // Tenere solo IdCodice rende un DE123456789 indistinguibile da un
  // IT123456789.
  const pg=await apri(`S.clients[0].vat_number='IT22222222222';`);
  const r=await confronta(pg,XML);
  ok(r.cliente==='sol'&&r.abbinamento==='piva',
     'scritta col prefisso in anagrafica, combacia',`${r.cliente} · ${r.abbinamento}`);
  await pg.close();
  const pg2=await apri();
  const r2=await confronta(pg2,XML);
  ok(r2.cliente==='sol'&&r2.abbinamento==='piva',
     'e scritta senza prefisso, come fanno tutti, pure',`${r2.cliente} · ${r2.abbinamento}`);
  await pg2.close();
  // Ma lo stesso numero di un ALTRO paese non è lo stesso soggetto.
  const pg3=await apri(`S.clients[0].vat_number='DE22222222222';`);
  const r3=await confronta(pg3,XML);
  ok(r3.cliente===null,'stesso numero ma paese diverso: non abbina',String(r3.cliente));
  ok(r3.esiti.some(e=>e.liv==='blocco'&&/partita IVA no/.test(e.titolo)),
     'e lo dice invece di tirare a indovinare',r3.esiti.map(e=>e.titolo).join(' | '));
  await pg3.close();
  // E il numero nudo in anagrafica si intende ITALIANO: una fattura
  // tedesca con quelle stesse cifre non è lo stesso cliente.
  const tedesca=XML.replace(/(<CessionarioCommittente>[\s\S]*?)<IdPaese>IT<\/IdPaese>/,'$1<IdPaese>DE</IdPaese>');
  const pg4=await apri();
  const r4=await confronta(pg4,tedesca);
  ok(r4.f.clientePaese==='DE','il paese della fattura si legge',String(r4.f.clientePaese));
  ok(r4.abbinamento!=='piva','il numero nudo non combacia con una fattura straniera',
     String(r4.abbinamento));
  ok(r4.cliente===null&&r4.esiti.some(e=>/partita IVA no/.test(e.titolo)),
     'e non ci si arriva nemmeno dal nome: sono due soggetti',
     r4.esiti.map(e=>e.titolo).join(' | '));
  await pg4.close();
}

console.log('\n=== UNA FATTURA CHE HAI RICEVUTO NON SI CONFRONTA ===');
{
  // Le fatture emesse e quelle ricevute stanno nella stessa cartella e
  // hanno la stessa forma: pescare quella sbagliata e' un gesto, non una
  // distrazione rara. Prima il confronto partiva lo stesso e produceva
  // scostamenti dall'aria autorevole su un documento di un altro.
  const altrui=XML.replace(/(<CedentePrestatore>[\s\S]*?)<IdCodice>11111111111<\/IdCodice>/,
                           '$1<IdCodice>99999999999</IdCodice>');
  const pg=await apri();
  const r=await confronta(pg,altrui);
  const b=r.esiti.find(e=>e.liv==='blocco');
  ok(!!b&&/non l’hai emessa tu/.test(b.titolo),'si ferma subito',b?b.titolo:'nessun blocco');
  ok(!!b&&/99999999999/.test(b.dettaglio)&&/11111111111/.test(b.dettaglio),
     'mettendo a confronto le due partite IVA',b?b.dettaglio.slice(0,140):'');
  ok(r.cliente===null&&r.mesi.length===0,'e non confronta niente',
     `${r.cliente} · ${r.mesi.length} mesi`);
  ok(!r.esiti.some(e=>/Giorni diversi|Importo diverso|Rivalsa|Bollo/.test(e.titolo)),
     'nessuno scostamento su un documento che non e tuo',
     r.esiti.map(e=>e.titolo).join(' | '));
  await pg.close();
}

console.log('\n=== LA TUA, INVECE, PASSA SENZA DIRE NIENTE ===');
{
  const pg=await apri();
  const r=await confronta(pg,XML);
  ok(!r.esiti.some(e=>/emessa tu|verificare che la fattura sia tua/.test(e.titolo)),
     'la partita IVA combacia: nessuna parola di troppo',
     r.esiti.map(e=>e.titolo).join(' | '));
  ok(r.cliente==='sol','e il confronto va avanti come prima');
  await pg.close();
}

console.log('\n=== SENZA LA TUA P.IVA NEL PROFILO, LO DICE E NON BLOCCA ===');
{
  // Un dato mai scritto non e' una smentita: bloccare chi non ha ancora
  // riempito il profilo renderebbe la schermata inutilizzabile.
  const pg=await apri(`delete S.user_profiles[0].vat_number;`);
  const r=await confronta(pg,XML);
  ok(!r.esiti.some(e=>e.liv==='blocco'),'non blocca',
     (r.esiti.find(e=>e.liv==='blocco')||{}).titolo||'nessun blocco');
  const n=r.esiti.find(e=>/verificare che la fattura sia tua/.test(e.titolo));
  ok(!!n,'ma dice che il controllo non si e potuto fare',n?n.titolo:'niente');
  ok(!!n&&/Account/.test(n.dettaglio),'e dove scrivere la partita IVA',n?n.dettaglio.slice(0,110):'');
  ok(r.cliente==='sol','e intanto il confronto si fa lo stesso');
  await pg.close();
}

console.log('\n=== IL MESE SI LEGGE DAI CAMPI DELLO STANDARD, NON SOLO DAL TESTO ===');
{
  // DataInizioPeriodo e DataFinePeriodo sono campi della FatturaPA: il
  // mese spesso sta lì, scritto come dato. Cercandolo solo nella
  // descrizione — «Consulenza - Marzo 2026», che è una convenzione di
  // chi emette — una fattura di un altro emittente finiva «senza mese»
  // e il confronto mensile si fermava del tutto.
  const standard=XML
    .replace('Consulenza - Febbraio 2026 | Giorni: 1,0','Consulenza')
    .replace('Consulenza - Marzo 2026 | Giorni: 5,5','Consulenza')
    .replace('<PrezzoTotale>460.00</PrezzoTotale>',
             '<PrezzoTotale>460.00</PrezzoTotale><DataInizioPeriodo>2026-02-01</DataInizioPeriodo><DataFinePeriodo>2026-02-28</DataFinePeriodo>')
    .replace('<PrezzoTotale>2530.00</PrezzoTotale>',
             '<PrezzoTotale>2530.00</PrezzoTotale><DataInizioPeriodo>2026-03-01</DataInizioPeriodo><DataFinePeriodo>2026-03-31</DataFinePeriodo>');
  const pg=await apri();
  const r=await confronta(pg,standard);
  ok(r.f.righe[0].mese==='2026-02'&&r.f.righe[1].mese==='2026-03',
     'il mese si legge dal periodo, con la descrizione muta',
     r.f.righe.map(x=>x.mese).join(' · '));
  ok(!r.esiti.some(e=>/senza mese riconoscibile/.test(e.titolo)),
     'e nessuna riga resta orfana',
     r.esiti.map(e=>e.titolo).join(' | '));
  ok(r.mesi.join(',')==='2026-02,2026-03','i mesi coperti si riconoscono lo stesso',r.mesi.join(','));
  await pg.close();
  // Un periodo a cavallo di due mesi non si può attribuire: si torna
  // alla descrizione invece di scegliere a caso.
  const cavallo=XML.replace('<PrezzoTotale>2530.00</PrezzoTotale>',
    '<PrezzoTotale>2530.00</PrezzoTotale><DataInizioPeriodo>2026-03-01</DataInizioPeriodo><DataFinePeriodo>2026-04-30</DataFinePeriodo>');
  const pg2=await apri();
  const r2=await confronta(pg2,cavallo);
  ok(r2.f.righe[1].mese==='2026-03','a cavallo di due mesi vince la descrizione',String(r2.f.righe[1].mese));
  await pg2.close();
}

console.log('\n=== I GIORNI SI LEGGONO DA «5,5 GG», NON SOLO DAL TESTO ===');
{
  // Quantita e UnitaMisura sono campi dello standard. Senza leggerli, il
  // confronto coi giorni lavorati si saltava in silenzio su qualunque
  // fattura che non ripetesse «Giorni: 5,5» nella descrizione.
  const gg=XML
    .replace('Consulenza - Marzo 2026 | Giorni: 5,5','Consulenza - Marzo 2026')
    .replace('<Quantita>5.50</Quantita>','<Quantita>5.50</Quantita><UnitaMisura>GG</UnitaMisura>');
  const pg=await apri();
  const r=await confronta(pg,gg);
  ok(r.f.righe[1].giorni===5.5,'5,50 GG sono 5,5 giorni',String(r.f.righe[1].giorni));
  ok(!r.esiti.some(e=>/Giorni diversi/.test(e.titolo)),
     'e il confronto coi giorni lavorati si fa, invece di saltarsi',
     r.esiti.map(e=>e.titolo).join(' | '));
  await pg.close();
  // E se i giorni fatturati non tornano, si vede: il controllo è vivo.
  const storti=gg.replace('<Quantita>5.50</Quantita>','<Quantita>7.00</Quantita>');
  const pg2=await apri();
  const r2=await confronta(pg2,storti);
  ok(r2.esiti.some(e=>/Giorni diversi/.test(e.titolo)),
     'con 7,00 GG contro 5,5 consuntivati lo scostamento compare',
     (r2.esiti.find(e=>/Giorni diversi/.test(e.titolo))||{}).dettaglio||'nessuno');
  await pg2.close();
}

console.log('\n=== SENZA DatiRiepilogo IL FILE SI RIFIUTA ===');
{
  // È obbligatorio nella FatturaPA, ed è l'unica fonte indipendente con
  // cui verificare che le righe tornino. Senza, il controllo di
  // quadratura si saltava in silenzio e un documento troncato poteva
  // arrivare in fondo e far dire «tutto torna».
  const monco=XML.replace(/<DatiRiepilogo>[\s\S]*?<\/DatiRiepilogo>/,'');
  const pg=await apri();
  const r=await confronta(pg,monco);
  const b=r.esiti.find(e=>e.liv==='blocco');
  ok(!!b&&/DatiRiepilogo/.test(b.dettaglio),'si rifiuta, dicendo cosa manca',
     b?b.dettaglio.slice(0,110):'nessun blocco');
  ok(r.mesi.length===0&&r.cliente===null,'e non confronta niente',
     `${r.cliente} · ${r.mesi.length} mesi`);
  await pg.close();
}

console.log('\n=== IL TOTALE CHE NON TORNA FERMA IL CONFRONTO ===');
{
  // Il ramo del riepilogo si fermava già; questo proseguiva, dando la
  // colpa ai consuntivi con un documento già dichiarato inattendibile.
  // Il consuntivo qui è ANCHE guasto, così si vede che lo scostamento
  // sarebbe arrivato e invece non arriva.
  const totStorto=XML.replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>9999.00');
  const pg=await apri(`S.timesheet_entries=S.timesheet_entries.filter(e=>e.id!=='m6');`);
  const sano=await confronta(pg,XML);
  ok(sano.esiti.some(e=>/Giorni diversi/.test(e.titolo)),
     'col totale sano lo scostamento sui giorni c’è');
  const r=await confronta(pg,totStorto);
  ok(r.esiti.some(e=>/Il totale non torna/.test(e.titolo)),'il blocco sul totale c’è');
  ok(r.esiti.some(e=>/si ferma qui/.test(e.titolo)),'e dice che il confronto si ferma');
  ok(!r.esiti.some(e=>/Giorni diversi|Importo diverso/.test(e.titolo)),
     'nessuno scostamento sui consuntivi con un totale inattendibile',
     r.esiti.map(e=>e.titolo).join(' | '));
  ok(r.mesi.length===0,'e nessun mese dichiarato coperto',String(r.mesi.length));
  await pg.close();
}

console.log('\n=== LO SCONTO DI DOCUMENTO ARRIVA AL CONFRONTO MENSILE ===');
{
  // perMese sommava i PrezzoTotale LORDI e li confrontava con l'attesa
  // netta dell'app: su una fattura con sconto in piede, o nascondeva
  // che si era fatturato meno, o inventava uno scostamento.
  // Un mese solo: lo sconto è tutto suo.
  const unMese=SOLO_MARZO
    .replace('<ImportoTotaleDocumento>','<ScontoMaggiorazione><Tipo>SC</Tipo><Importo>130.00</Importo></ScontoMaggiorazione><ImportoTotaleDocumento>')
    .replace('<ImponibileImporto>2631.20','<ImponibileImporto>2501.20')
    .replace('<ImportoTotaleDocumento>2631.20','<ImportoTotaleDocumento>2501.20');
  const pg=await apri();
  const r=await confronta(pg,unMese);
  ok(!r.esiti.some(e=>/non torna con se stessa/.test(e.titolo)),'la fattura quadra',
     (r.esiti.find(e=>/non torna con se stessa/.test(e.titolo))||{}).dettaglio||'nessuno');
  const sc=r.esiti.find(e=>/Importo diverso/.test(e.titolo));
  ok(!!sc,'e marzo risulta fatturato MENO di quanto l’app si aspetta',sc?sc.dettaglio.slice(0,120):'nessuno');
  // senza il simbolo: fra numero e € ci va uno spazio unificatore, non
  // uno normale, e cercarlo con lo spazio semplice non trova mai
  ok(!!sc&&/2\.400,00/.test(sc.dettaglio)&&!/In fattura 2\.530,00/.test(sc.dettaglio),
     'cioè 2.530 − 130 = 2.400, non 2.530',
     sc?sc.dettaglio.slice(0,120):'');
  await pg.close();
  // Su più mesi lo sconto non si sa come ripartirlo: lo si dice.
  const piuMesi=XML
    .replace('<ImportoTotaleDocumento>','<ScontoMaggiorazione><Tipo>SC</Tipo><Importo>130.00</Importo></ScontoMaggiorazione><ImportoTotaleDocumento>')
    .replace('<ImponibileImporto>3109.60','<ImponibileImporto>2979.60')
    .replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>2979.60');
  const pg2=await apri();
  const r2=await confronta(pg2,piuMesi);
  ok(r2.esiti.some(e=>/Sconto di documento su più mesi/.test(e.titolo)),
     'su due mesi lo dice invece di inventare una ripartizione',
     r2.esiti.map(e=>e.titolo).join(' | '));
  ok(!r2.esiti.some(e=>/Importo diverso/.test(e.titolo)),
     'e non confronta gli importi mese per mese');
  await pg2.close();
}

await b.close(); srv.close();
console.log(`\n=== fattura caricata: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
