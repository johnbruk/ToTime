// Gli export devono essere file Excel veri.
//
// Prima non lo erano: uno era una tabella HTML e l'altro uno
// SpreadsheetML del 2003, tutti e due salvati con estensione .xls.
// Excel da computer li apriva dopo aver avvisato che «formato ed
// estensione non corrispondono»; Excel mobile non li apriva affatto.
//
// Qui si verifica che quello che esce sia un .xlsx a tutti gli effetti —
// firma dell'archivio, parti obbligatorie del formato, valori e date
// rileggibili — e che il giro completo regga: esporto, ricarico, ritrovo
// le stesse righe. Quel giro prima si spezzava, perche' l'import gli
// .xlsx li rifiutava per iscritto.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};

const pg=await b.newPage({viewport:{width:1280,height:900}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(800);
// il mock ha i dati a luglio 2026
await pg.evaluate(()=>{for(let i=0;i<36;i++){
  if((document.querySelector('.month strong')?.textContent||'').startsWith('Luglio 2026'))break;
  window.changeMonth(-1)}});
await pg.waitForTimeout(300);

// Si intercetta quello che l'app passa al download, invece di chiamare
// funzioni interne: cosi' il test percorre la strada vera, quella che
// percorre una persona premendo il pulsante.
const scarica=async azione=>await pg.evaluate(async a=>{
  let blob=null,nome=null;
  const veroUrl=URL.createObjectURL, veroClick=HTMLAnchorElement.prototype.click;
  URL.createObjectURL=b=>{blob=b;return veroUrl.call(URL,b)};
  HTMLAnchorElement.prototype.click=function(){nome=this.download};
  try{ await eval(a); await new Promise(r=>setTimeout(r,400)); }
  finally{ URL.createObjectURL=veroUrl; HTMLAnchorElement.prototype.click=veroClick; }
  if(!blob)return null;
  const buf=await blob.arrayBuffer();
  const {leggiXlsx}=await import('/src/xlsx.js');
  let righe=null,errore=null;
  try{ righe=await leggiXlsx(buf) }catch(e){ errore=String(e.message||e) }
  return {nome,tipo:blob.type,byte:[...new Uint8Array(buf)],righe,errore};
},azione);

const parti=buf=>{
  // si leggono i nomi dall'indice centrale dell'archivio
  const u8=buf,nomi=[];
  for(let i=0;i<u8.length-4;i++)
    if(u8[i]===0x50&&u8[i+1]===0x4B&&u8[i+2]===0x01&&u8[i+3]===0x02){
      const ln=u8[i+28]|(u8[i+29]<<8);
      nomi.push(new TextDecoder().decode(u8.subarray(i+46,i+46+ln)));
    }
  return nomi;
};
const OBBLIGATORIE=['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/worksheets/sheet1.xml'];

console.log('\n=== A. Il consuntivo mensile esce come .xlsx vero ===');
const m=await scarica('window.downloadMonthExcel()');
ok(m!==null,'il pulsante genera un file',m?'sì':'nessun file intercettato');
const g=Uint8Array.from(m?m.byte:[]);
ok(g[0]===0x50&&g[1]===0x4B&&g[2]===0x03&&g[3]===0x04,'comincia con la firma di un archivio (PK)',
   'primi byte: '+[...g.slice(0,4)].map(x=>x.toString(16)).join(' '));
const pg1=parti(g);
ok(OBBLIGATORIE.every(p=>pg1.includes(p)),'contiene le parti obbligatorie del formato',pg1.join(' · '));
ok(pg1.includes('xl/worksheets/sheet2.xml'),'e tutti e due i fogli, Dettaglio e Pivot');
ok(m&&m.nome&&m.nome.endsWith('.xlsx'),'il nome del file finisce per .xlsx',m?m.nome:'—');
ok(m&&/spreadsheetml\.sheet$/.test(m.tipo),'e il tipo dichiarato è quello di Excel',m?m.tipo:'—');

console.log('\n=== B. Il contenuto si rilegge, date comprese ===');
const letto=(m&&m.righe)||[];
ok(!m||!m.errore,'il file si rilegge senza errori',m&&m.errore?m.errore:'nessun errore');
ok(letto.length>2,'il primo foglio ha righe',letto.length+' righe');
ok(letto[0]&&letto[0][0]==='Data'&&letto[0][6]==='Ore','con le intestazioni al loro posto',JSON.stringify(letto[0]||[]));
const conData=letto.slice(1).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r[0]));
ok(conData.length>0,'le date tornano come date, non come numeri seriali',
   conData.length?conData[0][0]:'nessuna data riconosciuta: '+JSON.stringify(letto[1]||[]));
ok(letto.some(r=>r[0]==='Totale'),'e la riga del totale c\'è');

console.log('\n=== C. Anche l\'export del timesheet ===');
await pg.evaluate(()=>window.go('exportTimesheet'));await pg.waitForTimeout(350);
const t=await scarica(`(async()=>{const f=document.querySelector('#app form.form');
  const mese=f.querySelector('[name=month]'); if(mese)mese.value='2026-07';
  f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()`);
ok(t!==null,'il modulo genera un file',t?'sì':'nessun file intercettato');
if(t){
  ok(t.byte[0]===0x50&&t.byte[1]===0x4B,'anche questo è un archivio, non HTML',
     t.byte.slice(0,4).map(x=>x.toString(16)).join(' '));
  ok(/spreadsheetml\.sheet$/.test(t.tipo),'col tipo di Excel',t.tipo);
  ok(t.nome&&t.nome.endsWith('.xlsx'),'e il nome finisce per .xlsx',t.nome||'—');
  ok(t.righe&&t.righe[0]&&t.righe[0][0]==='Tipo','con le intestazioni giuste',
     JSON.stringify(((t.righe||[])[0]||[]).slice(0,4)));
  const d2=(t.righe||[]).slice(1).find(r=>/^\d{4}-\d{2}-\d{2}$/.test(r[1]));
  ok(!!d2,'e le date leggibili',d2?d2[1]:JSON.stringify((t.righe||[])[1]||[]));
}

console.log('\n=== D. Il giro completo: esporto e ricarico ===');
// E' la parte che prima si spezzava: l'import rispondeva «questo è un
// .xlsx e non si può leggere qui».
ok(g[0]===0x50&&letto.length>2,'un file appena esportato si rilegge senza conversioni',
   letto.length+' righe, prima: '+JSON.stringify((letto[1]||[]).slice(0,3)));
const accept=await pg.evaluate(()=>{window.go('importaConsuntivi');
  const i=document.querySelector('#app input[type=file]');return i?i.getAttribute('accept'):null});
ok(accept&&accept.includes('.xlsx'),'e il selettore dei file li accetta',accept||'nessun campo file');

console.log('\n=== E. Niente resti del formato vecchio ===');
const src=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
ok(!/application\/vnd\.ms-excel/.test(src),'nessun tipo «vnd.ms-excel» nel codice');
ok(!/urn:schemas-microsoft-com:office:spreadsheet/.test(src),'nessuno SpreadsheetML 2003');
ok(!/download=[`'"][^`'"]*\.xls[`'"]/.test(src),'nessun download con estensione .xls');
ok(fs.readFileSync(path.join(ROOT,'sw.js'),'utf8').includes('src/xlsx.js'),
   'il generatore è fra i file tenuti per l\'uso offline');
ok(errs.length===0,'nessun errore JS',errs.slice(0,2).join(' | ')||'nessuno');

console.log('\n=== F. Aperto da una libreria Excel indipendente ===');
// Rileggerlo col nostro stesso lettore direbbe solo che siamo coerenti
// con noi stessi. Qui lo apre openpyxl, che non sa niente di questo
// codice: se lo apre lei, lo apre Excel.
fs.writeFileSync('/tmp/totime-verifica.xlsx',Buffer.from(g));
let esito='';
try{
  esito=execFileSync('python3',['-c',`
import openpyxl,sys
wb=openpyxl.load_workbook('/tmp/totime-verifica.xlsx')
ws=wb.worksheets[0]
d=[c for r in ws.iter_rows() for c in r if c.is_date]
print('%s|%d|%s|%s'%('|'.join(wb.sheetnames),ws.max_row,len(d),ws['A1'].value))
`],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
}catch(e){ esito='ERRORE:'+String(e.stderr||e.message).split('\n').pop(); }
if(esito.startsWith('ERRORE')){
  ok(false,'openpyxl apre il file',esito.slice(0,120));
}else{
  const [n1,n2,righe,date,a1]=esito.split('|');
  ok(true,'openpyxl apre il file senza protestare',`fogli: ${n1}, ${n2}`);
  ok(Number(righe)>2,'e ci trova le righe',righe+' righe');
  ok(Number(date)>0,'con le date riconosciute come date',date+' celle data');
  ok(a1==='Data','e l\'intestazione al suo posto',a1);
}

await pg.close();await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
