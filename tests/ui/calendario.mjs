// Il calendario che sfondava a destra.
//
// Le sette colonne erano repeat(7,1fr). 1fr vale minmax(auto,1fr), cioè
// «almeno quanto il contenuto»: il nome della festività, che è nowrap,
// faceva da cuneo. A dicembre 2026 le colonne uscivano 140px, 72, 17,
// 17, 42, 87, 17 e la domenica finiva fuori dallo schermo.
//
// Perché nessun test se n'era accorto: quelli che guardavano il
// calendario lo guardavano nel mese corrente, e il difetto si vede solo
// dove i nomi delle festività sono lunghi. Qui si passano tutti e
// dodici i mesi, che è il modo in cui la prossima volta lo si prende.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>server.listen(0,r));
const port=server.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};

const MESI=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
            'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
// Portarsi su un mese. Il confronto fra etichette come stringhe non
// funziona («Settembre» viene prima di «Dicembre» in ordine alfabetico,
// non nel calendario): si calcola la distanza in mesi e si fanno quei
// passi. Torna il mese in cui si è arrivati davvero — chi chiama lo
// verifica, così una navigazione che non si muove non può più lasciare
// un test verde per il motivo sbagliato.
const vaiA=async(pg,etichetta)=>{
  return await pg.evaluate(({eti,MESI})=>{
    const ora=()=>(document.querySelector('.month strong')?.textContent||'').trim();
    const num=t=>{const m=t.match(/^(\p{L}+)\s+(\d{4})/u);
                  return m?MESI.indexOf(m[1])+Number(m[2])*12:null};
    const meta=num(eti);
    for(let i=0;i<40;i++){
      const c=num(ora());
      if(c===null||c===meta)break;
      window.changeMonth(c<meta?1:-1);
    }
    return ora();
  },{eti:etichetta,MESI});
};

// Misura la griglia: colonne, allineamento con la riga dei giorni,
// celle fuori schermo.
const leggi=pg=>pg.evaluate(()=>{
  const teste=[...document.querySelector('.calGrid.head').children];
  const g=document.querySelectorAll('.calGrid')[1];
  const celle=[...g.querySelectorAll('.calCell')];
  const piene=celle.filter(c=>!c.classList.contains('blank'));
  const W=document.documentElement.clientWidth;
  // la prima riga di caselle dà le sette ascisse delle colonne
  const top=Math.min(...celle.map(c=>Math.round(c.getBoundingClientRect().top)));
  const prima=celle.filter(c=>Math.round(c.getBoundingClientRect().top)===top)
                   .map(c=>Math.round(c.getBoundingClientRect().left));
  return {
    mese:document.querySelector('.month strong')?.textContent.trim(),
    larghezze:[...new Set(piene.map(c=>Math.round(c.getBoundingClientRect().width)))],
    colonne:prima, intestazioni:teste.map(h=>Math.round(h.getBoundingClientRect().left)),
    fuori:piene.filter(c=>c.getBoundingClientRect().right>W+1)
               .map(c=>c.querySelector('.calNum')?.textContent),
    scorre:document.documentElement.scrollWidth>W+1,
    etichette:[...g.querySelectorAll('.calFest')].filter(e=>e.offsetParent!==null)
      .map(e=>({t:e.textContent.trim(),serve:Math.round(e.scrollWidth),ha:Math.round(e.clientWidth)})),
    lista:(document.querySelector('.festList')?.textContent||'').trim(),
    ore:[...g.querySelectorAll('.calH')].filter(e=>e.offsetParent!==null).length,
    assenze:g.querySelectorAll('.calCell.ferie').length};
});

console.log('\n=== A. Tutti i dodici mesi, alle larghezze da telefono ===');
const storte=[],tagliate=[],disallineate=[],scorrono=[],mancati=[];const visitati=new Set();
for(const w of [360,390,430]){
  const pg=await b.newPage({viewport:{width:w,height:900},hasTouch:true});
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(650);
  await pg.evaluate(()=>window.go('calendario'));await pg.waitForTimeout(250);
  for(const m of MESI){
    const arrivato=await vaiA(pg,m+' 2026');
    if(!arrivato.startsWith(m))mancati.push(`${w}: chiesto ${m}, arrivato ${arrivato}`);
    visitati.add(w+'/'+m);
    await pg.waitForTimeout(120);
    const r=await leggi(pg);
    // sette colonne uguali: una sola larghezza, a meno di un pixel di arrotondamento
    if(r.larghezze.length>1&&Math.max(...r.larghezze)-Math.min(...r.larghezze)>1)
      storte.push(`${w}/${m}: ${r.larghezze.join('/')}px`);
    if(r.fuori.length)tagliate.push(`${w}/${m}: giorni ${r.fuori.join(',')}`);
    if(r.scorre)scorrono.push(`${w}/${m}`);
    if(!r.intestazioni.every((x,i)=>Math.abs(x-r.colonne[i])<=1))
      disallineate.push(`${w}/${m}: ${r.intestazioni.join(',')} contro ${r.colonne.join(',')}`);
  }
  await pg.close();
}
ok(mancati.length===0,'ogni mese chiesto è stato davvero aperto',mancati.slice(0,3).join(' | ')||visitati.size+' mesi aperti');
ok(storte.length===0,'le sette colonne restano uguali in ogni mese',storte.slice(0,3).join(' | ')||'36 mesi-larghezza controllati');
ok(tagliate.length===0,'nessun giorno finisce fuori dallo schermo',tagliate.slice(0,3).join(' | ')||'nessuno');
ok(scorrono.length===0,'e la pagina non scorre di lato',scorrono.slice(0,3).join(' | ')||'nessun mese');
ok(disallineate.length===0,'i nomi dei giorni stanno sopra la loro colonna',disallineate.slice(0,2).join(' | ')||'allineati');

console.log('\n=== B. Dicembre: il mese che lo faceva vedere ===');
// Quattro festività, di cui una lunga il triplo di una casella.
const pg=await b.newPage({viewport:{width:390,height:900},hasTouch:true});
await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(650);
await pg.evaluate(()=>window.go('calendario'));await pg.waitForTimeout(250);
const arrDic=await vaiA(pg,'Dicembre 2026');await pg.waitForTimeout(150);
const dic=await leggi(pg);
ok(/Dicembre 2026/.test(dic.mese||''),'siamo su dicembre 2026',dic.mese);
ok(dic.larghezze.length===1,'una sola larghezza di casella',dic.larghezze.join('/')+'px');
ok(dic.fuori.length===0&&!dic.scorre,'niente sfora a destra','celle da '+dic.larghezze[0]+'px');
// Sul telefono il nome non si scrive affatto: in 44px «Sant'Ambrogio ·
// Milano» diventerebbe «S…». Dirlo così, e non «nessuna etichetta viene
// troncata», perché quella frase sarebbe vera anche se le etichette non
// ci fossero per sbaglio.
ok(dic.etichette.length===0,'sul telefono i nomi non si scrivono dentro le caselle',
   dic.etichette.length?dic.etichette.map(e=>e.t).join(' | '):'0 etichette, 4 festività nel mese');
// ...ma l'informazione non si perde: la riga sotto le nomina tutte.
for(const f of ["Sant'Ambrogio","Immacolata","Natale","Santo Stefano"])
  ok(dic.lista.includes(f),`«${f}» resta leggibile nella riga delle festività`);

console.log('\n=== C. Non è sparito altro dalle caselle ===');
// Nascondere il nome della festività non deve aver portato via le ore
// consuntivate né il colore delle assenze: a luglio il mock ha entrambe.
const arrLug=await vaiA(pg,'Luglio 2026');await pg.waitForTimeout(150);
ok(arrLug.startsWith('Luglio'),'siamo su luglio 2026',arrLug);
const lug=await leggi(pg);
ok(lug.ore>0,'le ore consuntivate si vedono ancora nelle caselle',lug.ore+' caselle con le ore');
ok(lug.assenze>0,'e le assenze restano riconoscibili dal colore',lug.assenze+' caselle segnate');
ok(!lug.scorre&&lug.larghezze.length===1,'anche qui le colonne sono uguali e niente scorre',lug.larghezze.join('/')+'px');
await pg.close();

console.log('\n=== D. Dove la casella è larga, il nome si legge ===');
// Sotto i 700px il nome non si scrive: in 40px diventerebbe «S…».
// Sopra, la casella è larga ~90px e il nome ci sta: va mostrato.
for(const [w,atteso] of [[560,false],[720,true],[1440,true]]){
  const p=await b.newPage({viewport:{width:w,height:1000}});
  await p.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await p.waitForTimeout(650);
  await p.evaluate(()=>window.go('calendario'));await p.waitForTimeout(250);
  const a=await vaiA(p,'Dicembre 2026');await p.waitForTimeout(150);
  ok(a.startsWith('Dicembre'),`a ${w}px si arriva su dicembre`,a);
  const r=await leggi(p);
  // Qui sta il caso che prova la correzione strutturale: dove i nomi si
  // scrivono davvero, un nome lungo il triplo della casella allargherebbe
  // la SUA colonna e basta, sfasando la griglia. Sul telefono non si
  // vedrebbe, perché lì i nomi non si scrivono e il cuneo non c'è.
  ok(r.larghezze.length===1,`a ${w}px le sette colonne restano uguali anche coi nomi scritti`,
     r.larghezze.join('/')+'px');
  ok(r.intestazioni.every((x,i)=>Math.abs(x-r.colonne[i])<=1),
     `a ${w}px i nomi dei giorni restano sopra la loro colonna`,
     r.intestazioni.join(',')+' contro '+r.colonne.join(','));
  ok((r.etichette.length>0)===atteso,
     atteso?`a ${w}px i nomi sono scritti nelle caselle`:`a ${w}px i nomi non si scrivono nelle caselle`,
     r.etichette.length+' etichette · celle da '+r.larghezze.join('/')+'px');
  ok(!r.scorre&&r.fuori.length===0,`e a ${w}px niente esce dalla griglia`,r.larghezze.join('/')+'px');
  if(atteso){
    // Un nome lungo il triplo della casella viene abbreviato: è voluto.
    // Quello che non deve succedere è che l'informazione si perda, quindi
    // per ogni nome abbreviato si verifica che per esteso stia altrove —
    // nella riga delle festività e nel titolo della casella.
    const abbrev=r.etichette.filter(e=>e.serve>e.ha+1);
    const interi=await p.evaluate(()=>[...document.querySelectorAll('.calGrid .calCell[title]')]
      .map(c=>c.getAttribute('title')).join(' | '));
    ok(abbrev.every(e=>r.lista.includes(e.t)&&interi.includes(e.t)),
       `a ${w}px ogni nome abbreviato resta leggibile per esteso altrove`,
       abbrev.length?abbrev.map(e=>e.t).join(' | '):'nessun nome abbreviato');
  }
  await p.close();
}

await b.close();server.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
