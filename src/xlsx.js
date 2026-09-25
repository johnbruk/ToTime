// Un file .xlsx vero, senza dipendenze.
//
// Prima gli export erano una tabella HTML (e uno SpreadsheetML 2003)
// salvati con estensione .xls. Excel da computer li apre dopo aver
// avvisato che «formato ed estensione non corrispondono»; Excel mobile
// non li apre affatto, perché sul telefono non esiste il percorso di
// importazione da HTML. Da qui la segnalazione.
//
// Un .xlsx e' una cartella ZIP con dentro cinque file XML. Scriverla a
// mano costa un centinaio di righe e nessun megabyte: su una PWA che
// deve funzionare offline, tirarsi dentro una libreria da quasi un mega
// per generare una tabella sarebbe sproporzionato.
//
// Le voci dello ZIP sono salvate senza compressione (metodo "store").
// E' ZIP valido a tutti gli effetti — il campo del metodo dice 0 — e
// risparmia di implementare deflate. I file che produciamo sono piccoli.

// ── ZIP ──────────────────────────────────────────────────────────────
const TAB_CRC=(()=>{const t=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}
  return t})();

function crc32(bytes){let c=0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++)c=TAB_CRC[(c^bytes[i])&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0}

const enc=new TextEncoder();

// Lo ZIP scrive i numeri in little-endian, quindi byte per byte.
function u16(v){return [v&0xFF,(v>>>8)&0xFF]}
function u32(v){return [v&0xFF,(v>>>8)&0xFF,(v>>>16)&0xFF,(v>>>24)&0xFF]}

function zip(voci){
  const locali=[],centrale=[];let offset=0;
  for(const {nome,dati} of voci){
    const n=enc.encode(nome), crc=crc32(dati), len=dati.length;
    // bit 11 dei flag: il nome del file e' in UTF-8
    const testa=[...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),
                 ...u16(0),...u16(0),...u32(crc),...u32(len),...u32(len),
                 ...u16(n.length),...u16(0)];
    locali.push(Uint8Array.from(testa),n,dati);
    centrale.push(Uint8Array.from([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),
      ...u16(0),...u16(0),...u16(0),...u32(crc),...u32(len),...u32(len),
      ...u16(n.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]),n);
    offset+=testa.length+n.length+len;
  }
  const dimC=centrale.reduce((s,a)=>s+a.length,0);
  const coda=Uint8Array.from([...u32(0x06054b50),...u16(0),...u16(0),
    ...u16(voci.length),...u16(voci.length),...u32(dimC),...u32(offset),...u16(0)]);
  const pezzi=[...locali,...centrale,coda];
  const tot=pezzi.reduce((s,a)=>s+a.length,0);
  const out=new Uint8Array(tot);let p=0;
  for(const a of pezzi){out.set(a,p);p+=a.length}
  return out;
}

// ── XML ──────────────────────────────────────────────────────────────
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

// Colonna 1 → A, 27 → AA. Serve per i riferimenti di cella.
function lettera(n){let s='';while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=(n-r-1)/26}return s}

// Excel conta i giorni dal 30/12/1899. Le date scritte come numero con
// un formato data si possono ordinare e filtrare; scritte come testo no,
// ed e' la differenza fra un foglio usabile e un elenco morto.
function seriale(d){
  const t=(d instanceof Date)?d:new Date(String(d)+'T00:00:00Z');
  if(isNaN(t))return null;
  return Math.round((t.getTime()-Date.UTC(1899,11,30))/86400000);
}

// ── Stili ────────────────────────────────────────────────────────────
// Si raccolgono gli stili davvero usati e si scrive una tabella sola:
// Excel rifiuta il file se un indice punta a uno stile inesistente.
function tabellaStili(usati){
  const fmt=['0.00','dd/mm/yyyy','0.0'];              // id 164, 165, 166
  const numFmts=fmt.map((f,i)=>`<numFmt numFmtId="${164+i}" formatCode="${esc(f)}"/>`).join('');
  const sfondi=[...new Set(usati.map(s=>s.fill).filter(Boolean))];
  const fonts=['<font><sz val="11"/><name val="Calibri"/></font>',
               '<font><b/><sz val="11"/><name val="Calibri"/></font>',
               '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'];
  // gli indici 0 e 1 dei riempimenti sono riservati dal formato
  const fills=['<fill><patternFill patternType="none"/></fill>',
               '<fill><patternFill patternType="gray125"/></fill>',
               ...sfondi.map(c=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`)];
  const borders=['<border><left/><right/><top/><bottom/><diagonal/></border>',
                 '<border><left style="thin"><color rgb="FFB7C0CF"/></left><right style="thin"><color rgb="FFB7C0CF"/></right><top style="thin"><color rgb="FFB7C0CF"/></top><bottom style="thin"><color rgb="FFB7C0CF"/></bottom><diagonal/></border>'];
  const xfs=['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const chiavi=['|'];
  for(const s of usati){
    const k=chiave(s); if(chiavi.includes(k))continue; chiavi.push(k);
    const nf=s.fmt==='0.00'?164:s.fmt==='dd/mm/yyyy'?165:s.fmt==='0.0'?166:0;
    const fo=s.bianco?2:s.b?1:0;
    const fi=s.fill?2+sfondi.indexOf(s.fill):0;
    const bo=s.bordo===false?0:1;
    const al=s.align?`<alignment horizontal="${s.align}" vertical="center" wrapText="${s.wrap?1:0}"/>`:'';
    xfs.push(`<xf numFmtId="${nf}" fontId="${fo}" fillId="${fi}" borderId="${bo}" xfId="0"`+
             `${nf?' applyNumberFormat="1"':''}${fo?' applyFont="1"':''}${fi?' applyFill="1"':''}`+
             ` applyBorder="1"${al?' applyAlignment="1">'+al+'</xf>':'/>'}`);
  }
  return {xml:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`+
    `<numFmts count="${fmt.length}">${numFmts}</numFmts>`+
    `<fonts count="${fonts.length}">${fonts.join('')}</fonts>`+
    `<fills count="${fills.length}">${fills.join('')}</fills>`+
    `<borders count="${borders.length}">${borders.join('')}</borders>`+
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`+
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`+
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`+
    `</styleSheet>`, chiavi};
}
const chiave=s=>[s.b?'b':'',s.bianco?'w':'',s.fill||'',s.fmt||'',s.align||'',s.wrap?'w':'',s.bordo===false?'n':''].join('|');

// ── Foglio ───────────────────────────────────────────────────────────
function foglioXml(righe,cols,chiavi,blocca){
  const out=[];
  righe.forEach((riga,r)=>{
    const celle=[];
    riga.forEach((c,i)=>{
      if(c===null||c===undefined||c==='')return;
      const cella=(typeof c==='object'&&!(c instanceof Date))?c:{v:c};
      const rif=lettera(i+1)+(r+1);
      const st=chiavi.indexOf(chiave(cella.s||{}));
      const s=st>0?` s="${st}"`:'';
      if(cella.t==='d'){
        const n=seriale(cella.v);
        if(n===null){celle.push(`<c r="${rif}"${s} t="inlineStr"><is><t>${esc(cella.v)}</t></is></c>`);return}
        celle.push(`<c r="${rif}"${s}><v>${n}</v></c>`);return;
      }
      if(cella.t==='n'||(cella.t===undefined&&typeof cella.v==='number')){
        const n=Number(cella.v);
        if(!isFinite(n)){celle.push(`<c r="${rif}"${s} t="inlineStr"><is><t>${esc(cella.v)}</t></is></c>`);return}
        celle.push(`<c r="${rif}"${s}><v>${n}</v></c>`);return;
      }
      // xml:space="preserve" tiene gli spazi iniziali e finali
      celle.push(`<c r="${rif}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(cella.v)}</t></is></c>`);
    });
    if(celle.length)out.push(`<row r="${r+1}">${celle.join('')}</row>`);
  });
  const larg=cols&&cols.length?`<cols>${cols.map((w,i)=>
    `<col min="${i+1}" max="${i+1}" width="${Number(w)||12}" customWidth="1"/>`).join('')}</cols>`:'';
  // Quante righe restano ferme scorrendo: di norma la sola
  // intestazione, ma un foglio con un titolo sopra ne ha di piu'.
  const n=blocca===undefined?1:Number(blocca)||0;
  const pane=n>0?`<pane ySplit="${n}" topLeftCell="A${n+1}" activePane="bottomLeft" state="frozen"/>`:'';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`+
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>`+
    larg+`<sheetData>${out.join('')}</sheetData></worksheet>`;
}

// ── Il file ──────────────────────────────────────────────────────────
// fogli: [{nome, cols:[larghezze], righe:[[cella,…]], blocca:n}]
// cella: un valore, oppure {v, t:'s'|'n'|'d', s:{b,fill,fmt,align,wrap,bianco}}
export function xlsxBytes(fogli){
  const usati=[];
  for(const f of fogli)for(const r of f.righe)for(const c of r)
    if(c&&typeof c==='object'&&!(c instanceof Date)&&c.s)usati.push(c.s);
  const {xml:stili,chiavi}=tabellaStili(usati);
  const nomi=fogli.map((f,i)=>esc((f.nome||`Foglio${i+1}`).slice(0,31).replace(/[\\\/\?\*\[\]:]/g,'-')));
  const voci=[
    {nome:'[Content_Types].xml',dati:enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`+
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`+
      `<Default Extension="xml" ContentType="application/xml"/>`+
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`+
      fogli.map((f,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`+
      `</Types>`)},
    {nome:'_rels/.rels',dati:enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`+
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`+
      `</Relationships>`)},
    {nome:'xl/workbook.xml',dati:enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" `+
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>`+
      nomi.map((n,i)=>`<sheet name="${n}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+
      `</sheets></workbook>`)},
    {nome:'xl/_rels/workbook.xml.rels',dati:enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`+
      fogli.map((f,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+
      `<Relationship Id="rId${fogli.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`+
      `</Relationships>`)},
    {nome:'xl/styles.xml',dati:enc.encode(stili)},
    ...fogli.map((f,i)=>({nome:`xl/worksheets/sheet${i+1}.xml`,
                          dati:enc.encode(foglioXml(f.righe,f.cols,chiavi,f.blocca))})),
  ];
  return zip(voci);
}

export const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function xlsxBlob(fogli){
  return new Blob([xlsxBytes(fogli)],{type:XLSX_MIME});
}

// ── Leggere un .xlsx ─────────────────────────────────────────────────
// Serve perche' ora esportiamo .xlsx: se l'import non li sapesse leggere,
// il giro «esporto, correggo, ricarico» si spezzerebbe e toccherebbe
// passare da «Salva con nome → CSV» ogni volta.
//
// Le voci dello ZIP scritte da Excel sono compresse con deflate. Non si
// implementa deflate a mano: i browser ce l'hanno gia' in
// DecompressionStream, e i file che scriviamo noi sono senza
// compressione, quindi si gestiscono tutti e due i casi.

const dec=new TextDecoder('utf-8');
const rdU16=(b,o)=>b[o]|(b[o+1]<<8);
const rdU32=(b,o)=>(b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0;

async function unzip(buffer){
  const b=new Uint8Array(buffer);
  // la coda dello ZIP sta in fondo, dopo un commento di lunghezza ignota
  let eo=-1;
  for(let i=b.length-22;i>=0&&i>b.length-70000;i--)
    if(rdU32(b,i)===0x06054b50){eo=i;break}
  if(eo<0)throw new Error('Il file non sembra un .xlsx: manca la coda dell\'archivio.');
  const n=rdU16(b,eo+10), inizio=rdU32(b,eo+16);
  const out=new Map();
  let p=inizio;
  for(let i=0;i<n;i++){
    if(rdU32(b,p)!==0x02014b50)break;
    const metodo=rdU16(b,p+10), dimC=rdU32(b,p+20);
    const ln=rdU16(b,p+28), le=rdU16(b,p+30), lc=rdU16(b,p+32), off=rdU32(b,p+42);
    const nome=dec.decode(b.subarray(p+46,p+46+ln));
    const dati=(()=>{
      const ln2=rdU16(b,off+26), le2=rdU16(b,off+28);
      const d=off+30+ln2+le2;
      return b.subarray(d,d+dimC);
    })();
    out.set(nome,{metodo,dati});
    p+=46+ln+le+lc;
  }
  const finale=new Map();
  for(const [nome,{metodo,dati}] of out){
    if(metodo===0){finale.set(nome,dati);continue}
    if(metodo!==8)throw new Error(`Una parte del file usa una compressione che non so leggere (metodo ${metodo}).`);
    if(typeof DecompressionStream==='undefined')
      throw new Error('Questo browser non sa decomprimere i .xlsx. Da Excel fai «Salva con nome» e scegli CSV.');
    const ds=new DecompressionStream('deflate-raw');
    const buf=await new Response(new Blob([dati]).stream().pipeThrough(ds)).arrayBuffer();
    finale.set(nome,new Uint8Array(buf));
  }
  return finale;
}

const testo=u8=>u8?dec.decode(u8):'';
const unesc=s=>String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,d)=>String.fromCharCode(+d))
  .replace(/&amp;/g,'&');   // per ultimo, o si rovinano le altre

// I formati data predefiniti di Excel, piu' quelli scritti a mano che
// contengono giorni/mesi/anni. Senza questo controllo una data torna
// come numero (46000) e l'import la scarta.
const FMT_DATA=new Set([14,15,16,17,18,19,20,21,22,45,46,47]);
function stiliData(xml){
  const custom={};
  for(const m of xml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g))
    custom[+m[1]]=unesc(m[2]);
  const blocco=(xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)||[])[1]||'';
  return [...blocco.matchAll(/<xf[^>]*numFmtId="(\d+)"/g)].map(m=>{
    const id=+m[1];
    if(FMT_DATA.has(id))return true;
    const f=custom[id];
    return !!(f&&/[dmy]/i.test(f.replace(/\[[^\]]*\]/g,'').replace(/"[^"]*"/g,'')));
  });
}

const COL=r=>{const m=/^([A-Z]+)/.exec(r||'');if(!m)return null;
  let n=0;for(const c of m[1])n=n*26+(c.charCodeAt(0)-64);return n-1};

const daSeriale=n=>{
  const d=new Date(Date.UTC(1899,11,30)+Math.round(n)*86400000);
  return isNaN(d)?String(n):d.toISOString().slice(0,10);   // yyyy-mm-dd
};

// Torna le righe del primo foglio come matrice di stringhe, nella forma
// che l'import gia' sa digerire.
export async function leggiXlsx(buffer){
  const z=await unzip(buffer);
  const cond=[];
  const ss=testo(z.get('xl/sharedStrings.xml'));
  if(ss)for(const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g))
    cond.push(unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x=>x[1]).join('')));
  const dataSi=stiliData(testo(z.get('xl/styles.xml')));
  // il primo foglio secondo il workbook, non secondo l'ordine dei file
  let nome='xl/worksheets/sheet1.xml';
  const rel=testo(z.get('xl/_rels/workbook.xml.rels'));
  const wb=testo(z.get('xl/workbook.xml'));
  const rid=(wb.match(/<sheet[^>]*r:id="([^"]+)"/)||[])[1];
  if(rid){
    const t=(rel.match(new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))||[])[1];
    if(t)nome='xl/'+t.replace(/^\/?xl\//,'');
  }
  const sh=testo(z.get(nome));
  if(!sh)throw new Error('Nel file non trovo il primo foglio.');
  const righe=[];
  for(const r of sh.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)){
    const riga=[];
    for(const c of r[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      const attr=c[1]||'', dentro=c[2]||'';
      const i=COL((attr.match(/r="([A-Z]+\d+)"/)||[])[1]);
      const t=(attr.match(/t="([^"]+)"/)||[])[1];
      const st=+((attr.match(/s="(\d+)"/)||[])[1]||-1);
      let v='';
      if(t==='inlineStr')v=unesc([...dentro.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x=>x[1]).join(''));
      else{
        const raw=(dentro.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
        if(raw!==undefined){
          if(t==='s')v=cond[+raw]??'';
          else if(t==='str'||t==='b')v=unesc(raw);
          else v=(st>=0&&dataSi[st])?daSeriale(Number(raw)):unesc(raw);
        }
      }
      if(i===null)riga.push(v); else riga[i]=v;
    }
    for(let i=0;i<riga.length;i++)if(riga[i]===undefined)riga[i]='';
    righe.push(riga);
  }
  return righe;
}
