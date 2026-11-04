// La dimensione del testo segue il dispositivo.
//
// Le scritte sono in rem: partono dalla dimensione della radice, che
// somma quella del dispositivo (browser, Dynamic Type di iPhone) e quella
// scelta in Aspetto. Qui si verifica che:
//   A. sul telefono, con le impostazioni normali, le misure siano quelle
//      di prima; su tablet e computer crescano; il testo di iPhone e quello
//      del browser, in giù e in su, siano seguiti;
//   B. la scelta in Aspetto ingrandisca davvero il testo e resti dopo un
//      ricaricamento;
//   C. con il testo più grande, telefono e computer, nessuna vista
//      scorra di lato: niente esce dallo schermo.
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

const src=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
const i0=src.indexOf('const map={home');
const VISTE=src.slice(i0+11,src.indexOf('};',i0)).split(',').map(x=>x.split(':')[0].trim()).filter(Boolean);
const URL_=`http://127.0.0.1:${port}/tests/ui/mock.html`;

// Su GitHub e su certi dispositivi i caratteri sono più larghi che qui:
// con «largo» si forza DejaVu Sans, che occupa più spazio, per vedere
// prima quello che uscirebbe dallo schermo solo altrove.
async function apri(opts,scelta,largo){
  const ctx=await b.newContext(opts);
  if(largo)await ctx.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const st=document.createElement('style');st.textContent='*{font-family:"DejaVu Sans",sans-serif!important}';document.head.appendChild(st)}));
  if(scelta)await ctx.addInitScript(v=>{try{localStorage.setItem('totime-testo',v)}catch(e){}},scelta);
  const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto(URL_,{waitUntil:'networkidle'});await pg.waitForTimeout(600);
  return {ctx,pg,errs};
}
const px=(pg,sel)=>pg.evaluate(s=>{const e=document.querySelector(s);return e?parseFloat(getComputedStyle(e).fontSize):null},sel);
const sbordi=pg=>pg.evaluate(()=>{
  const W=document.documentElement.clientWidth;
  const sw=document.documentElement.scrollWidth;
  return {W,sw};
});

const radice=pg=>pg.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize));
console.log('\n=== A. Cresce con lo schermo, segue il dispositivo ===');
// Telefoni: 16px come prima (le misure di ogni schermata restano quelle).
// Poi sale a gradini: tablet +4%, portatile +8,5%, computer +12,5%.
for(const [W,atteso,nome] of [[320,16,'telefono piccolo'],[390,16,'telefono'],[480,16,'telefono grande'],[767,16,'ultimo telefono'],[768,16.64,'tablet'],[1024,17.36,'tablet orizzontale'],[1280,18,'computer'],[1920,18,'schermo grande']]){
  const {ctx,pg}=await apri({viewport:{width:W,height:800},hasTouch:W<900});
  const r=await radice(pg);
  ok(Math.abs(r-atteso)<0.02,`${nome} ${W}px: radice ${atteso}px`,String(r));
  await ctx.close();
}
{
  const {ctx,pg,errs}=await apri({viewport:{width:390,height:844},hasTouch:true});
  await pg.evaluate(()=>window.go('home'));await pg.waitForTimeout(150);
  const k=await px(pg,'.kpiGrid strong');
  ok(k===null||[23,20,15,17].some(x=>Math.abs(k-x)<0.05),'telefono: numeri della dashboard come prima',String(k));
  // iPhone con il testo al minimo (Dynamic Type «xSmall», 14px su 17) e al
  // massimo senza accessibilità («xxxLarge», 23px su 17): l'app segue.
  for(const [f,nome] of [['0.824','minimo'],['1.353','massimo']]){
    await pg.evaluate(x=>document.documentElement.style.setProperty('--testo-sistema',x),f);
    const r=await radice(pg);
    ok(Math.abs(r-16*f)<0.05,`iPhone con testo al ${nome}: anche l’app (${(16*f).toFixed(1)}px)`,String(r));
  }
  // Le misure «per l'accessibilità» di iOS arrivano a 53px: il fattore si
  // ferma a 1,5 (e in basso a 0,8), altrimenti le cifre non stanno più.
  const lim=await pg.evaluate(()=>[window.limitaFattoreTesto(53/17),window.limitaFattoreTesto(10/17),window.limitaFattoreTesto(14/17)]);
  ok(lim[0]===1.5&&lim[1]===0.8&&lim[2]===0.824,'iPhone con le misure enormi (53px) si ferma a 1,5; in basso a 0,8',JSON.stringify(lim));
  await pg.evaluate(()=>document.documentElement.style.setProperty('--testo-sistema','0.824'));
  await pg.evaluate(()=>window.go('dailyForm'));await pg.waitForTimeout(150);
  const minimo=await pg.evaluate(()=>Math.min(...[...document.querySelectorAll('input,select,textarea')].filter(e=>e.getBoundingClientRect().width&&!['checkbox','radio','file'].includes(e.type)).map(e=>parseFloat(getComputedStyle(e).fontSize))));
  ok(minimo>=16,'iPhone al minimo: i campi restano a 16px (niente zoom automatico di Safari)',String(minimo));
  ok(!errs.length,'nessun errore in pagina',errs.join(' | '));
  await ctx.close();
}
{
  // Computer: il browser con «Dimensione carattere» più piccola o più
  // grande cambia il 100% della radice, e l'app lo segue.
  for(const [def,nome] of [[12,'piccola'],[20,'grande']]){
    const ctx=await b.newContext({viewport:{width:1280,height:800}});const pg=await ctx.newPage();
    const cdp=await ctx.newCDPSession(pg);await cdp.send('Page.enable');
    await cdp.send('Page.setFontSizes',{fontSizes:{standard:def,fixed:13}});
    await pg.goto(URL_,{waitUntil:'networkidle'});await pg.waitForTimeout(400);
    const r=await radice(pg);
    ok(Math.abs(r-def*1.125)<0.05,`computer con carattere del browser ${nome} (${def}px): radice ${def*1.125}px`,String(r));
    await ctx.close();
  }
}

console.log('\n=== B. Scelta in Aspetto ===');
{
  const {ctx,pg,errs}=await apri({viewport:{width:390,height:844},hasTouch:true});
  await pg.evaluate(()=>window.go('appearance'));await pg.waitForTimeout(150);
  const n=await pg.locator('.dimTesto button').count();
  ok(n===4,'quattro scelte: Piccolo, Normale, Grande, Molto grande',String(n));
  ok(await pg.locator('.dimTesto button.active').innerText()==='Normale','di partenza è «Normale»');
  await pg.locator('.dimTesto button',{hasText:'Molto grande'}).click();await pg.waitForTimeout(150);
  const r=await pg.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize));
  ok(Math.abs(r-20)<0.01,'telefono, «Molto grande»: radice 20px (+25%)',String(r));
  ok(await pg.locator('.dimTesto button.active').innerText()==='Molto grande','la scelta risulta selezionata');
  const w=await sbordi(pg);ok(w.sw<=w.W,'le quattro scelte stanno nello schermo del telefono',`${w.sw}/${w.W}`);
  await pg.reload({waitUntil:'networkidle'});await pg.waitForTimeout(500);
  const r2=await pg.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize));
  ok(Math.abs(r2-20)<0.01,'resta anche dopo aver riaperto l’app',String(r2));
  await pg.evaluate(()=>window.saveTextSize('grande'));await pg.waitForTimeout(100);
  const r3=await pg.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize));
  ok(Math.abs(r3-18)<0.01,'«Grande» porta la radice a 18px (+12,5%, come Debt Escape)',String(r3));
  await pg.evaluate(()=>window.saveTextSize('normale'));await pg.waitForTimeout(100);
  ok(await pg.evaluate(()=>localStorage.getItem('totime-testo'))===null&&await pg.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))===16,'tornando a «Normale» si torna a 16px');
  ok(!errs.length,'nessun errore in pagina',errs.join(' | '));
  await ctx.close();
}

// Le prove di «Testo su misura» (versione 3, 4/11/2026): ogni vista a
// 320, 360, 430, 768 e 1280 px, testo del dispositivo al 100% e al 135%,
// scelta dell'app su Piccolo e su Molto grande; Molto grande anche con un
// carattere più largo.
//  - la pagina non scorre mai di lato;
//  - nessun testo tagliato a metà (i puntini «…» vanno bene);
//  - sul telefono, anche con «Piccolo», nessun campo sotto i 16px.
const tagliati=pg=>pg.evaluate(()=>{const out=[];
  document.querySelectorAll('.app *').forEach(e=>{
    if(!e.childNodes.length||![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return;
    const cs=getComputedStyle(e);if(e.classList.contains('srOnly')||cs.clip!=='auto'&&cs.position==='absolute')return;
    // i puntini vanno bene su nomi e note, mai su una cifra
    if(cs.textOverflow==='ellipsis'&&!/\d/.test(e.textContent))return;
    if(cs.overflowX==='visible'||cs.overflowX==='auto'||cs.overflowX==='scroll')return;
    if(e.clientWidth&&e.scrollWidth>e.clientWidth+1)out.push(e.tagName.toLowerCase()+'.'+String(e.className).split(' ')[0]+' «'+e.textContent.trim().slice(0,24)+'»');
  });
  // un riquadro che nasconde ciò che esce (.list ha overflow:hidden) non
  // deve avere dentro niente che finisca oltre il suo bordo destro
  document.querySelectorAll('.app .list,.app .row').forEach(box=>{
    const cs=getComputedStyle(box);if(cs.overflowX!=='hidden'&&cs.overflow!=='hidden')return;
    const R=box.getBoundingClientRect().right;
    box.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect();
      if(r.width&&r.right>R+1&&getComputedStyle(e).position!=='absolute')out.push('nascosto in '+String(box.className).split(' ')[0]+': '+e.tagName.toLowerCase()+'.'+String(e.className).split(' ')[0]+' «'+e.textContent.trim().slice(0,24)+'»')});
  });
  return out});
const PROVE=[];
for(const W of [320,360,430,768,1280])for(const sistema of ['1','1.35']){
  for(const scelta of ['piccolo','molto'])PROVE.push([W,sistema,scelta,false]);
  PROVE.push([W,sistema,'molto',true]);
}
for(const [W,sistema,scelta,largo] of PROVE){
  const tocco=W<=768;
  {
    {
      const {ctx,pg,errs}=await apri({viewport:{width:W,height:800},hasTouch:tocco},scelta,largo);
      await pg.evaluate(f=>document.documentElement.style.setProperty('--testo-sistema',f),sistema);
      const fuori=[],tronchi=[],piccoli=[];
      for(const v of VISTE){
        await pg.evaluate(x=>{try{window.go(x)}catch(e){}},v);
        await pg.waitForTimeout(40);
        const w=await sbordi(pg);
        if(w.sw>w.W+1)fuori.push(`${v} (${w.sw}/${w.W})`);
        for(const t of await tagliati(pg))tronchi.push(`${v}: ${t}`);
        if(tocco){const m=await pg.evaluate(()=>[...document.querySelectorAll('input,select,textarea')].filter(e=>e.getBoundingClientRect().width&&!['checkbox','radio','file'].includes(e.type)).map(e=>parseFloat(getComputedStyle(e).fontSize)));if(m.some(x=>x<16))piccoli.push(v)}
      }
      const nome=`${W}px · dispositivo ${Math.round(sistema*100)}% · ${scelta==='molto'?'Molto grande':'Piccolo'}${largo?' · carattere largo':''}`;
      ok(!fuori.length,`${nome}: nessuna delle ${VISTE.length} viste scorre di lato`,fuori.join(', '));
      ok(!tronchi.length,`${nome}: nessun testo tagliato`,[...new Set(tronchi)].slice(0,8).join(' | '));
      if(tocco)ok(!piccoli.length,`${nome}: campi almeno 16px (niente zoom di iPhone)`,piccoli.join(', '));
      ok(!errs.length,`${nome}: nessun errore in pagina`,errs.join(' | '));
      await ctx.close();
    }
  }
}

await b.close();server.close();
console.log(`\n${pass} OK, ${fail} KO`);
process.exit(fail?1:0);
