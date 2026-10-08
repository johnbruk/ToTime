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
  S.monthly_compensations=[];S.manual_entries=[];S.travel_expenses=[];
  S.trips=[];S.vehicles=[];S.billing_headers=[];
  S.tax_settings=[{id:'t1',fiscal_year:2026,regime:'forfettario',profitability_coefficient:78,
    substitute_tax_rate:5,inps_gs_rate:26.07,inps_recharge_rate:4,inps_recharge_enabled:true}];
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

await b.close(); srv.close();
console.log(`\n=== fattura caricata: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
