// I colori delle attività e i gruppi per cliente.
//
// Due cose che si vedono sull'elenco del mese e che prima non si
// vedevano: ogni attività ha un colore suo, e le righe sono spezzate
// per cliente invece di susseguirsi in un unico rotolo.
//
// Sul colore il punto delicato non è che ci sia — c'era già — ma che
// sia DIVERSO: con sei slot e un hash, due attività su tre finivano
// appaiate, e uno dei sei slot era l'ardesia della palette, cioè il
// grigio che non distingue niente. Qui si controlla che dodici
// attività prendano dodici colori diversi, che nessuno di loro sia
// grigio, e che il colore di un'attività non si sposti quando se ne
// aggiungono altre.
//
// Sul raggruppamento il punto delicato è che l'elenco non perda righe:
// spezzare in gruppi deve conservare tutte le voci e il loro ordine.
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

const apri=async(w=1280)=>{
  const pg=await b.newPage({viewport:{width:w,height:1400},hasTouch:w<900});
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(()=>{for(let i=0;i<36;i++){
    if((document.querySelector('.month strong')?.textContent||'').startsWith('Luglio 2026'))break;
    window.changeMonth(-1)}});
  await pg.waitForTimeout(400);
  return pg;
};
// il colore vero che si vede a schermo, non la classe: se la regola CSS
// sparisse il test dovrebbe accorgersene
const tinte=pg=>pg.evaluate(()=>{
  const out={};
  document.querySelectorAll('#app .actTag').forEach(t=>{
    const s=getComputedStyle(t);
    out[t.textContent.trim()]={testo:s.color,sfondo:s.backgroundColor,classe:[...t.classList].find(c=>/^act\d+$/.test(c))||''};
  });
  return out;
});
// grigio = i tre canali quasi uguali fra loro. L'ardesia della palette
// (#7C89A6, #93A2B8, #B3BDD0) ha canali vicini: e' quella che si vuole
// fuori dai tag delle attivita'.
const grigio=c=>{const m=c.match(/\d+(\.\d+)?/g);if(!m)return false;
  const [r,g,bl]=m.map(Number);const mx=Math.max(r,g,bl),mn=Math.min(r,g,bl);
  return (mx-mn)<=42};

const pg=await apri();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));

console.log('\n=== A. Ogni attività il suo colore ===');
// dodici attivita' vere, una per ogni consuntivo del mese
await pg.evaluate(()=>{
  const S=window.__stores;
  S.activities.length=0;
  S.timesheet_entries.length=0;
  for(let i=0;i<12;i++){
    S.activities.push({id:'act-'+i,name:'Attività '+i,active:true});
    S.timesheet_entries.push({id:'ec'+i,entry_date:'2026-07-'+String(i+1).padStart(2,'0'),
      client_id:'c1',project_id:'p1',activity_id:'act-'+i,hours:1,
      daily_rate_snapshot:480,standard_hours_snapshot:8});
  }
});
await pg.evaluate(()=>window.reload().then(()=>window.go('timesheet')));
await pg.waitForTimeout(600);

const t12=await tinte(pg);
const nomi=Object.keys(t12);
ok(nomi.length===12,'le dodici attività sono tutte a schermo con il loro tag',nomi.length+' tag');
const classi=[...new Set(nomi.map(n=>t12[n].classe))];
ok(classi.length===12,'e ognuna prende uno slot diverso',classi.sort().join(' '));
const colori=[...new Set(nomi.map(n=>t12[n].testo))];
ok(colori.length===12,'che a schermo sono dodici colori diversi davvero',colori.length+' tinte');
const sfondi=[...new Set(nomi.map(n=>t12[n].sfondo))];
ok(sfondi.length===12,'sfondi compresi',sfondi.length+' sfondi');

console.log('\n=== B. Nessuno di loro è grigio ===');
const grigi=nomi.filter(n=>grigio(t12[n].testo));
ok(grigi.length===0,'nessun tag di attività cade sull\'ardesia della palette',
   grigi.length?grigi.map(n=>n+' '+t12[n].testo).join(', '):'zero grigi');

console.log('\n=== C. Il colore di un\'attività non si sposta ===');
const primaAlfa=t12['Attività 3']||{classe:'(nessun tag)'};
// se ne aggiunge un'altra: quella di prima deve restare dov'era
await pg.evaluate(()=>{window.__stores.activities.push({id:'act-zz',name:'Aggiunta dopo',active:true})});
await pg.evaluate(()=>window.reload());
await pg.waitForTimeout(500);
const dopo=await tinte(pg);
ok(!!dopo['Attività 3']&&dopo['Attività 3'].classe===primaAlfa.classe,
   'aggiungere un\'attività non ricolora quelle che c\'erano già',
   primaAlfa.classe+' → '+(dopo['Attività 3']||{}).classe);
// e nemmeno rinominarla
await pg.evaluate(()=>{const a=window.__stores.activities.find(x=>x.id==='act-3');a.name='Zzz rinominata'});
await pg.evaluate(()=>window.reload());
await pg.waitForTimeout(500);
const rinom=await tinte(pg);
ok(!!rinom['Zzz rinominata']&&rinom['Zzz rinominata'].classe===primaAlfa.classe,
   'e nemmeno rinominarla',primaAlfa.classe+' → '+(rinom['Zzz rinominata']||{}).classe);

console.log('\n=== D. Anche sul tema chiaro si legge ===');
await pg.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));
await pg.waitForTimeout(250);
const chiaro=await tinte(pg);
const chiari=Object.keys(chiaro);
ok([...new Set(chiari.map(n=>chiaro[n].testo))].length===12,
   'sul chiaro restano dodici colori diversi');
// Il contrasto vero, non «piu' scuro di cosi'»: rapporto WCAG fra il
// testo e lo sfondo del tag, che essendo translucido va prima composto
// sopra la scheda. Il testo dei tag e' piccolo: la soglia e' 4,5:1.
const canali=c=>{const m=c.match(/\d+(\.\d+)?/g)||[0,0,0];return m.slice(0,3).map(Number)};
const alfa=c=>{const m=c.match(/[\d.]+/g)||[];return m.length>3?Number(m[3]):1};
const lum=c=>{const [r,g,bl]=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});
  return .2126*r+.7152*g+.0722*bl};
const rapporto=(fg,bg)=>{const a=lum(fg),b=lum(bg);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
const contrasti=async pgx=>{
  const dati=await pgx.evaluate(()=>{
    const out=[];
    document.querySelectorAll('#app .actTag').forEach(t=>{
      const s=getComputedStyle(t);
      let sotto=t.parentElement,sfondo='rgba(0, 0, 0, 0)';
      while(sotto){const b=getComputedStyle(sotto).backgroundColor;
        if(b&&!/rgba\(0, 0, 0, 0\)|transparent/.test(b)){sfondo=b;break}sotto=sotto.parentElement}
      out.push({nome:t.textContent.trim(),testo:s.color,tinta:s.backgroundColor,dietro:sfondo});
    });
    return out;
  });
  return dati.map(d=>{
    const dietro=canali(d.dietro), t=canali(d.tinta), a=alfa(d.tinta);
    const composto=t.map((c,i)=>c*a+dietro[i]*(1-a));
    return {nome:d.nome,r:rapporto(canali(d.testo),composto)};
  });
};
const crChiaro=await contrasti(pg);
const bassiC=crChiaro.filter(c=>c.r<4.5);
ok(bassiC.length===0,'tutti i tag passano 4,5:1 sul tema chiaro',
   bassiC.length?bassiC.map(c=>c.nome+' '+c.r.toFixed(2)).join(', ')
   :'il peggiore è '+Math.min(...crChiaro.map(c=>c.r)).toFixed(2)+':1');
await pg.evaluate(()=>document.documentElement.removeAttribute('data-theme'));
await pg.waitForTimeout(250);
const crScuro=await contrasti(pg);
const bassiS=crScuro.filter(c=>c.r<4.5);
ok(bassiS.length===0,'e 4,5:1 anche sul tema scuro',
   bassiS.length?bassiS.map(c=>c.nome+' '+c.r.toFixed(2)).join(', ')
   :'il peggiore è '+Math.min(...crScuro.map(c=>c.r)).toFixed(2)+':1');

console.log('\n=== E. L\'elenco del mese è spezzato per cliente ===');
const pg2=await apri();
const errs2=[];pg2.on('pageerror',e=>errs2.push(e.message));
// Un terzo cliente che alfabeticamente viene per primo ma che in elenco
// compare per ultimo: senza di lui l'ordine di comparsa e quello
// alfabetico coincidono, e il controllo sull'ordine sarebbe verde
// qualunque cosa faccia il codice.
await pg2.evaluate(()=>{const S=window.__stores;
  S.clients.push({id:'c3',name:'Acme',daily_rate:300,standard_hours:8,
    compensation_type:'daily_rate_8h',active:true});
  S.timesheet_entries.push({id:'eac',entry_date:'2026-07-02',client_id:'c3',
    project_id:null,activity_id:'a2',hours:2,daily_rate_snapshot:300,standard_hours_snapshot:8});
});
await pg2.evaluate(()=>window.reload().then(()=>window.go('timesheet')));
await pg2.waitForTimeout(600);
const gruppi=await pg2.evaluate(()=>{
  const nomeDi=id=>(window.__stores.clients.find(c=>c.id===id)||{}).name||'Senza cliente';
  const clienteDellaRiga=r=>{
    const m=/editEntry\('([^']+)'/.exec(r.getAttribute('onclick')||'');
    if(!m)return null;
    const e=[...window.__stores.timesheet_entries,...window.__stores.manual_entries,
             ...window.__stores.monthly_compensations,...window.__stores.travel_expenses]
      .find(x=>x.id===m[1]);
    return e?nomeDi(e.client_id):null;
  };
  return [...document.querySelectorAll('#app .cliGruppo')].map(g=>({
    testa:g.querySelector('.cliHead b')?.textContent.trim(),
    conto:g.querySelector('.cliHead .cliConto')?.textContent.trim(),
    righe:g.querySelectorAll('.row').length,
    clienti:[...new Set([...g.querySelectorAll('.row')].map(clienteDellaRiga))]
  }));
});
ok(gruppi.length===3,'tre clienti nel mese, tre gruppi',JSON.stringify(gruppi.map(g=>g.testa)));
ok(gruppi.map(g=>g.testa).join(' | ')==='Acme | Equans | Zeta',
   'in ordine alfabetico, non in ordine di comparsa',gruppi.map(g=>g.testa).join(' | '));
ok(gruppi.length>0&&gruppi.every(g=>g.clienti.length===1&&g.clienti[0]===g.testa),
   'e le registrazioni dentro ogni gruppo sono tutte di quel cliente',
   JSON.stringify(gruppi.map(g=>g.testa+' → '+g.clienti.join('+'))));

// Il cliente non si ripete su ogni riga: nella testata una volta, poi
// nelle righe c'e' il progetto, che e' la cosa che cambia
const titoli=await pg2.evaluate(()=>[...document.querySelectorAll('#app .cliGruppo')]
  .flatMap(g=>{const c=g.querySelector('.cliHead b')?.textContent.trim();
    return [...g.querySelectorAll('.row .title')].map(t=>({c,t:t.textContent.trim()}))}));
ok(titoli.length>0&&titoli.every(x=>!x.t.startsWith(x.c)),
   'e il nome del cliente non si ripete su ogni riga',
   JSON.stringify(titoli.slice(0,3).map(x=>x.t)));

console.log('\n=== F. Spezzare non perde righe ===');
const totRighe=gruppi.reduce((n,g)=>n+g.righe,0);
const attese=await pg2.evaluate(()=>window.__stores.timesheet_entries
  .filter(e=>String(e.entry_date).startsWith('2026-07')).length);
ok(totRighe===attese,'le righe dei gruppi sono tutte quelle del mese',totRighe+' su '+attese);
// Equans e' il cliente con piu' voci: cinque, di cui una pianificata
const gEq=gruppi.find(g=>g.testa==='Equans')||{conto:''};
ok(/5 voci/.test(gEq.conto),'la testata conta le voci del gruppo',gEq.conto);
ok(/h/.test(gEq.conto)&&/gg\/u/.test(gEq.conto),
   'e dice quante ore e quante giornate sono',gEq.conto);
// dentro il gruppo l'ordine resta dal piu' recente al piu' vecchio
const date=await pg2.evaluate(()=>{const g=[...document.querySelectorAll('#app .cliGruppo')]
    .find(x=>x.querySelector('.cliHead b')?.textContent.trim()==='Equans');
  return g?[...g.querySelectorAll('.row .date')].map(d=>d.textContent.trim()):[]});
const ordinate=date.slice().sort((a,b)=>{
  const [ga,ma]=a.split('/').map(Number),[gb,mb]=b.split('/').map(Number);
  return (mb-ma)||(gb-ga)});
ok(date.length>1&&JSON.stringify(date)===JSON.stringify(ordinate),
   'dentro il gruppo si scende dal giorno più recente',date.join(' ')||'nessuna data');

console.log('\n=== G. Con un cliente solo non cambia niente d\'altro ===');
await pg2.evaluate(()=>{const S=window.__stores;
  S.timesheet_entries=S.timesheet_entries.filter(e=>e.client_id==='c1')});
await pg2.evaluate(()=>window.reload());
await pg2.waitForTimeout(500);
const uno=await pg2.evaluate(()=>document.querySelectorAll('#app .cliGruppo').length);
ok(uno===1,'un cliente, un gruppo',uno+' gruppi');

console.log('\n=== H. Il mese vuoto resta leggibile ===');
await pg2.evaluate(()=>{window.__stores.timesheet_entries.length=0});
await pg2.evaluate(()=>window.reload());
await pg2.waitForTimeout(500);
const vuoto=await pg2.evaluate(()=>({
  gruppi:document.querySelectorAll('#app .cliGruppo').length,
  testo:document.querySelector('#app .empty')?.textContent.trim()||''}));
ok(vuoto.gruppi===0,'nessun gruppo quando non c\'è niente',vuoto.gruppi+'');
ok(/Nessun consuntivo in questo mese/.test(vuoto.testo),
   'e resta l\'invito ad aggiungerne uno',vuoto.testo.slice(0,60));

console.log('\n=== I. Nessun errore a schermo ===');
ok(errs.length===0,'nessun errore JavaScript nella prima pagina',errs.join(' | '));
ok(errs2.length===0,'nessun errore JavaScript nella seconda',errs2.join(' | '));

await b.close();srv.close();
console.log(`\n${pass} passati, ${fail} falliti`);
process.exit(fail?1:0);
