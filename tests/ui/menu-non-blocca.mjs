// Il menu non deve mettere nessuno davanti a una scelta fra «guardare
// dove sono» e «tenere quello che ho scritto».
//
// Il guasto, trovato usando l'app dal telefono: scritto qualcosa in un
// modulo, toccando ☰ compariva «Hai modifiche non salvate. Vuoi uscire
// da questa schermata e perdere i dati inseriti?». Rispondendo
// «Annulla» — la risposta prudente, quella che chiunque da' per non
// perdere il lavoro — il menu NON si apriva. Al tocco dopo richiedeva,
// e restava chiuso di nuovo. Da li' non si raggiungeva piu' niente:
// l'app sembrava bloccata nel menu, senza un errore a schermo. Su iOS,
// dove gli avvisi si possono bloccare, il confirm risponde «no» da
// solo e il menu non si apriva mai.
//
// La domanda era legittima per un motivo vero: render() ricostruisce
// tutto con innerHTML, quindi aprire il menu cancellava davvero il
// modulo. La guardia era un cerotto sul difetto, non la sua cura.
//
// Qui si verifica che aprire il menu non chieda niente, non perda
// niente, e funzioni anche quando il browser rifiuta gli avvisi — e
// che la protezione vera resti dov'e' utile: quando si cambia davvero
// schermata.
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

const menuAperto=pg=>pg.evaluate(()=>!!document.querySelector('.topMenu'));
const testoApp=pg=>pg.evaluate(()=>document.getElementById('app').innerText.replace(/\s+/g,' '));
const valore=(pg,n)=>pg.evaluate(x=>{const el=document.querySelector(`#app [name="${x}"]`);return el?el.value:null},n);
// si tocca il pulsante vero, come un dito: non si chiama la funzione
const toccaMenu=async pg=>{
  await pg.evaluate(()=>{
    const bt=[...document.querySelectorAll('button')].find(x=>/☰/.test(x.textContent));
    if(!bt)throw new Error('il pulsante ☰ non c’è');
    bt.click();
  });
  await pg.waitForTimeout(350);
};

// Dalla Dashboard, come chiunque: menu → Spese → Nuova spesa, e scrivo.
const alModuloScritto=async(pg,quanto='45')=>{
  await toccaMenu(pg);
  await pg.evaluate(()=>{
    const g=[...document.querySelectorAll('.topMenu button')].find(x=>/Spese/.test(x.textContent));
    if(g)g.click();
  });
  await pg.waitForTimeout(350);
  await pg.evaluate(()=>{
    const v=[...document.querySelectorAll('.topMenu button')].find(x=>/Nuova spesa/.test(x.textContent));
    if(v)v.click(); else window.go('expenseForm');
  });
  await pg.waitForTimeout(500);
  await pg.evaluate(q=>{
    const sel=document.querySelector('#app [name=expense_category_id]');
    if(sel){sel.value='cena';sel.dispatchEvent(new Event('change',{bubbles:true}))}
    const a=document.querySelector('#app [name=amount]');
    a.value=q; a.dispatchEvent(new Event('input',{bubbles:true}));
  },quanto);
  await pg.waitForTimeout(300);
};

// Un modulo sporco in un'ALTRA sezione: e' il caso che conta. Stando
// gia' sul modulo spesa, il gruppo Spese risulta aperto da se' (la
// vista appartiene a quella sezione) e non si proverebbe niente.
const alConsuntivoScritto=async pg=>{
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(500);
  const scritto=await pg.evaluate(()=>{
    const campi=[...document.querySelectorAll('#app form.form input[type=text],#app form.form input:not([type]),#app form.form textarea,#app form.form input[type=number]')];
    const c=campi.find(x=>!x.readOnly&&!x.disabled);
    if(!c)return null;
    c.value='qualcosa'; c.dispatchEvent(new Event('input',{bubbles:true}));
    return c.name||'(senza nome)';
  });
  await pg.waitForTimeout(300);
  return scritto;
};
const apri=async(sopprimiAvvisi=false)=>{
  const pg=await b.newPage({viewport:{width:390,height:844},hasTouch:true});
  const chiesti=[];
  pg.on('dialog',d=>{chiesti.push(d.message());d.dismiss()});   // sempre «Annulla»
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  if(sopprimiAvvisi)await pg.evaluate(()=>{window.confirm=()=>false});
  await pg.evaluate(()=>{const S=window.__stores;
    S.expense_categories=[{id:'cena',name:'Cena',active:true,reimbursable:true,calculation_type:'manual_amount'}];
    S.travel_expenses=[];S.trips=[];S.vehicles=[];
    return window.reload();});
  await pg.waitForTimeout(700);
  return {pg,chiesti};
};

console.log('\n=== IL MENU SI APRE ANCHE A MODULO SCRITTO, SENZA CHIEDERE NIENTE ===');
{
  const {pg,chiesti}=await apri();
  await alModuloScritto(pg);
  ok((await valore(pg,'amount'))==='45','ho scritto 45 nel modulo',String(await valore(pg,'amount')));
  const prima=chiesti.length;
  await toccaMenu(pg);
  ok(await menuAperto(pg),'toccando ☰ il menu si apre');
  ok(chiesti.length===prima,'e non chiede niente: aprire il menu non è uscire dalla schermata',
     chiesti.length>prima?('ha chiesto: '+chiesti[chiesti.length-1].slice(0,60)):'nessuna domanda');
  await pg.close();
}

console.log('\n=== E CHIUDENDOLO, QUELLO CHE AVEVO SCRITTO È ANCORA LÌ ===');
{
  // E' il punto per cui la guardia esisteva: render() rifaceva tutto e
  // il modulo si svuotava davvero. Ora il pannello si infila nel DOM.
  const {pg}=await apri();
  await alModuloScritto(pg,'67');
  await toccaMenu(pg);
  ok(await menuAperto(pg),'apro il menu');
  await toccaMenu(pg);
  ok(!(await menuAperto(pg)),'e lo richiudo');
  ok((await valore(pg,'amount'))==='67',
     'i 67 che avevo scritto sono ancora nel campo: il giro nel menu non li ha persi',
     String(await valore(pg,'amount')));
  ok((await pg.evaluate(()=>document.querySelector('#app [name=expense_category_id]').value))==='cena',
     'e anche la voce di spesa che avevo scelto');
  await pg.close();
}

console.log('\n=== FUNZIONA ANCHE SE IL BROWSER RIFIUTA GLI AVVISI (iOS) ===');
{
  // Su iOS gli avvisi si possono bloccare: il confirm risponde «no» da
  // solo, senza mostrare niente. Prima voleva dire menu mai aperto e
  // nessun modo di accorgersene.
  const {pg}=await apri(true);
  await alModuloScritto(pg,'88');
  await toccaMenu(pg);
  ok(await menuAperto(pg),'col confirm che risponde sempre «no», il menu si apre comunque');
  ok((await valore(pg,'amount'))==='88','e il modulo è intatto',String(await valore(pg,'amount')));
  await pg.close();
}

console.log('\n=== IL TAB SPESE SI APRE DA UN’ALTRA SEZIONE, A MODULO SCRITTO ===');
{
  // Il guasto come l'hai visto: «non funziona il tab spese, il menu si
  // blocca e rimane aperto senza darti navigare». Le voci del gruppo
  // compaiono SOLO quando la vista e' gia' cambiata; con la guardia che
  // bloccava il cambio, il gruppo non si apriva, il menu restava aperto
  // su niente, e da li' non si raggiungeva piu' nulla.
  const {pg,chiesti}=await apri();
  const campo=await alConsuntivoScritto(pg);
  ok(!!campo,'ho un consuntivo mezzo compilato (sezione Consuntivi)',String(campo));
  await toccaMenu(pg);
  ok(await menuAperto(pg),'il menu si apre');
  const primaVoci=await pg.evaluate(()=>[...document.querySelectorAll('.topMenu .navSubItem')].map(x=>x.textContent.trim()));
  ok(!primaVoci.includes('Nuova spesa'),'e il gruppo Spese parte chiuso, come dev’essere',JSON.stringify(primaVoci));
  await pg.evaluate(()=>{
    const g=[...document.querySelectorAll('.topMenu button')].find(x=>/Spese/.test(x.textContent));
    if(!g)throw new Error('il gruppo Spese non c’è nel menu');
    g.click();
  });
  await pg.waitForTimeout(450);
  const voci=await pg.evaluate(()=>[...document.querySelectorAll('.topMenu .navSubItem')].map(x=>x.textContent.trim()));
  ok(voci.includes('Nuova spesa')&&voci.includes('Nuova trasferta'),
     'toccando Spese il gruppo si apre e mostra le sue voci: non resta aperto su niente',JSON.stringify(voci));
  ok(await menuAperto(pg),'col menu ancora aperto, per scegliere dove andare');
  ok(chiesti.length===0,'e nessun avviso del browser in tutto il giro',
     chiesti.length?chiesti[0].slice(0,50):'nessuno');
  // e da li' si arriva davvero alla spesa nuova
  await pg.evaluate(()=>{
    const v=[...document.querySelectorAll('.topMenu .navSubItem')].find(x=>/Nuova spesa/.test(x.textContent));
    v.click();
  });
  await pg.waitForTimeout(450);
  ok(await pg.evaluate(()=>!!document.getElementById('uscitaCard')),
     'scegliendo «Nuova spesa» chiede, perché il consuntivo si perderebbe');
  await pg.evaluate(()=>window.uscitaConfermata());
  await pg.waitForTimeout(600);
  ok((await pg.evaluate(()=>document.documentElement.getAttribute('data-view')))==='expenseForm',
     'e accettando si arriva al modulo spesa: il percorso va fino in fondo');
  await pg.close();
}

console.log('\n=== CAMBIARE SCHERMATA LO CHIEDE, MA CON UNA SCHEDA DELL’APP ===');
{
  // La protezione non e' stata buttata: e' stata spostata dal browser
  // all'app. Un confirm() su iOS puo' restare appeso o rispondere «no»
  // da solo; una scheda con due pulsanti non puo' fare nessuna delle
  // due cose.
  const {pg,chiesti}=await apri();
  await alModuloScritto(pg,'45');
  await toccaMenu(pg);
  await pg.evaluate(()=>{
    const d=[...document.querySelectorAll('.topMenu button')].find(x=>/Dashboard/.test(x.textContent));
    if(!d)throw new Error('voce Dashboard non trovata');
    d.click();
  });
  await pg.waitForTimeout(450);
  ok(chiesti.length===0,'nessun avviso del browser: la domanda non è più sua',
     chiesti.length?chiesti[0].slice(0,50):'nessuno');
  ok(await pg.evaluate(()=>!!document.getElementById('uscitaCard')),
     'compare invece una scheda nell’app');
  const t=await pg.evaluate(()=>document.getElementById('uscitaCard').innerText.replace(/\s+/g,' '));
  ok(/modifiche non salvate/i.test(t),'che dice di cosa si tratta',t.slice(0,60));
  ok(/Resta qui/.test(t)&&/Esci e perdi i dati/.test(t),
     'e offre due vie d’uscita, entrambe a schermo',t.slice(0,90));
  // «Resta qui»: devo ritrovare il modulo come l'ho lasciato
  await pg.evaluate(()=>window.uscitaAnnullata());
  await pg.waitForTimeout(300);
  ok(!(await pg.evaluate(()=>!!document.getElementById('uscitaCard'))),'scegliendo «Resta qui» la scheda se ne va');
  ok((await valore(pg,'amount'))==='45',
     'e i 45 sono ancora nel campo: la domanda non ha ridisegnato niente',String(await valore(pg,'amount')));
  await pg.close();
}

console.log('\n=== «ESCI» PORTA DAVVERO DOVE VOLEVO ANDARE ===');
{
  // Non basta che la scheda compaia: la destinazione che avevo scelto
  // prima della domanda deve essere quella dove finisco.
  const {pg}=await apri();
  await alModuloScritto(pg,'45');
  await toccaMenu(pg);
  await pg.evaluate(()=>{
    const d=[...document.querySelectorAll('.topMenu button')].find(x=>/Dashboard/.test(x.textContent));
    d.click();
  });
  await pg.waitForTimeout(450);
  await pg.evaluate(()=>window.uscitaConfermata());
  await pg.waitForTimeout(600);
  const dove=await pg.evaluate(()=>document.documentElement.getAttribute('data-view'));
  ok(dove==='home','scegliendo «Esci» arrivo alla Dashboard, la voce che avevo toccato',String(dove));
  ok(!(await pg.evaluate(()=>!!document.getElementById('uscitaCard'))),'e la scheda non resta appesa');
  await pg.close();
}

console.log('\n=== NIENTE SI BLOCCA NEMMENO SE IL BROWSER NON SA FARE AVVISI ===');
{
  // La prova che il percorso di navigazione non tocca piu' il browser:
  // confirm() qui ESPLODE. Prima questo avrebbe fermato tutto.
  const {pg}=await apri();
  await pg.evaluate(()=>{window.confirm=()=>{throw new Error('confirm vietato')}});
  await alModuloScritto(pg,'45');
  await toccaMenu(pg);
  ok(await menuAperto(pg),'il menu si apre');
  await pg.evaluate(()=>{
    const d=[...document.querySelectorAll('.topMenu button')].find(x=>/Dashboard/.test(x.textContent));
    d.click();
  });
  await pg.waitForTimeout(450);
  ok(await pg.evaluate(()=>!!document.getElementById('uscitaCard')),
     'e la domanda compare comunque: nessun confirm viene chiamato');
  await pg.evaluate(()=>window.uscitaConfermata());
  await pg.waitForTimeout(600);
  ok((await pg.evaluate(()=>document.documentElement.getAttribute('data-view')))==='home',
     'e si naviga fino in fondo');
  await pg.close();
}

console.log('\n=== ALLEGARE UNA RICEVUTA NON RENDE IL MODULO «DA SALVARE» ===');
{
  // Scegliere un file spara DUE eventi, input e change. L'esclusione dei
  // file c'era solo su change: allegare una ricevuta marcava il modulo
  // «da salvare» anche se il caricamento salva subito nel database, e da
  // li' in poi ogni spostamento chiedeva di perdere dati che non
  // esistevano. E' la bandierina falsa che intrappola: niente da
  // salvare, e tutto bloccato.
  const {pg}=await apri();
  await pg.evaluate(()=>window.go('expenseForm'));
  await pg.waitForTimeout(500);
  await pg.evaluate(()=>{
    const f=document.querySelector('#app form.form');
    const inp=document.createElement('input');
    inp.type='file'; inp.name='receipt_file';
    f.appendChild(inp);
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    inp.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await pg.waitForTimeout(300);
  await toccaMenu(pg);
  await pg.evaluate(()=>{
    const d=[...document.querySelectorAll('.topMenu button')].find(x=>/Dashboard/.test(x.textContent));
    d.click();
  });
  await pg.waitForTimeout(600);
  ok(!(await pg.evaluate(()=>!!document.getElementById('uscitaCard'))),
     'scegliere un file non fa comparire la domanda: non c’è niente da perdere');
  ok((await pg.evaluate(()=>document.documentElement.getAttribute('data-view')))==='home',
     'e ci si sposta senza intoppi');
  await pg.close();
}

console.log('\n=== UN GUASTO NON È MAI MUTO ===');
{
  // La firma del guasto segnalato dal telefono: il menu aperto, i
  // tocchi che non fanno niente, e nessuno che dica cosa succede. Un
  // gestore che va in errore prima di arrivare a render() non lasciava
  // niente a schermo. Ora si legge — e senza ridisegnare la pagina,
  // altrimenti il modulo si perderebbe proprio mentre si cerca di
  // capire cosa non va.
  const {pg}=await apri();
  await alModuloScritto(pg,'45');
  await pg.evaluate(()=>{
    // un gestore qualunque che esplode, come ne basta uno solo
    const e=new ErrorEvent('error',{message:'mi si è rotto un ingranaggio'});
    window.dispatchEvent(e);
  });
  await pg.waitForTimeout(400);
  const t=await testoApp(pg);
  ok(/Qualcosa non ha funzionato/.test(t),'un errore scappato finisce a schermo',t.slice(0,80));
  ok(/ingranaggio/.test(t),'col dettaglio, che è quello che serve per riferirlo');
  ok((await valore(pg,'amount'))==='45',
     'e il modulo non si perde proprio mentre si cerca di capire',String(await valore(pg,'amount')));
  // anche una promessa rifiutata, che e' il caso piu' comune
  await pg.evaluate(()=>{window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection',
    {promise:Promise.reject(new Error('x')).catch(()=>{}),reason:new Error('la rete non ha risposto')}))});
  await pg.waitForTimeout(400);
  ok(/rete non ha risposto/.test(await testoApp(pg)),'e vale anche per una promessa rifiutata');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== menu non blocca: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
