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

console.log('\n=== MA CAMBIARE SCHERMATA DAVVERO CHIEDE ANCORA ===');
{
  // La protezione non e' stata buttata: e' stata messa dove serve.
  // Scegliere una destinazione perde il modulo, e quello si chiede.
  const {pg,chiesti}=await apri();
  await alModuloScritto(pg,'45');
  await toccaMenu(pg);
  await pg.evaluate(()=>{
    const d=[...document.querySelectorAll('.topMenu button')].find(x=>/Dashboard/.test(x.textContent));
    if(!d)throw new Error('voce Dashboard non trovata nel menu');
    d.click();
  });
  await pg.waitForTimeout(400);
  ok(chiesti.length>0,'scegliendo una destinazione lo chiede',chiesti[0]?chiesti[0].slice(0,55):'nessuna domanda');
  ok((await valore(pg,'amount'))==='45',
     'e avendo risposto «Annulla» resto sul modulo coi miei 45: niente è andato perso',
     String(await valore(pg,'amount')));
  ok(await menuAperto(pg),'col menu ancora aperto, per chiuderlo e continuare a lavorare');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== menu non blocca: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
