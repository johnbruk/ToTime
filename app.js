import {
  APP_VERSION,
  DEFAULT_DEFAULT_ACTIVITY_START_DATE,
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  esc,
  fmtEUR,
  fmtNum,
  monthNames,
  norm,
  today,
  ym
} from './src/app-utils.js';
import { xlsxBlob, XLSX_MIME, leggiXlsx } from './src/xlsx.js';
import { createRepository } from './src/dataRepository.js';
import { loadAppData } from './src/appDataLoader.js';

const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const repository=createRepository(sb);
let state={cerca:'',view:'home',month:ym(today),edit:null,editType:null,loading:true,message:'',theme:localStorage.getItem('totime-theme')||'light',menuOpen:false,history:[],dirty:false,selMode:false,sel:[]};
let session=null;
let data={clients:[],projects:[],activities:[],entries:[],monthly:[],billingHeaders:[],profiles:[],expenseCategories:[],travelExpenses:[],trips:[],vehicles:[],manualEntries:[],invoiceTemplates:[],appSettings:[],taxSettings:[],taxPayments:[]};
applyTheme();watchSystemTheme();


function systemTheme(){try{return (window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch(e){return 'light'}}
function effectiveTheme(){const t=state.theme||'light';return t==='auto'?systemTheme():t}
function applyTheme(){document.documentElement.setAttribute('data-theme',effectiveTheme());localStorage.setItem('totime-theme',state.theme||'light')}
function watchSystemTheme(){try{const mq=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');if(!mq)return;const h=()=>{if((state.theme||'light')==='auto'){applyTheme();render()}};mq.addEventListener?mq.addEventListener('change',h):mq.addListener(h)}catch(e){}}
function logoIcon(){return (state.theme||'light')==='dark'?'assets/TOTIME_logo_only_dark.png':'assets/TOTIME_logo_only.png'}
function logoWordmark(){return (state.theme||'light')==='dark'?'assets/TOTIME_logo_wordmark_dark.png':'assets/TOTIME_logo_wordmark.png'}
// Il pianificato entra in fattura: chi prepara la fattura prima della
// fine del mese vuole vedere anche i giorni gia' in calendario. Acceso
// di partenza — e' il caso normale di chi ce l'ha chiesto — ma si
// spegne dalla pagina della fatturazione, perche' su un mese chiuso
// fatturare del pianificato non ha senso.
// Il valore scelto in questa sessione. Non si scrive dentro
// data.appSettings: saveSetting decide fra inserimento e aggiornamento
// guardando proprio la' dentro, e una riga messa a mano senza
// identificativo gli farebbe scegliere un aggiornamento che non
// aggiorna niente. Qui l'interruttore risponde subito e il salvataggio
// resta una cosa sola.
let pianScelta=null;
function fatturaPianificato(){
  if(pianScelta!==null)return pianScelta;
  return settingValue('fattura_pianificato')!=='false';
}
async function cambiaFatturaPianificato(v){
  const prima=pianScelta;
  pianScelta=!!v;
  render();
  try{
    const res=await saveSetting('fattura_pianificato',v?'true':'false');
    if(res&&res.error)throw res.error;
  }catch(e){
    pianScelta=prima;
    setMsg('La scelta non si è salvata: '+(e&&e.message||e),5000);
    render();
  }
}
function settingValue(key){return data.appSettings?.find(s=>s.setting_key===key)?.setting_value}
function loadThemeFromSettings(){const val=settingValue('theme'); if(typeof val==='string' && ['light','dark','auto'].includes(val)){state.theme=val} applyTheme()}
async function saveThemeChoice(theme){state.theme=theme;applyTheme();const existing=data.appSettings?.find(s=>s.setting_key==='theme');const payload={setting_key:'theme',setting_value:theme};let res;if(existing)res=await updateResilient('app_settings',payload,existing.id);else res=await insertResilient('app_settings',payload);if(res.error)return setMsg(res.error.message,7000);await reload();state.view='appearance';setMsg('Tema aggiornato.',3000)}

function monthLabel(m){const [y,mo]=m.split('-').map(Number);return `${monthNames[mo-1]} ${y}`}
function periodParts(m=state.month){const [year,month]=m.split('-').map(Number);return {year,month}}
function changeMonth(delta){let [y,m]=state.month.split('-').map(Number);m+=delta;if(m<1){m=12;y--}if(m>12){m=1;y++}state.month=`${y}-${String(m).padStart(2,'0')}`;render()}
// Un messaggio non deve portare via quello che stai scrivendo.
// setMsg ridisegna tutta la schermata: va benissimo quando si cambia
// pagina, e' un disastro mentre un modulo e' aperto e compilato a
// meta'. Questo infila il messaggio nel DOM e basta.
function setMsgLeggero(msg,timeout=6000){
  const app=document.getElementById('app');
  const dove=app&&app.querySelector('.app');
  if(!dove)return setMsg(msg,timeout);
  state.message=msg;
  let t=dove.querySelector(':scope > .toast');
  if(!t){
    t=document.createElement('div');
    t.className='toast';
    dove.insertBefore(t,dove.firstChild);
  }
  t.textContent=msg;
  setTimeout(()=>{
    if(state.message!==msg)return;
    state.message='';
    const x=dove.querySelector(':scope > .toast');
    if(x)x.remove();
  },timeout);
}
function setMsg(msg,timeout=4200){
  state.message=msg;render();
  setTimeout(()=>{
    if(state.message!==msg)return;
    state.message='';
    const t=document.querySelector('#app .toast');
    if(t)t.remove(); else render();
  },timeout);
}
function clientById(id){return data.clients.find(c=>c.id===id)}
function projectById(id){return data.projects.find(p=>p.id===id)}
function activityById(id){return data.activities.find(a=>a.id===id)}
function expenseCategoryById(id){return data.expenseCategories.find(x=>x.id===id)}
function invoiceTemplateByType(type){return data.invoiceTemplates.filter(t=>t.active&&t.entry_type===type).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))[0]}
function clientName(id){return clientById(id)?.name||'Senza cliente'}
function projectName(id){return projectById(id)?.name||''}
function activityName(id){return activityById(id)?.name||''}
// Il colore di un'attivita' la distingue dalle altre: due attivita' dello
// stesso colore non distinguono niente. Prima il colore usciva da un hash
// su sei slot, e con sei slot due attivita' su tre finivano appaiate.
// Ora l'hash sceglie lo slot di partenza e, se e' gia' preso, si scorre:
// finche' ci sono slot liberi non ci sono due attivita' uguali.
// L'assegnazione gira sugli id ordinati, non sui nomi ne' sull'ordinamento
// scelto per le liste, cosi' rinominare un'attivita' o cambiare
// l'ordinamento non sposta nessun colore.
const ACT_COLORI=12;
let actSlotMappa=null,actSlotChiave=null;
function actHash(id){let h=0;const s=String(id||'');for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h}
function actSlots(){
  const ids=(data.activities||[]).map(a=>a.id).sort();
  const chiave=ids.join('|');
  if(actSlotMappa&&actSlotChiave===chiave)return actSlotMappa;
  const presi=new Set(),mappa={};
  ids.forEach(id=>{
    let slot=actHash(id)%ACT_COLORI;
    for(let k=0;k<ACT_COLORI&&presi.has(slot);k++)slot=(slot+1)%ACT_COLORI;
    presi.add(slot);mappa[id]=slot;
  });
  actSlotChiave=chiave;actSlotMappa=mappa;return mappa;
}
function activityTagClass(id){const s=actSlots()[id];return 'act'+(s===undefined?actHash(id)%ACT_COLORI:s)}
function activityTag(id){const n=activityName(id);return n?`<span class="tag actTag ${activityTagClass(id)}">${esc(n)}</span>`:''}
function expenseCategoryName(id){return expenseCategoryById(id)?.name||'Spesa'}
function entryRate(e){return Number(e.daily_rate_snapshot ?? clientById(e.client_id)?.daily_rate ?? 0)}
function entryStd(e){return Number(e.standard_hours_snapshot ?? clientById(e.client_id)?.standard_hours ?? 8) || 8}
function dailyAmount(e){return entryRate(e)/entryStd(e)*Number(e.hours||0)}
function dailyDays(e){return Number(e.hours||0)/entryStd(e)}
function rowsForMonth(){return data.entries.filter(e=>String(e.entry_date||'').startsWith(state.month))}
function monthlyRows(){const {year,month}=periodParts();return data.monthly.filter(e=>Number(e.year)===year&&Number(e.month)===month)}
function manualRows(){return data.manualEntries.filter(e=>String(e.entry_date||'').startsWith(state.month))}
function expenseRows(){return data.travelExpenses.filter(e=>String(e.expense_date||'').startsWith(state.month))}
const REIMB_TYPES=[['own','A mio carico (costo)'],['invoice','Rimborso in fattura'],['expense_report','Piè di lista']];
function reimbLabel(t){return ({own:'A mio carico',invoice:'Rimborso in fattura',expense_report:'Piè di lista'})[t]||'A mio carico'}
function expType(e){if(!e)return 'own';if(e.reimbursement_type)return String(e.reimbursement_type);return e.reimbursable===false?'own':'invoice'}
function expIsInvoice(e){return expType(e)==='invoice'}
function expIsOwn(e){return expType(e)==='own'}
function expIsPie(e){return expType(e)==='expense_report'}
function expReimbursable(e){return expType(e)!=='own'}
// ─── La trasferta ───────────────────────────────────────────────────
// Prima di questo, una spesa era sola al mondo: il volo del 25 e il
// rimborso km del 29 erano la stessa trasferta a Catania e l'app non
// lo sapeva. Ora la trasferta e' un oggetto suo, e la spesa ci sta
// dentro — ma solo se vuole: trip_id resta vuoto per i costi puri
// (software, abbonamenti) che non sono trasferte.
const TRIP_STATI=[['draft','Bozza'],['to_recharge','Da riaddebitare'],['invoiced','In fattura'],['closed','Chiusa']];
function tripStatoLabel(s){const h=TRIP_STATI.find(x=>x[0]===s);return h?h[1]:'Bozza'}
function tripStatoClass(s){return ({draft:'gray',to_recharge:'orange',invoiced:'blue',closed:'green'})[s]||'gray'}
// Senza la migrazione la tabella non c'e': la pagina Spese deve
// ricadere sull'elenco piatto invece di mostrare una vista vuota.
function trasferteReady(){return !(state.missingTables&&state.missingTables.has('trips'))}
function tripById(id){return (data.trips||[]).find(t=>t.id===id)}
function tripSpese(id){return (data.travelExpenses||[]).filter(e=>e.trip_id===id)}
function tripTotale(id){return tripSpese(id).reduce((s,e)=>s+Number(e.amount||0),0)}
function tripDa(t){return String(t&&t.start_date||'')}
function tripA(t){return String(t&&(t.end_date||t.start_date)||'')}
// «25 – 29 ott» su una trasferta di piu' giorni, «6 ott» su una di uno.
function tripPeriodo(t){
  const a=tripDa(t),b=tripA(t);
  if(!a)return '';
  if(!b||b===a)return dateIT(a);
  return dateIT(a)+' – '+dateIT(b);
}
function tripTitolo(t){
  const dove=norm(t&&t.destination_city)||'Senza destinazione';
  return dove+(t&&t.destination_country?' ('+t.destination_country+')':'');
}
// Una trasferta appartiene al mese se lo tocca, anche solo di sconfinamento:
// una 28/10 – 2/11 si deve vedere in ottobre e in novembre.
function tripNelMese(t,m=state.month){
  const a=tripDa(t).slice(0,7),b=tripA(t).slice(0,7);
  if(!a)return false;
  return a===m||b===m||(a<m&&b>m);
}
function trasferteDelMese(){
  return (data.trips||[]).filter(t=>tripNelMese(t))
    .sort((a,b)=>tripDa(b).localeCompare(tripDa(a))||tripTitolo(a).localeCompare(tripTitolo(b)));
}

// ─── Il rimborso chilometrico ─────────────────────────────
// «Rimborso KM» era una voce di spesa come un pasto, con la tariffa
// battuta a mano su ogni riga. Nei dati di ottobre ci sono due righe
// «Rimborso KM 94,50 €» identiche e non si puo' sapere se sono lo
// stesso tragitto fatto due volte o un errore: non e' scritto ne'
// quanti km ne' da dove a dove.
//
// La tariffa si mette a mano (le tabelle ACI stanno su costikm.aci.it e
// cambiano a gennaio). Quella del veicolo e' il valore PROPOSTO: sulla
// singola spesa si corregge, e una chilometrica si registra anche senza
// veicolo, con km e tariffa scritti a mano.
const CARBURANTI=[['benzina','Benzina'],['diesel','Diesel'],['ibrida','Ibrida'],['plugin','Ibrida plug-in'],['elettrica','Elettrica'],['altro','Altro']];
function carburanteLabel(v){const h=CARBURANTI.find(x=>x[0]===v);return h?h[1]:''}
function veicoliReady(){return !(state.missingTables&&state.missingTables.has('vehicles'))}
function vehicleById(id){return (data.vehicles||[]).find(v=>v.id===id)}
function veicoliAttivi(){return (data.vehicles||[]).filter(v=>v.active!==false)}
function vehicleLabel(v){
  if(!v)return '';
  const t=Number(v.rate_per_km||0);
  return v.name+(v.plate?' · '+v.plate:'')+(t>0?' · '+fmtNum(t,2)+' €/km':'');
}
function vehicleOptions(selected=''){
  const list=veicoliAttivi().filter(v=>v.active!==false||v.id===selected);
  return `<option value="">— Senza veicolo, tariffa a mano —</option>`+
    list.map(v=>`<option value="${v.id}"${v.id===selected?' selected':''}>${esc(vehicleLabel(v))}</option>`).join('');
}
// Quali voci sono chilometriche. La colonna is_mileage e' la verita';
// finche' la migrazione non c'e', si ripiega sull'unita' di misura, che
// e' fragile ma meglio di niente.
function eVoceChilometrica(cat){
  if(!cat)return false;
  if(cat.is_mileage===true)return true;
  if(cat.is_mileage===false)return false;
  return /^(km|chilometri|kilometri)$/i.test(String(cat.unit_label||''));
}
// Una voce chilometrica e' km x tariffa per definizione: il «tipo
// calcolo» della voce non puo' contraddirla. Se e' rimasta su «Importo
// manuale» \u2014 ed e' il caso delle voci che esistevano prima che
// is_mileage esistesse \u2014 il campo della tariffa spariva e l'importo
// non si calcolava mai: scrivevi i km e restavi a zero, senza nemmeno
// un posto dove mettere la tariffa.
function aQuantitaTariffa(cat){
  if(!cat)return false;
  return cat.calculation_type==='quantity_rate'||eVoceChilometrica(cat);
}
function spesaChilometrica(e){return eVoceChilometrica(expenseCategoryById(e&&e.expense_category_id))}
// «Catania → Modica e ritorno · 210 km × 0,45 €/km · Panda»
function percorsoDi(e){
  if(!e)return '';
  const pezzi=[];
  const da=norm(e.from_place),a=norm(e.to_place);
  if(da&&a)pezzi.push(da+' → '+a+(e.round_trip?' e ritorno':''));
  else if(da||a)pezzi.push(da||a);
  const km=Number(e.quantity||0),tar=Number(e.unit_rate||0);
  if(km>0)pezzi.push(fmtNum(km,0)+' km'+(tar>0?' × '+fmtNum(tar,2)+' €/km':''));
  const v=e.vehicle_id?vehicleById(e.vehicle_id):null;
  if(v)pezzi.push(v.name);
  return pezzi.join(' · ');
}

function isMissingColumnError(err){return !!err && /column|schema cache|does not exist|could not find/i.test(err.message||'')}
function missingColumnName(err){if(!err)return null;const m=(err.message||'').match(/'([a-zA-Z_]\w*)'\s+column|column\s+'([a-zA-Z_]\w*)'|column\s+"([a-zA-Z_]\w*)"/);return m?(m[1]||m[2]||m[3]):null}
// Esegue la scrittura; se il DB segnala una colonna mancante (schema non ancora
// migrato), la rimuove dal payload e ritenta, finche' la scrittura riesce.
// Cosi' i salvataggi non si bloccano mai per colonne nuove non ancora create.
// Il ripiego sulle colonne mancanti serviva a non bloccare i
// salvataggi quando il database non e' ancora migrato. Ma scartava i
// campi IN SILENZIO: uno scriveva come aveva pagato, la riga si
// salvava, e quel dato non c'era. Ora dice cosa ha dovuto lasciare
// fuori, in res.scartate, e chi salva lo riferisce.
async function runResilient(makeCall,payload,dropKeys){
  const p={...payload};
  const scartate=[];
  let res=await makeCall(p);
  let guard=0;
  while(isMissingColumnError(res.error)&&guard++<40){
    let removed=false;
    const col=missingColumnName(res.error);
    if(col&&Object.prototype.hasOwnProperty.call(p,col)){delete p[col];scartate.push(col);removed=true}
    if(!removed){(dropKeys||[]).forEach(k=>{if(Object.prototype.hasOwnProperty.call(p,k)){delete p[k];scartate.push(k);removed=true}})}
    if(!removed)break;
    res=await makeCall(p);
  }
  if(res&&typeof res==='object')res.scartate=scartate;
  return res;
}
// Quali migrazioni servono per le colonne che il database non ha.
const MIGRAZIONE_DI={
  trip_id:'2026-10-06_trasferte.sql',
  vehicle_id:'2026-10-06_veicoli-e-chilometrica.sql',
  from_place:'2026-10-06_veicoli-e-chilometrica.sql',
  to_place:'2026-10-06_veicoli-e-chilometrica.sql',
  round_trip:'2026-10-06_veicoli-e-chilometrica.sql',
  is_mileage:'2026-10-06_veicoli-e-chilometrica.sql',
  payment_method:'2026-10-06_tracciabilita.sql',
  receipt_kept:'2026-10-06_tracciabilita.sql',
  receipt_path:'2026-10-06_ricevute-storage.sql'
};
const NOME_COLONNA={
  trip_id:'la trasferta',vehicle_id:'il veicolo',from_place:'la partenza',
  to_place:'l\u2019arrivo',round_trip:'l\u2019andata e ritorno',
  payment_method:'come l\u2019hai pagata',receipt_kept:'la ricevuta',
  receipt_path:'la ricevuta allegata',wbs_id:'la commessa',
  is_mileage:'il rimborso chilometrico'
};
// Il messaggio da dire quando una scrittura ha dovuto lasciare fuori
// dei campi: cosa non e' stato salvato, e quale migrazione lo sistema.
function avvisoScartate(res){
  const sc=(res&&res.scartate)||[];
  if(!sc.length)return '';
  const nomi=[...new Set(sc.map(c=>NOME_COLONNA[c]||c))];
  const mig=[...new Set(sc.map(c=>MIGRAZIONE_DI[c]).filter(Boolean))];
  return 'Salvato, ma il database non ha ancora dove mettere '+nomi.join(', ')+
    ': quel dato non \u00e8 stato scritto.'+
    (mig.length?' Lancia '+mig.join(' e ')+'.':'');
}
async function insertResilient(table,payload,dropKeys){return runResilient(p=>sb.from(table).insert(p),payload,dropKeys)}
async function updateResilient(table,payload,id,dropKeys){return runResilient(p=>sb.from(table).update(p).eq('id',id),payload,dropKeys)}
async function insertReturningResilient(table,payload,dropKeys){return runResilient(p=>sb.from(table).insert(p).select().single(),payload,dropKeys)}
// Chiave di importazione (dedup): stringa deterministica dai campi identificativi.
function importKey(parts){return parts.map(x=>String(x==null?'':x).trim().toLowerCase()).join('|')}
// Upsert per import: se esiste una riga con la stessa import_key -> update, altrimenti insert.
// Se la colonna import_key non esiste ancora nel DB, le scritture resilienti la ignorano
// e nessuna riga risulta con import_key: l'import ricade sul vecchio comportamento (insert).
async function upsertByKey(table,list,payload,key,dropKeys){const p={...payload,import_key:key};const dk=['import_key'].concat(dropKeys||[]);const existing=key&&(list||[]).find(r=>r.import_key===key);if(existing){return {res:await updateResilient(table,p,existing.id,dk),updated:true}}return {res:await insertResilient(table,p,dk),updated:false}}
function totals(){let h=0,a=0,ph=0,pa=0,c=0,p=0;rowsForMonth().forEach(e=>{const amt=dailyAmount(e);if(isPlanned(e)){ph+=Number(e.hours||0);pa+=amt;}else{h+=Number(e.hours||0);a+=amt;}});monthlyRows().forEach(e=>a+=Number(e.amount||0));manualRows().forEach(e=>{const v=Number(e.amount||0);if(isPlanned(e))pa+=v;else a+=v;});expenseRows().forEach(e=>{const t=expType(e),v=Number(e.amount||0);if(t==='invoice')a+=v;else if(t==='own')c+=v;else p+=v});return {hours:h,days:h/8,amount:a,plannedHours:ph,plannedDays:ph/8,plannedAmount:pa,costs:c,pie:p}}
function fmtDays(hours){return fmtNum(Number(hours||0)/8,2)}
function metricLine(hours,amount){return `${fmtNum(hours,1)} h <span class="dot">·</span> ${fmtDays(hours)} gg/u <span class="dot">·</span> ${fmtEUR(amount)}`}
function amountLine(label,amount){return `${esc(label)} <span class="dot">·</span> ${fmtEUR(amount)}`}
function dateIT(v){if(!v)return'';const s=String(v);return `${s.slice(8,10)}/${s.slice(5,7)}`}
function viewLabel(v){return ({tripNew:'Nuova trasferta',tripEdit:'Modifica trasferta',home:'Dashboard',timesheet:'Timesheet',billing:'Fatturazione',billingDetail:'Dettaglio fattura',tax:'Profilo fiscale',taxPayments:'Pagamenti fiscali',taxPaymentEdit:'Pagamento fiscale',annualMonths:'Consuntivato annuale',annualInvoices:'Elenco fatture',settings:'Configurazione',clients:'Clienti',clientEdit:'Cliente',projects:'Progetti',projectEdit:'Progetto',activities:'Attività',activityEdit:'Attività',expenseCategories:'Voci spesa',vehicles:'Veicoli',vehicleEdit:'Veicolo',policyRimborsi:'Policy rimborsi',expenseCategoryEdit:'Voce spesa',invoiceTemplates:'Template fattura',invoiceTemplateEdit:'Template fattura',appearance:'Aspetto',exportTimesheet:'Export timesheet',dailyForm:'Consuntivo giornaliero',dailyEdit:'Consuntivo giornaliero',monthlyForm:'Compenso mensile',monthlyEdit:'Compenso mensile',manualForm:'Consuntivo manuale',manualEdit:'Consuntivo manuale',expenseForm:'Spesa trasferta',expenseEdit:'Spesa trasferta'})[v]||'schermata precedente'}
function guardUnsavedChanges(){if(!state.dirty)return true;const leave=confirm('Hai modifiche non salvate. Vuoi uscire da questa schermata e perdere i dati inseriti?');if(leave){state.dirty=false;return true}return false}
function pushHistory(){const last=state.history[state.history.length-1];const cur={view:state.view,edit:state.edit,editType:state.editType,parent:state.parent};if(!last||last.view!==cur.view||last.edit!==cur.edit||last.editType!==cur.editType)state.history.push(cur);if(state.history.length>30)state.history.shift()}
// `parent` e' il livello sopra: il cliente di un progetto nuovo, il
// progetto di una commessa nuova. Senza di lui quelle due maschere non
// sanno sotto cosa stanno creando e ricadono sull'elenco, in silenzio.
function navigateTo(v,{edit=null,editType=null,track=true,resetEdit=true,prefill=null,parent=null,keepMenu=false}={}){if(!guardUnsavedChanges())return;if(track&&state.view!==v)pushHistory();state.view=v;state.edit=resetEdit?edit:state.edit;state.editType=resetEdit?editType:state.editType;state.prefill=prefill;state.parent=parent;if(!keepMenu)state.menuOpen=false;clearSel();render()}
function go(v){navigateTo(v)}
// Le intestazioni del menu aprono la sezione senza chiudere il menu:
// cosi' le sottovoci si vedono subito, con un tocco invece di tre.
function apriGruppo(v){navigateTo(v,{keepMenu:true})}
function back(){if(!guardUnsavedChanges())return;const prev=state.history.pop()||{view:'home',edit:null,editType:null};state.view=prev.view||'home';state.edit=prev.edit||null;state.editType=prev.editType||null;state.parent=prev.parent||null;state.menuOpen=false;render()}
function toggleMainMenu(){if(!guardUnsavedChanges())return;state.menuOpen=!state.menuOpen;render()}
const MENU=[
  {v:'home',ic:'⌂',l:'Dashboard'},
  // Il gruppo che si apre ogni giorno. «Nuovo consuntivo» punta diritto
  // al modulo: prima passava da una scheda di scelta con tre voci, di cui
  // una era gia' una voce di menu per conto suo. Gli altri due tipi di
  // compenso stanno in fondo al modulo, a un tocco come prima.
  {main:'timesheet',ic:'◷',l:'Consuntivi',sub:[
    {v:'dailyForm',l:'Nuovo consuntivo'},
    {v:'griglia',l:'Consuntivo mensile'},
    {v:'calendario',l:'Calendario'},
    {v:'importaConsuntivi',l:'Carica da foglio'},
    {v:'tmManage',l:'Incarichi continuativi'},
    {v:'pivot',l:'Analisi consuntivi'}]},
  {main:'expenses',ic:'▦',l:'Spese',sub:[{v:'expenseForm',l:'Nuova spesa'},{v:'tripNew',l:'Nuova trasferta'}]},
  // «Per commessa» e «Report analitico WBS» non stanno piu' qui: si
  // aprono dalla commessa a cui si riferiscono, che e' il posto dove
  // uno le cerca. Il menu non e' un elenco di tutto quello che esiste.
  // Il report economico non sta piu' a menu: si apre dalla fatturazione,
  // in fondo, dove i suoi numeri hanno il contesto da cui vengono. Restava
  // una sola sottovoce, e un gruppo con un figlio solo e' un gruppo per
  // finta: Fatturazione torna a essere una voce diretta.
  {v:'billing',ic:'€',l:'Fatturazione'},
  {v:'balance',ic:'∑',l:'Bilancio'},
  {main:'tax',ic:'%',l:'Tassazione',sub:[
    {v:'tasseFuture',l:'Tasse future'},
    {v:'taxPayments',l:'Pagamenti fiscali (INPS)'},
    {v:'taxSettings',l:'Configurazione fiscale'}]},
  // Clienti, progetti e commesse sono una gerarchia sola: il progetto si
  // crea dentro il cliente e la commessa dentro il progetto. Tre voci
  // separate erano tre porte per la stessa stanza.
  {main:'settings',ic:'⚙',l:'Impostazioni',sub:[
    {v:'clients',l:'Clienti e progetti'},
    {v:'activities',l:'Attività'},
    {v:'expenseCategories',l:'Voci di costo/spesa'},
    {v:'invoiceTemplates',l:'Template fattura'},
    {v:'appearance',l:'Aspetto / Tema'},
    {v:'account',l:'Account'}]}
];
// A quale voce di menu appartiene ogni vista. Una vista che manca da
// qui fa richiudere il gruppo appena la si apre: era il caso di tutte
// le viste nuove — Commesse per prima — e sembrava che il menu si
// chiudesse da solo a ogni clic.
const NAV_CHILDREN={
  timesheet:['timesheet','calendario','giorno','griglia','pivot','reportWbs','tmManage','tmForm','importaConsuntivi','dailyForm','dailyEdit','monthlyForm','monthlyEdit','manualForm','manualEdit','annualMonths'],
  expenses:['expenses','expenseForm','expenseEdit','tripNew','tripEdit'],
  billing:['billing','billingDetail','annualInvoices','fatturatoDetail','fatturazioneCommessa','reportEconomico'],
  tax:['tax','tasseFuture','taxPayments','taxPaymentEdit','taxSettings'],
  settings:['settings','clients','clientEdit','clientDetail','engagements','engagementDetail','engagementNew','engagementEdit','projects','projectEdit','projectDetail','projectNew','wbsEdit','activities','activityEdit','expenseCategories','expenseCategoryEdit','invoiceTemplates','invoiceTemplateEdit','appearance','account','exportTimesheet']
};
function navSectionLabel(view){for(const m of MENU){const key=m.main||m.v;const kids=NAV_CHILDREN[key]||[key];if(kids.includes(view))return m.l;}return null;}
function navMenu(){const cur=navSectionLabel(state.view);return MENU.map(m=>{
  if(!m.sub)return `<button class="${cur===m.l?'active':''}" onclick="go('${m.v}')"><span>${m.ic}</span><b>${m.l}</b></button>`;
  const open=cur===m.l;
  const parent=`<button class="navParentBtn ${open?'active':''}" onclick="apriGruppo('${m.main}')"><span>${m.ic}</span><b>${m.l}</b><i class="navChev">${open?'▾':'▸'}</i></button>`;
  const subs=open?`<div class="navSubList">${m.sub.map(s=>`<button class="navSubItem ${state.view===s.v?'active':''}" onclick="${s.edit?`goNav('${s.v}','${s.edit}')`:`go('${s.v}')`}">${s.l}</button>`).join('')}</div>`:'';
  return parent+subs;
}).join('')}
function goNav(v,edit){navigateTo(v,{edit:edit||null})}
function menuDropdown(){if(!state.menuOpen)return'';return `<div class="topMenu" role="menu"><button class="topMenuClose" onclick="toggleMainMenu()" aria-label="Chiudi menu">✕</button><img class="topMenuLogo" src="${logoWordmark()}" alt="TOTIME">${navMenu()}</div>`}
function backControl(){if(!state.history.length||state.view==='home')return'';return `<button class="backArrow" onclick="back()" aria-label="Indietro" title="Indietro">‹</button>`}

function groupSummary(){
  const map={};
  rowsForMonth().forEach(e=>{const pia=isPlanned(e);if(pia&&!fatturaPianificato())return;const tm=isTM(e);const k=`${e.client_id}|${e.project_id||''}|${tm?'tm':'daily_rate_8h'}`; if(!map[k]) map[k]={client_id:e.client_id,project_id:e.project_id,type:'daily_rate_8h',label:tm?'Time & Material':'Consulenza',hours:0,amount:0,items:[]}; map[k].hours+=Number(e.hours||0); map[k].amount+=dailyAmount(e); if(pia){map[k].pHours=(map[k].pHours||0)+Number(e.hours||0);map[k].pAmount=(map[k].pAmount||0)+dailyAmount(e)} map[k].items.push(e)});
  monthlyRows().forEach(e=>{const k=`${e.client_id}|${e.project_id||''}|monthly_flat`; if(!map[k]) map[k]={client_id:e.client_id,project_id:e.project_id,type:'monthly_flat',label:'Compenso mensile',hours:null,amount:0,items:[]}; map[k].amount+=Number(e.amount||0); map[k].items.push(e)});
  manualRows().forEach(e=>{const pia=isPlanned(e);if(pia&&!fatturaPianificato())return;const k=`${e.client_id}|${e.project_id||''}|manual_entry`; if(!map[k]) map[k]={client_id:e.client_id,project_id:e.project_id,type:'manual_entry',label:'Consuntivo manuale',hours:null,amount:0,items:[]}; map[k].amount+=Number(e.amount||0); if(pia)map[k].pAmount=(map[k].pAmount||0)+Number(e.amount||0); map[k].items.push(e)});
  expenseRows().filter(expIsInvoice).forEach(e=>{const k=`${e.client_id}|${e.project_id||''}|travel_expenses`; if(!map[k]) map[k]={client_id:e.client_id,project_id:e.project_id,type:'travel_expenses',label:'Spese di trasferta',hours:null,amount:0,items:[]}; map[k].amount+=Number(e.amount||0); map[k].items.push(e)});
  // Il pie' di lista non arrivava qui, e quindi non arrivava da nessuna
  // parte nel flusso di fatturazione: soldi anticipati e dimenticati,
  // perche' non c'era una schermata che dicesse cosa chiedere.
  // Entra come riga SUA: billingCalc somma solo i tipi che conosce,
  // quindi nessun totale di fattura si muove.
  expenseRows().filter(expIsPie).forEach(e=>{const k=`${e.client_id}|${e.project_id||''}|expense_report`; if(!map[k]) map[k]={client_id:e.client_id,project_id:e.project_id,type:'expense_report',label:'Spese a pi\u00e8 di lista',hours:null,amount:0,items:[]}; map[k].amount+=Number(e.amount||0); map[k].items.push(e)});
  return Object.values(map).sort((a,b)=>`${clientName(a.client_id)}|${projectName(a.project_id)||''}|${a.type}`.localeCompare(`${clientName(b.client_id)}|${projectName(b.project_id)||''}|${b.type}`));
}
function renderTemplate(tpl,row){
  const fallback={daily_rate_8h:'Consulenza - [Mese Anno] - Cliente/Progetto: [Progetto] | Giorni: [Giorni]',monthly_flat:'Consulenza - [Mese Anno] - Cliente/Progetto: [Progetto]',manual_entry:'Prestazione professionale - [Mese Anno] - Cliente/Progetto: [Progetto]',travel_expenses:'Spese di trasferta - [Mese Anno] - Cliente/Progetto: [Progetto]'}[row.type]||'[Mese Anno] - [Progetto]';
  const text=(tpl?.template_text||fallback);
  const project=projectName(row.project_id)||clientName(row.client_id)||'';
  return text.replaceAll('[Mese Anno]',monthLabel(state.month)).replaceAll('[Progetto]',project).replaceAll('[Cliente]',clientName(row.client_id)||'').replaceAll('[Giorni]',fmtDays(row.hours)).replaceAll('[Ore]',fmtNum(row.hours||0,1)).replaceAll('[Importo]',fmtEUR(row.amount||0));
}
function fiscoText(row){return renderTemplate(invoiceTemplateByType(row.type),row)}
function headerForClient(client_id){const {year,month}=periodParts();return data.billingHeaders.find(h=>h.client_id===client_id&&Number(h.year)===year&&Number(h.month)===month)}
function headerStatus(client_id){return headerForClient(client_id)?.status||'to_invoice'}
function statusLabel(s){return ({to_invoice:'Da fatturare',invoice_issued:'Fattura emessa',collected:'Incassato',excluded:'Escluso'})[s]||'Da fatturare'}
function statusClass(s){return ({to_invoice:'orange',invoice_issued:'blue',collected:'green',excluded:'gray'})[s]||'orange'}

function currentYear(){return Number(String(state.month||ym(today)).slice(0,4))||new Date().getFullYear()}
function rowsForYear(year=currentYear()){return data.entries.filter(e=>String(e.entry_date||'').startsWith(String(year)+'-'))}
function monthlyRowsForYear(year=currentYear()){return data.monthly.filter(e=>Number(e.year)===Number(year))}
function manualRowsForYear(year=currentYear()){return data.manualEntries.filter(e=>String(e.entry_date||'').startsWith(String(year)+'-'))}
function expenseRowsForYear(year=currentYear()){return data.travelExpenses.filter(e=>String(e.expense_date||'').startsWith(String(year)+'-'))}
function monthIndexFromDate(d){return Math.max(0,Math.min(11,Number(String(d||'').slice(5,7))-1))}
function annualMonthData(year=currentYear()){
  const arr=Array.from({length:12},(_,i)=>({month:i+1,label:monthNames[i].slice(0,3),compensi:0,pianificato:0,rimborsiFattura:0,consuntivato:0,fatturato:0,fatturatoBase:0,incassato:0,costi:0,pieDiLista:0,spese:0}));
  rowsForYear(year).forEach(e=>{const amt=dailyAmount(e);const i=monthIndexFromDate(e.entry_date);if(isPlanned(e))arr[i].pianificato+=amt;else arr[i].compensi+=amt;});
  monthlyRowsForYear(year).forEach(e=>arr[Number(e.month||1)-1].compensi+=Number(e.amount||0));
  manualRowsForYear(year).forEach(e=>{const v=Number(e.amount||0);const i=monthIndexFromDate(e.entry_date);if(isPlanned(e))arr[i].pianificato+=v;else arr[i].compensi+=v;});
  expenseRowsForYear(year).forEach(e=>{const i=monthIndexFromDate(e.expense_date);const t=expType(e),v=Number(e.amount||0);arr[i].spese+=v;if(t==='invoice')arr[i].rimborsiFattura+=v;else if(t==='own')arr[i].costi+=v;else arr[i].pieDiLista+=v});
  arr.forEach(m=>m.consuntivato=m.compensi+m.rimborsiFattura);
  data.billingHeaders.filter(h=>Number(h.year)===Number(year)).forEach(h=>{const i=Number(h.month||1)-1;const inv=Number(h.invoice_total_amount||h.total_amount||0);if(['invoice_issued','collected'].includes(h.status)){arr[i].fatturato+=inv;arr[i].fatturatoBase+=Number(h.total_amount||0)}if(h.status==='collected')arr[i].incassato+=Number(h.collected_amount||inv||0)});
  return arr;
}
function annualTotals(year=currentYear()){const a=annualMonthData(year);const t=a.reduce((t,m)=>{t.compensi+=m.compensi;t.pianificato+=(m.pianificato||0);t.rimborsiFattura+=m.rimborsiFattura;t.consuntivato+=m.consuntivato;t.fatturato+=m.fatturato;t.fatturatoBase+=(m.fatturatoBase||0);t.incassato+=m.incassato;t.costi+=(m.costi||0);t.pieDiLista+=(m.pieDiLista||0);t.spese+=(m.spese||0);return t},{compensi:0,pianificato:0,rimborsiFattura:0,consuntivato:0,fatturato:0,fatturatoBase:0,incassato:0,costi:0,pieDiLista:0,spese:0,daIncassare:0});t.daIncassare=Math.max(0,t.fatturato-t.incassato);t.daFatturare=Math.max(0,t.consuntivato-t.fatturatoBase);t.margine=t.compensi-t.costi;return t}
function currentTaxSetting(year=currentYear()){return data.taxSettings.find(t=>Number(t.fiscal_year)===Number(year))||{fiscal_year:year,regime:'forfettario',ateco_code:'62.20.10',ateco_description:'Consulenza informatica',profitability_coefficient:67,substitute_tax_rate:5,inps_recharge_enabled:true,inps_recharge_rate:4,inps_gs_rate:26.07,stamp_duty_enabled:true,stamp_duty_amount:2,annual_revenue_limit:85000,activity_start_date:DEFAULT_DEFAULT_ACTIVITY_START_DATE,projection_method:'weighted_average',projection_excluded_months:[],projection_include_current_month:true,projection_prudent_factor:0.85,projection_optimistic_factor:1.10,risk_low_threshold:70,risk_medium_threshold:90,risk_high_threshold:100}}
// \u2500\u2500\u2500 I rimborsi analitici e il reddito \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Dal 1 gennaio 2025 (D.Lgs. 192/2024 sull'art. 54 TUIR, tracciabilita'
// dalla L. 207/2024) i rimborsi ANALITICI di vitto, alloggio, viaggio e
// trasporto, pagati con strumenti tracciabili e addebitati voce per
// voce al committente, non concorrono al reddito e non toccano la
// soglia degli 85.000 \u20ac. I rimborsi forfettari \u2014 e il rimborso
// chilometrico e' forfettario \u2014 restano compensi imponibili.
//
// SULL'APPLICAZIONE AL FORFETTARIO LA DOTTRINA E' DIVISA: la norma non
// richiama espressamente la L. 190/2014 e manca un chiarimento.
// Percio' questa non e' una scelta dell'app: e' un'impostazione, col
// comportamento di sempre come default, e la decide chi ha il
// commercialista.
function rimborsiFuoriReddito(){return settingValue('rimborsi_fuori_reddito')==='si'}
async function cambiaRimborsiFuoriReddito(v){
  const res=await saveSetting('rimborsi_fuori_reddito',v);
  if(res&&res.error)return setMsg('La scelta non si \u00e8 salvata: '+motivoLeggibile(res.error),7000);
  await reload();render();
  setMsg(v==='si'
    ? 'I rimborsi analitici tracciabili restano fuori dal reddito. Controlla la stima con il commercialista.'
    : 'I rimborsi tornano a contare come compensi, come prima.',6000);
}
// Il mese del cliente e' stato incassato? Solo allora il rimborso ha
// davvero attraversato il conto, e solo allora si toglie dai ricavi.
function meseIncassato(year,month,clientId){
  return (data.billingHeaders||[]).some(h=>Number(h.year)===Number(year)&&Number(h.month)===Number(month)&&h.client_id===clientId&&h.status==='collected');
}
// I rimborsi che il requisito lo reggono davvero: analitici (non
// chilometrici), pagati tracciabile, con la ricevuta, e incassati.
// L'obbligo di tracciabilita' riguarda le spese di vitto, alloggio,
// viaggio e trasporto sostenute IN ITALIA: quelle sostenute all'estero
// ne sono fuori. L'app lo diceva nel modulo ma il calcolo non lo
// applicava, e una cena a Ginevra pagata in contanti risultava senza
// requisiti quando invece li ha. Il paese lo dice la trasferta.
function spesaAllEstero(e){
  const t=e&&e.trip_id?tripById(e.trip_id):null;
  const paese=norm(t&&t.destination_country).toUpperCase();
  return !!paese&&paese!=='IT'&&paese!=='ITA';
}
function spesaFuoriReddito(e,year){
  if(!expIsInvoice(e))return false;
  if(spesaChilometrica(e))return false;             // forfettario: resta compenso
  if(e.receipt_kept!==true)return false;            // il giustificativo serve sempre
  if(!spesaAllEstero(e)&&!metodoTracciabile(e.payment_method))return false;
  const mese=Number(String(e.expense_date||'').slice(5,7));
  return meseIncassato(year,mese,e.client_id);
}
function rimborsiAnaliticiIncassati(year=currentYear()){
  return expenseRowsForYear(year).filter(e=>spesaFuoriReddito(e,year))
    .reduce((s,e)=>s+Number(e.amount||0),0);
}
// La scomposizione, da mostrare: analitici che reggono, chilometrici
// (compenso comunque), e quelli che non reggono e perche'.
function scomposizioneRimborsi(year=currentYear()){
  const righe=expenseRowsForYear(year).filter(expIsInvoice);
  let analitici=0,chilometrici=0,senzaRequisiti=0;
  righe.forEach(e=>{
    const v=Number(e.amount||0);
    if(spesaChilometrica(e))chilometrici+=v;
    else if(spesaFuoriReddito(e,year))analitici+=v;
    else senzaRequisiti+=v;
  });
  return {analitici,chilometrici,senzaRequisiti,totale:analitici+chilometrici+senzaRequisiti};
}
function annualTaxCalc(year=currentYear()){
  const ts=currentTaxSetting(year);const totalsY=annualTotals(year);
  const fuori=rimborsiFuoriReddito()?rimborsiAnaliticiIncassati(year):0;
  const revenue=Math.max(0,totalsY.incassato-fuori);const coeff=Number(ts.profitability_coefficient||0)/100;const taxRate=Number(ts.substitute_tax_rate||0)/100;
  const paidContrib=data.taxPayments.filter(p=>Number(p.fiscal_year)===Number(year)&&String(p.payment_type||'').toLowerCase().includes('inps')&&p.status==='paid').reduce((s,p)=>s+Number(p.amount||0),0);
  const forfaitIncome=revenue*coeff;const taxable=Math.max(0,forfaitIncome-paidContrib);const substituteTax=taxable*taxRate;const net=revenue-paidContrib-substituteTax;
  return {settings:ts,revenue,forfaitIncome,paidContrib,taxable,substituteTax,net,rimborsiFuori:fuori,...totalsY};
}
function billingCalc(group,header={}){
  const settings=currentTaxSetting();
  const services=group.lines.filter(l=>['daily_rate_8h','monthly_flat'].includes(l.type)).reduce((s,l)=>s+Number(l.amount||0),0);
  const manual=group.lines.filter(l=>l.type==='manual_entry').reduce((s,l)=>s+Number(l.amount||0),0);
  const expenses=group.lines.filter(l=>l.type==='travel_expenses').reduce((s,l)=>s+Number(l.amount||0),0);
  const taxableBase=services+manual+expenses;
  const inpsEnabled=header.inps_recharge_enabled ?? settings.inps_recharge_enabled ?? true;
  const inpsRate=Number(header.inps_recharge_rate ?? settings.inps_recharge_rate ?? 4);
  const inpsAmount=inpsEnabled?taxableBase*inpsRate/100:0;
  const stampEnabled=header.stamp_duty_enabled ?? settings.stamp_duty_enabled ?? false;
  const stampAmount=stampEnabled?Number(header.stamp_duty_amount ?? settings.stamp_duty_amount ?? 2):0;
  const subtotal=services+manual+expenses;
  const total=subtotal+inpsAmount+stampAmount;
  return {services,manual,expenses,taxableBase,inpsEnabled,inpsRate,inpsAmount,stampEnabled,stampAmount,subtotal,total};
}
function invoiceTemplateByCode(code){return data.invoiceTemplates.find(t=>t.active&&t.template_code===code)}

async function init(){
  if(/[?&]reset=done/.test(location.search)){state.message='Password aggiornata. Accedi con la nuova password.';history.replaceState(null,'',location.pathname)}
  const isRecoveryLink=/type=recovery/.test(location.hash)||/type=recovery/.test(location.search);
  if(isRecoveryLink){state.view='resetPassword';history.replaceState(null,'',location.pathname+location.search)}
  const res=await sb.auth.getSession(); session=res.data.session;
  if(session && !isRecoveryLink) await fetchAll();
  state.loading=false; render();
  sb.auth.onAuthStateChange(async(_event,newSession)=>{
    const wasLoggedIn=!!session;
    session=newSession;
    if(_event==='PASSWORD_RECOVERY'){state.view='resetPassword';state.message='';render();return}
    if(!session){data={clients:[],projects:[],activities:[],entries:[],monthly:[],billingHeaders:[],profiles:[],expenseCategories:[],travelExpenses:[],manualEntries:[],invoiceTemplates:[],appSettings:[],taxSettings:[],taxPayments:[]};state.view='login';render();return}
    if(_event==='SIGNED_IN'&&!wasLoggedIn){await fetchAll();state.view='home';state.message='';render()}
  });
}
async function fetchAll(){
  state.loading=true; render();
  try{
    state.missingTables=new Set();
    const loaded=await loadAppData({
      repository,
      ensureUserProfile:ensureUserProfileFromMetadata,
      tableError:(table,error,info)=>{
        console.error(table,error);
        // Una tabella della migrazione commesse/WBS non ancora
        // applicata non e' un errore per chi usa l'app: resta nel
        // registro tecnico e basta.
        if(info&&info.optional){
          (state.missingTables=state.missingTables||new Set()).add(table);
          return;
        }
        setMsg(`Errore caricamento ${table}: ${error.message}`,7000);
      }
    });
    data=loaded.data;
    loadThemeFromSettings();
    state.dirty=false;
  }catch(error){
    console.error('fetchAll',error);
    setMsg(`Errore caricamento dati: ${error.message||error}`,7000);
  }finally{
    state.loading=false;
  }
}
async function reload(){await fetchAll();render()}
async function ensureUserProfileFromMetadata(){
  if(!session?.user)return;
  try{
    const {data:existing,error:selectError}=await sb.from('user_profiles').select('*').eq('user_id',session.user.id).maybeSingle();
    if(selectError){console.warn('user_profiles select',selectError);return;} if(existing)return;
    const m=session.user.user_metadata||{};
    const payload={first_name:m.first_name||'',last_name:m.last_name||'',company_name:m.company_name||'',vat_number:m.vat_number||'',email:session.user.email||m.email||''};
    const {error}=await insertResilient('user_profiles',payload); if(error)console.warn('user_profiles insert',error);
  }catch(e){console.warn('ensureUserProfileFromMetadata',e)}
}

function appShell(content){return `<div class="shell"><aside class="sidebar"><div class="sidebarBrand"><img class="sidebarLogo" src="${logoWordmark()}" alt="TOTIME" onclick="go('home')" role="button" title="Torna alla Home"></div><nav class="sidebarNav">${navMenu()}</nav><div class="sidebarFoot"><div class="version">${APP_VERSION} · Database Edition · © ${new Date().getFullYear()} johnbruk</div></div></aside><div class="shellMain"><div class="topbar"><div class="headerMenuWrap"><button class="headerIcon" onclick="toggleMainMenu()" title="Apri menu" aria-label="Apri menu">☰</button>${menuDropdown()}</div><img class="topbarLogo" src="${logoIcon()}" alt="TOTIME" onclick="go('home')" role="button" title="Torna alla Home"><button class="headerIcon" onclick="go('settings')" title="Configurazione">⚙</button></div><div class="app">${state.message?`<div class="toast">${esc(state.message)}</div>`:''}${backControl()}${content}<div class="version mobileVersion">${APP_VERSION} · Database Edition · © ${new Date().getFullYear()} johnbruk</div></div></div></div>`}
function monthSelector(){const cur=ym(today);const rel=state.month<cur?'passato':state.month>cur?'futuro':'';return `<div class="month"><button onclick="changeMonth(-1)" title="Mese precedente" aria-label="Mese precedente">‹</button><strong>${monthLabel(state.month)}${rel?` <span class="monthRel ${rel}">${rel}</span>`:''}</strong><button onclick="changeMonth(1)" title="Mese successivo" aria-label="Mese successivo">›</button></div>${state.month!==cur?`<div class="todayLink"><button type="button" onclick="goToday()">Vai a oggi</button></div>`:''}`}
function goToday(){state.month=ym(today);render()}
function loadingView(){return `<div class="authScreen"><div class="authBox"><img class="authLogo" src="${logoWordmark()}" alt="TOTIME"><h1>Caricamento...</h1><p class="sub">Un attimo, stiamo preparando i tuoi dati.</p></div></div>`}
function switchAuthView(v){state.view=v;state.message='';render()}
function loginView(){return `<div class="authScreen"><div class="authBox"><img class="authLogo" src="${logoWordmark()}" alt="TOTIME"><h1>Accedi al tuo profilo</h1>${state.message?`<p class="small">${esc(state.message)}</p>`:''}<div class="card authCard"><form class="form" onsubmit="signIn(event)"><div class="field"><label>Email</label><input name="email" type="email" placeholder="Inserisci il tuo indirizzo email" autocomplete="email" required></div><div class="field"><label>Password</label><input name="password" type="password" placeholder="Inserisci la tua password" autocomplete="current-password" required></div><a href="#" class="small forgotLink" onclick="event.preventDefault();switchAuthView('forgotPassword')">Password dimenticata?</a><button class="primary">Accedi</button></form></div><p class="sub authSwitch">Non hai un account? <a href="#" onclick="event.preventDefault();switchAuthView('register')">Registrati</a></p></div></div>`}
function forgotPasswordView(){return `<div class="authScreen"><div class="authBox"><img class="authLogo" src="${logoWordmark()}" alt="TOTIME"><h1>Recupera password</h1><p class="sub">Inserisci l'email del tuo account: ti mandiamo un link per reimpostare la password.</p>${state.message?`<p class="small">${esc(state.message)}</p>`:''}<div class="card authCard"><form class="form" onsubmit="requestPasswordReset(event)"><div class="field"><label>Email</label><input name="email" type="email" placeholder="Inserisci il tuo indirizzo email" autocomplete="email" required></div><button class="primary">Invia link di reset</button></form></div><p class="sub authSwitch">Ricordi la password? <a href="#" onclick="event.preventDefault();switchAuthView('login')">Torna al login</a></p></div></div>`}
function resetPasswordView(){return `<div class="authScreen"><div class="authBox"><img class="authLogo" src="${logoWordmark()}" alt="TOTIME"><h1>Imposta nuova password</h1><p class="sub">Scegli una nuova password per il tuo account TOTIME.</p>${state.message?`<p class="small">${esc(state.message)}</p>`:''}<div class="card authCard"><form class="form" onsubmit="updatePassword(event)"><div class="field"><label>Nuova password</label><input name="password" type="password" placeholder="Almeno 6 caratteri" minlength="6" autocomplete="new-password" required></div><button class="primary">Salva nuova password</button></form></div></div></div>`}
async function requestPasswordReset(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));state.message='Invio link in corso...';render();const {error}=await sb.auth.resetPasswordForEmail(f.email,{redirectTo:new URL('reset.html',location.href).href});if(error)return setMsg(error.message,7000);state.message="Se l'indirizzo esiste riceverai un'email con il link per reimpostare la password. Controlla anche lo spam.";render()}
async function updatePassword(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));state.message='Salvataggio...';render();const {error}=await sb.auth.updateUser({password:f.password});if(error)return setMsg(error.message,7000);await sb.auth.signOut();state.view='login';state.message='Password aggiornata. Accedi con la nuova password.';render()}
function registerView(){return `<div class="authScreen"><div class="authBox"><img class="authLogo" src="${logoWordmark()}" alt="TOTIME"><h1>Crea account TOTIME</h1><p class="sub">Inserisci i dati del tuo profilo per collegare configurazioni, consuntivi e fatturazione al tuo account.</p>${state.message?`<p class="small">${esc(state.message)}</p>`:''}<div class="card authCard"><form class="form" onsubmit="signUpDetailed(event)"><div class="field"><label>Nome</label><input name="first_name" autocomplete="given-name" required></div><div class="field"><label>Cognome</label><input name="last_name" autocomplete="family-name" required></div><div class="field"><label>Azienda / Ragione sociale</label><input name="company_name" autocomplete="organization" required></div><div class="field"><label>P.IVA</label><input name="vat_number" inputmode="numeric" autocomplete="off" required></div><div class="field"><label>Email</label><input name="email" type="email" placeholder="Inserisci il tuo indirizzo email" autocomplete="email" required></div><div class="field"><label>Password</label><input name="password" type="password" placeholder="Inserisci la tua password" autocomplete="new-password" minlength="6" required></div><button class="primary">Crea account</button></form></div><p class="sub authSwitch">Hai gia' un account? <a href="#" onclick="event.preventDefault();switchAuthView('login')">Torna al login</a></p></div></div>`}
async function signIn(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));state.message='Accesso in corso...';render();const {error}=await sb.auth.signInWithPassword({email:f.email,password:f.password});if(error) setMsg(error.message,7000)}
async function signUpDetailed(ev){
  ev.preventDefault(); const f=Object.fromEntries(new FormData(ev.target)); state.message='Creazione account in corso...'; render();
  const {data:signData,error}=await sb.auth.signUp({email:f.email,password:f.password,options:{data:{first_name:f.first_name,last_name:f.last_name,company_name:f.company_name,vat_number:f.vat_number,email:f.email}}});
  if(error)return setMsg(error.message,7000);
  if(signData?.user && Array.isArray(signData.user.identities) && signData.user.identities.length===0){
    return setMsg('Questo indirizzo email risulta gia\' registrato. Prova ad accedere oppure usa "Password dimenticata?".',9000);
  }
  const userId=signData?.user?.id;
  if(userId){
    const {error:profileError}=await insertResilient('user_profiles',{user_id:userId,first_name:f.first_name,last_name:f.last_name,company_name:f.company_name,vat_number:f.vat_number,email:f.email});
    if(profileError && !String(profileError.message||'').includes('duplicate')) console.warn(profileError);
  }
  await sb.auth.signOut(); session=null; state.view='login';
  state.message=signData?.session?'Registrazione completata. Accedi con le credenziali scelte.':"Registrazione completata. Controlla la tua email (anche lo spam) e clicca il link di conferma prima di accedere.";
  render();
}
async function logout(){await sb.auth.signOut()}

function monthSeries(){const {year,month}=periodParts();const last=new Date(year,month,0).getDate();const daily=Array(last).fill(0);rowsForMonth().forEach(e=>{if(isPlanned(e))return;const d=Number(String(e.entry_date).slice(8,10));if(d>=1&&d<=last)daily[d-1]+=dailyAmount(e)});manualRows().forEach(e=>{if(isPlanned(e))return;const d=Number(String(e.entry_date).slice(8,10));if(d>=1&&d<=last)daily[d-1]+=Number(e.amount||0)});expenseRows().forEach(e=>{const d=Number(String(e.expense_date).slice(8,10));if(d>=1&&d<=last)daily[d-1]+=Number(e.amount||0)});let cum=0;return daily.map(v=>cum+=v)}
// L'asse dei grafici finiva su numeri arbitrari («1,7k €», «870 €») e a
// mese vuoto ripeteva due volte «1 €». Qui il massimo sale al primo
// numero tondo utile, con passi fitti per non sprecare altezza.
function niceMax(v){v=Number(v)||0;if(v<=0)return 1;
  const e=Math.pow(10,Math.floor(Math.log10(v)));const n=v/e;
  const p=[1,1.5,2,2.5,3,4,5,6,8,10];
  return (p.find(x=>n<=x+1e-9)||10)*e}
// Le migliaia con un decimale solo quando serve davvero: la tacca a
// 12.500 non deve leggersi «13k».
function fmtAxis(n){n=Number(n)||0;const a=Math.abs(n);
  if(a>=1000){const v=n/1000;return (Number.isInteger(v)?String(v):v.toFixed(1)).replace('.',',')+'k €'}
  return Math.round(n)+' €'}
function axisY(max){const alto=fmtAxis(max),mezzo=fmtAxis(max/2);
  return '<div class="lineChartY"><span>'+alto+'</span><span>'+(mezzo===alto?'':mezzo)+'</span><span>0</span></div>'}
function fmtK(n){n=Number(n)||0;const a=Math.abs(n);if(a>=1000)return (n/1000).toFixed(a>=10000?0:1).replace('.',',')+'k €';return Math.round(n)+' €'}
function homeMultiChart(){
  const year=currentYear();const md=annualMonthData(year);const net=netMarginByMonth(year);
  const now=new Date();const actualEnd=year<now.getFullYear()?11:(year===now.getFullYear()?now.getMonth():-1);
  if(actualEnd<0)return '';
  const ts=currentTaxSetting(year);const coeff=Number(ts.profitability_coefficient||0)/100;const gsRate=Number(ts.inps_gs_rate??26.07)/100;const taxRate=Number(ts.substitute_tax_rate||0)/100;
  const per=md.map(m=>{const forfait=m.compensi*coeff;const inps=forfait*gsRate;const imposta=Math.max(0,forfait-inps)*taxRate;const tasse=inps+imposta;const spese=(m.costi||0)+(m.rimborsiFattura||0);const netto=m.consuntivato-tasse-spese;return {netto,tasse,spese,cons:m.consuntivato};});
  const cum=sel=>{let s=0;return per.map(p=>s+=sel(p));};
  const cNet=cum(p=>p.netto),cTax=cum(p=>p.tasse),cExp=cum(p=>p.spese),cCons=cum(p=>p.cons);
  const max=niceMax(Math.max(...cCons.slice(0,actualEnd+1)));
  const X=i=>(i/11*100).toFixed(1);const Y=v=>(52-(Math.max(0,v)/max)*46).toFixed(1);
  const upTax=cNet.map((v,i)=>v+cTax[i]);const zeros=cNet.map(()=>0);
  const area=(lower,upper,color)=>{const top=[];const bot=[];for(let i=0;i<=actualEnd;i++)top.push(`${X(i)},${Y(upper[i])}`);for(let i=actualEnd;i>=0;i--)bot.push(`${X(i)},${Y(lower[i])}`);return `<polygon points="${top.concat(bot).join(' ')}" style="fill:${color};stroke:none"></polygon>`;};
  const bands=area(zeros,cNet,'#3FB27F')+area(cNet,upTax,'#F7A647')+area(upTax,cCons,'#94A2BE');
  const legend=`<div class="segLegend"><span class="li"><span class="sdot" style="background:transparent;border:1.5px solid var(--muted)"></span>Consuntivato · ${fmtEUR(cCons[actualEnd])}</span><span class="li"><span class="sdot" style="background:#3FB27F"></span>Netto · ${fmtEUR(cNet[actualEnd])}</span><span class="li"><span class="sdot" style="background:#F7A647"></span>Tasse · ${fmtEUR(cTax[actualEnd])}</span><span class="li"><span class="sdot" style="background:#94A2BE"></span>Spese · ${fmtEUR(cExp[actualEnd])}</span></div>`;
  return `<div class="card"><b>Composizione del consuntivato ${year}</b><div class="desc" style="margin-top:2px">Il consuntivato cumulato ripartito in netto (dopo spese e tasse) + tasse + spese</div><div class="lineChartWrap" style="margin-top:14px">${axisY(max)}<div class="lineChartCol"><svg class="lineChart" viewBox="0 0 100 58" preserveAspectRatio="none"><line x1="0" y1="6" x2="100" y2="6"></line><line x1="0" y1="52" x2="100" y2="52"></line>${bands}</svg></div></div><div class="chartMonths" style="padding-left:58px">${monthNames.map((m,i)=>`<span class="${i>actualEnd?'future':''}">${m.slice(0,3)}</span>`).join('')}</div>${legend}</div>`;
}
function annualChartSvg(){
  const year=currentYear();const md=annualMonthData(year);
  const now=new Date();const actualEnd=year<now.getFullYear()?11:(year===now.getFullYear()?now.getMonth():-1);
  // Mese per mese, non cumulato: il cumulato disegnava sempre una salita,
  // qualunque cosa fosse successo dentro l'anno.
  const cons=md.map(m=>Number(m.consuntivato||0));
  const plan=md.map(m=>Number(m.pianificato||0));
  const totCons=cons.reduce((a,b)=>a+b,0);const totPlan=plan.reduce((a,b)=>a+b,0);
  const hasPlan=totPlan>0.005;
  const max=niceMax(Math.max(...cons,...plan));
  const X=i=>(i/11*100).toFixed(2);const Y=v=>(52-(Math.max(0,v)/max)*46).toFixed(2);
  const pts=(arr,da,a)=>{const o=[];for(let i=da;i<=a;i++)o.push(X(i)+','+Y(arr[i]));return o.join(' ')};
  const consPts=actualEnd>=0?pts(cons,0,actualEnd):'';
  // La riga del pianificato parte dal primo mese in cui c'è davvero
  // qualcosa e finisce sull'ultimo: prima strisciava sullo zero da
  // gennaio, disegnando mesi vuoti come se fossero un dato.
  const p0=plan.findIndex(v=>v>0.005);
  let p1=-1;for(let i=11;i>=0;i--)if(plan[i]>0.005){p1=i;break}
  const planPts=(hasPlan&&p0>=0&&p1>p0)?pts(plan,p0,p1):'';
  const dot=(i,v,cls)=>'<i class="'+cls+'" style="left:'+X(i)+'%;top:'+(Number(Y(v))/58*100).toFixed(2)+'%"></i>';
  let dots='';
  for(let i=0;i<=actualEnd;i++)if(cons[i]>0)dots+=dot(i,cons[i],'dC');
  if(hasPlan)for(let i=0;i<12;i++)if(plan[i]>0)dots+=dot(i,plan[i],'dP');
  const hit=monthNames.map((m,i)=>'<span><span class="tip"><b>'+m+' '+year+'</b>'
    +'<span class="tl"><i class="dC"></i>Consuntivato '+fmtEUR(cons[i])+'</span>'
    +(hasPlan?'<span class="tl"><i class="dP"></i>Pianificato '+fmtEUR(plan[i])+'</span>':'')
    +'</span></span>').join('');
  const legend='<div class="segLegend" style="margin-top:10px"><span class="li"><span class="sdot" style="background:var(--cCons)"></span>Consuntivato · '+fmtEUR(totCons)+'</span>'
    +(hasPlan?'<span class="li"><span class="sdot" style="background:var(--cPlan)"></span>Pianificato · '+fmtEUR(totPlan)+'</span>':'')+'</div>';
  return '<div class="annualChartBox"><div class="lineChartWrap">'+axisY(max)+''
    +'<div class="lineChartCol chPlot"><svg class="lineChart" viewBox="0 0 100 58" preserveAspectRatio="none">'
    +'<line x1="0" y1="6" x2="100" y2="6"></line><line x1="0" y1="29" x2="100" y2="29"></line><line x1="0" y1="52" x2="100" y2="52"></line>'
    +(planPts?'<polyline class="pPlan" points="'+planPts+'" vector-effect="non-scaling-stroke"></polyline>':'')
    +(consPts?'<polyline class="pCons" points="'+consPts+'" vector-effect="non-scaling-stroke"></polyline>':'')
    +'</svg><div class="chDots">'+dots+'</div><div class="chHit">'+hit+'</div></div></div>'
    +'<div class="chartMonths" style="padding-left:58px">'+monthNames.map((m,i)=>'<span class="'+(i>actualEnd&&!(hasPlan&&plan[i]>0)?'future':'')+'">'+m.slice(0,3)+'</span>').join('')+'</div>'+legend+'</div>';
}
function monthChartSvg(){const series=monthSeries();const max=niceMax(Math.max(...series));const pts=series.map((v,i)=>`${(i/(series.length-1||1))*100},${52-(v/max)*46}`).join(' ');return `<div class="lineChartWrap">${axisY(max)}<div class="lineChartCol"><svg class="lineChart" viewBox="0 0 100 58" preserveAspectRatio="none"><line x1="0" y1="52" x2="100" y2="52"></line><line x1="0" y1="30" x2="100" y2="30"></line><polyline points="${pts}"></polyline></svg></div></div>`}
function homeIncassiCard(){const yr=currentYear();const cur=annualTotals(yr);const daIncassare=Math.max(0,cur.fatturato-cur.incassato);return `<div class="card cardLink" onclick="openAnnualInvoices('collected')" role="button" title="Elenco incassi ${yr}"><b>I tuoi incassi ${yr} <span class="cardLinkArrow">›</span></b><div class="statRow"><div class="stat tint-sage"><div class="statHead"><span class="statDot"></span><span class="statLbl">Incassato</span></div><strong>${fmtEUR(cur.incassato)}</strong></div><div class="stat tint-pink"><div class="statHead"><span class="statDot"></span><span class="statLbl">Da incassare</span></div><strong>${fmtEUR(daIncassare)}</strong></div></div></div>`}
function forfettarioBarCard(){const yr=currentYear();const ts=currentTaxSetting(yr);const limit=Number(ts.annual_revenue_limit||85000);const incassato=annualTotals(yr).incassato;const pct=limit?Math.min(100,(incassato/limit)*100):0;const remaining=Math.max(0,limit-incassato);const over=incassato>limit;const color=over?'#D9534F':pct>=90?'#D9534F':pct>=70?'#E0A24E':'var(--primary)';return `<div class="card"><div class="threshVals"><strong>${fmtEUR(incassato)}</strong> <span class="threshLimit">/ ${fmtEUR(limit)}</span></div><div class="threshBar"><span style="width:${pct.toFixed(1)}%;background:${color}"></span></div><div class="threshNote">${over?`Hai superato il limite del regime forfettario di <b>${fmtEUR(incassato-limit)}</b>.`:`Puoi incassare ancora <b>${fmtEUR(remaining)}</b> quest'anno per non superare il limite del regime forfettario.`}</div></div>`}
function homeFatturatoCard(){const yr=currentYear();const cur=annualTotals(yr);const daFatturare=cur.daFatturare;return `<div class="card cardLink" onclick="go('fatturatoDetail')" role="button" title="Come si calcolano fatturato e da fatturare"><b>Il tuo fatturato ${yr} <span class="cardLinkArrow">›</span></b><div class="statRow"><div class="stat tint-blue"><div class="statHead"><span class="statDot"></span><span class="statLbl">Fatturato</span></div><strong>${fmtEUR(cur.fatturato)}</strong></div><div class="stat tint-orange"><div class="statHead"><span class="statDot"></span><span class="statLbl">Da fatturare</span></div><strong>${fmtEUR(daFatturare)}</strong></div></div><div class="small" style="margin-top:10px">Imponibile fatturato ${fmtEUR(cur.fatturatoBase)}</div></div>`}
function fatturatoDetail(){const year=currentYear();const at=annualTotals(year);const md=annualMonthData(year);const rows=md.map((m,i)=>({i,cons:m.consuntivato,base:m.fatturatoBase,diff:m.consuntivato-m.fatturatoBase})).filter(r=>r.cons||r.base);return appShell(`<h1>Da fatturare ${year}</h1><p class="sub">Come si ottiene il totale "da fatturare".</p><div class="card"><b>Calcolo ${year}</b><div class="list" style="box-shadow:none;margin:12px 0 0"><div class="row"><div></div><div><div class="title">Consuntivato anno</div><div class="desc">tutto il lavoro registrato (compensi + rimborsi in fattura)</div></div><div class="value">${fmtEUR(at.consuntivato)}</div></div><div class="row"><div></div><div><div class="title" style="color:var(--red)">− Base imponibile fatturata</div><div class="desc">imponibili delle fatture emesse/incassate, senza rivalsa INPS e bollo</div></div><div class="value" style="color:var(--red)">${fmtEUR(at.fatturatoBase)}</div></div><div class="row"><div></div><div><div class="title"><b>= Da fatturare</b></div><div class="desc">lavoro consuntivato non ancora messo in fattura</div></div><div class="value"><b>${fmtEUR(at.daFatturare)}</b></div></div></div><div class="metricLine" style="margin-top:8px">Fatturato lordo ${fmtEUR(at.fatturato)} · include rivalsa INPS 4% e bollo</div></div><div class="card"><b>Dettaglio mensile ${year}</b><div class="desc" style="margin-top:2px">Per ogni mese: consuntivato, base già fatturata e residuo da fatturare. Tocca un mese per il timesheet.</div><div class="list" style="box-shadow:none;margin:10px 0 0">${rows.map(r=>`<div class="row" onclick="openMonthTimesheet(${year},${r.i+1})"><div class="date">${monthNames[r.i].slice(0,3)}</div><div><div class="title">${monthNames[r.i]}</div><div class="desc">Consuntivato ${fmtEUR(r.cons)} · Fatturato base ${fmtEUR(r.base)}</div></div><div class="value" style="${r.diff>0.005?'color:var(--orange)':''}">${fmtEUR(Math.max(0,r.diff))}</div></div>`).join('')||'<div class="empty">Nessun dato nel '+year+'.</div>'}</div></div><button type="button" class="secondary" onclick="openAnnualInvoices('issued')">Vedi fatture emesse ›</button>`)}
function openAnnualMonths(){navigateTo('annualMonths')}
function openAnnualInvoices(mode){navigateTo('annualInvoices',{edit:mode})}
function openMonthTimesheet(year,month){state.month=`${year}-${String(month).padStart(2,'0')}`;navigateTo('timesheet')}
function openInvoiceDetail(clientId,year,month){state.month=`${year}-${String(month).padStart(2,'0')}`;navigateTo('billingDetail',{edit:clientId})}
function annualMonths(){const year=currentYear();const md=annualMonthData(year);const tot=annualTotals(year);return appShell(`<h1>Consuntivato ${year}</h1><p class="sub">Dettaglio mese per mese. Tocca un mese per aprire il relativo timesheet.</p><div class="card"><b>Totale anno ${year}</b><div class="kpiGrid" style="margin-top:14px"><div><span>Consuntivato</span><strong>${fmtEUR(tot.consuntivato)}</strong></div><div><span>Fatturato</span><strong>${fmtEUR(tot.fatturato)}</strong></div><div><span>Incassato</span><strong>${fmtEUR(tot.incassato)}</strong></div><div><span>Speso</span><strong>${fmtEUR(tot.spese)}</strong></div></div>${tot.pianificato>0?`<div class="metricLine" style="margin-top:12px"><span class="tag blue">Pianificato</span> ${fmtEUR(tot.pianificato)} · giorni futuri (non nel consuntivato)</div>`:''}</div><div class="list">${md.map(m=>`<div class="row" onclick="openMonthTimesheet(${year},${m.month})"><div class="date">${m.label}</div><div><div class="title">${monthNames[m.month-1]} ${year}</div><div class="desc">Consuntivato ${fmtEUR(m.consuntivato)} · Fatturato ${fmtEUR(m.fatturato)}<br>Incassato ${fmtEUR(m.incassato)} · Speso ${fmtEUR(m.spese)}${m.pianificato>0?' · Pianificato '+fmtEUR(m.pianificato):''}</div></div><div class="value">${fmtEUR(m.consuntivato)}</div></div>`).join('')}</div>`)}
// Un elenco di fatture si legge per numero. Prima il numero stava in
// mezzo a una riga di testo — «Fattura Fattura #4/2026 · Fattura emessa
// · 26/06» — insieme allo stato e alla data, mentre nella colonna di
// sinistra c'era il mese di competenza: tre date e un numero mescolati,
// e il prefisso «Fattura» scritto nel codice che si sommava a quello
// gia' digitato nel numero.
// Adesso sono colonne: numero, mese di competenza, data della fattura,
// cliente e stato, importo. Su schermo stretto si impilano, ma il
// numero resta il primo e resta grande.
function numeroFattura(h){
  const n=String(h&&h.invoice_number||'').trim();
  if(!n)return '';
  // chi scrive «Fattura 5» nel campo numero non deve leggere
  // «Fattura Fattura 5»: il prefisso lo toglie l'app, non la persona
  return n.replace(/^fatt(ura)?\.?\s*/i,'')||n;
}
function intestazioneFatture(){
  return `<div class="fatTestata" aria-hidden="true">
    <span>Numero</span><span>Mese</span><span>Data</span><span>Cliente</span><span>Importo</span></div>`;
}
function rigaFattura(h,importo){
  const n=numeroFattura(h);
  return `<div class="row rowFattura" onclick="openInvoiceDetail('${h.client_id}',${h.year},${h.month})">
    <div class="fatNum">${n?esc(n):'<span class="fatVuoto">senza numero</span>'}</div>
    <div class="fatMese"><span class="fatEtic">Mese</span>${String(h.month).padStart(2,'0')}/${h.year}</div>
    <div class="fatData"><span class="fatEtic">Data</span>${h.invoice_date?dateIT(h.invoice_date)+'/'+String(h.invoice_date).slice(0,4):'<span class="fatVuoto">—</span>'}</div>
    <div class="fatCli"><div class="title">${esc(clientName(h.client_id))}</div>
      <div class="desc"><span class="tag ${statusClass(h.status)}">${statusLabel(h.status)}</span></div></div>
    <div class="value">${fmtEUR(importo)}</div></div>`;
}
function annualInvoices(modeArg){const year=currentYear();const mode=modeArg||(state.edit==='collected'?'collected':'issued');let rows=data.billingHeaders.filter(h=>Number(h.year)===Number(year)&&['invoice_issued','collected'].includes(h.status));if(mode==='collected')rows=rows.filter(h=>h.status==='collected');rows=rows.sort((a,b)=>(Number(b.month)-Number(a.month))||clientName(a.client_id).localeCompare(clientName(b.client_id)));const title=mode==='collected'?`Incassi ${year}`:`Fatture emesse ${year}`;const amountOf=h=>mode==='collected'?Number(h.collected_amount||h.invoice_total_amount||h.total_amount||0):Number(h.invoice_total_amount||h.total_amount||0);const total=rows.reduce((s,h)=>s+amountOf(h),0);return appShell(`<h1>${title}</h1><p class="sub">Tocca una voce per aprire il dettaglio della fattura.</p><div class="card"><b>Totale ${mode==='collected'?'incassato':'fatturato'} ${year}</b><div class="amount" style="margin-top:8px">${fmtEUR(total)}</div></div>${rows.length?intestazioneFatture():''}<div class="list">${rows.map(h=>rigaFattura(h,amountOf(h))).join('')||`<div class="empty">${mode==='collected'?'Nessun incasso registrato':'Nessuna fattura emessa'} nel ${year}.</div>`}</div>`)}
function home(){const t=totals();const y=annualTotals(currentYear());return appShell(`<h1 class="srOnly">Dashboard</h1><button class="primary cta" onclick="newEntryChoice()">+ Nuovo consuntivo</button><div class="homeTop">${monthSelector()}</div><div class="card cardLink" onclick="go('timesheet')" role="button" title="Apri il timesheet di ${monthLabel(state.month)}"><b>Consuntivo mese <span class="cardLinkArrow">›</span></b><div class="kpiGrid three" style="margin-top:14px"><div><span>Consuntivate</span><strong>${fmtNum(t.days,2)} gg</strong><small>${fmtNum(t.hours,1)} h</small></div><div><span>Pianificate</span><strong>${fmtNum(t.plannedDays,2)} gg</strong><small>${fmtNum(t.plannedHours,1)} h</small></div><div><span>Totale</span><strong>${fmtNum(t.days+t.plannedDays,2)} gg</strong><small>${fmtNum(t.hours+t.plannedHours,1)} h</small></div></div><div class="metricLine" style="margin-top:12px">${fmtEUR(t.amount)} consuntivato${t.plannedAmount>0?` <span class="dot">·</span> ${fmtEUR(t.plannedAmount)} pianificato <span class="dot">·</span> <b>${fmtEUR(t.amount+t.plannedAmount)}</b> totale`:''}</div></div><div class="dashboardCard heroCard cardLink" onclick="openAnnualMonths()" role="button" title="Dettaglio consuntivato mese per mese"><b>Consuntivato anno ${currentYear()} <span class="cardLinkArrow">›</span></b><div class="kpiGrid" style="${y.pianificato>0?'':'grid-template-columns:1fr;'}margin-top:14px"><div style="${y.pianificato>0?'':'border-right:0'}"><span>Anno in corso</span><strong>${fmtEUR(y.consuntivato)}</strong><small>consuntivato</small></div>${y.pianificato>0?`<div style="border-right:0"><span>Pianificato</span><strong>${fmtEUR(y.pianificato)}</strong><small>giorni futuri</small></div>`:''}</div><div class="chartWrap"><div class="chartTitle"><span>Andamento mese per mese</span><span>consuntivato · pianificato</span></div>${annualChartSvg()}</div></div>${homeFatturatoCard()}${homeIncassiCard()}${dashFull()?homeBalanceCharts()+homeMultiChart():''}<button type="button" class="secondary dashToggle" onclick="toggleDashFull()">${dashFull()?'▴ Nascondi analisi e grafici':'▾ Mostra analisi e grafici'}</button>`)}
function dashFull(){return settingValue('dash_full')==='1'}
async function toggleDashFull(){const r=await saveSetting('dash_full',dashFull()?'0':'1');if(r.error)return setMsg(r.error.message,7000);await reload();render()}
function newEntryChoice(){navigateTo('dailyForm')}
function openGriglia(){const v=state.editType;if(typeof v==='string'&&v.length===10&&v.charAt(4)==='-')state.month=v.slice(0,7);navigateTo('griglia')}
// Il lavoro si fa da remoto quasi sempre: "Remoto" e' il valore di
// partenza, e la trasferta la si segna quando capita. Passando una
// sede esplicita — anche vuota, in modifica — comanda quella.
const SEDE_DEFAULT='Remoto';
function sediOptions(selected=SEDE_DEFAULT){const sedi=['Remoto','Casa','Ufficio','Sede cliente','Onsite cliente','Altro'];return `<option></option>${sedi.map(x=>`<option value="${esc(x)}" ${x===selected?'selected':''}>${esc(x)}</option>`).join('')}`}
function projectOptions(clientId,selected=''){return `<option value=""></option>${sortEntities('projects',data.projects.filter(p=>p.active&&p.client_id===clientId)).map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('')}`}
function activityOptions(selected=''){return `<option value=""></option>${sortEntities('activities',data.activities.filter(a=>a.active)).map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.name)}</option>`).join('')}`}
function expenseOptions(selected=''){return `<option value=""></option>${sortEntities('expenseCategories',data.expenseCategories.filter(x=>x.active)).map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${esc(x.name)}</option>`).join('')}`}
// I campi di quando la gerarchia non c'e': cliente/progetto piatto e
// attivita' sciolta. Estratti perche' vanno rimessi al volo quando si
// cambia cliente, non solo al primo disegno del modulo.
function campiSenzaGerarchia(clientId,prjSel='',attSel=''){
  return `<div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(clientId,prjSel)}</select></div>`+
    `<div class="field"><label>Attività</label><select name="activity_id">${activityOptions(attSel)}</select></div>`;
}
// Cambiando cliente puo' cambiare anche QUALE modulo serve: un cliente
// con commesse vuole la gerarchia, uno senza no. Prima si aggiornavano
// solo i campi gia' disegnati, quindi passando da un cliente senza
// gerarchia a uno che ce l'ha i menu non comparivano mai.
function refreshProjectsForForm(form){
  const cli=form.client_id.value;
  const blocco=document.getElementById('hierBlock');
  if(blocco){
    blocco.innerHTML=hierAvailable(cli)
      ? hierFields(cli,'')+'<input type="hidden" name="project_id" value="">'
      : campiSenzaGerarchia(cli);
    if(form.hier_project_id)hierChanged(form,'client');
    return;
  }
  const project=form.project_id;
  if(project)project.innerHTML=projectOptions(cli,'');
  refreshHierForForm(form);
}
// Salvare un'impostazione due volte di fila non deve rompersi.
//
// Qui si decideva fra insert e update guardando SOLO la copia in
// memoria. Chi salva senza ricaricare — il flag del pianificato, i
// gruppi chiusi del timesheet — scriveva la riga nel database e
// lasciava la copia in memoria senza: alla scrittura dopo la riga non
// si trovava, si tentava un secondo insert, e il database rispondeva
//
//   duplicate key value violates unique constraint
//   "app_settings_user_id_setting_key_key"
//
// cioe' la scelta non si salvava mai piu'. Il flag restava inchiodato
// sul valore scritto la prima volta.
//
// Adesso: la copia in memoria si tiene allineata dopo ogni scrittura,
// e se il doppione arriva lo stesso — la riga c'e' nel database ma non
// qui, per esempio dopo che l'ha scritta un altro dispositivo — si
// ricarica e si aggiorna quella, invece di arrendersi.
async function saveSetting(key,value){
  const payload={setting_key:key,setting_value:String(value)};
  data.appSettings=data.appSettings||[];
  const trova=()=>data.appSettings.find(s=>s.setting_key===key);
  let riga=trova();
  let res=riga?await updateResilient('app_settings',payload,riga.id)
              :await insertReturningResilient('app_settings',payload);
  if(res.error&&/duplicate key|app_settings_user_id_setting_key/i.test(String(res.error.message||''))){
    await reload();
    riga=trova();
    if(riga)res=await updateResilient('app_settings',payload,riga.id);
  }
  if(res.error)return res;
  if(riga)riga.setting_value=String(value);
  else if(res.data&&res.data.id)data.appSettings.push(res.data);
  else await reload();
  return res;
}
function entitiesOf(kind){return kind==='clients'?(data.clients||[]):kind==='projects'?(data.projects||[]):kind==='expenseCategories'?(data.expenseCategories||[]):(data.activities||[])}
function entityLabel(kind,e){return kind==='projects'?`${clientName(e.client_id)} · ${e.name||''}`:(e.name||'')}
function sortMode(kind){const v=settingValue('sort_'+kind);return ['asc','desc','manual'].includes(v)?v:'asc'}
function manualOrder(kind){try{const v=JSON.parse(settingValue('order_'+kind)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}}
function sortEntities(kind,arr){const list=(arr||entitiesOf(kind)).slice();const mode=sortMode(kind);
  if(mode==='manual'){const ord=manualOrder(kind);const idx=id=>{const i=ord.indexOf(id);return i<0?1e6:i};return list.sort((a,b)=>idx(a.id)-idx(b.id)||String(entityLabel(kind,a)).localeCompare(String(entityLabel(kind,b)),'it'));}
  const dir=mode==='desc'?-1:1;return list.sort((a,b)=>dir*String(entityLabel(kind,a)).localeCompare(String(entityLabel(kind,b)),'it',{sensitivity:'base'}));}
async function setSortMode(kind,mode){if(mode==='manual'&&!manualOrder(kind).length){const ids=sortEntities(kind,entitiesOf(kind)).map(x=>x.id);const r0=await saveSetting('order_'+kind,JSON.stringify(ids));if(r0.error)return setMsg(r0.error.message,7000);}
  const r=await saveSetting('sort_'+kind,mode);if(r.error)return setMsg(r.error.message,7000);await reload();render();}
async function moveEntity(kind,id,dir){const ids=sortEntities(kind,entitiesOf(kind)).map(x=>x.id);const i=ids.indexOf(id),j=i+dir;if(i<0||j<0||j>=ids.length)return;ids.splice(j,0,ids.splice(i,1)[0]);const r=await saveSetting('order_'+kind,JSON.stringify(ids));if(r.error)return setMsg(r.error.message,7000);await reload();render();}
function sortControl(kind){const m=sortMode(kind);const b=(v,l)=>`<button type="button" class="${m===v?'active':''}" onclick="setSortMode('${kind}','${v}')">${l}</button>`;return `<div class="tabs">${b('asc','A → Z')}${b('desc','Z → A')}${b('manual','Manuale')}</div>`}
function moveBtns(kind,id){if(sortMode(kind)!=='manual')return '<div>›</div>';return `<div class="moveBtns"><button type="button" onclick="event.stopPropagation();moveEntity('${kind}','${id}',-1)" title="Sposta su" aria-label="Sposta su">↑</button><button type="button" onclick="event.stopPropagation();moveEntity('${kind}','${id}',1)" title="Sposta giù" aria-label="Sposta giù">↓</button></div>`}
function activeClients(){return sortEntities('clients',data.clients.filter(c=>c.active))}
function guardDay(iso){if(!iso)return true;const a=assenzaDel(iso);const fe=!!a;const ho=holidayName(iso);
  const eti=a?assenzaLabel(a).toLowerCase()+' ('+fmtNum(a.h,a.h%1?1:0)+' h)':'';
  if(fe&&ho)return confirm('Il '+fmtDMY(iso)+' è '+ho+' ed è segnato come '+eti+'.\n\nVuoi inserire comunque il consuntivo?');
  if(fe)return confirm('Il '+fmtDMY(iso)+' è segnato come '+eti+'.\n\nVuoi inserire comunque il consuntivo?');
  if(ho)return confirm('Il '+fmtDMY(iso)+' è '+ho+' (giorno festivo).\n\nVuoi inserire comunque il consuntivo?');
  return true}
function dailyClients(){return sortEntities('clients',data.clients.filter(c=>c.compensation_type==='daily_rate_8h'&&c.active))}
function monthlyClients(){return data.clients.filter(c=>c.compensation_type==='monthly_flat'&&c.active)}

function todayISO(){return new Date().toISOString().slice(0,10);}
function isPlanned(e){return !!e&&(e.status==='planned'||String(e.entry_date||'')>todayISO());}
function isTM(e){return !!e&&(!!e.tm_batch_id||e.description==='Time & Material');}
function easterMonday(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;return new Date(Date.UTC(y,mo-1,da)+86400000).toISOString().slice(0,10);}
/* ===== Assenze =====
   Ferie, permessi, malattia e recuperi non sono ore lavorate: non hanno
   cliente e non si fatturano, quindi non stanno in timesheet_entries.
   Vivono in app_settings, come tutte le impostazioni: nessuna modifica
   allo schema Supabase.

   Compatibilità con il pregresso: fino alla v1.6 i giorni off erano un
   semplice elenco di date in "ferie_<anno>". Quelle date continuano a
   valere, lette come ferie di 8 ore. E a ogni salvataggio la vecchia
   chiave viene tenuta aggiornata, così tornare indietro di versione non
   perde nulla. */
const ASSENZE={ferie:{l:'Ferie',i:'🏖'},permesso:{l:'Permesso',i:'🕘'},malattia:{l:'Malattia',i:'🩺'},recupero:{l:'Recupero',i:'↩'}};
const ASSENZA_ORE_DEFAULT=8;
function assenzeRaw(year){try{const v=JSON.parse(settingValue('assenze_'+year)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}}
function legacyFerie(year){try{const v=JSON.parse(settingValue('ferie_'+year)||'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string'):[]}catch(e){return []}}
function normAssenza(a){const k=ASSENZE[a&&a.k]?a.k:'ferie';const h=Number(a&&a.h);return {d:String(a.d),k,h:(Number.isFinite(h)&&h>0&&h<=24)?h:ASSENZA_ORE_DEFAULT,n:(a&&a.n)?String(a.n):''}}
function assenzeList(year){
  const out=assenzeRaw(year).filter(a=>a&&a.d).map(normAssenza);
  const seen=new Set(out.map(a=>a.d));
  legacyFerie(year).forEach(d=>{if(!seen.has(d)){out.push({d,k:'ferie',h:ASSENZA_ORE_DEFAULT,n:''});seen.add(d)}});
  return out.sort((a,b)=>a.d.localeCompare(b.d));
}
function assenzeOfMonth(ym){return assenzeList(String(ym).slice(0,4)).filter(a=>a.d.startsWith(ym))}
function assenzaDel(iso){return assenzeList(String(iso).slice(0,4)).find(a=>a.d===iso)||null}
function oreAssenza(iso){return Number(assenzaDel(iso)?.h||0)}
function assenzaLabel(a){return a?(ASSENZE[a.k]?.l||a.k):''}
function assenzaIcona(a){return a?(ASSENZE[a.k]?.i||''):''}
async function saveAssenze(year,list){
  const clean=list.filter(a=>a&&a.d).map(normAssenza).sort((a,b)=>a.d.localeCompare(b.d));
  const r=await saveSetting('assenze_'+year,JSON.stringify(clean));
  if(r.error)return r;
  return await saveSetting('ferie_'+year,JSON.stringify(clean.map(a=>a.d)));
}
function ferieList(year){return assenzeList(year).map(a=>a.d)}
function ferieSet(year){return new Set(ferieList(year))}
function isFerie(iso){return ferieSet(String(iso).slice(0,4)).has(iso)}
function isHolidayISO(iso){const y=Number(String(iso).slice(0,4));return italianHolidays(y).has(iso)}
const HOLIDAY_NAMES={'01-01':'Capodanno','01-06':'Epifania','04-25':'Liberazione','05-01':'Festa del Lavoro','06-02':'Festa della Repubblica','08-15':'Ferragosto','11-01':'Ognissanti','12-08':'Immacolata','12-25':'Natale','12-26':'Santo Stefano'};
// Santi patroni delle città in cui lavoro (festività locali)
const PATRON_HOLIDAYS={'04-03':'San Pancrazio · Canicattì','05-21':'San Zeno · Verona','12-07':'Sant\'Ambrogio · Milano'};
function isPatron(iso){return !!PATRON_HOLIDAYS[String(iso).slice(5)]}
function holidayName(iso){const s=String(iso);const y=Number(s.slice(0,4));if(s===easterMonday(y))return 'Lunedì dell\'Angelo';return HOLIDAY_NAMES[s.slice(5)]||PATRON_HOLIDAYS[s.slice(5)]||null}
function isWeekendISO(iso){const d=new Date(iso+'T00:00:00Z').getUTCDay();return d===0||d===6}
function dayHours(iso){return (data.entries||[]).filter(e=>String(e.entry_date)===iso).reduce((s,e)=>s+Number(e.hours||0),0)}
function openDay(iso){navigateTo('giorno',{edit:iso})}
function dayShift(n){const d=new Date((state.edit||todayISO())+'T00:00:00Z');const iso=new Date(d.getTime()+n*86400000).toISOString().slice(0,10);state.edit=iso;state.month=iso.slice(0,7);render()}
function dayRows(iso){
  const rows=[];
  (data.entries||[]).filter(e=>String(e.entry_date)===iso).forEach(e=>rows.push({...e,kind:'daily'}));
  (data.manualEntries||[]).filter(e=>String(e.entry_date)===iso).forEach(e=>rows.push({...e,kind:'manual'}));
  (data.travelExpenses||[]).filter(e=>String(e.expense_date)===iso).forEach(e=>rows.push({...e,kind:'expense'}));
  return rows;
}
function giorno(){
  const iso=state.edit||todayISO();
  const d=new Date(iso+'T00:00:00Z');
  const wdName=['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'][d.getUTCDay()];
  const hn=holidayName(iso),fe=isFerie(iso),we=isWeekendISO(iso);
  const rows=dayRows(iso);
  const ore=rows.filter(r=>r.kind==='daily').reduce((s,r)=>s+Number(r.hours||0),0);
  const imp=rows.reduce((s,r)=>s+(r.kind==='daily'?dailyAmount(r):Number(r.amount||0)),0);
  const az=assenzaDel(iso);const badges=[az?`<span class="tag ferieTag">${esc(assenzaIcona(az))} ${esc(assenzaLabel(az))} · ${fmtNum(az.h,az.h%1?1:0)} h</span>`:'',hn?`<span class="tag ${isPatron(iso)?'orange':'red'}">${esc(hn)}</span>`:'',we&&!hn?'<span class="tag gray">Weekend</span>':''].filter(Boolean).join(' ');
  const list=rows.length?`<div class="list">${rows.map(r=>r.kind==='expense'?`<div ${rowAttrs('expense',r.id)}><div class="date">${selBox('expense',r.id)}${dateIT(r.expense_date)}</div><div><div class="title">${esc(expenseCategoryName(r.expense_category_id))}</div><div class="desc">${esc(clientName(r.client_id))} · ${expenseTypeTag(r)}</div></div><div class="value">${fmtEUR(r.amount)}</div></div>`:timesheetRow(r)).join('')}</div>`:'<div class="empty">Nessun consuntivo in questo giorno.<button type="button" class="secondary emptyCta" onclick="newEntryForDay()">+ Aggiungi consuntivo</button></div>';
  return appShell(`<h1>${wdName} ${fmtDMY(iso)}</h1>${badges?`<p class="sub">${badges}</p>`:''}<div class="dayNav"><button type="button" onclick="dayShift(-1)">‹ Giorno prec.</button><button type="button" onclick="go('calendario')">Calendario</button><button type="button" onclick="dayShift(1)">Giorno succ. ›</button></div><div class="card"><b>Riepilogo giornata</b><div class="kpiGrid three" style="margin-top:14px"><div><span>Ore</span><strong>${fmtNum(ore,1)} h</strong><small>${fmtDays(ore)} gg/u</small></div><div><span>Voci</span><strong>${rows.length}</strong></div><div><span>Importo</span><strong>${fmtEUR(imp)}</strong></div></div></div>${selBar('giorno',rows.length)}${list}${rows.length?`<button type="button" class="secondary" onclick="newEntryForDay()">+ Aggiungi consuntivo in questo giorno</button>`:''}`);
}
function goForDay(v){navigateTo(v,{editType:state.editType})}
function newEntryForDay(){navigateTo('dailyForm',{editType:state.edit||todayISO()})}
async function saveAssenza(ev){
  ev.preventDefault();
  const f=Object.fromEntries(new FormData(ev.target));
  const d=norm(f.day);
  if(!d)return setMsg('Indica il giorno.',5000);
  const k=ASSENZE[f.kind]?f.kind:'ferie';
  const h=Number(String(f.hours??'').replace(',','.'));
  if(!Number.isFinite(h)||h<=0||h>24)return setMsg('Le ore devono stare fra 0 e 24.',6000);
  const ore=dayHours(d);
  if(ore>0&&!confirm('Il '+fmtDMY(d)+' ha già '+fmtNum(ore,1)+' h consuntivate.\n\nSegnarlo comunque come '+ASSENZE[k].l.toLowerCase()+'?'))return;
  const y=d.slice(0,4);
  const list=assenzeList(y).filter(a=>a.d!==d);
  list.push({d,k,h,n:norm(f.note)||''});
  const r=await saveAssenze(y,list);
  if(r.error)return setMsg(r.error.message,7000);
  state.month=d.slice(0,7);
  await reload();
  setMsg(ASSENZE[k].l+' del '+fmtDMY(d)+' segnata.',4000);
  render();
}
async function removeAssenza(iso){
  const a=assenzaDel(iso);
  if(!confirm('Togliere '+(a?assenzaLabel(a).toLowerCase():'l\'assenza')+' del '+fmtDMY(iso)+'?'))return;
  const y=String(iso).slice(0,4);
  const r=await saveAssenze(y,assenzeList(y).filter(x=>x.d!==iso));
  if(r.error)return setMsg(r.error.message,7000);
  await reload();setMsg('Assenza tolta.',3500);render();
}
function assenzeCard(){
  const list=assenzeOfMonth(state.month);
  const [y,m]=String(state.month).split('-').map(Number);
  const first=`${y}-${String(m).padStart(2,'0')}-01`;
  const last=`${y}-${String(m).padStart(2,'0')}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`;
  const today=todayISO();
  const proposed=today.startsWith(state.month)?today:first;
  const kinds=Object.entries(ASSENZE).map(([k,v])=>`<option value="${k}">${esc(v.i+' '+v.l)}</option>`).join('');
  const tot=list.reduce((t,a)=>t+Number(a.h||0),0);
  return `<div class="card"><b>Assenze di ${esc(monthLabel(state.month))}</b>
    <div class="desc" style="margin-top:4px">Ferie, permessi, malattia e recuperi. Non sono ore lavorate e non si fatturano: compaiono nella griglia in una riga già valorizzata, che non devi compilare.</div>
    <details class="moreFields"><summary>Segna un'assenza</summary>
    <form class="form assForm" onsubmit="saveAssenza(event)">
      <input name="day" type="date" required value="${esc(proposed)}" min="${esc(first)}" max="${esc(last)}" aria-label="Giorno dell'assenza">
      <select name="kind" aria-label="Tipo di assenza">${kinds}</select>
      <input name="hours" type="number" step="0.5" min="0.5" max="24" value="${ASSENZA_ORE_DEFAULT}" aria-label="Ore">
      <input name="note" placeholder="Nota (facoltativa)" aria-label="Nota">
      <button class="miniBtn">Segna</button>
    </form>
    <div class="ferieRange"><b>Oppure un periodo intero</b>
      <div class="frRow"><input type="date" id="ferieFrom" aria-label="Dal"><span>→</span><input type="date" id="ferieTo" aria-label="Al">
        <select id="ferieKind" aria-label="Tipo di assenza del periodo">${kinds}</select>
        <input type="number" id="ferieHours" step="0.5" min="0.5" max="24" value="${ASSENZA_ORE_DEFAULT}" aria-label="Ore al giorno">
        <button type="button" class="miniBtn" onclick="ferieRange('add')">Segna periodo</button>
        <button type="button" class="miniBtn danger" onclick="ferieRange('remove')">Rimuovi periodo</button></div>
      <div class="desc">Vengono segnati i giorni lavorativi dell'intervallo, weekend esclusi.</div></div>
    </details>
    <div class="list" style="margin-bottom:0">${list.map(a=>`<div class="row">
      <div class="date">${esc(a.d.slice(8,10))}/${esc(a.d.slice(5,7))}</div>
      <div><div class="title">${esc(assenzaIcona(a))} ${esc(assenzaLabel(a))}</div>${a.n?`<div class="desc">${esc(a.n)}</div>`:''}</div>
      <div class="value">${fmtNum(a.h,a.h%1?1:0)} h <button type="button" class="miniBtn danger" style="margin-left:8px" onclick="removeAssenza('${esc(a.d)}')" aria-label="Togli l'assenza del ${esc(fmtDMY(a.d))}">✕</button></div>
      </div>`).join('')||'<div class="empty">Nessuna assenza segnata in questo mese.</div>'}</div>
    ${tot>0?`<div class="metricLine" style="margin-top:12px">${list.length===1?'1 assenza':list.length+' assenze'} <span class="dot">·</span> ${fmtNum(tot,tot%1?1:0)} h <span class="dot">·</span> ${fmtDays(tot)} gg/u</div>`:''}
  </div>`;
}
async function ferieRange(mode){
  const f=document.getElementById('ferieFrom'),t=document.getElementById('ferieTo');
  if(!f||!t||!f.value||!t.value){setMsg('Indica la data di inizio e di fine.',5000);render();return}
  if(f.value>t.value){setMsg('La data di inizio è successiva a quella di fine.',5000);render();return}
  const days=[];let d=new Date(f.value+'T00:00:00Z');const e=new Date(t.value+'T00:00:00Z');let g=0;
  while(d<=e&&g++<400){const iso=d.toISOString().slice(0,10);if(!isWeekendISO(iso))days.push(iso);d=new Date(d.getTime()+86400000);}
  if(!days.length){setMsg('Nessun giorno feriale nell\'intervallo.',5000);render();return}
  const remove=mode==='remove';
  if(!remove){const withH=days.filter(x=>dayHours(x)>0);
    if(withH.length&&!confirm(withH.length+' giorni dell\'intervallo hanno già ore consuntivate.\n\nSegnarli comunque come giorni off?'))return;}
  const kEl=document.getElementById('ferieKind'),hEl=document.getElementById('ferieHours');
  const kind=ASSENZE[kEl&&kEl.value]?kEl.value:'ferie';
  const ore=Number(String((hEl&&hEl.value)||ASSENZA_ORE_DEFAULT).replace(',','.'));
  if(!remove&&(!Number.isFinite(ore)||ore<=0||ore>24)){setMsg('Le ore devono stare fra 0 e 24.',6000);render();return}
  const byYear={};days.forEach(x=>{const yy=x.slice(0,4);(byYear[yy]=byYear[yy]||[]).push(x)});
  let n=0;
  for(const yy of Object.keys(byYear)){let list=assenzeList(yy);
    if(remove){const before=list.length;list=list.filter(a=>byYear[yy].indexOf(a.d)<0);n+=before-list.length;}
    else byYear[yy].forEach(x=>{const i=list.findIndex(a=>a.d===x);const rec={d:x,k:kind,h:ore,n:''};if(i<0)list.push(rec);else list[i]=rec;n++});
    const r=await saveAssenze(yy,list);if(r.error){setMsg(r.error.message,7000);return}}
  await reload();setMsg(n?(n+' giorni '+(remove?'rimossi dalle assenze.':'segnati come '+ASSENZE[kind].l.toLowerCase()+'.')):'Nessuna modifica: i giorni erano già nello stato richiesto.',4000);render();
}
async function toggleFerie(iso){const y=String(iso).slice(0,4);const list=ferieList(y);const i=list.indexOf(iso);
  if(i<0){const h=dayHours(iso);if(h>0&&!confirm('Il '+fmtDMY(iso)+' ha già '+fmtNum(h,1)+' h consuntivate.\n\nVuoi segnarlo comunque come ferie?'))return;list.push(iso);}
  else list.splice(i,1);
  list.sort();const r=await saveSetting('ferie_'+y,JSON.stringify(list));if(r.error)return setMsg(r.error.message,7000);await reload();render();}
function calendario(){
  const [year,mo]=String(state.month).split('-').map(Number);
  const days=new Date(year,mo,0).getDate();const first=new Date(Date.UTC(year,mo-1,1)).getUTCDay();const lead=(first+6)%7;
  const fer=ferieSet(String(year));const hol=italianHolidays(year);
  let nLav=0,nFer=0,nFest=0,nCons=0,totH=0;const festList=[];
  let cells='';for(let i=0;i<lead;i++)cells+='<div class="calCell blank"></div>';
  for(let d=1;d<=days;d++){const iso=`${year}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const we=isWeekendISO(iso),fe=fer.has(iso),ho=hol.has(iso),h=dayHours(iso);const hn=ho?holidayName(iso):null;if(hn)festList.push([d,hn]);
    if(fe)nFer++;else if(ho)nFest++;else if(!we)nLav++;
    if(h>0){nCons++;totH+=h;}
    const cls=['calCell'];if(iso===todayISO())cls.push('today');if(we)cls.push('we');if(ho)cls.push(isPatron(iso)?'patron':'holiday');if(fe)cls.push('ferie');if(h>0)cls.push('worked');
    const az=fe?assenzaDel(iso):null;const tip=[az?assenzaLabel(az)+' '+fmtNum(az.h,az.h%1?1:0)+' h':'',hn||'',h>0?fmtNum(h,1)+' h consuntivate':''].filter(Boolean).join(' · ');
    cells+=`<div class="${cls.join(' ')}" onclick="openDay('${iso}')" role="button" title="${esc(tip?tip+' · ':'')}Apri il dettaglio del giorno"><span class="calNum">${d}</span>${az?`<span class="calFest">${esc(assenzaLabel(az))}</span>`:hn?`<span class="calFest">${esc(hn)}</span>`:''}${h>0?`<span class="calH">${fmtNum(h,1)}h</span>`:''}</div>`;}
  return appShell(`<h1>Calendario</h1><p class="sub">Giorni non lavorabili e ore consuntivate. Tocca un giorno per aprirne il dettaglio; le assenze si gestiscono nella sezione in fondo.</p>${monthSelector()}<div class="card"><div class="calGrid head">${['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map(d=>`<div class="calHead">${d}</div>`).join('')}</div><div class="calGrid">${cells}</div>${festList.length?`<div class="festList"><b>Festività del mese</b>${festList.map(f=>`<span>${f[0]} · ${esc(f[1])}</span>`).join('')}</div>`:''}<div class="calLegend"><span><i class="sw we"></i>Weekend</span><span><i class="sw holiday"></i>Festivo</span><span><i class="sw ferie"></i>Assenza</span><span><i class="sw worked"></i>Consuntivato</span></div></div>${assenzeCard()}<div class="card"><b>Riepilogo ${monthLabel(state.month)}</b><div class="kpiGrid" style="margin-top:14px"><div><span>Giorni lavorabili</span><strong>${nLav}</strong></div><div><span>Assenze</span><strong>${nFer}</strong><small>${fmtNum(assenzeOfMonth(state.month).reduce((t,a)=>t+Number(a.h||0),0),0)} h</small></div><div><span>Festivi</span><strong>${nFest}</strong></div><div><span>Giorni consuntivati</span><strong>${nCons}</strong><small>${fmtNum(totH,1)} h</small></div></div></div>`);
}
function italianHolidays(y){return new Set([...Object.keys(PATRON_HOLIDAYS).map(md=>y+'-'+md),y+'-01-01',y+'-01-06',y+'-04-25',y+'-05-01',y+'-06-02',y+'-08-15',y+'-11-01',y+'-12-08',y+'-12-25',y+'-12-26',easterMonday(y)]);}
function tmWorkingDays(start,end,excludeHolidays){const out=[];if(!start||!end)return out;let d=new Date(start+'T00:00:00Z');const e=new Date(end+'T00:00:00Z');if(isNaN(d.getTime())||isNaN(e.getTime())||d>e)return out;const hol={};for(let y=d.getUTCFullYear();y<=e.getUTCFullYear();y++)hol[y]=italianHolidays(y);let guard=0;while(d<=e&&guard++<1200){const wd=d.getUTCDay();const iso=d.toISOString().slice(0,10);if(wd!==0&&wd!==6&&!(excludeHolidays&&hol[d.getUTCFullYear()].has(iso))&&!isFerie(iso))out.push(iso);d=new Date(d.getTime()+86400000);}return out;}
async function insertManyResilient(table,rows){if(!rows.length)return {error:null};let payloads=rows.map(r=>({...r}));let res=await sb.from(table).insert(payloads);let guard=0;while(isMissingColumnError(res.error)&&guard++<40){const col=missingColumnName(res.error);if(!col)break;let removed=false;payloads=payloads.map(p=>{if(Object.prototype.hasOwnProperty.call(p,col)){const q={...p};delete q[col];removed=true;return q;}return p;});if(!removed)break;res=await sb.from(table).insert(payloads);}return res;}
const TM_CADENCE=[['daily','Giornaliero · ogni giorno lavorativo'],['weekly_fixed','Settimanale · giorno fisso'],['weekly_any','Settimanale · primo giorno utile']];
const WEEKDAYS=[['1','Lunedì'],['2','Martedì'],['3','Mercoledì'],['4','Giovedì'],['5','Venerdì']];
function tmDates(start,end,excl,cadence,weekday){
  const base=tmWorkingDays(start,end,excl);
  if(cadence!=='weekly_fixed'&&cadence!=='weekly_any')return base;
  const byWeek={};
  base.forEach(iso=>{const d=new Date(iso+'T00:00:00Z');const wd=d.getUTCDay();const monday=new Date(d.getTime()-((wd+6)%7)*86400000).toISOString().slice(0,10);(byWeek[monday]=byWeek[monday]||[]).push(iso);});
  const out=[];
  Object.keys(byWeek).sort().forEach(wk=>{const days=byWeek[wk].sort();
    if(cadence==='weekly_fixed'){const t=days.find(iso=>new Date(iso+'T00:00:00Z').getUTCDay()===Number(weekday));if(t)out.push(t);}
    else out.push(days[0]);});
  return out;
}
function tmCadenceLabel(cadence,weekday){if(cadence==='weekly_fixed')return 'ogni '+((WEEKDAYS.find(w=>w[0]===String(weekday))||[])[1]||'settimana').toLowerCase();if(cadence==='weekly_any')return 'una volta a settimana';return 'ogni giorno lavorativo';}
function tmComputeVals(clientId,start,end,hours,excl,skipConflicts,cadence,weekday){const c=clientById(clientId);let days=tmDates(start,end,excl,cadence||'daily',weekday||'4');const set=new Set((data.entries||[]).map(e=>String(e.entry_date)));const conflicts=days.filter(d=>set.has(d));if(skipConflicts)days=days.filter(d=>!set.has(d));const rate=Number(c?.daily_rate||0),std=Number(c?.standard_hours||8)||8;const hh=Number(hours||0);const tISO=todayISO();const future=days.filter(d=>d>tISO).length;return {days,conflicts,future,hours:hh,totHours:days.length*hh,amount:days.length*(rate/std*hh),rate,std,client:c,cadence:cadence||'daily',weekday:weekday||'4'};}
function tmPreviewHtml(r){const nc=r.conflicts?r.conflicts.length:0;if(!r.days.length)return '<b>Anteprima</b><div class="desc" style="margin-top:6px">Nessun giorno da generare in questo intervallo.'+(nc?' Tutti i giorni hanno già un consuntivo.':'')+'</div>'+(nc?'<div class="tag orange" style="margin-top:8px">'+(nc===1?'1 giorno con consuntivo già esistente':nc+' giorni con consuntivo già esistente')+'</div>':'');const planned=r.future?'<div class="desc" style="margin-top:6px">'+(r.future===1?'1 giorno futuro verrà segnato come <b>Pianificato</b>.':r.future+' giorni futuri verranno segnati come <b>Pianificato</b>.')+'</div>':'';const warn=nc?'<div class="tag orange" style="margin-top:10px">Attenzione: '+(nc===1?'1 giorno del periodo ha':nc+' giorni del periodo hanno')+' già un consuntivo</div>':'';return '<b>Anteprima generazione</b><div class="kpiGrid three" style="margin-top:12px"><div><span>Giorni</span><strong>'+r.days.length+'</strong></div><div><span>Ore totali</span><strong>'+fmtNum(r.totHours,1)+' h</strong></div><div><span>Importo stimato</span><strong>'+fmtEUR(r.amount)+'</strong></div></div><div class="desc" style="margin-top:8px">Dal '+fmtDMY(r.days[0])+' al '+fmtDMY(r.days[r.days.length-1])+' · '+fmtNum(r.hours,2)+' h '+tmCadenceLabel(r.cadence,r.weekday)+' · tariffa oraria '+fmtEUR(r.rate/r.std)+'</div>'+planned+warn;}
function updateTMPreview(form){const el=form.querySelector('#tmPreview');if(!el)return;el.innerHTML=tmPreviewHtml(tmComputeVals(form.client_id.value,form.start_date.value,form.end_date.value,form.hours.value,form.exclude_holidays.value==='1',form.skip_conflicts.value==='1',form.cadence.value,form.weekday.value));const wd=form.querySelector('.weekdayField');if(wd)wd.style.display=form.cadence.value==='weekly_fixed'?'':'none';const lb=form.querySelector('.hoursLabel');if(lb)lb.textContent=form.cadence.value==='daily'?'Ore al giorno':'Ore a settimana';}
function tmForm(){const clients=dailyClients();const selected=clients[0]?.id||'';const today=new Date().toISOString().slice(0,10);const initial=tmPreviewHtml(tmComputeVals(selected,today,today,4,true,true));return appShell(`<h1>Impegno continuativo</h1><p class="sub">Genera i consuntivi su tutti i giorni lavorativi tra due date, con un impegno orario fisso. Tariffa oraria = tariffa giornaliera / 8h.</p>${clients.length?`<form class="form" onsubmit="saveTM(event)" oninput="updateTMPreview(this)"><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form);updateTMPreview(this.form)">${clients.map(c=>`<option value="${c.id}"${c.id===selected?' selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div id="hierBlock">${hierAvailable(selected)?hierFields(selected,'')+'<input type="hidden" name="project_id" value="">':campiSenzaGerarchia(selected)}</div><div class="grid"><div class="field"><label>Data inizio</label><input name="start_date" type="date" value="${today}"></div><div class="field"><label>Data fine</label><input name="end_date" type="date" value="${today}"></div></div><div class="field"><label>Cadenza</label><select name="cadence" onchange="updateTMPreview(this.form)">${TM_CADENCE.map(c=>`<option value="${c[0]}">${c[1]}</option>`).join('')}</select></div><div class="field weekdayField" style="display:none"><label>Giorno della settimana</label><select name="weekday" onchange="updateTMPreview(this.form)">${WEEKDAYS.map(w=>`<option value="${w[0]}" ${w[0]==='4'?'selected':''}>${w[1]}</option>`).join('')}</select></div><div class="field"><label class="hoursLabel">Ore al giorno</label><input name="hours" type="number" step="0.25" min="0.25" value="4"></div><div class="field"><label>Giorni</label><select name="exclude_holidays"><option value="1">Lun-Ven · esclude le festività italiane</option><option value="0">Lun-Ven · include le festività</option></select></div><div class="field"><label>Giorni già consuntivati</label><select name="skip_conflicts"><option value="1">Salta i giorni con consuntivo esistente</option><option value="0">Genera comunque (duplica)</option></select></div><div class="field"><label>Sede</label><select name="work_site">${sediOptions()}</select></div><div class="field"><label>Descrizione</label><input name="description" value="Time &amp; Material"></div><div class="field"><label>Note</label><textarea name="notes" placeholder="Note interne opzionali"></textarea></div><div class="card" id="tmPreview" style="margin:6px 0">${initial}</div><div class="actions"><button class="primary">Genera consuntivi</button><button type="button" class="secondary" onclick="go('home')">Annulla</button></div></form>`:`<div class="card">Crea prima un cliente con tariffa giornaliera in Configurazione.</div>`}`);}
async function saveTM(ev){ev.preventDefault();const f=ev.target;const c=clientById(f.client_id.value);const r=tmComputeVals(f.client_id.value,f.start_date.value,f.end_date.value,f.hours.value,f.exclude_holidays.value==='1',f.skip_conflicts.value==='1',f.cadence.value,f.weekday.value);if(r.hours<=0)return setMsg('Inserisci le ore al giorno.',6000);if(!r.days.length)return setMsg('Nessun giorno da generare (verifica intervallo e giorni già consuntivati).',6000);if(r.days.length>366&&!confirm('Stai per generare '+r.days.length+' consuntivi. Procedere?'))return;const tISO=todayISO();const batch='tm_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);const site=norm(f.work_site.value);const desc=norm(f.description.value)||null;const notes=norm(f.notes.value)||null;const lin=(f.wbs_id&&f.wbs_id.value)?wbsLineage(f.wbs_id.value):null;
  if(hierAvailable(f.client_id.value)&&!(f.wbs_id&&f.wbs_id.value))return setMsg('Scegli su cosa registrare: progetto e commessa.',6000);
  const rows=r.days.map(iso=>({entry_date:iso,client_id:f.client_id.value,project_id:(lin?lin.project.id:(f.project_id?f.project_id.value:''))||null,wbs_id:(f.wbs_id&&f.wbs_id.value)||null,activity_id:(lin&&lin.wbs.activity_id?lin.wbs.activity_id:(f.activity_id?f.activity_id.value:''))||null,work_location:site||null,work_site:site||null,work_city:null,description:desc,notes:notes,hours:r.hours,status:(iso>tISO?'planned':'actual'),tm_batch_id:batch,daily_rate_snapshot:Number(c?.daily_rate||0),standard_hours_snapshot:Number(c?.standard_hours||8)}));setMsg('Generazione di '+rows.length+' consuntivi in corso...',6000);render();const res=await insertManyResilient('timesheet_entries',rows);if(res.error)return setMsg(res.error.message,8000);await reload();state.month=r.days[0].slice(0,7);state.view='timesheet';setMsg(rows.length+' consuntivi Time & Material generati.',4500);render();}
function tmBatches(){const map={};(data.entries||[]).filter(isTM).forEach(e=>{const k=e.tm_batch_id||['nb',e.client_id,e.project_id||'',e.activity_id||'',e.hours,e.description||''].join('|');if(!map[k])map[k]={key:k,client_id:e.client_id,project_id:e.project_id,activity_id:e.activity_id,hours:Number(e.hours||0),desc:e.description,ids:[],dates:[],hoursSum:0};const b=map[k];b.ids.push(e.id);b.dates.push(String(e.entry_date));b.hoursSum+=Number(e.hours||0);});return Object.values(map).map(b=>{b.dates.sort();b.start=b.dates[0];b.end=b.dates[b.dates.length-1];b.days=b.ids.length;b.planned=b.dates.filter(d=>d>todayISO()).length;return b;}).sort((a,b)=>String(b.start).localeCompare(a.start));}
function tmManage(){const batches=tmBatches();return appShell(`<h1>Incarichi continuativi</h1><p class="sub">Un incarico genera in un colpo solo i consuntivi dei giorni lavorativi di un periodo. Da qui li crei, e puoi eliminare un intero periodo senza toccare i singoli giorni.</p>${batches.length?`<div class="list">${batches.map((b,i)=>`<div class="row"><div></div><div><div class="title">${esc(clientName(b.client_id))}${b.project_id?' / '+esc(projectName(b.project_id)):''}${b.planned?' <span class="tag blue">'+b.planned+' pianif.</span>':''}</div><div class="desc">${esc(activityName(b.activity_id)||'')}${b.desc?' · '+esc(b.desc):''}</div><div class="desc">Dal ${fmtDMY(b.start)} al ${fmtDMY(b.end)} · ${b.days} giorni · ${fmtNum(b.hoursSum,1)} h totali · ${fmtNum(b.hours,2)} h/giorno</div><button class="secondary danger" style="margin-top:10px" onclick="deleteTMBatch(${i})">Elimina intero periodo</button></div><div class="value"></div></div>`).join('')}</div>`:emptyState('Nessun incarico continuativo generato.','+ Crea un incarico continuativo',"go('tmForm')")}<div class="actions"><button class="primary" onclick="go('tmForm')">+ Nuovo incarico continuativo</button><button type="button" class="secondary" onclick="go('timesheet')">Torna al timesheet</button></div>`);}
async function deleteTMBatch(i){const b=tmBatches()[i];if(!b)return;if(!confirm('Eliminare l\'intero periodo Time & Material?\n'+b.days+' consuntivi dal '+fmtDMY(b.start)+' al '+fmtDMY(b.end)+'.'))return;const {error}=await sb.from('timesheet_entries').delete().in('id',b.ids);if(error)return setMsg(error.message,7000);await reload();setMsg(b.days+' consuntivi Time & Material eliminati.',4000);state.view='tmManage';render();}
/* ---------- Salvare e passare al giorno dopo ----------
   Compilare una settimana significa ripetere lo stesso consuntivo su
   cinque giorni. Senza questo si torna all'elenco, si cerca il giorno
   dopo e si riscelgono cliente, progetto e commessa ogni volta. */
function giornoSpostato(iso,passo){
  const d=new Date(iso+'T00:00:00Z');
  return new Date(d.getTime()+passo*86400000).toISOString().slice(0,10);
}
function salvaEVai(btn,passo){
  const f=btn.form;if(!f)return;
  state.dopoSalva=passo;
  if(typeof f.requestSubmit==='function')f.requestSubmit();else f.submit();
}
// Dopo il salvataggio: o si torna all'elenco, o si scivola al giorno
// accanto portandosi dietro la riga appena compilata.
async function dopoIlSalvataggio(f){
  const passo=state.dopoSalva;state.dopoSalva=null;
  if(!passo){state.view='timesheet';render();return}
  const iso=giornoSpostato(f.entry_date,passo);
  state.month=iso.slice(0,7);
  // se in quel giorno c'e' gia' la stessa voce, la si apre invece di
  // aggiungerne una seconda uguale
  const esistente=(data.entries||[]).find(e=>e.entry_date===iso && (f.wbs_id
    ? e.wbs_id===f.wbs_id
    : e.client_id===f.client_id && String(e.project_id||'')===String(f.project_id||'')));
  if(esistente){
    navigateTo('dailyEdit',{edit:esistente.id});
    setMsg('Salvato. '+fmtDMY(iso)+' era già consuntivato: eccolo.',4500);
    return;
  }
  navigateTo('dailyForm',{editType:iso,prefill:{
    client_id:f.client_id,wbs_id:f.wbs_id||'',project_id:f.project_id||'',
    activity_id:f.activity_id||'',hours:f.hours,
    work_site:f.work_site||'',work_city:f.work_city||'',description:f.description||''}});
  setMsg('Salvato. Ora '+fmtDMY(iso)+'.',4000);
}
function prefillDate(){const v=state.editType;return (typeof v==='string'&&v.length===10&&v.charAt(4)==='-')?v:new Date().toISOString().slice(0,10)}
function dailyForm(){const clients=dailyClients();const pre=state.prefill||{};const selected=(pre.client_id&&clients.some(c=>c.id===pre.client_id))?pre.client_id:(clients[0]?.id||'');return appShell(`<h1>Consuntivo giornaliero</h1><p class="sub">Ore effettivamente lavorate, valorizzate secondo tariffa (tariffa oraria = tariffa giornaliera / 8h).</p>${clients.length?`<form class="form" onsubmit="saveDaily(event)"><div class="field"><label>Data</label><input name="entry_date" type="date" required value="${pre.dataVuota?'':prefillDate()}">${pre.dataVuota?'<div class="small">Copia di un consuntivo esistente: scegli la data.</div>':''}</div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}"${c.id===selected?' selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div id="hierBlock">${hierAvailable(selected)?hierFields(selected,pre.wbs_id||'')+'<input type="hidden" name="project_id" value="'+esc(pre.project_id||'')+'">':campiSenzaGerarchia(selected,pre.project_id||'',pre.activity_id||'')}</div><details class="moreFields"><summary>Altri dettagli (sede, luogo, descrizione)</summary><div class="field"><label>Sede</label><select name="work_site">${sediOptions(pre.work_site||SEDE_DEFAULT)}</select></div><div class="field"><label>Luogo/Città</label><input name="work_city" value="${esc(pre.work_city||'')}" placeholder="Es. Verona, Milano, Canicattì"></div><div class="field"><label>Descrizione</label><textarea name="description">${esc(pre.description||'')}</textarea></div></details><div class="field"><label>Ore consuntivate</label><input name="hours" type="number" step="0.25" value="${pre.hours!=null?esc(String(pre.hours)):'8'}"></div><div class="field"><label>Note</label><textarea name="notes" placeholder="Note interne opzionali"></textarea></div><div class="actions"><button class="primary" data-busy="Salvataggio…">Salva</button><button type="button" class="secondary" onclick="salvaEVai(this,1)">Salva e vai al giorno dopo ›</button><button type="button" class="secondary" onclick="go('home')">Annulla</button></div></form>
      <div class="altriCompensi"><b>Ti serve un altro tipo di compenso?</b>
        <button type="button" onclick="goForDay('manualForm')">Compenso una tantum ›</button>
        <button type="button" onclick="goForDay('monthlyForm')">Compenso mensile ›</button>
      </div>`:`<div class="card">Crea prima un cliente con tariffa giornaliera in Configurazione.</div>`}`)}
async function saveDaily(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));if(!guardDay(f.entry_date))return;const c=clientById(f.client_id);const lin=f.wbs_id?wbsLineage(f.wbs_id):null;if(hierAvailable(f.client_id)&&!f.wbs_id)return setMsg('Scegli su quale attività della commessa registrare le ore.',5000);const payload={entry_date:f.entry_date,client_id:f.client_id,project_id:(lin?lin.project.id:f.project_id)||null,activity_id:(lin&&lin.wbs.activity_id?lin.wbs.activity_id:f.activity_id)||null,wbs_id:f.wbs_id||null,work_location:[norm(f.work_site),norm(f.work_city)].filter(Boolean).join(' - ')||null,work_site:norm(f.work_site)||null,work_city:norm(f.work_city)||null,description:f.description||null,notes:f.notes||null,hours:Number(f.hours||0),daily_rate_snapshot:Number(c?.daily_rate||0),standard_hours_snapshot:Number(c?.standard_hours||8)};const {error}=await insertResilient('timesheet_entries',payload);if(error)return setMsg(error.message,7000);await reload();await dopoIlSalvataggio(f)}
function dailyEdit(){const e=data.entries.find(x=>x.id===state.edit);if(!e)return timesheet();const clients=dailyClients();return appShell(`<h1>Modifica consuntivo</h1><form class="form" onsubmit="saveDailyEdit(event)"><div class="field"><label>Data</label><input name="entry_date" type="date" value="${esc(e.entry_date)}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}" ${c.id===e.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div id="hierBlock">${hierAvailable(e.client_id)?hierFields(e.client_id,e.wbs_id||'')+'<input type="hidden" name="project_id" value="'+(e.project_id||'')+'">':campiSenzaGerarchia(e.client_id,e.project_id||'',e.activity_id||'')}</div><div class="field"><label>Sede</label><select name="work_site">${sediOptions(e.work_site==null?SEDE_DEFAULT:e.work_site)}</select></div><div class="field"><label>Luogo/Città</label><input name="work_city" value="${esc(e.work_city||'')}" placeholder="Es. Verona, Milano, Canicattì"></div><div class="field"><label>Descrizione</label><textarea name="description">${esc(e.description||'')}</textarea></div><div class="field"><label>Ore consuntivate</label><input name="hours" type="number" step="0.25" value="${Number(e.hours||0)}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(e.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary" onclick="salvaEVai(this,1)">Salva e vai al giorno dopo ›</button><button type="button" class="secondary" onclick="salvaEVai(this,-1)">‹ Salva e vai al giorno prima</button><button type="button" class="secondary" onclick="duplicateDaily('${e.id}')">Duplica</button><button type="button" class="secondary danger" onclick="deleteDaily('${e.id}')">Elimina</button><button type="button" class="secondary" onclick="go('timesheet')">Annulla</button></div></form>`)}
async function saveDailyEdit(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));if(!guardDay(f.entry_date))return;const c=clientById(f.client_id);const lin=f.wbs_id?wbsLineage(f.wbs_id):null;if(hierAvailable(f.client_id)&&!f.wbs_id)return setMsg('Scegli su quale attività della commessa registrare le ore.',5000);const payload={entry_date:f.entry_date,client_id:f.client_id,project_id:(lin?lin.project.id:f.project_id)||null,activity_id:(lin&&lin.wbs.activity_id?lin.wbs.activity_id:f.activity_id)||null,wbs_id:f.wbs_id||null,work_location:[norm(f.work_site),norm(f.work_city)].filter(Boolean).join(' - ')||null,work_site:norm(f.work_site)||null,work_city:norm(f.work_city)||null,description:f.description||null,notes:f.notes||null,hours:Number(f.hours||0),daily_rate_snapshot:Number(c?.daily_rate||0),standard_hours_snapshot:Number(c?.standard_hours||8)};const {error}=await updateResilient('timesheet_entries',payload,state.edit);if(error)return setMsg(error.message,7000);await reload();state.edit=null;await dopoIlSalvataggio(f)}
// Duplicare non scrive piu' di nascosto su oggi: apre il modulo gia'
// pieno con la data vuota, cosi' la data la si sceglie apposta. Prima
// scriveva dritto nel database e, non portandosi dietro la voce su cui
// erano registrate le ore, il database rifiutava: "duplica" sembrava
// semplicemente non fare niente.
function duplicateDaily(idv){
  const e=data.entries.find(x=>x.id===idv);if(!e)return;
  navigateTo('dailyForm',{prefill:{dataVuota:true,
    client_id:e.client_id,wbs_id:e.wbs_id||'',project_id:e.project_id||'',
    activity_id:e.activity_id||'',hours:e.hours,
    work_site:e.work_site||SEDE_DEFAULT,work_city:e.work_city||'',description:e.description||''}});
  setMsg('Copia pronta: scegli la data e salva.',4500);
}
async function deleteDaily(idv){if(!confirm('Eliminare questo consuntivo?'))return;const {error}=await sb.from('timesheet_entries').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}

function monthlyForm(){const clients=monthlyClients();const selected=clients[0]?.id||'';return appShell(`<h1>Compenso mensile</h1>${clients.length?`<form class="form" onsubmit="saveMonthly(event)"><div class="field"><label>Mese</label><input name="month" type="month" value="${state.month}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}"${c.id===selected?' selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(selected)}</select></div><div class="field"><label>Descrizione</label><textarea name="description"></textarea></div><div class="field"><label>Importo</label><input name="amount" type="number" step="0.01" value="0"></div><div class="field"><label>Note</label><textarea name="notes" placeholder="Note interne opzionali"></textarea></div><div class="actions"><button class="primary" data-busy="Salvataggio…">Salva</button><button type="button" class="secondary" onclick="go('home')">Annulla</button></div></form>`:`<div class="card">Crea prima un cliente una tantum mensile in Configurazione.</div>`}`)}
async function saveMonthly(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const [year,month]=String(f.month||state.month).split('-').map(Number);const payload={year,month,client_id:f.client_id,project_id:f.project_id||null,description:f.description||null,notes:f.notes||null,amount:Number(f.amount||0)};const {error}=await insertResilient('monthly_compensations',payload);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
function monthlyEdit(){const m=data.monthly.find(x=>x.id===state.edit);if(!m)return timesheet();const clients=monthlyClients();const mm=`${m.year}-${String(m.month).padStart(2,'0')}`;return appShell(`<h1>Modifica compenso mensile</h1><form class="form" onsubmit="saveMonthlyEdit(event)"><div class="field"><label>Mese</label><input name="month" type="month" value="${mm}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}" ${c.id===m.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(m.client_id,m.project_id||'')}</select></div><div class="field"><label>Descrizione</label><textarea name="description">${esc(m.description||'')}</textarea></div><div class="field"><label>Importo</label><input name="amount" type="number" step="0.01" value="${Number(m.amount||0)}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(m.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary" onclick="duplicateMonthly('${m.id}')">Duplica</button><button type="button" class="secondary danger" onclick="deleteMonthly('${m.id}')">Elimina</button><button type="button" class="secondary" onclick="go('timesheet')">Annulla</button></div></form>`)}
async function saveMonthlyEdit(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const [year,month]=String(f.month||state.month).split('-').map(Number);const payload={year,month,client_id:f.client_id,project_id:f.project_id||null,description:f.description||null,notes:f.notes||null,amount:Number(f.amount||0)};const {error}=await updateResilient('monthly_compensations',payload,state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';state.edit=null;render()}
async function duplicateMonthly(idv){const m=data.monthly.find(x=>x.id===idv);if(!m)return;const {year,month}=periodParts();const copy={year,month,client_id:m.client_id,project_id:m.project_id,description:m.description,notes:m.notes,amount:m.amount};const {error}=await insertResilient('monthly_compensations',copy);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
async function deleteMonthly(idv){if(!confirm('Eliminare questo compenso mensile?'))return;const {error}=await sb.from('monthly_compensations').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}

function manualForm(){const clients=activeClients();const selected=clients[0]?.id||'';return appShell(`<h1>Compenso una tantum</h1>${clients.length?`<form class="form" onsubmit="saveManual(event)"><div class="field"><label>Data</label><input name="entry_date" type="date" value="${prefillDate()}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}"${c.id===selected?' selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div id="hierBlock">${hierAvailable(selected)?hierFields(selected,'')+'<input type="hidden" name="project_id" value="">':campiSenzaGerarchia(selected)}</div><details class="moreFields"><summary>Altri dettagli (sede, luogo, descrizione)</summary><div class="field"><label>Sede</label><select name="work_site">${sediOptions()}</select></div><div class="field"><label>Luogo/Città</label><input name="work_city"></div><div class="field"><label>Descrizione</label><textarea name="description"></textarea></div></details><div class="field"><label>Importo manuale</label><input name="amount" type="number" step="0.01" value="0"></div><div class="field"><label>Note</label><textarea name="notes"></textarea></div><div class="actions"><button class="primary" data-busy="Salvataggio…">Salva</button><button type="button" class="secondary" onclick="go('home')">Annulla</button></div></form>`:`<div class="card">Crea prima un cliente in Configurazione.</div>`}`)}
async function saveManual(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));if(!guardDay(f.entry_date))return;const lin=f.wbs_id?wbsLineage(f.wbs_id):null;
  if(hierAvailable(f.client_id)&&!f.wbs_id)return setMsg('Scegli su cosa registrare: progetto e commessa.',5000);
  const payload={entry_date:f.entry_date,client_id:f.client_id,project_id:(lin?lin.project.id:f.project_id)||null,wbs_id:f.wbs_id||null,activity_id:(lin&&lin.wbs.activity_id?lin.wbs.activity_id:f.activity_id)||null,work_site:norm(f.work_site)||null,work_city:norm(f.work_city)||null,description:f.description||null,amount:Number(f.amount||0),notes:f.notes||null};const {error}=await insertResilient('manual_entries',payload,['wbs_id']);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
function manualEdit(){const e=data.manualEntries.find(x=>x.id===state.edit);if(!e)return timesheet();const clients=activeClients();return appShell(`<h1>Modifica compenso una tantum</h1><form class="form" onsubmit="saveManualEdit(event)"><div class="field"><label>Data</label><input name="entry_date" type="date" value="${esc(e.entry_date)}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}" ${c.id===e.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div id="hierBlock">${hierAvailable(e.client_id)?hierFields(e.client_id,e.wbs_id||'')+'<input type="hidden" name="project_id" value="'+(e.project_id||'')+'">':campiSenzaGerarchia(e.client_id,e.project_id||'',e.activity_id||'')}</div><div class="field"><label>Sede</label><select name="work_site">${sediOptions(e.work_site==null?SEDE_DEFAULT:e.work_site)}</select></div><div class="field"><label>Luogo/Città</label><input name="work_city" value="${esc(e.work_city||'')}"></div><div class="field"><label>Descrizione</label><textarea name="description">${esc(e.description||'')}</textarea></div><div class="field"><label>Importo manuale</label><input name="amount" type="number" step="0.01" value="${Number(e.amount||0)}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(e.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary" onclick="duplicateManual('${e.id}')">Duplica</button><button type="button" class="secondary danger" onclick="deleteManual('${e.id}')">Elimina</button><button type="button" class="secondary" onclick="go('timesheet')">Annulla</button></div></form>`)}
async function saveManualEdit(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));if(!guardDay(f.entry_date))return;const lin=f.wbs_id?wbsLineage(f.wbs_id):null;
  if(hierAvailable(f.client_id)&&!f.wbs_id)return setMsg('Scegli su cosa registrare: progetto e commessa.',5000);
  const payload={entry_date:f.entry_date,client_id:f.client_id,project_id:(lin?lin.project.id:f.project_id)||null,wbs_id:f.wbs_id||null,activity_id:(lin&&lin.wbs.activity_id?lin.wbs.activity_id:f.activity_id)||null,work_site:norm(f.work_site)||null,work_city:norm(f.work_city)||null,description:f.description||null,amount:Number(f.amount||0),notes:f.notes||null};const {error}=await updateResilient('manual_entries',payload,state.edit,['wbs_id']);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';state.edit=null;render()}
async function duplicateManual(idv){const e=data.manualEntries.find(x=>x.id===idv);if(!e)return;const copy={entry_date:new Date().toISOString().slice(0,10),client_id:e.client_id,project_id:e.project_id,activity_id:e.activity_id,wbs_id:e.wbs_id||null,work_site:e.work_site,work_city:e.work_city,description:e.description,amount:e.amount,notes:e.notes};const {error}=await insertResilient('manual_entries',copy,['wbs_id']);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
async function deleteManual(idv){if(!confirm('Eliminare questo consuntivo manuale?'))return;const {error}=await sb.from('manual_entries').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}

// Le trasferte fra cui scegliere: quelle del mese piu' quella gia'
// agganciata alla spesa, che puo' stare in un mese diverso.
function tripScelta(selected=''){
  const viaggi=(data.trips||[]).slice()
    .filter(t=>tripNelMese(t)||t.id===selected)
    .sort((a,b)=>tripDa(b).localeCompare(tripDa(a)));
  return `<option value="">— Spesa singola, fuori trasferta —</option>${viaggi.map(t=>`<option value="${t.id}"${t.id===selected?' selected':''}>${esc(tripTitolo(t))} · ${esc(tripPeriodo(t))}</option>`).join('')}`;
}
function campoTrasferta(selected=''){
  if(!trasferteReady())return '';
  return `<div class="field"><label>Trasferta</label><select name="trip_id" onchange="trasfertaCambiata(this.form)">${tripScelta(selected)}</select><div class="small">Scegliendo una trasferta, cliente, progetto e città li prende da lei.</div></div>`;
}
// Scegliere la trasferta deve riempire i campi che da lei si deducono,
// altrimenti uno li ribatte a mano e sbaglia.
function trasfertaCambiata(form){
  const t=tripById(form.trip_id&&form.trip_id.value);
  if(!t)return;
  if(t.client_id&&form.client_id){form.client_id.value=t.client_id;refreshProjectsForForm(form)}
  if(t.project_id&&form.project_id){
    const ok=[...form.project_id.options].some(o=>o.value===t.project_id);
    if(ok)form.project_id.value=t.project_id;
  }
  if(t.destination_city&&form.work_city&&!norm(form.work_city.value))form.work_city.value=t.destination_city;
  if(form.expense_date&&t.start_date){
    const d=form.expense_date.value;
    if(!d||d<tripDa(t)||d>tripA(t))form.expense_date.value=tripDa(t);
  }
  if(form.reimbursement_type)aggiornaCalcoloEAvviso(form,true);
}
function reimbTypeOptions(selected){return REIMB_TYPES.map(([v,l])=>`<option value="${v}" ${v===selected?'selected':''}>${l}</option>`).join('')}
function parsePolicy(c){try{const p=c&&c.expense_policy;if(!p)return [];return Array.isArray(p)?p:JSON.parse(p)}catch(e){return []}}
// \u2500\u2500\u2500 Come si \u00e8 pagato, e se la ricevuta c'\u00e8 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Non si poteva dire se una spesa era stata pagata con carta, bonifico
// o contanti, e non c'era nemmeno una spunta per la ricevuta. E' il
// dato che decide il trattamento fiscale del riaddebito: dal 2025
// (D.Lgs. 192/2024, art. 54 TUIR, tracciabilita' dalla L. 207/2024) i
// rimborsi analitici di vitto, alloggio, viaggio e trasporto pagati
// con strumenti tracciabili non concorrono al reddito; in contanti si'.
//
// Due eccezioni che l'app deve dire, perche' nessuno se le ricorda:
// il rimborso chilometrico e' forfettario e resta compenso comunque, e
// le spese sostenute all'estero sono fuori dall'obbligo.
// \u2500\u2500\u2500 La foto della ricevuta \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Questo e' il solo pezzo di tutta la serie che aggiunge un SERVIZIO
// nuovo: Supabase Storage, che l'app non usava da nessuna parte. Per
// questo e' l'ultimo passo e sta da solo.
//
// Il percorso del file e' <user_id>/<expense_id>/<nome>: la prima
// cartella e' l'id dell'utente, ed e' su quella che le policy del
// bucket decidono. Senza quella convenzione, uno leggerebbe le
// ricevute di un altro — quindi non e' un dettaglio di forma.
const BUCKET_RICEVUTE='ricevute';
function nomeFileRicevuta(nome){
  const pulito=String(nome||'ricevuta').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(-60);
  return pulito||'ricevuta';
}
function percorsoRicevuta(expenseId,nome){
  const uid=session&&session.user&&session.user.id;
  if(!uid)return null;
  return uid+'/'+expenseId+'/'+Date.now()+'-'+nomeFileRicevuta(nome);
}
// Supabase Storage puo' non esserci: il bucket si crea con la
// migrazione. In quel caso l'app lo deve DIRE, non restare zitta, e la
// spesa non deve restare con un percorso che non esiste.
function motivoStorage(err){
  const m=String(err&&err.message||err||'');
  if(/bucket not found|not found/i.test(m))
    return 'il deposito delle ricevute non c\u2019\u00e8 ancora: lancia la migrazione 2026-10-06_ricevute-storage.sql.';
  if(/row-level security|policy|unauthorized|403/i.test(m))
    return 'il deposito delle ricevute non ti autorizza a scrivere: controlla le policy del bucket.';
  if(/payload too large|exceeded|size/i.test(m))
    return 'il file \u00e8 troppo grande: il limite \u00e8 10 MB.';
  if(/mime|content type/i.test(m))
    return 'il tipo di file non \u00e8 ammesso: foto (jpg, png, webp, heic) o PDF.';
  return motivoLeggibile(err);
}
async function caricaRicevuta(ev){
  const file=ev.target.files&&ev.target.files[0];
  if(!file)return;
  const id=state.edit;
  const e=(data.travelExpenses||[]).find(x=>x.id===id);
  if(!e)return setMsgLeggero('Spesa non trovata: riapri la schermata.',6000);
  const path=percorsoRicevuta(id,file.name);
  if(!path)return setMsgLeggero('Non si sa chi sei: esci e rientra.',7000);
  setMsgLeggero('Carico la ricevuta\u2026',4000);
  try{
    const up=await sb.storage.from(BUCKET_RICEVUTE).upload(path,file,{upsert:false});
    if(up&&up.error)throw up.error;
    const res=await updateResilient('travel_expenses',{receipt_path:path,receipt_kept:true},id,['receipt_path','receipt_kept']);
    if(res.error){
      // Il file c'e' ma la riga no: si rimuove il file, altrimenti
      // resta un orfano nel bucket che nessuno ritrovera' piu'.
      try{await sb.storage.from(BUCKET_RICEVUTE).remove([path])}catch(x){}
      return setMsgLeggero('La ricevuta \u00e8 stata caricata ma non si \u00e8 potuta collegare alla spesa: '+motivoLeggibile(res.error),9000);
    }
    // NIENTE reload()+render() qui: ridisegnerebbe il modulo dal
    // database e porterebbe via le modifiche non ancora salvate \u2014 e
    // fetchAll() azzera anche state.dirty, quindi nemmeno un avviso.
    // Si aggiorna la riga in memoria e si ridisegna il solo campo.
    e.receipt_path=path;e.receipt_kept=true;
    const form=ev.target.form;
    if(form&&form.receipt_kept)form.receipt_kept.checked=true;
    const box=document.getElementById('ricevutaCampo');
    if(box)box.innerHTML=campoRicevuta(e,false);
    if(form)aggiornaTracciabilita(form);
    setMsgLeggero('Ricevuta allegata.',4000);
  }catch(err){
    setMsgLeggero('Non si \u00e8 potuta caricare la ricevuta: '+motivoStorage(err),10000);
  }
}
// La finestra si apre SUBITO, dentro il gesto: aspettare il
// collegamento firmato e aprirla dopo la fa scambiare per un popup non
// richiesto, e su telefono lento il pulsante sembra non fare niente.
async function apriRicevuta(){
  const e=(data.travelExpenses||[]).find(x=>x.id===state.edit);
  if(!e||!e.receipt_path)return;
  const w=window.open('','_blank','noopener');
  try{
    const r=await sb.storage.from(BUCKET_RICEVUTE).createSignedUrl(e.receipt_path,120);
    if(r&&r.error)throw r.error;
    const url=r&&r.data&&(r.data.signedUrl||r.data.signedURL);
    if(!url)throw new Error('nessun collegamento');
    if(w&&!w.closed)w.location.href=url;
    else window.open(url,'_blank','noopener');
  }catch(err){
    try{if(w&&!w.closed)w.close()}catch(x){}
    setMsgLeggero('Non si \u00e8 potuta aprire la ricevuta: '+motivoStorage(err),9000);
  }
}
async function togliRicevuta(){
  const id=state.edit;
  const e=(data.travelExpenses||[]).find(x=>x.id===id);
  if(!e||!e.receipt_path)return;
  if(!confirm('Togliere la ricevuta allegata? Il file viene cancellato.'))return;
  try{
    const r=await sb.storage.from(BUCKET_RICEVUTE).remove([e.receipt_path]);
    if(r&&r.error)throw r.error;
  }catch(err){
    return setMsgLeggero('Non si \u00e8 potuto cancellare il file: '+motivoStorage(err),9000);
  }
  // La spunta va azzerata con il file: era il file a metterla, e senza
  // di lui la spesa direbbe di avere una ricevuta che non c'e' piu'.
  const res=await updateResilient('travel_expenses',{receipt_path:null,receipt_kept:false},id,['receipt_path','receipt_kept']);
  if(res.error)return setMsgLeggero('Il file \u00e8 stato cancellato ma la spesa lo nomina ancora: '+motivoLeggibile(res.error),9000);
  e.receipt_path=null;e.receipt_kept=false;
  const form=document.querySelector('#app form.form');
  if(form&&form.receipt_kept)form.receipt_kept.checked=false;
  const box=document.getElementById('ricevutaCampo');
  if(box)box.innerHTML=campoRicevuta(e,false);
  if(form)aggiornaTracciabilita(form);
  setMsgLeggero('Ricevuta rimossa. Se la conservi su carta, rimetti la spunta.',6000);
}
// Il campo: su una spesa nuova non si puo' allegare niente, perche' il
// percorso ha bisogno dell'id della spesa. Lo si dice, invece di
// mostrare un campo che non funziona.
function campoRicevuta(v={},nuova=false){
  if(nuova)
    return `<div class="small ricevutaNota">La foto della ricevuta si allega dopo aver salvato: il file va in una cartella intestata a questa spesa.</div>`;
  if(v.receipt_path)
    return `<div class="ricevutaBox"><div><b>Ricevuta allegata</b><div class="desc">${esc(String(v.receipt_path).split('/').pop()||'')}</div></div><div class="ricevutaBtn"><button type="button" class="secondary" onclick="apriRicevuta()">Guarda la ricevuta</button><button type="button" class="secondary danger" onclick="togliRicevuta()">Togli la ricevuta</button></div></div>`;
  return `<label class="ricevutaCarica"><span><b>Allega la foto della ricevuta</b><small>Foto o PDF, fino a 10 MB. Resta privata: la vedi solo tu.</small></span><input type="file" name="receipt_file" accept="image/*,application/pdf" capture="environment" onchange="caricaRicevuta(event)"></label>`;
}
const METODI_PAGAMENTO=[['carta','Carta'],['bonifico','Bonifico'],['contanti','Contanti'],['cliente','Pagata dal cliente'],['altro','Altro']];
function metodoLabel(m){const h=METODI_PAGAMENTO.find(x=>x[0]===m);return h?h[1]:''}
function metodoTracciabile(m){return ['carta','bonifico','cliente'].includes(String(m||''))}
function metodoOptions(selected=''){
  return `<option value="">\u2014 non indicato \u2014</option>`+
    METODI_PAGAMENTO.map(([v,l])=>`<option value="${v}"${v===selected?' selected':''}>${l}</option>`).join('');
}
// Una spesa a riaddebitare che non regge: in contanti, o senza ricevuta.
function spesaDaSistemare(e){
  if(!e||expIsOwn(e))return false;
  if(e.payment_method===undefined&&e.receipt_kept===undefined)return false;
  if(spesaChilometrica(e))return false;
  if(e.payment_method&&!metodoTracciabile(e.payment_method))return true;
  if(e.receipt_path)return false;
  return e.receipt_kept===false&&!!e.payment_method;
}
function notaTracciabilita(clientId,categoryId,tipo,metodo,ricevuta){
  if(!tipo||tipo==='own')return '';
  const cat=expenseCategoryById(categoryId);
  if(eVoceChilometrica(cat))
    return `<div class="notaTraccia"><span class="tag gray">forfettario</span><div class="desc">Il rimborso chilometrico \u00e8 forfettario: resta un <b>compenso imponibile</b> anche se lo paghi con carta. Qui la tracciabilit\u00e0 non cambia il trattamento.</div></div>`;
  const pezzi=[];
  let cls='verde',dist='tracciabile';
  if(metodo&&!metodoTracciabile(metodo)){
    cls='orange';dist='non tracciabile';
    pezzi.push('Pagata in contanti: il riaddebito torna a concorrere al reddito. Le spese sostenute <b>all\u2019estero</b> sono per\u00f2 fuori dall\u2019obbligo di tracciabilit\u00e0.');
  }else if(metodo){
    pezzi.push('Pagata con '+esc(metodoLabel(metodo).toLowerCase())+': il riaddebito <b>analitico</b> regge il requisito della tracciabilit\u00e0.');
  }else{
    cls='gray';dist='da indicare';
    pezzi.push('Scrivi come l\u2019hai pagata: \u00e8 il dato che decide se il riaddebito resta fuori dal reddito.');
  }
  if(metodo&&!ricevuta)
    pezzi.push('<b>Manca la ricevuta.</b> Senza giustificativo l\u2019addebito analitico non si regge.');
  return `<div class="notaTraccia"><span class="tag ${cls}">${dist}</span><div class="desc">${pezzi.join(' ')}</div></div>`;
}
function aggiornaTracciabilita(form){
  const box=document.getElementById('tracciaBox');
  if(!box||!form)return;
  box.innerHTML=notaTracciabilita(
    form.client_id?form.client_id.value:'',
    form.expense_category_id?form.expense_category_id.value:'',
    form.reimbursement_type?form.reimbursement_type.value:'own',
    form.payment_method?form.payment_method.value:'',
    !!(form.receipt_kept&&form.receipt_kept.checked));
}
function policyRiga(clientId,categoryId){
  const c=clientById(clientId);
  if(!c)return null;
  const pol=parsePolicy(c);
  const catName=(expenseCategoryById(categoryId)||{}).name;
  return pol.find(r=>r.category_id===categoryId||(r.category&&catName&&String(r.category).toLowerCase()===String(catName).toLowerCase()))||null;
}
function clientPolicyType(clientId,categoryId){const h=policyRiga(clientId,categoryId);return h?h.type||'':''}
// \u2500\u2500\u2500 I limiti \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// L'editor della policy esisteva ma non aveva limiti: solo una tendina
// coi tre tipi di rimborso. I limiti sono la sostanza di qualsiasi
// travel policy, e l'app li deve dire MENTRE si inserisce \u2014 non a
// fattura emessa, quando non si puo' piu' fare niente.
function policyCap(clientId,categoryId,quantita){
  const h=policyRiga(clientId,categoryId);
  const cap=Number(h&&h.cap||0);
  if(!(cap>0))return null;
  const perUnit=!!(h&&h.per_unit);
  const q=Math.max(1,Number(quantita||0)||1);
  return {cap,perUnit,massimo:perUnit?cap*q:cap,quantita:q};
}
function sforamento(clientId,categoryId,importo,quantita){
  const c=policyCap(clientId,categoryId,quantita);
  if(!c)return null;
  const ecc=Number(importo||0)-c.massimo;
  if(!(ecc>0.005))return null;
  return {...c,importo:Number(importo||0),eccedenza:ecc};
}
// L'avviso: dice il limite, l'eccedenza, e offre di spezzare. Non
// impedisce di sforare \u2014 l'eccedenza a volte si tiene e basta.
function avvisoPolicy(clientId,categoryId,importo,quantita){
  const sf=sforamento(clientId,categoryId,importo,quantita);
  if(!sf)return '';
  const dettaglio=sf.perUnit
    ? fmtEUR(sf.cap)+' per '+esc(unitaVoce(categoryId))+' \u00d7 '+fmtNum(sf.quantita,0)+' = '+fmtEUR(sf.massimo)
    : fmtEUR(sf.massimo);
  return `<div class="avvisoPolicy"><b>Oltre il limite di ${esc(clientName(clientId))}</b><div class="desc">${esc(expenseCategoryName(categoryId))}: ${dettaglio}. Tu hai messo ${fmtEUR(sf.importo)}, quindi <b>${fmtEUR(sf.eccedenza)}</b> sono oltre.</div><label class="manoLbl"><input type="checkbox" name="spezza"> Spezza in due righe: ${fmtEUR(sf.massimo)} in fattura, ${fmtEUR(sf.eccedenza)} a mio carico</label></div>`;
}
function unitaVoce(categoryId){
  const cat=expenseCategoryById(categoryId);
  return (cat&&cat.unit_label)||'unit\u00e0';
}
// Si ridisegna solo l'avviso, non il modulo: ridisegnare il modulo
// mentre uno scrive gli porta via il fuoco dal campo.
function aggiornaAvvisoPolicy(form){
  const box=document.getElementById('policyBox');
  if(!box||!form)return;
  const spezzaPrima=!!(form.spezza&&form.spezza.checked);
  box.innerHTML=avvisoPolicy(
    form.client_id?form.client_id.value:'',
    form.expense_category_id?form.expense_category_id.value:'',
    Number(form.amount?form.amount.value:0),
    Number(form.quantity?form.quantity.value:0));
  if(spezzaPrima&&form.spezza)form.spezza.checked=true;
}
// ─── Il modulo della spesa, in tre blocchi ──────────────────
// Prima erano undici campi in fila, tutti con lo stesso peso: la data
// che cambi ogni volta accanto al costo unitario a quattro decimali che
// non tocchi mai. E chiedeva SIA quantita' x tariffa SIA il totale, in
// tre caselle scrivibili, senza dire quale vince: due fonti di verita'
// per lo stesso numero, e se correggevi il totale a mano quantita' e
// tariffa restavano li' a raccontare un'altra cifra.
//
// Ora: «Quando e dove», «Cosa», «Come la tratto». Il totale lo calcola
// l'app quando la voce e' a quantita' x tariffa; per correggerlo a mano
// si spunta «Lo scrivo a mano», cosi' resta flessibile ma mai ambiguo.
function bloccoCampi(titolo,sotto,campi){
  return `<div class="bloccoCampi"><div class="bloccoTit">${titolo}${sotto?`<small>${esc(sotto)}</small>`:''}</div>${campi}</div>`;
}
function campiQuandoDove(v={},nuova=false){
  const clients=activeClients();
  const sel=v.client_id||clients[0]?.id||'';
  const quando=nuova?(v.expense_date||todayISO()):(v.expense_date||'');
  return bloccoCampi('Quando e dove','La data, e per chi',
    `<div class="field"><label>Data</label><input name="expense_date" type="date" value="${esc(quando)}" required></div>`
    +campoTrasferta(v.trip_id||'')
    +`<div class="field"><label>Cliente</label><select name="client_id" onchange="clienteSpesaCambiato(this.form)">${clients.map(c=>`<option value="${c.id}"${c.id===sel?' selected':''}>${esc(c.name)}</option>`).join('')}</select></div>`
    +`<div id="speseHier">${campiCommessaSpesa(sel,v)}</div>`
    +`<div class="field"><label>Sede / Città</label><input name="work_city" value="${esc(v.work_city||'')}" placeholder="Es. Catania, Verona"></div>`);
}
// La commessa mancava del tutto: le spese nuove nascevano con wbs_id
// vuoto e l'analisi per commessa tornava a bucarsi a ogni inserimento,
// nonostante la bonifica di settembre.
function campiCommessaSpesa(clientId,v={}){
  if(hierAvailable(clientId))
    return hierFields(clientId,v.wbs_id||'')+`<input type="hidden" name="project_id" value="${esc(v.project_id||'')}">`;
  return `<div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(clientId,v.project_id||'')}</select></div>`;
}
function clienteSpesaCambiato(form){
  const cli=form.client_id?form.client_id.value:'';
  const blocco=document.getElementById('speseHier');
  if(blocco){
    blocco.innerHTML=campiCommessaSpesa(cli,{});
    if(form.hier_project_id)hierChanged(form,'client');
  }
  aggiornaCalcoloEAvviso(form,true);
}
function campiCosa(v={}){
  const cat=expenseCategoryById(v.expense_category_id);
  const km=eVoceChilometrica(cat);
  const aQ=aQuantitaTariffa(cat);
  const unita=(cat&&cat.unit_label)||'unit\u00e0';
  const tratta=km?kmTrattaDi(v):0;
  return bloccoCampi('Cosa','La voce di spesa e quanto',
    `<div class="field"><label>Voce di spesa</label><select name="expense_category_id" onchange="voceSpesaCambiata(this.form)">${expenseOptions(v.expense_category_id||'')}</select></div>`
    +campiPercorso(v,km)
    +`<div class="field" id="qtaField"${aQ&&!km?'':' hidden'}><label>Quantit\u00e0 <span id="qtaUnita">(${esc(unita)})</span></label><input name="quantity" type="number" step="0.01" value="${Number(v.quantity||(aQ?1:0))}" oninput="aggiornaCalcoloEAvviso(this.form)"></div>`
    +`<div class="field" id="rateField"${aQ?'':' hidden'}><label id="rateLbl">${km?'Tariffa \u20ac/km':'Tariffa unitaria'}</label><input name="unit_rate" type="number" step="0.0001" value="${Number(v.unit_rate||0)}" oninput="aggiornaCalcoloEAvviso(this.form)">${km?'<div class="small">La proponi tu: le tabelle ACI stanno su costikm.aci.it e cambiano a gennaio. Il veicolo la suggerisce, qui si corregge.</div>':''}</div>`
    +`<div class="field"><label>Importo totale</label><input name="amount" type="number" step="0.01" value="${Number(v.amount||0)}"${aQ?' readonly':''} oninput="aggiornaAvvisoPolicy(this.form)"><label class="manoLbl"><input type="checkbox" name="amount_a_mano" onchange="totaleAMano(this.form)"${aQ?'':' checked'}> Lo scrivo a mano</label><div class="small" id="calcNota">${aQ?NOTA_CALCOLO:NOTA_MANO}</div></div>`
    +`<div class="field"><label>Descrizione</label><textarea name="description" placeholder="Es. Volo Milano\u2013Catania andata">${esc(v.description||'')}</textarea></div>`);
}
// I km a tratta: quello che una persona ha in testa. Il totale \u2014 che
// e' il doppio quando si torna \u2014 lo fa l'app e finisce in quantity.
function kmTrattaDi(v){
  const tot=Number(v&&v.quantity||0);
  if(!tot)return 0;
  return v&&v.round_trip?tot/2:tot;
}
function campiPercorso(v={},km=false){
  if(!km&&!v.vehicle_id&&!v.from_place&&!v.to_place)return bloccoPercorsoVuoto(v);
  return bloccoPercorsoVuoto(v,km);
}
function bloccoPercorsoVuoto(v={},km=false){
  const tratta=kmTrattaDi(v);
  const vei=veicoliReady()
    ? `<div class="field"><label>Veicolo</label><select name="vehicle_id" onchange="veicoloCambiato(this.form)">${vehicleOptions(v.vehicle_id||'')}</select></div>`
    : '';
  return `<div id="kmField"${km?'':' hidden'}>${vei}<div class="field"><label>Da \u2192 A</label><div class="qtaCoppia"><input name="from_place" value="${esc(v.from_place||'')}" placeholder="Partenza" aria-label="Partenza"><span>\u2192</span><input name="to_place" value="${esc(v.to_place||'')}" placeholder="Arrivo" aria-label="Arrivo"></div></div><div class="field"><label>Km a tratta</label><input name="km_tratta" type="number" step="0.1" value="${tratta||''}" oninput="kmCambiati(this.form)"><label class="manoLbl"><input type="checkbox" name="round_trip" onchange="kmCambiati(this.form)"${v.round_trip?' checked':''}> Andata e ritorno</label><div class="small" id="kmTot">${totaleKmTesto(Number(tratta||0),!!v.round_trip)}</div></div></div>`;
}
function totaleKmTesto(tratta,ar){
  const tot=Number(tratta||0)*(ar?2:1);
  if(!tot)return 'Scrivi i km di una tratta: se torni, spunta «andata e ritorno» e l\u2019app raddoppia.';
  return 'In tutto '+fmtNum(tot,0)+' km'+(ar?' (105 andata + 105 ritorno, per dire)'.replace('105',fmtNum(tratta,0)):'');
}
// Il veicolo PROPONE la sua tariffa. Non la impone: subito sotto si
// corregge, e una volta corretta non viene piu' riscritta.
function veicoloCambiato(form){
  const v=vehicleById(form.vehicle_id&&form.vehicle_id.value);
  if(v&&Number(v.rate_per_km||0)>0&&form.unit_rate)form.unit_rate.value=Number(v.rate_per_km);
  kmCambiati(form);
}
function kmCambiati(form){
  if(!form.km_tratta||!form.quantity)return;
  const tratta=Number(form.km_tratta.value||0);
  const ar=!!(form.round_trip&&form.round_trip.checked);
  form.quantity.value=tratta?Number((tratta*(ar?2:1)).toFixed(2)):'';
  const t=document.getElementById('kmTot');
  if(t)t.textContent=totaleKmTesto(tratta,ar);
  updateExpenseCalc(form);
  aggiornaAvvisoPolicy(form);
}
function campiComeLaTratto(v={},nuova=false){
  return bloccoCampi('Come la tratto','Chi la paga, alla fine',
    `<div class="field"><label>Tipo rimborso</label><select name="reimbursement_type" onchange="aggiornaTracciabilita(this.form)">${reimbTypeOptions(nuova?'own':expType(v))}</select></div>`
    +`<div id="policyBox">${avvisoPolicy(v.client_id||activeClients()[0]?.id||'',v.expense_category_id||'',Number(v.amount||0),Number(v.quantity||0))}</div>`
    +`<div class="field"><label>Come l\u2019hai pagata</label><select name="payment_method" onchange="aggiornaTracciabilita(this.form)">${metodoOptions(v.payment_method||'')}</select><label class="manoLbl"><input type="checkbox" name="receipt_kept" onchange="aggiornaTracciabilita(this.form)"${v.receipt_kept?' checked':''}> La ricevuta ce l\u2019ho e la conservo</label></div>`
    +`<div id="tracciaBox">${notaTracciabilita(v.client_id||activeClients()[0]?.id||'',v.expense_category_id||'',nuova?'own':expType(v),v.payment_method||'',!!v.receipt_kept)}</div>`
    +`<div id="ricevutaCampo">${campoRicevuta(v,nuova)}</div>`
    +`<div class="field"><label>Note</label><textarea name="notes">${esc(v.notes||'')}</textarea></div>`);
}
const NOTA_CALCOLO='Lo calcola l\u2019app: quantit\u00e0 \u00d7 tariffa.';
const NOTA_MANO='Scrivi tu l\u2019importo.';
// Cambiare voce deve aprire o chiudere la coppia quantita'/tariffa:
// prima il campo c'era sempre, anche per un volo, dove non vuol dire
// niente — e il costo unitario a quattro decimali restava li' a far
// pensare che servisse.
function voceSpesaCambiata(form){
  const cat=expenseCategoryById(form.expense_category_id&&form.expense_category_id.value);
  const km=eVoceChilometrica(cat);
  const aQ=aQuantitaTariffa(cat);
  const mostra=(id,cond)=>{const el=document.getElementById(id);if(el)el.hidden=!cond};
  mostra('kmField',km);
  mostra('qtaField',aQ&&!km);
  mostra('rateField',aQ);
  const u=document.getElementById('qtaUnita');
  if(u)u.textContent='('+((cat&&cat.unit_label)||'unit\u00e0')+')';
  const rl=document.getElementById('rateLbl');
  if(rl)rl.textContent=km?'Tariffa \u20ac/km':'Tariffa unitaria';
  if(form.amount_a_mano)form.amount_a_mano.checked=!aQ;
  if(form.amount)form.amount.readOnly=aQ;
  const n=document.getElementById('calcNota');
  if(n)n.textContent=aQ?NOTA_CALCOLO:NOTA_MANO;
  if(km&&form.vehicle_id&&form.vehicle_id.value)veicoloCambiato(form);
  else updateExpenseCalc(form,true);
  aggiornaAvvisoPolicy(form);
  aggiornaTracciabilita(form);
}
function totaleAMano(form){
  const aMano=!!(form.amount_a_mano&&form.amount_a_mano.checked);
  if(form.amount)form.amount.readOnly=!aMano;
  const n=document.getElementById('calcNota');
  if(n)n.textContent=aMano?NOTA_MANO:NOTA_CALCOLO;
  if(!aMano)updateExpenseCalc(form);
  aggiornaAvvisoPolicy(form);
}
function expenseForm(){
  const clients=activeClients();
  if(!clients.length)return appShell(`<h1>Nuova spesa</h1><div class="card">Crea prima un cliente in Impostazioni.</div>`);
  const pre=state.prefill||{};
  const v={trip_id:pre.trip_id||'',client_id:pre.client_id||'',project_id:pre.project_id||''};
  const t=v.trip_id?tripById(v.trip_id):null;
  if(t){
    v.client_id=t.client_id||v.client_id;
    v.project_id=t.project_id||v.project_id;
    v.work_city=t.destination_city||'';
    v.expense_date=tripDa(t)||todayISO();
    v.wbs_id=t.wbs_id||'';
  }
  return appShell(`<h1>Nuova spesa</h1>${t?`<p class="sub">Dentro la trasferta <b>${esc(tripTitolo(t))}</b> · ${esc(tripPeriodo(t))}</p>`:''}<form class="form" onsubmit="saveExpense(event)">${campiQuandoDove(v,true)}${campiCosa(v)}${campiComeLaTratto(v,true)}<div class="actions"><button class="primary" data-busy="Salvataggio…">Salva</button><button type="button" class="secondary" onclick="go('expenses')">Annulla</button></div></form>`);
}
function expenseEdit(){
  const e=data.travelExpenses.find(x=>x.id===state.edit);
  if(!e)return timesheet();
  const t=e.trip_id?tripById(e.trip_id):null;
  return appShell(`<h1>Modifica spesa</h1>${t?`<p class="sub">Dentro la trasferta <b>${esc(tripTitolo(t))}</b> · ${esc(tripPeriodo(t))}</p>`:''}<form class="form" onsubmit="saveExpenseEdit(event)">${campiQuandoDove(e)}${campiCosa(e)}${campiComeLaTratto(e)}<div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary" onclick="duplicateExpense('${e.id}')">Duplica</button><button type="button" class="secondary danger" onclick="deleteExpense('${e.id}')">Elimina</button><button type="button" class="secondary" onclick="go('expenses')">Annulla</button></div></form>`);
}
// Il totale: lo calcola l'app da quantita' x tariffa, ma solo se non
// e' stato corretto a mano. Prima lo riscriveva sempre, quindi una
// correzione a mano veniva cancellata al tocco successivo su quantita'
// o tariffa — senza dire niente.
function updateExpenseCalc(form,proposeType){
  const cat=expenseCategoryById(form.expense_category_id?.value);
  if(!cat)return;
  if(proposeType&&form.reimbursement_type){
    const proposed=clientPolicyType(form.client_id?.value,cat.id)||(cat.reimbursable===false?'own':'invoice');
    if(proposed)form.reimbursement_type.value=proposed;
  }
  if(aQuantitaTariffa(cat)&&form.unit_rate){
    if((!form.unit_rate.value||Number(form.unit_rate.value)===0)&&cat.default_unit_rate)
      form.unit_rate.value=Number(cat.default_unit_rate);
  }
  if(form.amount_a_mano&&form.amount_a_mano.checked)return;
  if(!aQuantitaTariffa(cat))return;
  if(!form.unit_rate||!form.quantity||!form.amount)return;
  const tariffa=Number(form.unit_rate.value||0);
  const quanti=Number(form.quantity.value||0);
  if(tariffa>0)form.amount.value=(quanti*tariffa).toFixed(2);
  // Il conto si deve LEGGERE, non solo avvenire: un numero in una
  // casella grigia non dice da dove viene, e se e' sbagliato non si
  // capisce dove. E la tariffa a zero lascerebbe uno zero muto.
  const n=document.getElementById('calcNota');
  if(!n)return;
  if(tariffa<=0&&quanti>0){
    n.textContent=eVoceChilometrica(cat)
      ? 'Manca la tariffa \u20ac/km: scrivila qui sopra, o scegli un veicolo che ce l\u2019ha.'
      : 'Manca la tariffa: scrivila qui sopra.';
    return;
  }
  if(tariffa>0&&quanti>0){
    const unita=eVoceChilometrica(cat)?'km':((cat.unit_label||'').trim()||'');
    n.textContent=fmtNum(quanti,quanti%1?2:0)+(unita?' '+unita:'')+
      ' \u00d7 '+fmtNum(tariffa,tariffa%1&&(tariffa*100)%1?4:2)+' \u20ac'+(eVoceChilometrica(cat)?'/km':'')+
      ' = '+fmtEUR(quanti*tariffa);
    return;
  }
  n.textContent=NOTA_CALCOLO;
}
// updateExpenseCalc esce presto in molti rami (voce non scelta, totale
// a mano, voce non a quantita'): l'avviso va aggiornato comunque, da
// fuori, altrimenti resta appeso a un importo vecchio.
function aggiornaCalcoloEAvviso(form,proposeType){
  updateExpenseCalc(form,proposeType);
  aggiornaAvvisoPolicy(form);
  aggiornaTracciabilita(form);
}
// Salvare puo' scrivere DUE righe: fino al limite col tipo della
// policy, l'eccedenza a mio carico. Lo si fa solo se chi inserisce lo
// ha spuntato: l'avviso informa, non decide.
const DROP_SPESA=['reimbursement_type','trip_id','wbs_id','vehicle_id','from_place','to_place','round_trip','payment_method','receipt_kept'];
function payloadSpesa(f){
  const rt=f.reimbursement_type||'own';
  const lin=f.wbs_id?wbsLineage(f.wbs_id):null;
  return {expense_date:f.expense_date,client_id:f.client_id,
    project_id:(lin?lin.project.id:f.project_id)||null,wbs_id:f.wbs_id||null,
    expense_category_id:f.expense_category_id,work_city:norm(f.work_city)||null,
    description:f.description||null,
    quantity:Number(f.quantity||0)||null,unit_rate:Number(f.unit_rate||0)||null,
    amount:Number(f.amount||0),reimbursement_type:rt,reimbursable:rt!=='own',
    notes:f.notes||null,trip_id:f.trip_id||null,vehicle_id:f.vehicle_id||null,
    from_place:norm(f.from_place)||null,to_place:norm(f.to_place)||null,
    round_trip:f.round_trip==='on'||f.round_trip===true,
    payment_method:f.payment_method||null,
    receipt_kept:f.receipt_kept==='on'||f.receipt_kept===true};
}
async function saveExpense(ev){
  ev.preventDefault();
  const f=Object.fromEntries(new FormData(ev.target));
  const payload=payloadSpesa(f);
  const spezza=f.spezza==='on'||f.spezza===true;
  const sf=spezza?sforamento(f.client_id,f.expense_category_id,payload.amount,payload.quantity):null;
  if(sf){
    const voce=expenseCategoryName(f.expense_category_id);
    const dentro={...payload,amount:Number(sf.massimo.toFixed(2)),
      description:payload.description||voce,
      notes:[payload.notes,'Entro il limite '+clientName(f.client_id)+' di '+fmtEUR(sf.massimo)].filter(Boolean).join(' \u00b7 ')};
    const fuori={...payload,amount:Number(sf.eccedenza.toFixed(2)),
      reimbursement_type:'own',reimbursable:false,
      quantity:null,unit_rate:null,
      description:(payload.description||voce)+' \u2014 eccedenza oltre il limite',
      notes:[payload.notes,'Eccedenza oltre il limite '+clientName(f.client_id)+' di '+fmtEUR(sf.massimo)].filter(Boolean).join(' \u00b7 ')};
    const a=await insertResilient('travel_expenses',dentro,DROP_SPESA);
    if(a.error)return setMsg('Non si \u00e8 potuta salvare: '+motivoLeggibile(a.error),9000);
    const b=await insertResilient('travel_expenses',fuori,DROP_SPESA);
    if(b.error){
      await reload();
      return setMsg('La parte in fattura \u00e8 stata salvata, l\u2019eccedenza no: '+motivoLeggibile(b.error)+' Aggiungila a mano.',11000);
    }
    await reload();state.view='expenses';render();
    return setMsg('Spezzata in due: '+fmtEUR(sf.massimo)+' in fattura, '+fmtEUR(sf.eccedenza)+' a mio carico.',6000);
  }
  const res=await insertResilient('travel_expenses',payload,DROP_SPESA);
  if(res.error)return setMsg('Non si \u00e8 potuta salvare: '+motivoLeggibile(res.error),9000);
  await reload();state.view='expenses';render();
  const avviso=avvisoScartate(res);
  if(avviso)setMsg(avviso,12000);
}
async function saveExpenseEdit(ev){
  ev.preventDefault();
  const f=Object.fromEntries(new FormData(ev.target));
  const res=await updateResilient('travel_expenses',payloadSpesa(f),state.edit,DROP_SPESA);
  if(res.error)return setMsg('Non si sono potute salvare le modifiche: '+motivoLeggibile(res.error),9000);
  await reload();state.view='expenses';state.edit=null;render();
  const avviso=avvisoScartate(res);
  if(avviso)setMsg(avviso,12000);
}
async function duplicateExpense(idv){const e=data.travelExpenses.find(x=>x.id===idv);if(!e)return;const copy={expense_date:new Date().toISOString().slice(0,10),client_id:e.client_id,project_id:e.project_id,wbs_id:e.wbs_id||null,trip_id:e.trip_id||null,vehicle_id:e.vehicle_id||null,payment_method:e.payment_method||null,receipt_kept:!!e.receipt_kept,receipt_path:null,from_place:e.from_place||null,to_place:e.to_place||null,round_trip:!!e.round_trip,expense_category_id:e.expense_category_id,work_site:e.work_site,work_city:e.work_city,description:e.description,quantity:e.quantity,unit_rate:e.unit_rate,amount:e.amount,reimbursement_type:expType(e),reimbursable:expType(e)!=='own',notes:e.notes};const {error}=await insertResilient('travel_expenses',copy,DROP_SPESA);if(error)return setMsg(error.message,7000);await reload();state.view='expenses';render()}
// Eliminare la spesa deve portarsi via anche la ricevuta: un
// documento fiscale irraggiungibile nel bucket non e' «cancellato», e
// chi elimina la spesa si aspetta che se ne vada tutto.
async function deleteExpense(idv){
  const e=(data.travelExpenses||[]).find(x=>x.id===idv);
  const conFile=!!(e&&e.receipt_path);
  if(!confirm(conFile
    ? 'Eliminare questa spesa di trasferta? Viene cancellata anche la ricevuta allegata.'
    : 'Eliminare questa spesa di trasferta?'))return;
  const {error}=await sb.from('travel_expenses').delete().eq('id',idv);
  if(error)return setMsg(motivoLeggibile(error),7000);
  if(conFile){
    try{
      const r=await sb.storage.from(BUCKET_RICEVUTE).remove([e.receipt_path]);
      if(r&&r.error)throw r.error;
    }catch(err){
      await reload();state.view='timesheet';render();
      return setMsg('Spesa eliminata, ma la ricevuta \u00e8 rimasta nel deposito: '+motivoStorage(err),10000);
    }
  }
  await reload();state.view='timesheet';render();
}

function focusForm(){const f=document.querySelector('.app form.form');if(!f)return;const el=f.querySelector('input,select,textarea');if(!el)return;el.scrollIntoView({block:'center',behavior:'smooth'});setTimeout(()=>el.focus({preventScroll:true}),260)}
function emptyState(text,ctaLabel,ctaAction){return `<div class="empty">${text}<button type="button" class="secondary emptyCta" onclick="${ctaAction}">${ctaLabel}</button></div>`}
function emptyForm(text){return emptyState(text,'\u2191 Vai al modulo','focusForm()')}
function editEntry(id,type){navigateTo(type==='monthly'?'monthlyEdit':type==='manual'?'manualEdit':type==='expense'?'expenseEdit':'dailyEdit',{edit:id})}
function fmtDMY(s){const p=String(s||'').split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(s||'');}
function monthWorkbookFogli(clientId=''){
  // Gli stessi due fogli di prima — Dettaglio e Pivot mese — ma come
  // dati per il generatore .xlsx invece che come XML SpreadsheetML.
  // Il contenuto non cambia: cambia il formato del file, che prima era
  // XML di Excel 2003 travestito da .xls e su Excel mobile non si apriva.
  const [year,mo]=String(state.month).split('-').map(Number);
  const days=new Date(year,mo,0).getDate();
  const rows=rowsForMonth().filter(e=>!clientId||e.client_id===clientId)
    .slice().sort((a,b)=>String(a.entry_date).localeCompare(String(b.entry_date)));
  const prof=(data.profiles||[])[0]||{};
  const uname=[prof.first_name,prof.last_name].filter(Boolean).join(' ')||prof.company_name||'Consulente';
  const monLabel=monthLabel(state.month);
  const palette=['DDEBF7','E2EFDA','FFF2CC','FCE4D6','EDEDED','EAD1DC','D9E1F2','FFE699'];

  // stili ricorrenti, scritti una volta
  const hdr={b:true,fill:'FFC000',align:'center'}, hdrL={b:true,fill:'FFC000'};
  const num={align:'center',fmt:'0.0'}, txt={};
  const totL={b:true,fill:'D9D9D9'}, totN={b:true,fill:'D9D9D9',align:'center',fmt:'0.0'};
  const rigaTot={b:true,fill:'F2F2F2',align:'center',fmt:'0.0'};

  // ── Foglio 1: il dettaglio riga per riga ──
  const det=[[{v:'Data',s:hdrL},{v:'Cliente',s:hdrL},{v:'Progetto',s:hdrL},
              {v:'Attività',s:hdrL},{v:'Sede',s:hdrL},{v:'Descrizione',s:hdrL},
              {v:'Note',s:hdrL},{v:'Ore',s:hdr}]];
  let oreTot=0;
  rows.forEach(e=>{
    const ore=Number(e.hours||0);oreTot+=ore;
    const sede=e.work_location||[e.work_site,e.work_city].filter(Boolean).join(' - ')||'';
    // la data come data vera: cosi' si ordina e si filtra in Excel
    det.push([{v:e.entry_date,t:'d',s:{fmt:'dd/mm/yyyy'}},
      {v:clientName(e.client_id),s:txt},{v:projectName(e.project_id)||'',s:txt},
      {v:activityName(e.activity_id)||'',s:txt},{v:sede,s:txt},
      {v:e.description||'',s:txt},{v:e.notes||'',s:txt},{v:ore,t:'n',s:num}]);
  });
  det.push([{v:'Totale',s:totL},{v:'',s:totL},{v:'',s:totL},{v:'',s:totL},
            {v:'',s:totL},{v:'',s:totL},{v:'',s:totL},{v:oreTot,t:'n',s:totN}]);

  // ── Foglio 2: il pivot del mese ──
  const pv={},order=[],dayTot=new Array(days+1).fill(0);let grand=0;const clientColor={};let ci=0;
  rows.forEach(e=>{
    const cName=clientName(e.client_id);
    const key=cName+' - '+(projectName(e.project_id)||'—')+' - '+(activityName(e.activity_id)||'—');
    if(!pv[key]){pv[key]={d:new Array(days+1).fill(0),tot:0,client:cName};order.push(key)}
    if(!(cName in clientColor)){clientColor[cName]=ci%palette.length;ci++}
    const d=Number(String(e.entry_date).slice(8,10)),h=Number(e.hours||0);
    pv[key].d[d]+=h;pv[key].tot+=h;if(d>=1&&d<=days)dayTot[d]+=h;grand+=h;
  });
  const piv=[[{v:'Attività mese di: '+monLabel+(clientId?' · '+clientName(clientId):''),s:{b:true}}],[{v:uname,s:{b:true}}]];
  const intest=[{v:'Data',s:hdrL}];
  for(let d=1;d<=days;d++)intest.push({v:d,t:'n',s:hdr});
  intest.push({v:'Tot.Ore',s:hdr});
  piv.push(intest);
  order.forEach(key=>{
    const r=pv[key],fill=palette[clientColor[r.client]];
    const riga=[{v:key,s:{b:true,fill}}];
    for(let d=1;d<=days;d++)riga.push(r.d[d]>0?{v:r.d[d],t:'n',s:num}:{v:'',s:txt});
    riga.push({v:r.tot,t:'n',s:rigaTot});
    piv.push(riga);
  });
  const rigaTotale=[{v:'Totale',s:totL}];
  for(let d=1;d<=days;d++)rigaTotale.push(dayTot[d]>0?{v:dayTot[d],t:'n',s:totN}:{v:'',s:totL});
  rigaTotale.push({v:grand,t:'n',s:totN});
  piv.push(rigaTotale);

  // le larghezze sono in caratteri, non in punti come nel formato vecchio
  const colPiv=[30];for(let d=1;d<=days;d++)colPiv.push(4.5);colPiv.push(9);
  return [{nome:'Dettaglio',cols:[11,16,20,17,17,31,26,7],righe:det,blocca:1},
          {nome:'Pivot mese',cols:colPiv,righe:piv,blocca:3}];
}
function monthExcelBlob(clientId=''){return xlsxBlob(monthWorkbookFogli(clientId))}
// Nel nome del file ci va il cliente, perche' il file si manda al
// cliente: se si chiamano tutti uguale, in cartella Download non si
// distingue quello di uno da quello di un altro e si allega il primo.
function nomeFile(t){return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40)||'cliente'}
function monthExcelFilename(clientId=''){
  return 'TOTIME_consuntivi_'+state.month+(clientId?'_'+nomeFile(clientName(clientId)):'')+'.xlsx';
}
// Condividere il mese intero voleva dire mandare a un cliente i
// consuntivi di tutti gli altri. Si esporta un cliente alla volta, e
// chi condivide deve dire quale: senza cliente non si condivide.
function downloadMonthExcel(clientId=''){
  const url=URL.createObjectURL(monthExcelBlob(clientId));
  const a=document.createElement('a');a.href=url;a.download=monthExcelFilename(clientId);
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  setMsg('Excel di '+(clientId?clientName(clientId):'tutti i clienti')+' · '+monthLabel(state.month)+' generato.',3500);
}
async function shareMonthExcel(clientId=''){
  if(!clientId)return setMsg('Scegli il cliente: il file del mese si condivide un cliente alla volta.',5000);
  const nome=clientName(clientId);
  const file=new File([monthExcelBlob(clientId)],monthExcelFilename(clientId),{type:XLSX_MIME});
  try{
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:'Consuntivi '+nome+' · '+monthLabel(state.month),
        text:'Consuntivi '+nome+' · '+monthLabel(state.month)});
      return;
    }
  }catch(err){if(err&&err.name==='AbortError')return;}
  downloadMonthExcel(clientId);
}
function timesheetRows(){return rowsForMonth().map(e=>({...e,kind:'daily',date:e.entry_date})).concat(monthlyRows().map(m=>({...m,kind:'monthly',date:`${m.year}-${String(m.month).padStart(2,'0')}-01`}))).concat(manualRows().map(e=>({...e,kind:'manual',date:e.entry_date}))).concat(expenseRows().map(e=>({...e,kind:'expense',date:e.expense_date}))).sort((a,b)=>String(b.date).localeCompare(String(a.date)))}
// Un mese misto e' una sequenza di righe in cui il cliente si ripete a
// ogni riga senza mai fare somma: per fatturare si ragiona un cliente
// alla volta. L'elenco si spezza in gruppi, uno per cliente, con sopra
// quante voci e quante ore ci sono dentro. Dentro il gruppo l'ordine
// resta quello di prima, dal giorno piu' recente al piu' vecchio.
function oreDiRiga(r){return r.kind==='daily'?Number(r.hours||0):0}
function gruppiCliente(righe){
  const mappa=new Map();
  righe.forEach(r=>{const k=r.client_id||'';if(!mappa.has(k))mappa.set(k,[]);mappa.get(k).push(r)});
  return [...mappa.entries()]
    .map(([client_id,voci])=>({client_id,voci,ore:voci.reduce((n,r)=>n+oreDiRiga(r),0)}))
    .sort((a,b)=>String(clientName(a.client_id)).localeCompare(String(clientName(b.client_id)),'it',{sensitivity:'base'}));
}
// Un cliente con ventidue voci occupa uno schermo e mezzo, e per
// arrivare al cliente sotto si scorre tutto. Il gruppo si chiude
// toccandone la testata: dentro resta il conto — voci, ore, giornate —
// che e' quello che serve quando il dettaglio non serve.
// La scelta si ricorda per cliente, non per mese: chi tiene chiuso un
// cliente lo tiene chiuso sempre, e non deve richiuderlo ogni volta che
// cambia mese.
let chiusiScelta=null;
function clientiChiusi(){
  if(chiusiScelta!==null)return chiusiScelta;
  try{const v=JSON.parse(settingValue('ts_chiusi')||'[]');return Array.isArray(v)?v:[]}
  catch(e){return []}
}
function clienteChiuso(id){return clientiChiusi().includes(id||'')}
async function apriChiudiCliente(id){
  const prima=chiusiScelta;
  const ora=clientiChiusi();
  chiusiScelta=ora.includes(id)?ora.filter(x=>x!==id):ora.concat(id);
  render();
  try{
    const res=await saveSetting('ts_chiusi',JSON.stringify(chiusiScelta));
    if(res&&res.error)throw res.error;
  }catch(e){
    chiusiScelta=prima;
    setMsg('La scelta non si è salvata: '+(e&&e.message||e),5000);
    render();
  }
}
function elencoCliente(g,cercando){
  const std=Number(clientById(g.client_id)?.standard_hours||8)||8;
  const conto=g.voci.length===1?'1 voce':g.voci.length+' voci';
  const ore=g.ore>0?` <span class="dot">·</span> ${fmtNum(g.ore,1)} h <span class="dot">·</span> ${fmtNum(g.ore/std,2)} gg/u`:'';
  const nome=esc(clientName(g.client_id));
  // Cercando, i gruppi si aprono tutti: chi cerca vuole vedere quello
  // che ha trovato, non sapere che da qualche parte, dentro un gruppo
  // chiuso, ci sono tre righe che corrispondono.
  const chiuso=!cercando&&clienteChiuso(g.client_id);
  // I pulsanti stanno qui dentro, non in cima alla pagina: dalla
  // testata del gruppo si vede a colpo d'occhio di chi sono i dati che
  // si sta per mandare fuori. In cima non si vedeva, ed era proprio
  // quello il modo di mandare a un cliente i consuntivi di un altro.
  const azioni=g.client_id?`<span class="cliAzioni">
      <button type="button" class="miniBtn" title="Scarica l'Excel di ${nome}" onclick="downloadMonthExcel('${g.client_id}')">⤓ Excel</button>
      <button type="button" class="miniBtn" title="Condividi i consuntivi di ${nome}" onclick="shareMonthExcel('${g.client_id}')">↗ Condividi</button>
    </span>`:'';
  return `<div class="cliGruppo${chiuso?' chiuso':''}"><div class="cliHead">
      <button type="button" class="cliToggle" aria-expanded="${chiuso?'false':'true'}"
        title="${chiuso?'Apri':'Chiudi'} ${nome}" onclick="apriChiudiCliente('${g.client_id}')">
        <span class="cliChev" aria-hidden="true">${chiuso?'▸':'▾'}</span>
        <b>${nome}</b><span class="cliConto">${conto}${ore}</span></button>${azioni}</div>
    ${chiuso?'':`<div class="list">${g.voci.map(r=>timesheetRow(r)).join('')}</div>`}</div>`;
}
function elencoMensile(filtrate,tutte){
  const cercando=!!normCerca(state.cerca);
  if(filtrate.length)return gruppiCliente(filtrate).map(g=>elencoCliente(g,cercando)).join('');
  const vuoto=tutte.length
    ? `<div class="empty">Nessun consuntivo con &laquo;${esc(state.cerca)}&raquo;.<button type="button" class="secondary emptyCta" onclick="cambiaCerca('')">Svuota la ricerca</button></div>`
    : '<div class="empty">Nessun consuntivo in questo mese.<button type="button" class="secondary emptyCta" onclick="newEntryChoice()">+ Aggiungi il primo consuntivo</button></div>';
  return `<div class="list">${vuoto}</div>`;
}
function timesheet(){const rows=timesheetRows();const t=totals();const groups=groupSummary();const filtrate=filtraRighe(rows);return appShell(`<h1>Timesheet</h1>${monthSelector()}<div class="card"><b>Riepilogo ${monthLabel(state.month)}</b><div class="kpiGrid three" style="margin-top:14px"><div><span>Consuntivate</span><strong>${fmtNum(t.days,2)} gg</strong><small>${fmtNum(t.hours,1)} h</small></div><div><span>Pianificate</span><strong>${fmtNum(t.plannedDays,2)} gg</strong><small>${fmtNum(t.plannedHours,1)} h</small></div><div><span>Totale</span><strong>${fmtNum(t.days+t.plannedDays,2)} gg</strong><small>${fmtNum(t.hours+t.plannedHours,1)} h</small></div></div><div class="metricLine" style="margin-top:12px">${fmtEUR(t.amount)} consuntivato${t.plannedAmount>0?` <span class="dot">·</span> ${fmtEUR(t.plannedAmount)} pianificato <span class="dot">·</span> <b>${fmtEUR(t.amount+t.plannedAmount)}</b> totale`:''}</div><div class="chartWrap"><div class="chartTitle"><span>Andamento mese</span><span>1 → fine mese</span></div>${monthChartSvg()}</div></div><div class="miniActions"><button type="button" class="miniBtn" onclick="go('griglia')" title="Compila tutto il mese in una griglia">Mensile</button><button type="button" class="miniBtn" onclick="go('pivot')" title="Analizza i consuntivi per cliente, progetto, attività">Analisi</button><button type="button" class="miniBtn" onclick="downloadMonthExcel()" title="Scarica l'Excel di tutti i clienti, per archivio">⤓ Excel (tutti)</button></div>${groups.length?`<div class="card"><b>Per cliente</b><div class="list" style="box-shadow:none;margin:10px 0 0">${groups.map(r=>`<div class="row"><div></div><div><div class="title">${esc(clientName(r.client_id))}</div><div class="desc">${esc(projectName(r.project_id)||'Senza progetto')} · ${esc(r.label)}</div></div><div class="value">${fmtEUR(r.amount)}</div></div>`).join('')}</div></div>`:''}<button class="primary" onclick="newEntryChoice()">+ Nuovo consuntivo</button>${rows.length?cercaBox(filtrate.length,rows.length):''}${selBar('timesheet',filtrate.length)}${elencoMensile(filtrate,rows)}`)}
/* ===== Analisi consuntivi (pivot) ===== */
const PIVOT_DIMS=[['client','Cliente'],['project','Cliente / Progetto'],['activity','Attività'],['desc','Descrizione'],['type','Tipo voce'],['site','Sede'],['month','Mese']];
const PIVOT_PRESETS=[['client','project','Cliente › Progetto'],['project','activity','Progetto › Attività'],['activity','desc','Attività › Descrizione'],['client','activity','Cliente › Attività'],['month','client','Mese › Cliente']];
function pivotScope(){return settingValue('pivot_scope')==='year'?'year':'month'}
function pivotDim1(){const v=settingValue('pivot_dim1');return PIVOT_DIMS.some(d=>d[0]===v)?v:'client'}
function pivotDim2(){const v=settingValue('pivot_dim2');return (v==='none'||PIVOT_DIMS.some(d=>d[0]===v))?v:'project'}
function pivotSort(){const v=settingValue('pivot_sort');return ['amount','hours','label'].includes(v)?v:'amount'}
function pivotWithExpenses(){return settingValue('pivot_exp')!=='0'}
async function setPivotSetting(key,val){const r=await saveSetting('pivot_'+key,val);if(r.error)return setMsg(r.error.message,7000);state.pivotClosed=[];await reload();render()}
async function setPivotPreset(d1,d2){const a=await saveSetting('pivot_dim1',d1);if(a.error)return setMsg(a.error.message,7000);const b=await saveSetting('pivot_dim2',d2);if(b.error)return setMsg(b.error.message,7000);state.pivotClosed=[];await reload();render()}
async function togglePivotExpenses(){await setPivotSetting('exp',pivotWithExpenses()?'0':'1')}
function changeYear(n){const [y,m]=String(state.month).split('-').map(Number);state.month=(y+n)+'-'+String(m).padStart(2,'0');render()}
function recSite(e){return [e.work_site,e.work_city].filter(Boolean).join(' - ')||e.work_location||''}
function pivotRecords(){
  const year=currentYear(),scope=pivotScope(),recs=[];
  (scope==='year'?rowsForYear(year):rowsForMonth()).forEach(e=>recs.push({date:String(e.entry_date||''),client_id:e.client_id,project_id:e.project_id,activity_id:e.activity_id,desc:norm(e.description),site:recSite(e),type:isTM(e)?'Time & Material':'Consulenza a ore',hours:Number(e.hours||0),amount:dailyAmount(e),planned:isPlanned(e)}));
  (scope==='year'?monthlyRowsForYear(year):monthlyRows()).forEach(e=>recs.push({date:`${e.year}-${String(e.month).padStart(2,'0')}-01`,client_id:e.client_id,project_id:e.project_id,activity_id:null,desc:norm(e.description),site:'',type:'Compenso mensile',hours:0,amount:Number(e.amount||0),planned:false}));
  (scope==='year'?manualRowsForYear(year):manualRows()).forEach(e=>recs.push({date:String(e.entry_date||''),client_id:e.client_id,project_id:e.project_id,activity_id:e.activity_id,desc:norm(e.description),site:recSite(e),type:'Compenso forfettario',hours:0,amount:Number(e.amount||0),planned:isPlanned(e)}));
  if(pivotWithExpenses())(scope==='year'?expenseRowsForYear(year):expenseRows()).filter(expIsInvoice).forEach(e=>recs.push({date:String(e.expense_date||''),client_id:e.client_id,project_id:e.project_id,activity_id:null,desc:norm(e.description)||expenseCategoryName(e.expense_category_id),site:recSite(e),type:'Rimborso spese',hours:0,amount:Number(e.amount||0),planned:false}));
  return recs;
}
function pivotValue(r,dim){
  if(dim==='client')return clientName(r.client_id)||'Senza cliente';
  if(dim==='project')return `${clientName(r.client_id)||'Senza cliente'} / ${projectName(r.project_id)||'Senza progetto'}`;
  if(dim==='activity')return activityName(r.activity_id)||'Senza attività';
  if(dim==='desc')return r.desc||'Senza descrizione';
  if(dim==='type')return r.type;
  if(dim==='site')return r.site||'Senza sede';
  if(dim==='month')return monthLabel(String(r.date).slice(0,7));
  return '—';
}
function pivotNode(label){return {label,hours:0,amount:0,pHours:0,pAmount:0,hAmt:0,hHrs:0,count:0,children:{},kids:[]}}
function pivotAgg(n,r){if(r.planned){n.pHours+=r.hours;n.pAmount+=r.amount}else{n.hours+=r.hours;n.amount+=r.amount;if(r.hours>0){n.hAmt+=r.amount;n.hHrs+=r.hours}}n.count++}
function pivotSortFn(){const m=pivotSort();const byLabel=(a,b)=>String(a.label).localeCompare(String(b.label),'it',{sensitivity:'base'});
  if(m==='label')return byLabel;
  if(m==='hours')return (a,b)=>(b.hours-a.hours)||(b.amount-a.amount)||byLabel(a,b);
  return (a,b)=>(b.amount-a.amount)||(b.hours-a.hours)||byLabel(a,b);}
function pivotTree(){
  const d1=pivotDim1(),d2=pivotDim2(),root=pivotNode('Totale');
  pivotRecords().forEach(r=>{
    pivotAgg(root,r);
    const k1=pivotValue(r,d1);const n1=root.children[k1]||(root.children[k1]=pivotNode(k1));pivotAgg(n1,r);
    if(d2!=='none'){const k2=pivotValue(r,d2);const n2=n1.children[k2]||(n1.children[k2]=pivotNode(k2));pivotAgg(n2,r);}
  });
  const s=pivotSortFn();
  root.kids=Object.values(root.children).sort(s);
  root.kids.forEach(n=>{n.kids=Object.values(n.children).sort(s)});
  return root;
}
function pivotClosedList(){return Array.isArray(state.pivotClosed)?state.pivotClosed:[]}
function pivotIsOpen(label){return pivotClosedList().indexOf(label)<0}
function pivotToggleGroup(i){const n=pivotTree().kids[i];if(!n)return;const list=pivotClosedList().slice();const j=list.indexOf(n.label);if(j>=0)list.splice(j,1);else list.push(n.label);state.pivotClosed=list;render()}
function pivotExpandAll(open){state.pivotClosed=open?[]:pivotTree().kids.map(n=>n.label);render()}
function pivotPct(n,base,baseH){if(base>0)return n.amount/base*100;if(baseH>0)return n.hours/baseH*100;return 0}
function pivotRowHtml(n,base,baseH,lvl,onclick,chev){
  const pct=pivotPct(n,base,baseH);
  const bits=[];
  if(n.hours>0)bits.push(`${fmtNum(n.hours,1)} h`,`${fmtDays(n.hours)} gg/u`);
  bits.push(n.count===1?'1 voce':`${n.count} voci`);
  if(base>0||baseH>0)bits.push(`${fmtNum(pct,1)}%${lvl===2?' del gruppo':''}`);
  const plan=(n.pAmount>0||n.pHours>0)?` <span class="tag blue">Pianificato ${fmtEUR(n.pAmount)}</span>`:'';
  return `<div class="pvRow lvl${lvl}"${onclick?` onclick="${onclick}"`:''}><div class="pvName">${chev?`<span class="pvChev">${chev}</span>`:''}${esc(n.label)}</div><div class="pvVal">${fmtEUR(n.amount)}</div><div class="pvMeta">${bits.join(' · ')}${plan}</div><div class="pvBar"><i style="width:${Math.max(0,Math.min(100,pct)).toFixed(1)}%"></i></div></div>`;
}
function pivotDimSelect(n,cur){return `<select onchange="setPivotSetting('dim${n}',this.value)">${PIVOT_DIMS.map(d=>`<option value="${d[0]}"${cur===d[0]?' selected':''}>${d[1]}</option>`).join('')}${n===2?`<option value="none"${cur==='none'?' selected':''}>— nessuno —</option>`:''}</select>`}
function pivotDimLabel(d){const h=PIVOT_DIMS.find(x=>x[0]===d);return h?h[1]:'—'}
function pivot(){
  const scope=pivotScope(),d1=pivotDim1(),d2=pivotDim2(),sort=pivotSort();
  const t=pivotTree();
  const period=scope==='year'?String(currentYear()):monthLabel(state.month);
  const selector=scope==='year'
    ?`<div class="month"><button onclick="changeYear(-1)" title="Anno precedente" aria-label="Anno precedente">‹</button><strong>Anno ${currentYear()}</strong><button onclick="changeYear(1)" title="Anno successivo" aria-label="Anno successivo">›</button></div>`
    :monthSelector();
  const scopeTabs=`<div class="tabs"><button type="button" class="${scope==='month'?'active':''}" onclick="setPivotSetting('scope','month')">Mese</button><button type="button" class="${scope==='year'?'active':''}" onclick="setPivotSetting('scope','year')">Anno</button></div>`;
  const presets=`<div class="pvPresets">${PIVOT_PRESETS.map(p=>`<button type="button" class="miniBtn${d1===p[0]&&d2===p[1]?' active':''}" onclick="setPivotPreset('${p[0]}','${p[1]}')">${p[2]}</button>`).join('')}</div>`;
  const sortBtn=(v,l)=>`<button type="button" class="miniBtn${sort===v?' active':''}" onclick="setPivotSetting('sort','${v}')">${l}</button>`;
  const allOpen=pivotClosedList().length===0;
  const body=t.kids.length
    ?`<div class="pivotTable">${t.kids.map((n,i)=>{
        const hasKids=d2!=='none'&&n.kids.length>0;
        const open=pivotIsOpen(n.label);
        const head=pivotRowHtml(n,t.amount,t.hours,1,hasKids?`pivotToggleGroup(${i})`:'',hasKids?(open?'▾':'▸'):'');
        const sub=hasKids&&open?`<div class="pvKids">${n.kids.map(k=>pivotRowHtml(k,n.amount,n.hours,2,'','')).join('')}</div>`:'';
        return `<div class="pvGroup">${head}${sub}</div>`;
      }).join('')}</div>`
    :emptyState('Nessun consuntivo nel periodo selezionato.','+ Registra un consuntivo','newEntryChoice()');
  return appShell(`<h1>Analisi consuntivi</h1><p class="sub">Raggruppa i consuntivi per dimensioni diverse, sul mese o sull'anno.</p>${scopeTabs}${selector}
<div class="card"><b>Totale ${esc(period)}</b><div class="kpiGrid three" style="margin-top:14px"><div><span>Ore</span><strong>${fmtNum(t.hours,1)} h</strong><small>${fmtDays(t.hours)} gg/u</small></div><div><span>Consuntivato</span><strong>${fmtEUR(t.amount)}</strong><small>${t.count===1?'1 voce':t.count+' voci'}</small></div><div><span>Tariffa media</span><strong>${t.hHrs>0?fmtEUR(t.hAmt/t.hHrs):'—'}</strong><small>${t.hHrs>0?'per ora lavorata':'nessuna ora'}</small></div></div>${(t.pAmount>0||t.pHours>0)?`<div class="metricLine" style="margin-top:12px"><span class="tag blue">Pianificato</span> ${fmtNum(t.pHours,1)} h · ${fmtDays(t.pHours)} gg/u · ${fmtEUR(t.pAmount)}</div>`:''}</div>
<div class="card"><b>Raggruppamento</b>${presets}<details class="moreFields"><summary>Dimensioni, ordinamento e opzioni</summary><div class="pvDims"><div class="field"><label>Primo livello</label>${pivotDimSelect(1,d1)}</div><div class="field"><label>Secondo livello</label>${pivotDimSelect(2,d2)}</div></div><div class="pvOpts"><span class="pvOptLabel">Ordina per</span>${sortBtn('amount','Importo')}${sortBtn('hours','Ore')}${sortBtn('label','Nome')}</div><div class="pvOpts"><button type="button" class="miniBtn${pivotWithExpenses()?' active':''}" onclick="togglePivotExpenses()">${pivotWithExpenses()?'☑':'☐'} Includi rimborsi in fattura</button></div></details>${d2!=='none'&&t.kids.length?`<div class="pvOpts"><button type="button" class="miniBtn" onclick="pivotExpandAll(${allOpen?'false':'true'})">${allOpen?'Comprimi tutto':'Espandi tutto'}</button></div>`:''}</div>
<h2>${esc(pivotDimLabel(d1))}${d2!=='none'?' › '+esc(pivotDimLabel(d2)):''}</h2>${body}
<div class="actions"><button type="button" class="secondary" onclick="go('timesheet')">Torna al timesheet</button></div>`);
}
/* ===== Griglia mensile =====
   Una riga per attivita', con sopra cliente e progetto; una colonna per
   giorno. Ogni cella è una voce di timesheet_entries: lo schema non cambia,
   cambia solo il modo di compilarlo. */
function daysInMonth(ymStr){const [y,m]=String(ymStr).split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate()}
function isoOf(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
// La chiave della riga: se la voce ha una WBS quella comanda,
// altrimenti resta il raggruppamento di sempre. Cosi' una griglia
// con voci miste, migrate e no, si legge lo stesso.
function gridKey(e){return e.wbs_id?('w|'+e.wbs_id):[e.client_id||'',e.project_id||'',e.activity_id||''].join('|')}
function gridRows(){
  const map=new Map();
  // Anche il pianificato: sta nella riga della sua commessa ed è una
  // casella modificabile come le altre. Prima era escluso da qui e
  // finiva in una riga a parte di sola lettura, quindi sui giorni
  // futuri si scriveva alla cieca, sopra un valore che non si vedeva.
  rowsForMonth().forEach(e=>{
    const k=gridKey(e);
    if(!map.has(k))map.set(k,{k,client_id:e.client_id,project_id:e.project_id,activity_id:e.activity_id,wbs_id:e.wbs_id||null,hours:{},items:{}});
    const r=map.get(k),d=String(e.entry_date);
    r.hours[d]=(r.hours[d]||0)+Number(e.hours||0);
    (r.items[d]=r.items[d]||[]).push(e);
  });
  (state.gridNew||[]).forEach(r=>{if(!map.has(r.k))map.set(r.k,{...r,hours:{},items:{}})});
  return [...map.values()].sort((a,b)=>
    (clientName(a.client_id)||'').localeCompare(clientName(b.client_id)||'','it')||
    (projectName(a.project_id)||'').localeCompare(projectName(b.project_id)||'','it'));
}
function gridDays(){
  const [y,m]=String(state.month).split('-').map(Number);
  const n=daysInMonth(state.month),t=todayISO(),out=[];
  for(let d=1;d<=n;d++){const iso=isoOf(y,m,d);
    out.push({d,iso,holiday:holidayName(iso),we:isWeekendISO(iso),off:isFerie(iso),ass:assenzaDel(iso),today:iso===t});}
  return out;
}
function gridScope(){
  const v=settingValue('grid_scope');
  if(v==='week'||v==='month')return v;
  return (typeof window!=='undefined'&&window.innerWidth<720)?'week':'month';
}
async function setGridScope(v){const r=await saveSetting('grid_scope',v);if(r.error)return setMsg(r.error.message,7000);await reload();render()}
function gridWeeks(days){
  const out=[];let cur=[];
  for(const d of days){
    const wd=(new Date(d.iso+'T00:00:00Z').getUTCDay()+6)%7; // 0 = lunedi
    if(wd===0&&cur.length){out.push(cur);cur=[]}
    cur.push(d);
  }
  if(cur.length)out.push(cur);
  return out;
}
function gridWeekIndex(weeks){
  if(state.gridWeekOf!==state.month){state.gridWeekOf=state.month;state.gridWeek=null}
  if(state.gridWeek==null){
    const t=todayISO();
    const i=weeks.findIndex(w=>w.some(d=>d.iso===t));
    state.gridWeek=i<0?0:i;
  }
  return Math.max(0,Math.min(weeks.length-1,state.gridWeek));
}
function gridWeekShift(n){const w=gridWeeks(gridDays());state.gridWeek=Math.max(0,Math.min(w.length-1,gridWeekIndex(w)+n));render()}
function gridWeekLabel(w){if(!w||!w.length)return '';const a=w[0],b=w[w.length-1];return a.d===b.d?String(a.d):a.d+'\u2013'+b.d}
function gridDayClass(x){const c=[];if(x.holiday)c.push('festivo');else if(x.we)c.push('we');if(x.off)c.push('assente');if(x.today)c.push('oggi');return c}
function gridDayWhy(x){return [x.holiday||'',(!x.holiday&&x.we)?'weekend':'',x.ass?assenzaLabel(x.ass).toLowerCase():''].filter(Boolean).join(' · ')}
function gridNum(v){return fmtNum(v, Number(v)%1?2:0)}
function griglia(){
  const days=gridDays(),tutte=gridRows();
  const rows=filtraRighe(tutte,r=>[clientName(r.client_id),projectName(r.project_id),
    activityName(r.activity_id),r.wbs_id?wbsLabel(wbsById(r.wbs_id)):''].filter(Boolean).join(' '));
  const wd=['dom','lun','mar','mer','gio','ven','sab'];
  const rowTot=r=>Object.values(r.hours).reduce((t,v)=>t+Number(v||0),0);
  const total=rows.reduce((t,r)=>t+rowTot(r),0);

  const scope=gridScope();
  const weeks=gridWeeks(days);
  const wi=gridWeekIndex(weeks);
  const inWeek=new Set((weeks[wi]||[]).map(d=>d.iso));
  const wk=x=>inWeek.has(x.iso)?' wk':'';
  // Ogni casella è modificabile, senza eccezioni: quello che c'è scritto
  // qui è quello che finirà nel database. Anche i giorni con più voci —
  // prima di sola lettura — si scrivono, e al salvataggio le voci in
  // eccesso vengono unite in una sola invece di restare indietro.
  const cells=r=>days.map(x=>{
    const items=r.items[x.iso]||[],v=Number(r.hours[x.iso]||0),multi=items.length>1;
    const cls=['gg',...gridDayClass(x)];if(v>0)cls.push('pieno');if(multi)cls.push('multi');if(inWeek.has(x.iso))cls.push('wk');
    const why=gridDayWhy(x);
    const nota=[why,
      multi?items.length+' voci in questo giorno: se cambi il valore diventano una sola':''
      ].filter(Boolean).join(' · ');
    const who=`${esc(clientName(r.client_id)||'senza cliente')} giorno ${x.d}`;
    return `<td class="${cls.join(' ')}"${nota?` title="${esc(nota)}"`:''}><input inputmode="decimal" data-row="${esc(r.k)}" data-day="${x.iso}" value="${v>0?esc(String(v)):''}" aria-label="${who}${nota?', '+esc(nota):''}"></td>`;
  }).join('');

  const head=days.map(x=>{
    const c=[x.holiday?'fest':x.we?'we':'',x.today?'oggi':''].filter(Boolean).join(' ');
    return `<th class="gg ${c}${wk(x)}"${x.holiday?` title="${esc(x.holiday)}"`:''}>${wd[new Date(x.iso+'T00:00:00Z').getUTCDay()]}<br>${x.d}</th>`;
  }).join('');

  const assTot=days.reduce((t,x)=>t+Number(x.ass?.h||0),0);
  const foot=days.map(x=>{
    const t=rows.reduce((a,r)=>a+Number(r.hours[x.iso]||0),0)+Number(x.ass?.h||0);
    return `<td class="gg ${gridDayClass(x).join(' ')}${wk(x)}">${t>0?gridNum(t):''}</td>`;
  }).join('');

  // Le assenze sono già segnate a calendario: qui si vedono, non si
  // riscrivono. Tenerle in due posti vorrebbe dire vederle divergere.
  const assRow=assTot>0?`<tr class="assRiga">
      <td class="riga"><div class="n">Assenze</div><div class="d">Ferie, permessi e malattia segnati a calendario</div></td>
      ${days.map(x=>`<td class="gg ${gridDayClass(x).join(' ')}${wk(x)}"><span class="ass"${x.ass?` title="${esc(assenzaLabel(x.ass))}"`:''}>${x.ass?gridNum(x.ass.h):''}</span></td>`).join('')}
      <td class="tot">${gridNum(assTot)}</td></tr>`:'';

  const body=rows.length
    ? rows.map(r=>`<tr>
        <td class="riga">${gridRigaEtichetta(r)}</td>
        ${cells(r)}<td class="tot">${gridNum(rowTot(r))}</td></tr>`).join('')
    : (assRow?'':`<tr><td class="riga vuota" colspan="${days.length+2}">Nessuna commessa in questo mese. Aggiungine una qui sotto.</td></tr>`);

  const opts=(list,empty)=>`<option value="">${empty}</option>`+list.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');

  return appShell(`<h1>Consuntivo mensile</h1>
    <p class="sub">Una riga per attività — con sopra cliente e progetto — e una colonna per giorno, fino a fine mese. Si compila con la tastiera, Tab per il giorno dopo, e si salva una volta sola.</p>
    ${monthSelector()}
    <div class="card grigliaCard" data-scope="${scope}">
      <div class="barra">
        <button type="button" class="miniBtn" onclick="go('timesheet')">☰ Passa all'elenco</button>
        <button type="button" class="primary" onclick="saveGrid()"${state.busy?' disabled':''}>${state.busy?'Salvataggio…':'Salva le modifiche'}</button>
      </div>
      ${tutte.length?`<div class="cercaGriglia">${cercaBox(rows.length,tutte.length)}</div>`:''}
      <div class="scopeNav"><span class="scopeLbl">Vista</span><div class="tabs"><button type="button" class="${scope==='week'?'active':''}" onclick="setGridScope('week')">Settimana</button><button type="button" class="${scope==='month'?'active':''}" onclick="setGridScope('month')">Mese intero</button></div></div>
      <div class="settimanaNav"><button type="button" onclick="gridWeekShift(-1)"${wi===0?' disabled':''} aria-label="Settimana precedente">‹</button><strong>${wi+1}ª settimana<span>${gridWeekLabel(weeks[wi])} ${esc(monthLabel(state.month).split(' ')[0].toLowerCase())}</span></strong><button type="button" onclick="gridWeekShift(1)"${wi>=weeks.length-1?' disabled':''} aria-label="Settimana successiva">›</button></div>
      <div class="scrollGriglia"><table class="griglia">
        <thead><tr><th class="riga">Cliente · Progetto · Attività</th>${head}<th class="tot"><span class="totMese">Mese</span><span class="totTot">Tot</span></th></tr></thead>
        <tbody>${body}${assRow}</tbody>
        <tfoot><tr><td class="riga">Totale giornata</td>${foot}<td class="tot">${gridNum(total+assTot)}</td></tr></tfoot>
      </table></div>
      <div class="nuovaRiga">
        <select id="g-cliente" onchange="gridClienteCambiato()" aria-label="Cliente">${opts(activeClients(),'— cliente —')}</select>
        <select id="g-progetto" onchange="gridProgettoCambiato()" aria-label="Progetto / cliente finale"><option value="">— prima scegli il cliente —</option></select>
        <select id="g-commessa" onchange="gridCommessaCambiata()" aria-label="Commessa"><option value="">— prima scegli il progetto —</option></select>
        <select id="g-wbs" aria-label="Attività della commessa"><option value="">— prima scegli la commessa —</option></select>
        <select id="g-attivita" aria-label="Attività" hidden>${opts(sortEntities('activities',data.activities.filter(a=>a.active)),'— attività —')}</select>
        <button type="button" class="miniBtn" onclick="addGridRow()">+ Aggiungi riga</button>
      </div>
      <div class="calLegend" style="padding:10px 14px">
        <span><i class="sw we"></i>Weekend</span><span><i class="sw holiday"></i>Festivo</span>
        <span><i class="sw ferie"></i>Giorno off</span><span><i class="sw worked"></i>Oggi</span>
      </div>
    </div>
    <div class="metricLine" style="margin-top:12px">${gridNum(total)} h consuntivate <span class="dot">·</span> ${fmtDays(total)} gg/u${assTot>0?` <span class="dot">·</span> <span class="tag ferieTag">Assenze ${gridNum(assTot)} h</span>`:''}</div>`);
}
function gridFillProjects(){const c=document.getElementById('g-cliente')?.value||'';const p=document.getElementById('g-progetto');if(p)p.innerHTML=`<option value="">— progetto —</option>`+sortEntities('projects',data.projects.filter(x=>x.active&&x.client_id===c)).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}
function addGridRow(){
  const c=document.getElementById('g-cliente')?.value||'';
  const p=document.getElementById('g-progetto')?.value||'';
  const a=document.getElementById('g-attivita')?.value||'';
  const w=document.getElementById('g-wbs')?.value||'';
  if(!c)return setMsg('Scegli almeno il cliente.',5000);
  // dove il cliente ha delle commesse, la WBS e' obbligatoria: e'
  // quella che dice su cosa si sta lavorando
  if(wbsReady()&&engagementsOf(c).length&&!w)
    return setMsg('Scegli progetto e commessa.',5000);
  const lin=w?wbsLineage(w):null;
  const k=w?('w|'+w):[c,p,a].join('|');
  state.gridNew=state.gridNew||[];
  if(gridRows().some(r=>r.k===k))return setMsg('Questa riga è già nella griglia.',5000);
  state.gridNew.push({k,client_id:lin?lin.client_id:c,
    project_id:(lin?lin.project.id:p)||null,
    activity_id:(lin&&lin.wbs.activity_id?lin.wbs.activity_id:a)||null,
    wbs_id:w||null});
  render();
}
function gridConfirmRed(dates){
  if(!dates.length)return true;
  const lines=dates.sort().map(iso=>{const w=gridDayWhy({iso,holiday:holidayName(iso),we:isWeekendISO(iso),off:isFerie(iso)});return fmtDMY(iso)+(w?' — '+w:'')});
  return confirm('Stai registrando ore in giorni non lavorativi:\n\n'+lines.join('\n')+'\n\nVuoi procedere?');
}
// Unire più voci di uno stesso giorno in una sola fa perdere le
// descrizioni e le note delle altre: si chiede prima.
function gridConfirmMerge(merged){
  if(!merged.length)return true;
  const righe=merged.map(m=>fmtDMY(m.iso)+' — '+m.chi+' · '+m.n+' voci diventano 1');
  const perse=merged.reduce((t,m)=>t+m.n-1,0);
  return confirm('In questi giorni ci sono più voci per la stessa commessa. Salvando, il valore che hai scritto resta su una sola voce e le altre vengono eliminate:\n\n'
    +righe.join('\n')+'\n\nSi perdono descrizioni e note di '+(perse===1?'1 voce':perse+' voci')+'.\n\nVuoi procedere?');
}
async function saveGrid(){
  const rows=new Map(gridRows().map(r=>[r.k,r]));
  const toCreate=[],toUpdate=[],toDelete=[],merged=[];
  for(const el of document.querySelectorAll('.griglia input:not([disabled])')){
    const r=rows.get(el.dataset.row);if(!r)continue;
    const iso=el.dataset.day,before=Number(r.hours[iso]||0);
    const txt=norm(el.value).replace(',','.');
    const after=txt===''?0:Number(txt);
    if(!Number.isFinite(after)||after<0||after>24)return setMsg('Valore non valido il '+fmtDMY(iso)+': le ore stanno fra 0 e 24.',7000);
    if(after===before)continue;
    const items=r.items[iso]||[];
    if(after===0)toDelete.push(...items.map(e=>e.id));
    else if(!items.length){const c=clientById(r.client_id);
      toCreate.push({entry_date:iso,client_id:r.client_id,project_id:r.project_id||null,activity_id:r.activity_id||null,wbs_id:r.wbs_id||null,hours:after,daily_rate_snapshot:Number(c?.daily_rate||0),standard_hours_snapshot:Number(c?.standard_hours||8)});}
    else{
      // La casella è l'unica verità: la prima voce prende il valore
      // scritto e le altre dello stesso giorno spariscono. Altrimenti
      // la griglia direbbe una cosa e il database ne conterrebbe
      // un'altra, con le voci in eccesso rimaste indietro.
      // La griglia ragiona per WBS e ore, non per stato: quello che si
      // scrive qui è un consuntivo, qualunque sia il giorno.
      const patch={hours:after};
      if(items[0].status==='planned')patch.status=null;
      toUpdate.push({id:items[0].id,iso,patch});
      if(items.length>1){
        toDelete.push(...items.slice(1).map(e=>e.id));
        merged.push({iso,n:items.length,chi:clientName(r.client_id)||'Senza cliente'});
      }}
  }
  const n=toCreate.length+toUpdate.length+toDelete.length;
  if(!n){const pruned=(state.gridNew||[]).length;state.gridNew=[];return setMsg(pruned?'Non c\'era niente da salvare. Tolte '+(pruned===1?'la riga aggiunta e mai compilata.':pruned+' righe aggiunte e mai compilate.'):'Non c\'è niente da salvare.',4000)||render();}
  const red=[...new Set(toCreate.map(e=>e.entry_date).concat(toUpdate.map(u=>u.iso)))]
    .filter(iso=>holidayName(iso)||isFerie(iso)||isWeekendISO(iso));
  if(!gridConfirmRed(red))return;
  if(!gridConfirmMerge(merged))return;
  state.busy=true;render();
  try{
    if(toDelete.length){const {error}=await sb.from('timesheet_entries').delete().in('id',toDelete);if(error)throw error;}
    for(const u of toUpdate){const r=await updateResilient('timesheet_entries',u.patch,u.id);if(r.error)throw r.error;}
    if(toCreate.length){const r=await insertManyResilient('timesheet_entries',toCreate);if(r.error)throw r.error;}
  }catch(e){state.busy=false;return setMsg(e.message||String(e),8000)||render();}
  state.busy=false;state.gridNew=[];
  await reload();
  setMsg('Griglia salvata: '+[toCreate.length?toCreate.length+' aggiunte':'',toUpdate.length?toUpdate.length+' modificate':'',toDelete.length?toDelete.length+' eliminate':''].filter(Boolean).join(', ')+'.',4500);
  render();
}
const SEL_TABLES={daily:'timesheet_entries',monthly:'monthly_compensations',manual:'manual_entries',expense:'travel_expenses'};
function selKey(kind,id){return kind+':'+id}
function isSel(kind,id){return state.sel.indexOf(selKey(kind,id))>=0}
function clearSel(){state.selMode=false;state.sel=[]}
function startSel(){state.selMode=true;state.sel=[];render()}
function cancelSel(){clearSel();render()}
function toggleSel(kind,id){const k=selKey(kind,id);const i=state.sel.indexOf(k);if(i>=0)state.sel.splice(i,1);else state.sel.push(k);render()}
function selScopeRows(scope){return scope==='giorno'?dayRows(state.edit||todayISO()):timesheetRows()}
function toggleSelAll(scope){const rows=selScopeRows(scope);const keys=rows.map(r=>selKey(r.kind,r.id));state.sel=keys.every(k=>state.sel.indexOf(k)>=0)?[]:keys;render()}
function rowAttrs(kind,id){return state.selMode?`class="row selectable${isSel(kind,id)?' selOn':''}" onclick="toggleSel('${kind}','${id}')"`:`class="row" onclick="editEntry('${id}','${kind}')"`}
function selBox(kind,id){return state.selMode?`<span class="selBox${isSel(kind,id)?' on':''}" aria-hidden="true">${isSel(kind,id)?'\u2713':''}</span>`:''}
function selBar(scope,count){
  if(!count)return '';
  if(!state.selMode)return `<div class="selBar"><button type="button" class="miniBtn" onclick="startSel('${scope}')">\u2611 Seleziona voci</button></div>`;
  const n=state.sel.length;
  const all=selScopeRows(scope).every(r=>isSel(r.kind,r.id));
  return `<div class="selBar on"><span class="selCount">${n?n+(n===1?' voce selezionata':' voci selezionate'):'Nessuna voce selezionata'}</span><span class="selActions"><button type="button" class="miniBtn" onclick="toggleSelAll('${scope}')">${all?'Deseleziona tutto':'Seleziona tutto'}</button><button type="button" class="miniBtn danger"${n?'':' disabled'} onclick="deleteSelected()">\ud83d\uddd1 Elimina</button><button type="button" class="miniBtn" onclick="cancelSel()">Annulla</button></span></div>`;
}
async function deleteSelected(){
  const n=state.sel.length;if(!n)return;
  if(!confirm(n===1?'Eliminare la voce selezionata?\n\nL\'operazione non è reversibile.':'Eliminare le '+n+' voci selezionate?\n\nL\'operazione non è reversibile.'))return;
  const byKind={};
  state.sel.forEach(k=>{const i=k.indexOf(':');const kind=k.slice(0,i),id=k.slice(i+1);(byKind[kind]=byKind[kind]||[]).push(id)});
  let done=0;
  for(const kind of Object.keys(byKind)){
    const table=SEL_TABLES[kind];if(!table)continue;
    const {error}=await sb.from(table).delete().in('id',byKind[kind]);
    if(error)return setMsg(error.message,7000);
    done+=byKind[kind].length;
  }
  clearSel();
  await reload();
  setMsg(done===1?'1 voce eliminata.':done+' voci eliminate.',4000);
  render();
}
// Il cliente ora sta nella testata del gruppo: ripeterlo su ogni riga
// riempirebbe la colonna del titolo con la stessa parola dieci volte di
// fila e spingerebbe in coda il progetto, che e' la cosa che cambia.
function titoloRiga(r){return projectName(r.project_id)||'Senza progetto'}
function timesheetRow(r){if(r.kind==='daily')return `<div ${rowAttrs('daily',r.id)}><div class="date">${selBox('daily',r.id)}${dateIT(r.entry_date)}</div><div><div class="title">${esc(titoloRiga(r))}${isTM(r)?' <span class="tag green">T&amp;M</span>':''}${isPlanned(r)?' <span class="tag blue">Pianificato</span>':''}</div><div class="desc">${activityTag(r.activity_id)} ${r.work_site||r.work_city?'· '+esc([r.work_site,r.work_city].filter(Boolean).join(' - ')):''}</div><div class="desc">${esc(r.description||'')}</div>${r.notes?`<div class="desc">Note: ${esc(r.notes)}</div>`:''}</div><div class="value">${fmtNum(r.hours,1)} h</div></div>`;
if(r.kind==='monthly')return `<div ${rowAttrs('monthly',r.id)}><div class="date">${selBox('monthly',r.id)}${String(r.month).padStart(2,'0')}/${r.year}</div><div><div class="title">${esc(titoloRiga(r))}</div><div class="desc">Una tantum mensile</div><div class="desc">${esc(r.description||'')}</div></div><div class="value">Mensile</div></div>`;
if(r.kind==='manual')return `<div ${rowAttrs('manual',r.id)}><div class="date">${selBox('manual',r.id)}${dateIT(r.entry_date)}</div><div><div class="title">${esc(titoloRiga(r))}</div><div class="desc">Forfettario ${activityTag(r.activity_id)} ${r.work_site||r.work_city?'· '+esc([r.work_site,r.work_city].filter(Boolean).join(' - ')):''}</div><div class="desc">${esc(r.description||'')}</div></div><div class="value">Manuale</div></div>`;
return `<div ${rowAttrs('expense',r.id)}><div class="date">${selBox('expense',r.id)}${dateIT(r.expense_date)}</div><div><div class="title">${esc(titoloRiga(r))}</div><div class="desc">Spesa · ${esc(expenseCategoryName(r.expense_category_id))} ${r.work_site||r.work_city?'· '+esc([r.work_site,r.work_city].filter(Boolean).join(' - ')):''}</div><div class="desc">${esc(r.description||'')}</div></div><div class="value">Spesa</div></div>`}

function annualSummaryCard(){const y=currentYear();const at=annualTotals(y);return `<div class="card cardLink" onclick="openAnnualMonths()" role="button" title="Dettaglio consuntivato mese per mese"><b>Annuale ${y} <span class="cardLinkArrow">›</span></b><div class="kpiGrid three" style="margin-top:14px"><div><span>Consuntivato</span><strong>${fmtEUR(at.consuntivato)}</strong></div><div><span>Fatturato</span><strong>${fmtEUR(at.fatturato)}</strong></div><div><span>Incassato</span><strong>${fmtEUR(at.incassato)}</strong></div></div><div class="metricLine" style="margin-top:12px">Da incassare <span class="dot">·</span> ${fmtEUR(at.daIncassare)}</div></div>`}
function billingGroupsByClient(){const lines=groupSummary();const by={};lines.forEach(l=>{if(!by[l.client_id])by[l.client_id]={client_id:l.client_id,lines:[],baseTotal:0,total:0,hours:0,pAmount:0,pHours:0};by[l.client_id].lines.push(l);by[l.client_id].baseTotal+=Number(l.amount||0);by[l.client_id].hours+=Number(l.hours||0);by[l.client_id].pAmount+=Number(l.pAmount||0);by[l.client_id].pHours+=Number(l.pHours||0)});Object.values(by).forEach(g=>{const header=headerForClient(g.client_id)||{};g.calc=billingCalc(g,header);g.total=g.calc.total});return Object.values(by).sort((a,b)=>clientName(a.client_id).localeCompare(clientName(b.client_id)))}
function billingMonthlyView(){const {year,month}=periodParts();const md=annualMonthData(year);const m=md[month-1]||{};const fat=m.fatturato||0;const inc=m.incassato||0;const daInc=Math.max(0,fat-inc);const daFat=Math.max(0,(m.consuntivato||0)-(m.fatturatoBase||0));return `<div class="card"><b>Vista mensile · ${monthLabel(state.month)}</b><div class="kpiGrid" style="margin-top:14px"><div><span>Fatturato mese</span><strong>${fmtEUR(fat)}</strong></div><div><span>Incassato mese</span><strong>${fmtEUR(inc)}</strong></div></div><div class="metricLine" style="margin-top:12px">Da fatturare ${fmtEUR(daFat)} <span class="dot">·</span> Da incassare ${fmtEUR(daInc)}</div></div>`}
function billingAnnualView(){const year=currentYear();const at=annualTotals(year);return `<div class="card"><b>Vista annuale · ${year}</b><div class="kpiGrid" style="margin-top:14px"><div><span>Fatturato anno</span><strong>${fmtEUR(at.fatturato)}</strong></div><div><span>Incassato anno</span><strong>${fmtEUR(at.incassato)}</strong></div></div><div class="metricLine" style="margin-top:12px">Da fatturare ${fmtEUR(at.daFatturare)} <span class="dot">·</span> Da incassare ${fmtEUR(at.daIncassare)}</div><div class="grid" style="margin-top:12px"><button class="secondary" onclick="openAnnualInvoices('issued')">Fatture emesse ›</button><button class="secondary" onclick="openAnnualInvoices('collected')">Incassi ›</button></div></div>`}
function billing(){const groups=billingGroupsByClient();const total=groups.reduce((s,g)=>s+g.total,0);return appShell(`<h1>Fatturazione e incassi</h1>${monthSelector()}<div class="rigaPian"><label><input type="checkbox" ${fatturaPianificato()?'checked':''} onchange="cambiaFatturaPianificato(this.checked)"> Fattura anche il pianificato</label></div><div class="card"><b>Totale fatturazione mese</b><div class="amount" style="margin-top:8px">${fmtEUR(total)}</div><div class="sub">Include eventuale rivalsa INPS 4% e marca da bollo se attive.</div></div><div class="list">${groups.map(g=>{const st=headerStatus(g.client_id);return `<div class="row" onclick="openBillingClient('${g.client_id}')"><div></div><div><div class="title">${esc(clientName(g.client_id))}</div><div class="metricLine">${metricLine(g.hours,g.total)}</div><div class="desc">Base ${fmtEUR(g.calc.subtotal)} · Rivalsa ${fmtEUR(g.calc.inpsAmount)} · Bollo ${fmtEUR(g.calc.stampAmount)}</div><span class="tag ${statusClass(st)}">${statusLabel(st)}</span></div><div class="value">›</div></div>`}).join('')||emptyState('Nessuna riga fatturabile in questo mese.','+ Registra un consuntivo','newEntryChoice()')}</div><h2>Riepilogo</h2>${previsioneRicaviCard()}${billingMonthlyView()}${billingAnnualView()}${forfettarioBarCard()}
    <div class="list"><div class="row" onclick="go('reportEconomico')"><div></div>
      <div><div class="title">Report economico</div>
      <div class="desc">Ricavi, costi e margine, mese per mese.</div></div><div class="chev">›</div></div></div>`)}
function openBillingClient(clientId){navigateTo('billingDetail',{edit:clientId})}
// La descrizione da copiare su Fiscozen diceva «Rimborso spese di
// trasferta - Ottobre 2026 - Omnichannel - Volo»: mancava la DATA e
// mancava l'IMPORTO, cioe' proprio cio' che rende l'addebito ANALITICO.
// Dal 2025 l'addebito analitico e' la condizione perche' il rimborso
// resti fuori dal reddito, e una descrizione generica non la soddisfa:
// un generico «rimborso trasferta: 500 euro» in fattura non qualifica
// il rimborso come analitico.
function expenseFiscoText(e){
  const pezzi=['Rimborso spese di trasferta'];
  pezzi.push(expenseCategoryName(e.expense_category_id));
  if(e.expense_date)pezzi.push(fmtDMY(e.expense_date));
  const perc=percorsoDi(e);
  if(perc)pezzi.push(perc);
  else if(norm(e.work_city))pezzi.push(norm(e.work_city));
  const t=e.trip_id?tripById(e.trip_id):null;
  if(t)pezzi.push('trasferta '+tripTitolo(t)+' '+tripPeriodo(t));
  const proj=projectName(e.project_id)||clientName(e.client_id)||'';
  if(proj)pezzi.push(proj);
  if(norm(e.description))pezzi.push(norm(e.description));
  pezzi.push(fmtEUR(e.amount||0));
  return pezzi.filter(Boolean).join(' \u00b7 ');
}
function billingDetailView(){const clientId=state.edit;const group=billingGroupsByClient().find(g=>g.client_id===clientId);if(!group)return billing();const header=headerForClient(clientId)||{};const st=header.status||'to_invoice';const calc=billingCalc(group,header);const items=[];const piede=[];group.lines.forEach(l=>{
    if(l.type==='expense_report'){
      (l.items||[]).forEach(e=>piede.push({title:expenseCategoryName(e.expense_category_id),desc:(e.description?esc(e.description)+' · ':'')+dateIT(e.expense_date),metric:amountLine(expenseCategoryName(e.expense_category_id),Number(e.amount||0)),fisco:expenseFiscoText(e),amount:Number(e.amount||0)}));
      return;
    }
    if(l.type==='travel_expenses'){(l.items||[]).forEach(e=>items.push({title:expenseCategoryName(e.expense_category_id),desc:'Rimborso in fattura'+(e.work_city?' · '+e.work_city:''),metric:amountLine(expenseCategoryName(e.expense_category_id),Number(e.amount||0)),fisco:expenseFiscoText(e)}))}
    else{items.push({title:projectName(l.project_id)||'Senza progetto',desc:l.label,metric:l.type==='daily_rate_8h'?metricLine(l.hours,l.amount):amountLine(l.label,l.amount),fisco:fiscoText(l)})}});
  const piedeTot=piede.reduce((s,x)=>s+x.amount,0);const inpsText=renderTemplate(invoiceTemplateByCode('RIVALSA_INPS_4'),{type:'manual_entry',client_id:clientId,project_id:null,amount:calc.inpsAmount,hours:0});const bolloText=renderTemplate(invoiceTemplateByCode('MARCA_BOLLO'),{type:'manual_entry',client_id:clientId,project_id:null,amount:calc.stampAmount,hours:0});return appShell(`<h1>${esc(clientName(clientId))}</h1><p class="sub">Fattura ${monthLabel(state.month)}</p><div class="card"><b>Totale cliente</b><div class="amount" style="margin-top:8px">${fmtEUR(calc.total)}</div><div class="metricLine">Base ${fmtEUR(calc.subtotal)} <span class="dot">·</span> Rivalsa ${fmtEUR(calc.inpsAmount)} <span class="dot">·</span> Bollo ${fmtEUR(calc.stampAmount)}</div>${group.pAmount>0?`<div class="metricLine" style="margin-top:6px"><span class="tag blue">Pianificato</span> ${fmtEUR(group.pAmount)} dei ${fmtEUR(calc.subtotal)} di base${group.pHours>0?` <span class="dot">·</span> ${fmtNum(group.pHours/8,2)} gg/u`:''}</div>`:''}<span class="tag ${statusClass(st)}">${statusLabel(st)}</span></div><h2>Righe Fiscozen</h2><div class="list">${items.map((it,i)=>`<div class="row"><div>${i+1}</div><div><div class="title">${esc(it.title)}</div><div class="desc">${esc(it.desc)}</div><div class="metricLine">${it.metric}</div><div class="copybox" id="copy-${i}">${esc(it.fisco)}</div><button class="secondary" onclick="copyText('${esc(it.fisco).replace(/'/g,'&#39;')}')">Copia descrizione</button></div><div></div></div>`).join('')}${calc.inpsEnabled&&calc.inpsAmount>0?`<div class="row"><div>+</div><div><div class="title">Rivalsa INPS ${fmtNum(calc.inpsRate,2)}%</div><div class="metricLine">${fmtEUR(calc.inpsAmount)}</div><div class="copybox">${esc(inpsText)}</div><button class="secondary" onclick="copyText('${esc(inpsText).replace(/'/g,'&#39;')}')">Copia descrizione</button></div><div></div></div>`:''}${calc.stampEnabled&&calc.stampAmount>0?`<div class="row"><div>+</div><div><div class="title">Marca da bollo</div><div class="metricLine">${fmtEUR(calc.stampAmount)}</div><div class="copybox">${esc(bolloText)}</div><button class="secondary" onclick="copyText('${esc(bolloText).replace(/'/g,'&#39;')}')">Copia descrizione</button></div><div></div></div>`:''}</div>${piede.length?`<h2>Spese a piè di lista</h2><p class="sub">Anticipate da te e <b>da chiedere a parte</b>: non entrano nel totale della fattura, che e' e resta ${fmtEUR(calc.total)}. Sono una partita di giro, quindi la descrizione analitica serve comunque.</p><div class="card"><b>Da farsi rimborsare</b><div class="amount" style="margin-top:8px">${fmtEUR(piedeTot)}</div><small class="desc">${piede.length} ${piede.length===1?'spesa':'spese'}</small></div><div class="list">${piede.map((it,i)=>`<div class="row"><div>·</div><div><div class="title">${esc(it.title)}</div><div class="desc">${it.desc}</div><div class="metricLine">${it.metric}</div><div class="copybox" id="pie-${i}">${esc(it.fisco)}</div><button class="secondary" onclick="copyText('${esc(it.fisco).replace(/'/g,'&#39;')}')">Copia descrizione</button></div><div></div></div>`).join('')}</div>`:''}<h2>Dati fattura / incasso</h2><form class="form" onsubmit="saveBillingHeader(event)"><div class="field"><label>Stato</label><select name="status"><option value="to_invoice" ${st==='to_invoice'?'selected':''}>Da fatturare</option><option value="invoice_issued" ${st==='invoice_issued'?'selected':''}>Fattura emessa</option><option value="collected" ${st==='collected'?'selected':''}>Incassato</option><option value="excluded" ${st==='excluded'?'selected':''}>Escluso</option></select></div><div class="field"><label>Rivalsa INPS</label><select name="inps_recharge_enabled"><option value="true" ${calc.inpsEnabled?'selected':''}>Sì</option><option value="false" ${!calc.inpsEnabled?'selected':''}>No</option></select></div><div class="field"><label>Percentuale rivalsa INPS</label><input name="inps_recharge_rate" type="number" step="0.01" value="${Number(calc.inpsRate||4)}"></div><div class="field"><label>Marca da bollo</label><select name="stamp_duty_enabled"><option value="true" ${calc.stampEnabled?'selected':''}>Sì</option><option value="false" ${!calc.stampEnabled?'selected':''}>No</option></select></div><div class="field"><label>Importo bollo</label><input name="stamp_duty_amount" type="number" step="0.01" value="${Number(calc.stampAmount||0)||Number(currentTaxSetting().stamp_duty_amount||2)}"></div><div class="field"><label>Numero fattura</label><input name="invoice_number" value="${esc(header.invoice_number||'')}"></div><div class="field"><label>Data fattura</label><input name="invoice_date" type="date" value="${esc(header.invoice_date||'')}"></div><div class="field"><label>Data incasso</label><input name="collection_date" type="date" value="${esc(header.collection_date||'')}"></div><div class="field"><label>Importo incassato</label><input name="collected_amount" type="number" step="0.01" value="${Number(header.collected_amount||0)}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(header.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva stato fattura</button><button type="button" class="secondary" onclick="go('billing')">Indietro</button></div></form>`)}
async function saveBillingHeader(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const clientId=state.edit;const group=billingGroupsByClient().find(g=>g.client_id===clientId);const {year,month}=periodParts();const tempCalc=billingCalc(group,{inps_recharge_enabled:f.inps_recharge_enabled==='true',inps_recharge_rate:Number(f.inps_recharge_rate||4),stamp_duty_enabled:f.stamp_duty_enabled==='true',stamp_duty_amount:Number(f.stamp_duty_amount||0)});const payload={year,month,client_id:clientId,total_amount:Number(tempCalc.subtotal||0),services_amount:tempCalc.services,expenses_amount:tempCalc.expenses,manual_amount:tempCalc.manual,taxable_base_amount:tempCalc.taxableBase,inps_recharge_enabled:tempCalc.inpsEnabled,inps_recharge_rate:tempCalc.inpsRate,inps_recharge_amount:tempCalc.inpsAmount,stamp_duty_enabled:tempCalc.stampEnabled,stamp_duty_amount:tempCalc.stampAmount,invoice_total_amount:tempCalc.total,status:f.status,invoice_number:norm(f.invoice_number)||null,invoice_date:f.invoice_date||null,collection_date:f.collection_date||null,collected_amount:Number(f.collected_amount||0)||null,notes:f.notes||null};const existing=headerForClient(clientId);let error;if(existing){({error}=await updateResilient('billing_headers',payload,existing.id));}else{({error}=await insertResilient('billing_headers',payload));}if(error)return setMsg(error.message,7000);await reload();state.view='billingDetail';state.edit=clientId;render()}
function copyText(txt){const cleaned=document.createElement('textarea');cleaned.innerHTML=txt;const val=cleaned.value;navigator.clipboard?.writeText(val).then(()=>setMsg('Descrizione copiata.')).catch(()=>prompt('Copia descrizione:',val))}



function parseExcludedMonths(v){
  if(Array.isArray(v)) return v.map(Number).filter(n=>n>=1&&n<=12);
  if(typeof v==='string') return v.split(',').map(x=>Number(x.trim())).filter(n=>n>=1&&n<=12);
  return [];
}
function projectionCalc(year=currentYear()){
  const months=annualMonthData(year).map(x=>Number(x.consuntivato||0));
  const ts=currentTaxSetting(year);
  const now=new Date();
  const selectedIsCurrent=year===now.getFullYear();
  const currentIdx=selectedIsCurrent?now.getMonth():11;
  const activityStart=ts.activity_start_date||DEFAULT_DEFAULT_ACTIVITY_START_DATE;
  const start=new Date(activityStart+'T00:00:00');
  const startIdx=year===start.getFullYear()?start.getMonth():0;
  const excluded=parseExcludedMonths(ts.projection_excluded_months).map(n=>n-1);
  const includeCurrent=ts.projection_include_current_month!==false;
  const lastClosedIdx=selectedIsCurrent?Math.max(startIdx,currentIdx-1):11;
  const closed=[];
  for(let i=startIdx;i<=lastClosedIdx;i++){
    if(!excluded.includes(i) && months[i]) closed.push(months[i]);
  }
  const last3=closed.slice(-3);
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  const avgLast3=avg(last3);
  const avgYear=avg(closed);
  const currentActual=months[currentIdx]||0;
  const currentProjected=currentActual;
  const weightedMonthly=(avgLast3*0.50)+(avgYear*0.30)+(currentProjected*0.20);
  const actualToDate=months.slice(0,currentIdx+1).reduce((a,b)=>a+b,0);
  const closedTotal=closed.reduce((a,b)=>a+b,0);
  let futureMonths=0;
  if(selectedIsCurrent){
    for(let i=currentIdx+1;i<12;i++) if(!excluded.includes(i)) futureMonths++;
  }
  const currentContribution=includeCurrent?currentActual:weightedMonthly;
  const base=(selectedIsCurrent?closedTotal+currentContribution+(weightedMonthly*futureMonths):months.reduce((a,b)=>a+b,0));
  const remaining=Math.max(0,base-actualToDate);
  const prudentFactor=Number(ts.projection_prudent_factor ?? 0.85);
  const optimisticFactor=Number(ts.projection_optimistic_factor ?? 1.10);
  const prudent=actualToDate+(remaining*prudentFactor);
  const optimistic=actualToDate+(remaining*optimisticFactor);
  const limit=Number(ts.annual_revenue_limit||85000);
  const ratio=limit?base/limit:0;
  const low=Number(ts.risk_low_threshold ?? 70)/100;
  const med=Number(ts.risk_medium_threshold ?? 90)/100;
  const high=Number(ts.risk_high_threshold ?? 100)/100;
  const risk=ratio>=high?'Critico':ratio>=med?'Alto':ratio>=low?'Medio':'Basso';
  return {year,actualToDate,avgLast3,avgYear,currentProjected,weightedMonthly,base,prudent,optimistic,limit,ratio,risk,currentMonthLabel:monthNames[currentIdx],startDate:activityStart,excludedMonths:excluded.map(i=>i+1),prudentFactor,optimisticFactor};
}
function projectionCard(){const p=projectionCalc(currentYear());return `<div class="card projectionCard"><b>Proiezione anno ${p.year}</b><div class="desc">Basata sui consuntivi mensili reali: media ponderata 50% ultimi 3 mesi chiusi · 30% media anno · 20% mese corrente (dato reale, senza estrapolazioni). Consuntivato reale ad oggi: ${fmtEUR(p.actualToDate)}. Data avvio attività: ${dateIT(p.startDate)}.${p.excludedMonths.length?' Mesi esclusi: '+p.excludedMonths.join(', ')+'.':''}</div><div class="kpiGrid three" style="margin-top:14px"><div><span>Prudente</span><strong>${fmtEUR(p.prudent)}</strong><small>fattore ${fmtNum(p.prudentFactor*100,0)}%</small></div><div><span>Base</span><strong>${fmtEUR(p.base)}</strong><small>media ponderata</small></div><div><span>Ottimistico</span><strong>${fmtEUR(p.optimistic)}</strong><small>fattore ${fmtNum(p.optimisticFactor*100,0)}%</small></div></div><div class="riskBox"><div><span>Rischio limite forfettario</span><strong class="risk risk-${p.risk.toLowerCase()}">${p.risk}</strong></div><div class="desc">Utilizzo previsto ${fmtNum(p.ratio*100,1)}% su limite ${fmtEUR(p.limit)}, calcolato sui consuntivi reali inseriti.</div></div></div>`}

function tax(){const year=currentYear();const c=annualTaxCalc(year);const ts=c.settings;return appShell(`<div class="screenTitle">Fiscalità</div><p class="sub">Stima regime forfettario per l'anno ${year}. Valori configurabili, da verificare con il consulente fiscale.</p>${projectionCard()}${previsioneTasseCard()}<div class="card"><b>Stima tasse forfettario</b><div class="list" style="box-shadow:none;margin-bottom:0"><div class="row"><div></div><div><div class="title">ATECO ${esc(ts.ateco_code||'')}</div><div class="desc">${esc(ts.ateco_description||'')}</div></div><div></div></div><div class="row"><div></div><div><div class="title">Incassato anno</div><div class="desc">base di calcolo provvisoria</div></div><div class="value">${fmtEUR(c.revenue)}</div></div><div class="row"><div></div><div><div class="title">Reddito forfettario lordo</div><div class="desc">coefficiente ${fmtNum(ts.profitability_coefficient,2)}%</div></div><div class="value">${fmtEUR(c.forfaitIncome)}</div></div><div class="row" onclick="go('taxPayments')"><div></div><div><div class="title">Contributi INPS pagati</div><div class="desc">tocca per gestire i pagamenti fiscali registrati</div></div><div class="value">${fmtEUR(c.paidContrib)}</div></div><div class="row"><div></div><div><div class="title">Imponibile fiscale stimato</div><div class="desc">reddito forfettario - contributi</div></div><div class="value">${fmtEUR(c.taxable)}</div></div><div class="row"><div></div><div><div class="title">Imposta sostitutiva stimata</div><div class="desc">aliquota ${fmtNum(ts.substitute_tax_rate,2)}%</div></div><div class="value">${fmtEUR(c.substituteTax)}</div></div><div class="row"><div></div><div><div class="title">Netto stimato dopo imposta</div><div class="desc">incassato - contributi - imposta</div></div><div class="value">${fmtEUR(c.net)}</div></div></div></div><button class="secondary" style="margin-bottom:12px" onclick="go('tasseFuture')">◷ Tasse future · scadenze previste ›</button><div class="grid"><button class="secondary" onclick="go('taxPayments')">Pagamenti fiscali (INPS) ›</button><button class="secondary" onclick="go('taxSettings')">Configurazione fiscale ›</button></div>`)}
function taxSettings(){const year=currentYear();const c=annualTaxCalc(year);const ts=c.settings;return appShell(`<div class="screenTitle">Configurazione fiscale</div><p class="sub">ATECO, regime, aliquote e parametri della stima. Il cruscotto imposte è nella voce Tassazione.</p><form class="form" onsubmit="saveTaxSettings(event)"><h2>ATECO, regime e tasse</h2><p class="sub">Determinano il calcolo delle tasse sul tuo codice ATECO.</p><div class="field"><label>Anno fiscale</label><input name="fiscal_year" type="number" value="${year}"></div><div class="field"><label>Regime fiscale</label><select name="regime"><option value="forfettario" ${ts.regime==='forfettario'?'selected':''}>Forfettario</option><option value="ordinario" ${ts.regime==='ordinario'?'selected':''}>Ordinario</option><option value="semplificato" ${ts.regime==='semplificato'?'selected':''}>Semplificato</option></select></div><div class="field"><label>Codice ATECO</label><input name="ateco_code" value="${esc(ts.ateco_code||'')}"></div><div class="field"><label>Descrizione ATECO</label><input name="ateco_description" value="${esc(ts.ateco_description||'')}"></div><div class="field"><label>Coefficiente redditività %</label><input name="profitability_coefficient" type="number" step="0.01" value="${Number(ts.profitability_coefficient||67)}"></div><div class="field"><label>Aliquota imposta sostitutiva %</label><input name="substitute_tax_rate" type="number" step="0.01" value="${Number(ts.substitute_tax_rate||5)}"></div><div class="field"><label>Limite ricavi annuo forfettario</label><input name="annual_revenue_limit" type="number" step="0.01" value="${Number(ts.annual_revenue_limit||85000)}"></div><div class="field"><label>Data avvio attività</label><input name="activity_start_date" type="date" value="${esc(ts.activity_start_date||DEFAULT_DEFAULT_ACTIVITY_START_DATE)}"></div><h2>Rimborsi spese e reddito</h2><p class="sub">Dal 1° gennaio 2025 i rimborsi <b>analitici</b> di vitto, alloggio, viaggio e trasporto, pagati con strumenti <b>tracciabili</b> e addebitati voce per voce in fattura, non concorrono al reddito né alla soglia degli 85.000 € (D.Lgs. 192/2024 sull'art. 54 TUIR, tracciabilità dalla L. 207/2024). <b>Sull'applicazione al regime forfettario la dottrina è però divisa</b>: la norma non richiama espressamente la legge 190/2014 e manca un chiarimento. Perciò la scelta è tua, da fare con il commercialista: l'app non la prende per te.</p><div class="card"><div class="themeChoice"><button type="button" class="${rimborsiFuoriReddito()?'':'active'}" onclick="cambiaRimborsiFuoriReddito('no')"><b>Li conto come compensi</b><span>Prudente, ed è quello che l'app ha sempre fatto: i rimborsi entrano nei ricavi e nella stima delle imposte. Nessun numero si muove.</span></button><button type="button" class="${rimborsiFuoriReddito()?'active':''}" onclick="cambiaRimborsiFuoriReddito('si')"><b>Fuori dal reddito, regola 2025</b><span>I rimborsi analitici tracciabili, con ricevuta e già incassati, escono dalla base imponibile della stima. Il rimborso chilometrico resta compenso in ogni caso, perché è forfettario.</span></button></div>${(()=>{const sc=scomposizioneRimborsi(year);if(!sc.totale)return '';return `<div class="metricLine" style="margin-top:14px">Rimborsi in fattura ${year}: <b>${fmtEUR(sc.totale)}</b></div><div class="desc" style="margin-top:6px">di cui <b>${fmtEUR(sc.analitici)}</b> analitici che reggono il requisito${sc.chilometrici?` · <b>${fmtEUR(sc.chilometrici)}</b> chilometrici, compenso comunque`:''}${sc.senzaRequisiti?` · <b>${fmtEUR(sc.senzaRequisiti)}</b> senza i requisiti (contanti, ricevuta mancante o mese non ancora incassato)`:''}.</div>`})()}</div><h2>Rivalsa INPS e marca da bollo</h2><p class="sub">Voci aggiuntive da esporre in fattura oltre al compenso.</p><div class="field"><label>Gestione previdenziale</label><input name="inps_management" value="${esc(ts.inps_management||'gestione_separata')}"></div><div class="field"><label>Aliquota INPS Gestione Separata %</label><input name="inps_gs_rate" type="number" step="0.01" value="${Number(ts.inps_gs_rate??26.07)}"></div><div class="field"><label>Rivalsa INPS</label><select name="inps_recharge_enabled"><option value="true" ${ts.inps_recharge_enabled?'selected':''}>Sì</option><option value="false" ${!ts.inps_recharge_enabled?'selected':''}>No</option></select></div><div class="field"><label>Percentuale rivalsa INPS</label><input name="inps_recharge_rate" type="number" step="0.01" value="${Number(ts.inps_recharge_rate||4)}"></div><div class="field"><label>Marca da bollo</label><select name="stamp_duty_enabled"><option value="true" ${ts.stamp_duty_enabled?'selected':''}>Sì</option><option value="false" ${!ts.stamp_duty_enabled?'selected':''}>No</option></select></div><div class="field"><label>Importo marca da bollo</label><input name="stamp_duty_amount" type="number" step="0.01" value="${Number(ts.stamp_duty_amount||2)}"></div><details class="moreFields"><summary>Proiezione annua (avanzato)</summary><p class="sub">Parametri opzionali per affinare la stima "Prudente / Base / Ottimistico".</p><div class="field"><label>Includi mese corrente nella proiezione</label><select name="projection_include_current_month"><option value="true" ${ts.projection_include_current_month!==false?'selected':''}>Sì</option><option value="false" ${ts.projection_include_current_month===false?'selected':''}>No</option></select></div><div class="field"><label>Mesi esclusi dalla proiezione</label><input name="projection_excluded_months" placeholder="es. 1,8" value="${esc(parseExcludedMonths(ts.projection_excluded_months).join(','))}"></div><div class="field"><label>Fattore scenario prudente</label><input name="projection_prudent_factor" type="number" step="0.01" value="${Number(ts.projection_prudent_factor??0.85)}"></div><div class="field"><label>Fattore scenario ottimistico</label><input name="projection_optimistic_factor" type="number" step="0.01" value="${Number(ts.projection_optimistic_factor??1.10)}"></div><div class="field"><label>Soglia rischio basso %</label><input name="risk_low_threshold" type="number" step="0.01" value="${Number(ts.risk_low_threshold??70)}"></div><div class="field"><label>Soglia rischio medio %</label><input name="risk_medium_threshold" type="number" step="0.01" value="${Number(ts.risk_medium_threshold??90)}"></div><div class="field"><label>Soglia rischio alto %</label><input name="risk_high_threshold" type="number" step="0.01" value="${Number(ts.risk_high_threshold??100)}"></div></details><div class="field"><label>Note</label><textarea name="notes">${esc(ts.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva configurazione fiscale</button><button type="button" class="secondary" onclick="go('settings')">Indietro</button></div></form>`)}
async function saveTaxSettings(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const year=Number(f.fiscal_year||currentYear());const payload={fiscal_year:year,regime:f.regime,ateco_code:norm(f.ateco_code)||null,ateco_description:norm(f.ateco_description)||null,profitability_coefficient:Number(f.profitability_coefficient||0),substitute_tax_rate:Number(f.substitute_tax_rate||0),inps_management:norm(f.inps_management)||null,inps_gs_rate:Number(f.inps_gs_rate||26.07),inps_recharge_enabled:f.inps_recharge_enabled==='true',inps_recharge_rate:Number(f.inps_recharge_rate||0),stamp_duty_enabled:f.stamp_duty_enabled==='true',stamp_duty_amount:Number(f.stamp_duty_amount||0),annual_revenue_limit:Number(f.annual_revenue_limit||0),activity_start_date:f.activity_start_date||null,projection_method:'weighted_average',projection_include_current_month:f.projection_include_current_month==='true',projection_excluded_months:parseExcludedMonths(f.projection_excluded_months),projection_prudent_factor:Number(f.projection_prudent_factor||0.85),projection_optimistic_factor:Number(f.projection_optimistic_factor||1.10),risk_low_threshold:Number(f.risk_low_threshold||70),risk_medium_threshold:Number(f.risk_medium_threshold||90),risk_high_threshold:Number(f.risk_high_threshold||100),notes:f.notes||null};const existing=data.taxSettings.find(t=>Number(t.fiscal_year)===year);let res;if(existing)res=await updateResilient('tax_settings',payload,existing.id);else res=await insertResilient('tax_settings',payload);if(res.error)return setMsg(res.error.message,7000);await reload();state.view='tax';setMsg('Configurazione fiscale aggiornata.',4000)}

function inpsGsCalc(year=currentYear()){
  const ts=currentTaxSetting(year);
  const gsRate=Number(ts.inps_gs_rate??26.07)/100;
  const prevYear=year-1;
  const prevCalc=annualTaxCalc(prevYear);
  const totalDuePrev=prevCalc.forfaitIncome*gsRate;
  const paidPrev=data.taxPayments.filter(p=>Number(p.fiscal_year)===prevYear&&String(p.payment_type||'').toLowerCase().includes('inps')&&p.status==='paid').reduce((s,p)=>s+Number(p.amount||0),0);
  const saldoPrevDue=Math.max(0,totalDuePrev-paidPrev);
  const accontoCurrentDue=totalDuePrev*0.8;
  const paidCurrent=data.taxPayments.filter(p=>Number(p.fiscal_year)===year&&String(p.payment_type||'').toLowerCase().includes('inps')&&p.status==='paid').reduce((s,p)=>s+Number(p.amount||0),0);
  const accontoCurrentRemaining=Math.max(0,accontoCurrentDue-paidCurrent);
  const rata1=accontoCurrentDue*0.5,rata2=accontoCurrentDue*0.5;
  const totalCurrentYearOut=saldoPrevDue+accontoCurrentRemaining;
  const proj=projectionCalc(year);
  const coeff=Number(ts.profitability_coefficient||0)/100;
  const projectedForfaitIncome=proj.base*coeff;
  const nextYearAccontoEstimate=projectedForfaitIncome*gsRate;
  return {year,gsRate,prevYear,totalDuePrev,paidPrev,saldoPrevDue,accontoCurrentDue,paidCurrent,accontoCurrentRemaining,rata1,rata2,totalCurrentYearOut,nextYear:year+1,projectedForfaitIncome,nextYearAccontoEstimate};
}
function inpsGsCard(){const c=inpsGsCalc(currentYear());return `<div class="card"><b>Contributi INPS Gestione Separata</b><div class="desc">Aliquota ${fmtNum(c.gsRate*100,2)}% sul reddito imponibile forfettario. Metodo storico: l'acconto è pari all'80% del contributo dovuto sull'anno precedente, in due rate uguali (30/06 e 30/11). Valori indicativi, da verificare con INPS o il commercialista.</div><div class="list" style="box-shadow:none;margin-top:12px;margin-bottom:0"><div class="row"><div></div><div><div class="title">Saldo ${c.prevYear} da versare</div><div class="desc">dovuto ${fmtEUR(c.totalDuePrev)} · già versato ${fmtEUR(c.paidPrev)} · scadenza 30/06/${c.year}</div></div><div class="value">${fmtEUR(c.saldoPrevDue)}</div></div><div class="row"><div></div><div><div class="title">Acconto ${c.year} residuo</div><div class="desc">dovuto ${fmtEUR(c.accontoCurrentDue)} · già versato ${fmtEUR(c.paidCurrent)} · 1ª rata 50% ${fmtEUR(c.rata1)} (30/06) · 2ª rata 50% ${fmtEUR(c.rata2)} (30/11)</div></div><div class="value">${fmtEUR(c.accontoCurrentRemaining)}</div></div><div class="row"><div></div><div><div class="title">Totale da versare nel ${c.year}</div><div class="desc">saldo ${c.prevYear} + acconto ${c.year} residuo</div></div><div class="value">${fmtEUR(c.totalCurrentYearOut)}</div></div><div class="row"><div></div><div><div class="title">Anticipo stimato ${c.nextYear}</div><div class="desc">stima su proiezione ${c.year} (scenario base): sarà l'acconto da versare nel ${c.nextYear}, da ricalcolare a consuntivo chiuso</div></div><div class="value">${fmtEUR(c.nextYearAccontoEstimate)}</div></div></div></div>`}
function taxPaymentTypeLabel(t){return ({inps:'Contributi INPS',imposta_sostitutiva:'Imposta sostitutiva',acconto_imposta:'Acconto imposta',bollo:'Imposta di bollo',altro:'Altro'})[t]||t||'Pagamento'}
function taxPaymentTypeOptions(selected=''){return ['inps','imposta_sostitutiva','acconto_imposta','bollo','altro'].map(v=>`<option value="${v}" ${v===selected?'selected':''}>${esc(taxPaymentTypeLabel(v))}</option>`).join('')}
function taxPayments(){const year=currentYear();const pre=state.prefill||{};const rows=data.taxPayments.filter(p=>Number(p.fiscal_year)===year).sort((a,b)=>String(b.payment_date||'').localeCompare(String(a.payment_date||'')));const totalPaid=rows.filter(p=>p.status==='paid').reduce((s,p)=>s+Number(p.amount||0),0);return appShell(`<h1>Pagamenti fiscali</h1><p class="sub">Contributi INPS e altri versamenti fiscali per l'anno ${year}. I pagamenti INPS "Pagato" vengono dedotti in Fiscalità dall'imponibile stimato.</p>${inpsGsCard()}<div class="card"><b>Totale pagato ${year}</b><div class="amount" style="margin-top:8px">${fmtEUR(totalPaid)}</div></div><form class="form" onsubmit="addTaxPayment(event)"${pre.payment_type?' id="moduloPagamento"':''}><div class="field"><label>Anno fiscale</label><input name="fiscal_year" type="number" value="${Number(pre.fiscal_year||year)}"></div><div class="field"><label>Tipo pagamento</label><select name="payment_type">${taxPaymentTypeOptions(pre.payment_type||'inps')}</select></div><div class="field"><label>Data pagamento</label><input name="payment_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Importo</label><input name="amount" type="number" step="0.01" value="${Number(pre.amount||0)}"></div><div class="field"><label>Stato</label><select name="status"><option value="paid" ${pre.status!=='planned'?'selected':''}>Pagato</option><option value="planned" ${pre.status==='planned'?'selected':''}>Pianificato</option></select></div><div class="field"><label>Note</label><textarea name="notes">${esc(pre.notes||'')}</textarea></div><button class="primary">${pre.payment_type?'Registra il versamento':'Aggiungi pagamento'}</button></form><div class="list">${rows.map(p=>`<div class="row" onclick="editTaxPayment('${p.id}')"><div></div><div><div class="title">${esc(taxPaymentTypeLabel(p.payment_type))}</div><div class="desc">${dateIT(p.payment_date)} · ${p.status==='paid'?'Pagato':'Pianificato'}</div></div><div class="value">${fmtEUR(p.amount||0)}</div></div>`).join('')||emptyForm('Nessun pagamento registrato per questo anno.')}</div><button type="button" class="secondary" onclick="go('tax')">Indietro</button>`)}
function editTaxPayment(id){navigateTo('taxPaymentEdit',{edit:id})}
function taxPaymentEdit(){const p=data.taxPayments.find(x=>x.id===state.edit);if(!p)return taxPayments();return appShell(`<h1>Modifica pagamento</h1><form class="form" onsubmit="saveTaxPayment(event)"><div class="field"><label>Anno fiscale</label><input name="fiscal_year" type="number" value="${Number(p.fiscal_year||currentYear())}"></div><div class="field"><label>Tipo pagamento</label><select name="payment_type">${taxPaymentTypeOptions(p.payment_type||'inps')}</select></div><div class="field"><label>Data pagamento</label><input name="payment_date" type="date" value="${esc(p.payment_date||'')}"></div><div class="field"><label>Importo</label><input name="amount" type="number" step="0.01" value="${Number(p.amount||0)}"></div><div class="field"><label>Stato</label><select name="status"><option value="paid" ${p.status==='paid'?'selected':''}>Pagato</option><option value="planned" ${p.status==='planned'?'selected':''}>Pianificato</option></select></div><div class="field"><label>Note</label><textarea name="notes">${esc(p.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteTaxPayment('${p.id}')">Elimina</button><button type="button" class="secondary" onclick="go('taxPayments')">Annulla</button></div></form>`)}
async function addTaxPayment(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={fiscal_year:Number(f.fiscal_year||currentYear()),payment_type:f.payment_type,payment_date:f.payment_date||null,amount:Number(f.amount||0),status:f.status,notes:f.notes||null};const {error}=await insertResilient('tax_payments',payload);if(error)return setMsg(error.message,7000);await reload();state.view='taxPayments';render()}
async function saveTaxPayment(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={fiscal_year:Number(f.fiscal_year||currentYear()),payment_type:f.payment_type,payment_date:f.payment_date||null,amount:Number(f.amount||0),status:f.status,notes:f.notes||null};const {error}=await updateResilient('tax_payments',payload,state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='taxPayments';state.edit=null;render()}
async function deleteTaxPayment(idv){if(!confirm('Eliminare questo pagamento fiscale?'))return;const {error}=await sb.from('tax_payments').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='taxPayments';render()}

function costsForYear(year=currentYear()){return data.travelExpenses.filter(e=>String(e.expense_date||'').startsWith(String(year)+'-')&&expIsOwn(e))}
function expensesForYear(year=currentYear()){return data.travelExpenses.filter(e=>String(e.expense_date||'').startsWith(String(year)+'-'))}
function monthBars(vals){const max=Math.max(1,...vals.map(v=>Math.abs(v)));return `<div class="barChart">${vals.map((v,i)=>`<div class="bar ${v<0?'neg':''}" style="height:${Math.max(2,Math.abs(v)/max*100)}%" title="${monthNames[i]}: ${fmtEUR(v)}"></div>`).join('')}</div><div class="barLabels">${monthNames.map(m=>`<span>${m.slice(0,1)}</span>`).join('')}</div>`}
function netMarginByMonth(year){const ts=currentTaxSetting(year);const coeff=Number(ts.profitability_coefficient||0)/100;const gsRate=Number(ts.inps_gs_rate??26.07)/100;const taxRate=Number(ts.substitute_tax_rate||0)/100;return annualMonthData(year).map(m=>{const forfait=m.compensi*coeff;const inps=forfait*gsRate;const imposta=Math.max(0,forfait-inps)*taxRate;return m.compensi-m.costi-inps-imposta})}
function netMarginMonthlyList(year){const vals=netMarginByMonth(year);const md=annualMonthData(year);const rows=vals.map((v,i)=>({i,v})).filter(r=>md[r.i].compensi||md[r.i].costi);if(!rows.length)return '<div class="empty">Nessun dato quest\'anno.</div>';const max=Math.max(1,...rows.map(r=>Math.abs(r.v)));return `<div class="hbars">${rows.map(r=>`<div class="hbar"><div>${monthNames[r.i]}</div><div class="htrack"><div class="hfill" style="width:${Math.max(2,Math.abs(r.v)/max*100)}%${r.v<0?';background:var(--red)':''}"></div></div><div>${fmtEUR(r.v)}</div></div>`).join('')}</div>`}
function balanceMarginBars(year){return monthBars(annualMonthData(year).map(m=>m.compensi-m.costi))}
function homeBalanceCharts(){const year=currentYear();const c=annualTaxCalc(year);const bo=bolloCalc(year);const ex=billingExtras(year);const gsRate=Number(c.settings.inps_gs_rate??26.07)/100;const inpsDovuto=c.forfaitIncome*gsRate;const imposta=c.substituteTax;const margine=(c.compensi+ex.rivalsa)-c.costi-bo.aCarico;const utileNetto=margine-inpsDovuto-imposta;return `<div class="card cardLink" onclick="go('balance')" role="button" title="Apri il Bilancio ${year}"><b>Ripartizione ricavi ${year} <span class="cardLinkArrow">›</span></b><div class="desc" style="margin-top:2px">Dove vanno i ricavi: spese, contributi, imposte, utile netto</div>${balanceCompositionBar(c.costi+bo.aCarico,inpsDovuto,imposta,utileNetto)}</div><div class="card cardLink" onclick="go('balance')" role="button" title="Apri il Bilancio ${year}"><b>Marginalità netta mensile ${year} <span class="cardLinkArrow">›</span></b><div class="desc" style="margin-top:2px">Utile per mese al netto di spese, contributi e imposte</div>${netMarginMonthlyList(year)}</div>`}
const BOLLO_SOGLIA=77.47;
function bolloCalc(year=currentYear()){
  const ts=currentTaxSetting(year);const unit=Number(ts.stamp_duty_amount??2)||2;
  const rows=data.billingHeaders.filter(h=>Number(h.year)===Number(year)&&['invoice_issued','collected'].includes(h.status));
  let nFatture=0,dovuto=0,addebitato=0;const perTrim=[0,0,0,0];
  rows.forEach(h=>{const base=Number(h.total_amount||0);const add=Number(h.stamp_duty_amount||0);addebitato+=add;
    if(base>BOLLO_SOGLIA){nFatture++;dovuto+=unit;const m=Number(h.month||1);perTrim[Math.min(3,Math.floor((m-1)/3))]+=unit;}});
  const aCarico=Math.max(0,dovuto-addebitato);
  return {unit,soglia:BOLLO_SOGLIA,nFatture,dovuto,addebitato,aCarico,perTrim,rows:rows.length};
}
function billingExtras(year=currentYear()){let rivalsa=0,bollo=0;data.billingHeaders.filter(h=>Number(h.year)===Number(year)&&['invoice_issued','collected'].includes(h.status)).forEach(h=>{rivalsa+=Number(h.inps_recharge_amount||0);bollo+=Number(h.stamp_duty_amount||0)});return {rivalsa,bollo}}
function balanceCompositionBar(costi,inps,imposta,utile){const parts=[['Spese a mio carico',Math.max(0,costi),'var(--red)'],['Contributi INPS',Math.max(0,inps),'var(--primary2)'],['Imposta sostitutiva',Math.max(0,imposta),'var(--orange)'],['Utile netto',Math.max(0,utile),'var(--green)']];const tot=parts.reduce((s,p)=>s+p[1],0)||1;return `<div class="segBar">${parts.map(p=>`<span style="width:${p[1]/tot*100}%;background:${p[2]}" title="${p[0]}: ${fmtEUR(p[1])}"></span>`).join('')}</div><div class="segLegend">${parts.map(p=>`<span class="li"><span class="sdot" style="background:${p[2]}"></span>${p[0]} · ${fmtEUR(p[1])}</span>`).join('')}</div>`}
function costsByCategoryData(year){const m={};expenseRowsForYear(year).filter(expIsOwn).forEach(e=>{const n=expenseCategoryName(e.expense_category_id);m[n]=(m[n]||0)+Number(e.amount||0)});return Object.entries(m).map(([name,amount])=>({name,amount})).sort((a,b)=>b.amount-a.amount)}
function costsByCategoryBars(year){const rows=costsByCategoryData(year).slice(0,8);if(!rows.length)return '';const max=Math.max(1,...rows.map(r=>r.amount));return `<div class="hbars">${rows.map(r=>`<div class="hbar"><div>${esc(r.name)}</div><div class="htrack"><div class="hfill" style="width:${Math.max(2,r.amount/max*100)}%"></div></div><div>${fmtEUR(r.amount)}</div></div>`).join('')}</div>`}
const ACCONTO_MIN_IMPOSTA=51.65,ACCONTO_UNICA_SOGLIA=257.52;
function bolloIncassato(year=currentYear()){return data.billingHeaders.filter(h=>Number(h.year)===Number(year)&&h.status==='collected').reduce((s,h)=>s+Number(h.stamp_duty_amount||0),0)}
function taxBaseFor(year,mode){const at=annualTotals(year);const ts=currentTaxSetting(year);
  // Il bollo riaddebitato è anticipazione ex art.15 DPR 633/72: non è ricavo imponibile.
  const bolloInc=bolloIncassato(year);
  const incassatoImponibile=Math.max(0,at.incassato-bolloInc);
  if(mode==='cassa')return {base:incassatoImponibile,parts:[['Incassato imponibile',incassatoImponibile]],bolloEscluso:bolloInc};
  // La parte non ancora fatturata porterà la rivalsa INPS, che è ricavo imponibile.
  const rivRate=(ts.inps_recharge_enabled??true)?Number(ts.inps_recharge_rate??4)/100:0;
  const futuro=(at.daFatturare+(at.pianificato||0))*(1+rivRate);
  const parts=[['Incassato imponibile',incassatoImponibile],['Da incassare',at.daIncassare],['Da fatturare + pianificato',futuro]];
  return {base:parts.reduce((s,p)=>s+p[1],0),parts,bolloEscluso:bolloInc,rivRate};
}
function taxDueFor(year,mode){const ts=currentTaxSetting(year);const {base,parts}=taxBaseFor(year,mode);
  const coeff=Number(ts.profitability_coefficient||0)/100,gsRate=Number(ts.inps_gs_rate??26.07)/100,taxRate=Number(ts.substitute_tax_rate||0)/100;
  const forfait=base*coeff;const inps=forfait*gsRate;
  const paidContrib=data.taxPayments.filter(p=>Number(p.fiscal_year)===Number(year)&&String(p.payment_type||'').toLowerCase().includes('inps')&&p.status==='paid').reduce((s,p)=>s+Number(p.amount||0),0);
  const imposta=Math.max(0,forfait-paidContrib)*taxRate;
  return {ts,base,parts,coeff,gsRate,taxRate,forfait,inps,imposta,paidContrib};
}
function taxScheduleItems(year,mode){
  const d=taxDueFor(year,mode);const N=year+1;const items=[];
  const bo=bolloCalc(year);const trimLabel=['I','II','III','IV'];
  const bolloDue=[[year+'-05-31','I'],[year+'-09-30','II'],[year+'-11-30','III'],[N+'-02-28','IV']];
  const bolloTot=bo.perTrim.reduce((s,v)=>s+v,0);
  if(bolloTot>0){bo.perTrim.forEach((v,i)=>{if(v>0)items.push({date:bolloDue[i][0],label:'Imposta di bollo fatture elettroniche · '+trimLabel[i]+' trimestre',ref:year,amount:v,kind:'bollo'});});}
  const paidInps=d.paidContrib;
  const saldoInps=Math.max(0,d.inps-paidInps);
  if(saldoInps>0)items.push({date:N+'-06-30',label:'Saldo contributi INPS Gestione Separata',ref:year,amount:saldoInps,kind:'inps'});
  const accInps=d.inps*0.8;
  if(accInps>0){items.push({date:N+'-06-30',label:'Primo acconto contributi INPS (80% in 2 rate)',ref:N,amount:accInps/2,kind:'inps'});
    items.push({date:N+'-11-30',label:'Secondo acconto contributi INPS (80% in 2 rate)',ref:N,amount:accInps/2,kind:'inps'});}
  if(d.imposta>0)items.push({date:N+'-06-30',label:'Saldo imposta sostitutiva',ref:year,amount:d.imposta,kind:'imposta'});
  if(d.imposta>ACCONTO_MIN_IMPOSTA){
    if(d.imposta<ACCONTO_UNICA_SOGLIA){items.push({date:N+'-11-30',label:'Acconto imposta sostitutiva (unica rata)',ref:N,amount:d.imposta,kind:'imposta'});}
    else{items.push({date:N+'-06-30',label:'Primo acconto imposta sostitutiva (40%)',ref:N,amount:d.imposta*0.4,kind:'imposta'});
      items.push({date:N+'-11-30',label:'Secondo acconto imposta sostitutiva (60%)',ref:N,amount:d.imposta*0.6,kind:'imposta'});}}
  items.sort((a,b)=>a.date.localeCompare(b.date)||a.label.localeCompare(b.label));
  applicaVersamenti(items,year);
  return {items,total:items.reduce((s,i)=>s+i.amount,0),due:d,bolloTot};
}
// Le scadenze fiscali si guardano in tre modi diversi, e servono tutti
// e tre. Per scadenza — cosa devo pagare, e quando — e' la domanda di
// chi deve pagare, ed e' quella di partenza. Per riferimento — a quale
// anno appartiene quel versamento — e' la domanda di chi deve capire il
// conto. La linea del tempo e' le due cose insieme, a colpo d'occhio.
//
// Prima c'era solo il raggruppamento per riferimento, e dentro quei
// gruppi le date si accavallavano: il «Riferimento 2026» conteneva una
// scadenza del 30/06/2027, e anche il «Riferimento 2027». Scorrendo
// l'elenco non si leggeva in nessun punto l'ordine in cui le cose vanno
// pagate.
// Segnare che una scadenza e' stata pagata.
//
// Si riusa la tabella dei pagamenti fiscali che c'e' gia' — quella dove
// finiscono i contributi INPS — invece di aprirne un'altra: cosi' il
// versamento si ritrova, si corregge e si cancella da «Pagamenti
// fiscali» come tutti gli altri, e il totale dell'anno torna.
//
// Il legame fra il pagamento e la scadenza sta nelle note, in una
// targhetta leggibile: non serve cambiare il database, e chi apre la
// riga in «Pagamenti fiscali» capisce lo stesso di cosa si tratta.
// COME SI SEGNA UN BOLLO PAGATO
//
// Non spuntando la riga: registrando il versamento. E' il modo in cui
// l'app tratta i contributi INPS da sempre — si scrive quanto si e'
// versato, e il dovuto scende da solo — e funziona perche' non dipende
// dal trovare la riga giusta e premerci sopra la cosa giusta.
//
// Quindi: quanto risulta versato di bollo per un anno copre le sue
// scadenze in ordine di data, fino a esaurimento. Chi ha pagato 14 euro
// di bollo vede coperte le scadenze che fanno 14 euro, dalla piu'
// vecchia. Il versamento si scrive da «Pagamenti fiscali», che c'era
// gia' e si puo' correggere e cancellare come tutto il resto.
//
// La targhetta nelle note resta per il pulsante rapido, ma non e' piu'
// l'unico modo: se sparisce, o se il versamento lo si e' scritto a
// mano, i conti tornano lo stesso.
function targhettaScadenza(it){return '[totime:'+it.kind+'|'+it.ref+'|'+it.date+']'}
function pagamentoDi(it){
  const t=targhettaScadenza(it);
  return (data.taxPayments||[]).find(p=>p.status==='paid'&&String(p.notes||'').includes(t))||null;
}
// Il bollo si riconosce dal tipo, oppure dalle note: se il database non
// accetta il tipo «bollo» l'app ripiega su «altro», e la riga va
// riconosciuta lo stesso.
function eVersamentoBollo(p){
  return String(p.payment_type||'')==='bollo'||/bollo/i.test(String(p.notes||''));
}
function versatoBollo(year){
  return (data.taxPayments||[])
    .filter(p=>p.status==='paid'&&Number(p.fiscal_year)===Number(year)&&eVersamentoBollo(p))
    .reduce((s,p)=>s+Number(p.amount||0),0);
}
// Segna «pagate» le scadenze coperte dai versamenti registrati. Si
// lavora sulla lista completa, in ordine di data: cosi' chi versa un
// importo che copre due trimestri li vede coperti tutti e due.
function applicaVersamenti(items,year){
  let residuo=versatoBollo(year);
  items.filter(i=>i.kind==='bollo').sort((a,b)=>String(a.date).localeCompare(String(b.date)))
    .forEach(i=>{
      if(residuo>=Number(i.amount||0)-0.005){residuo-=Number(i.amount||0);i.coperta=true}
    });
  return items;
}
function scadenzaPagata(it){return !!it.coperta||!!pagamentoDi(it)}
const TIPO_PAGAMENTO={bollo:'bollo',inps:'inps',imposta:'imposta_sostitutiva'};
// Un pulsante che puo' non fare niente, in silenzio, e' un guasto per
// chi lo preme: non sa se ha sbagliato mira, se l'app e' lenta, o se
// c'e' un problema vero. Qui ogni strada dice qualcosa, comprese le due
// che prima uscivano zitte: la scadenza gia' segnata, e l'errore che
// arriva come eccezione invece che come oggetto.
// Dalla pagina delle tasse si arriva a registrare il versamento col
// modulo gia' compilato: anno, tipo bollo, importo che resta. Resta un
// modulo normale — si corregge prima di salvare, e poi si ritrova in
// «Pagamenti fiscali» come tutti gli altri.
function registraBollo(year,importo){
  navigateTo('taxPayments',{prefill:{fiscal_year:Number(year),payment_type:'bollo',
    amount:Number(importo)||0,status:'paid',
    notes:'Imposta di bollo fatture elettroniche '+year}});
}
async function segnaPagata(kind,ref,date,amount,label){
  try{
    const it={kind,ref,date};
    if(scadenzaPagata(it))return setMsg('Questa scadenza risulta già segnata pagata.',4000);
    setMsg('Registro il pagamento…',2500);
    const payload={fiscal_year:Number(ref)||currentYear(),
      payment_type:TIPO_PAGAMENTO[kind]||'altro',
      payment_date:todayISO(),amount:Number(amount)||0,status:'paid',
      notes:label+' · scadenza '+dataEstesa(date)+' '+targhettaScadenza(it)};
    let res=await insertResilient('tax_payments',payload);
    // Il tipo «bollo» e' nuovo: se il database non lo accetta, per un
    // vincolo sui valori ammessi, si riprova con «altro», che c'e' da
    // sempre. La targhetta nelle note tiene il legame con la scadenza,
    // quindi non si perde niente.
    if(res.error&&/payment_type|check constraint|violates check/i.test(String(res.error.message||''))){
      res=await insertResilient('tax_payments',{...payload,payment_type:'altro'});
    }
    if(res.error)return setMsg('Non si è potuta registrare: '+motivoLeggibile(res.error),9000);
    await reload();render();
    if(!scadenzaPagata(it))
      return setMsg('Il pagamento è stato scritto ma la scadenza non risulta segnata. Guarda in Pagamenti fiscali.',9000);
    setMsg('Segnata pagata. La trovi in Pagamenti fiscali, dove puoi correggerla.',5000);
  }catch(e){
    setMsg('Non si è potuta registrare: '+motivoLeggibile(e),9000);
  }
}
async function annullaPagata(kind,ref,date){
  const p=pagamentoDi({kind,ref,date});
  if(!p)return setMsg('Per questa scadenza non risulta nessun pagamento registrato.',4000);
  if(!confirm('Togliere il segno di pagato? Il versamento registrato verrà eliminato.'))return;
  const {error}=await sb.from('tax_payments').delete().eq('id',p.id);
  if(error)return setMsg(error.message,7000);
  await reload();render();setMsg('Segno di pagato tolto.',4000);
}
const TASSE_VISTE=[['scadenze','Per scadenza'],['riferimento','Per riferimento'],['tempo','Linea del tempo']];
let vistaTasseScelta=null;
function vistaTasse(){
  const v=vistaTasseScelta!==null?vistaTasseScelta:settingValue('tasse_vista');
  return TASSE_VISTE.some(x=>x[0]===v)?v:'scadenze';
}
async function cambiaVistaTasse(v){
  const prima=vistaTasseScelta;
  vistaTasseScelta=v;
  render();
  try{
    const res=await saveSetting('tasse_vista',v);
    if(res&&res.error)throw res.error;
  }catch(e){
    vistaTasseScelta=prima;
    setMsg('La scelta non si è salvata: '+(e&&e.message||e),5000);
    render();
  }
}
function sceltaVistaTasse(){
  const v=vistaTasse();
  return `<div class="tabs" role="tablist" aria-label="Come guardare le scadenze">${TASSE_VISTE.map(([k,l])=>
    `<button type="button" role="tab" aria-selected="${k===v}" class="${k===v?'active':''}" onclick="cambiaVistaTasse('${k}')">${l}</button>`).join('')}</div>`;
}
const TASSE_TINTA={bollo:'gray',inps:'blue',imposta:'orange'};
// Scaduta vuol dire che quel giorno e' passato: e' la prima cosa da
// sapere guardando un elenco di cose da pagare, e prima non si vedeva.
function statoScadenza(iso,oggi,pagata){
  if(pagata)return {cls:'verde',testo:'pagata'};
  if(String(iso)<oggi)return {cls:'red',testo:'scaduta'};
  return {cls:'orange',testo:'prevista'};
}
function dataEstesa(iso){return dateIT(iso)+'/'+String(iso).slice(0,4)}
function rigaScadenza(it,oggi,conData){
  const pagata=scadenzaPagata(it);
  const st=statoScadenza(it.date,oggi,pagata);
  return `<div class="row${pagata?' vocePagata':''}">
    ${conData?`<div class="date">${dateIT(it.date)}<br><span class="dateYear">${String(it.date).slice(0,4)}</span></div>`:'<div></div>'}
    <div><div class="title">${esc(it.label)}</div>
      <div class="desc"><span class="tag ${st.cls}">${st.testo}</span>
        <span class="tag ${TASSE_TINTA[it.kind]||'gray'}">rif. ${esc(String(it.ref))}</span>
        ${conData?'':'scadenza '+dataEstesa(it.date)}</div>
      <div class="rigaAzione">${bottonePagata(it)}</div></div>
    <div class="value">${fmtEUR(it.amount)}</div></div>`;
}
// Per scadenza: un gruppo per giorno, con quanto si versa quel giorno.
// Chi deve pagare ragiona per bonifico, e in un bonifico ci va il totale
// del giorno, non la singola voce.
function tassePerScadenza(items,oggi){
  const scadute=items.filter(i=>String(i.date)<oggi&&!scadenzaPagata(i));
  const futuri=items.filter(i=>String(i.date)>=oggi);
  const gruppi=perGiorno(futuri).map(([data,its])=>{
    const sub=its.reduce((s,i)=>s+i.amount,0);
    const chiave='s-'+data;
    const aperto=tappeAperte().includes(chiave);
    return `<div class="refGroup"><button type="button" class="refHead refApri" aria-expanded="${aperto}" onclick="apriChiudiTappa('${chiave}')">
        <b>${dataEstesa(data)} <span class="refQuando">${giorniA(data,oggi)}</span></b>
        <span>${fmtEUR(sub)} <span class="tappaChev" aria-hidden="true">${aperto?'\u25be':'\u25b8'}</span></span></button>
      ${aperto?`<div class="list" style="box-shadow:none;margin:0">${its.map(it=>rigaScadenza(it,oggi,false)).join('')}</div>`:''}</div>`;
  }).join('');
  const vuoto=futuri.length?'':'<div class="empty">Nessuna scadenza davanti.</div>';
  return bloccoScadute(scadute,oggi,'s-scadute')+gruppi+vuoto;
}
function tassePerRiferimento(items,oggi){
  const refs=[...new Set(items.map(i=>Number(i.ref)))].sort((a,b)=>a-b);
  return refs.map(rf=>{
    const its=items.filter(i=>Number(i.ref)===rf);
    const sub=its.reduce((s,i)=>s+i.amount,0);
    return `<div class="refGroup"><div class="refHead"><b>Riferimento ${rf}</b><span>${fmtEUR(sub)}</span></div>
      <div class="list" style="box-shadow:none;margin:0">${its.map(it=>rigaScadenza(it,oggi,true)).join('')}</div></div>`;
  }).join('');
}
// La linea del tempo: una colonna di date in ordine, con quanto resta
// da versare man mano. Verticale, perche' su un telefono il tempo che
// scorre in orizzontale non ci sta.
// Una scadenza, una riga. Dentro ci stanno le voci — INPS, imposta,
// bollo, col loro riferimento — e si aprono quando servono. Prima erano
// tutte aperte insieme: cinque scadenze diventavano cinquanta righe, e
// per vedere la terza si scorreva mezzo schermo di roba gia' nota.
// Lo scaduto non si mescola alle altre: sta in una riga sola in cima,
// chiusa. Quello che si guarda aprendo questa pagina e' cosa viene
// adesso, non cosa e' passato.
function tappeAperte(){state.tappe=state.tappe||[];return state.tappe}
function apriChiudiTappa(chiave){
  const a=tappeAperte();const i=a.indexOf(chiave);
  if(i>=0)a.splice(i,1);else a.push(chiave);
  render();
}
// Il pulsante per segnare pagata una voce si costruisce QUI, in un
// posto solo, e tutte le viste chiamano questo. Prima stava dentro la
// voce della linea del tempo: le altre due viste — fra cui quella che
// si apre per prima — non l'hanno mai avuto, e dall'app non c'era modo
// di segnare niente senza passare dalla linea del tempo.
function bottonePagata(it){
  const arg=`'${it.kind}',${Number(it.ref)},'${it.date}'`;
  if(scadenzaPagata(it))
    return `<button type="button" class="miniBtn vocePag" onclick="annullaPagata(${arg})">Non l'ho pagata</button>`;
  const etichetta=esc(String(it.label)).replace(/'/g,'&#39;');
  return `<button type="button" class="miniBtn vocePag" onclick="segnaPagata(${arg},${Number(it.amount)},'${etichetta}')">\u2713 Segna pagata</button>`;
}
function voceScadenza(it){
  const pagata=scadenzaPagata(it);
  return `<li class="${pagata?'vocePagata':''}">
    <span class="tag ${TASSE_TINTA[it.kind]||'gray'}">rif. ${esc(String(it.ref))}</span> ${esc(it.label)} <b>${fmtEUR(it.amount)}</b>
    ${pagata?'<span class="tag verde">pagata</span> ':''}${bottonePagata(it)}
  </li>`;
}
function tappaScadenza(data,its,oggi,chiave,restaDopo){
  const sub=its.reduce((s,i)=>s+i.amount,0);
  const daPagare=its.filter(i=>!scadenzaPagata(i));
  const tuttePagate=!daPagare.length;
  const passata=!tuttePagate&&String(data)<oggi;
  const aperta=tappeAperte().includes(chiave);
  const quante=its.length===1?'1 voce':its.length+' voci';
  return `<li class="tappa ${passata?'passata':''}${tuttePagate?' pagata':''}${aperta?' aperta':''}">
    <div class="tappaData"><b>${dataEstesa(data)}</b><span>${tuttePagate?'<span class="tag verde">pagata</span>':giorniA(data,oggi)}</span></div>
    <div class="tappaCorpo">
      <button type="button" class="tappaBtn" aria-expanded="${aperta}"
        onclick="apriChiudiTappa('${chiave}')">
        <span class="tappaTot">${fmtEUR(sub)}</span>
        <span class="tappaQuante">${quante}</span>
        <span class="tappaChev" aria-hidden="true">${aperta?'\u25be':'\u25b8'}</span></button>
      ${aperta?`<ul class="tappaVoci">${its.map(voceScadenza).join('')}</ul>
        ${restaDopo!==null?`<div class="tappaResta">dopo questo versamento restano ${fmtEUR(restaDopo)}</div>`:''}`:''}
    </div></li>`;
}
function perGiorno(items){
  const g=new Map();
  items.forEach(it=>{if(!g.has(it.date))g.set(it.date,[]);g.get(it.date).push(it)});
  return [...g.entries()];
}
// Lo scaduto, tutto insieme, in una riga che si apre
function bloccoScadute(scadute,oggi,chiave){
  if(!scadute.length)return '';
  const tot=scadute.reduce((s,i)=>s+i.amount,0);
  const aperto=tappeAperte().includes(chiave);
  return `<div class="scadutoBlocco${aperto?' aperto':''}">
    <button type="button" class="scadutoBtn" aria-expanded="${aperto}" onclick="apriChiudiTappa('${chiave}')">
      <span class="tag red">Già scadute</span>
      <span class="scadutoConto">${scadute.length===1?'1 voce':scadute.length+' voci'}</span>
      <span class="scadutoTot">${fmtEUR(tot)}</span>
      <span class="tappaChev" aria-hidden="true">${aperto?'\u25be':'\u25b8'}</span></button>
    ${aperto?`<ul class="tappaVoci scadutoVoci">${perGiorno(scadute).map(([d,its])=>
      `<li class="scadutoGiorno"><b>${dataEstesa(d)}</b> <span>${giorniA(d,oggi)}</span></li>`+
      its.map(voceScadenza).join('')).join('')}</ul>`:''}
  </div>`;
}
function tasseLineaDelTempo(items,oggi){
  const scadute=items.filter(i=>String(i.date)<oggi&&!scadenzaPagata(i));
  const futuri=items.filter(i=>String(i.date)>=oggi);
  let restante=futuri.filter(i=>!scadenzaPagata(i)).reduce((s,i)=>s+i.amount,0);
  const tappe=perGiorno(futuri).map(([data,its])=>{
    const sub=its.filter(i=>!scadenzaPagata(i)).reduce((s,i)=>s+i.amount,0);
    const riga=tappaScadenza(data,its,oggi,'t-'+data,Math.max(0,restante-sub));
    restante-=sub;
    return riga;
  }).join('');
  const vuoto=futuri.length?'':`<li class="tappa adesso"><div class="tappaData"><b>nessuna</b><span>scadenza davanti</span></div>
    <div class="tappaCorpo"><div class="tappaQui">non c'è niente da versare da qui in avanti</div></div></li>`;
  return bloccoScadute(scadute,oggi,'t-scadute')+`<ol class="lineaTempo">${tappe}${vuoto}</ol>`;
}
// Quanto mettere da parte ogni mese per arrivarci senza sorprese: e'
// la domanda vera di chi ha partita IVA, e il conto l'app ce l'ha gia'
// tutto in mano. Si guarda solo il futuro: lo scaduto va pagato, non
// accantonato.
function accantonamento(items,oggi){
  const futuri=items.filter(i=>String(i.date)>=oggi&&!scadenzaPagata(i));
  if(!futuri.length)return null;
  const ultima=futuri[futuri.length-1].date;
  const tot=futuri.reduce((s,i)=>s+i.amount,0);
  const a=new Date(ultima+'T00:00:00'),b=new Date(oggi+'T00:00:00');
  const mesi=Math.max(1,Math.round((a-b)/86400000/30.44));
  return {tot,mesi,mese:tot/mesi,ultima};
}
// Quanto manca, detto come lo direbbe una persona
function giorniA(iso,oggi){
  const a=new Date(iso+'T00:00:00'),b=new Date(oggi+'T00:00:00');
  const g=Math.round((a-b)/86400000);
  if(g===0)return 'oggi';
  if(g===1)return 'domani';
  if(g===-1)return 'ieri';
  if(g<0)return 'passata da '+Math.abs(g)+' giorni';
  if(g<60)return 'fra '+g+' giorni';
  const m=Math.round(g/30.44);
  return 'fra circa '+m+(m===1?' mese':' mesi');
}
function taxScheduleCard(year,mode,title,desc){
  const r=taxScheduleItems(year,mode);const d=r.due;
  const oggi=todayISO();
  const vista=vistaTasse();
  // «Da versare» e' quello che resta davvero da versare: cio' che hai
  // gia' segnato pagato non e' piu' un debito, e il pagato dell'anno si
  // dice a parte, se no il totale sembra sbagliato
  const pagate=r.items.filter(scadenzaPagata);
  const somPagate=pagate.reduce((s,i)=>s+i.amount,0);
  const daVersare=r.total-somPagate;
  const corpo=!r.items.length?'<div class="empty">Nessuna scadenza prevista.</div>'
    :vista==='riferimento'?tassePerRiferimento(r.items,oggi)
    :vista==='tempo'?tasseLineaDelTempo(r.items,oggi)
    :tassePerScadenza(r.items,oggi);
  const scadute=r.items.filter(i=>String(i.date)<oggi&&!scadenzaPagata(i));
  const prossima=r.items.find(i=>String(i.date)>=oggi&&!scadenzaPagata(i));
  return `<div class="card"><b>${title}</b><div class="desc" style="margin-top:2px">${desc}</div>
    <div class="kpiGrid three" style="margin-top:14px"><div><span>Base</span><strong>${fmtEUR(d.base)}</strong></div><div><span>Imponibile</span><strong>${fmtEUR(d.forfait)}</strong></div><div><span>Da versare</span><strong>${fmtEUR(daVersare)}</strong></div></div>
    <div class="metricLine" style="margin-top:8px">${d.parts.map(p=>esc(p[0])+' '+fmtEUR(p[1])).join(' <span class="dot">·</span> ')}</div>
    ${prossima?`<div class="metricLine" style="margin-top:10px"><span class="tag orange">Prossima</span> ${dataEstesa(prossima.date)} <span class="dot">·</span> ${giorniA(prossima.date,oggi)} <span class="dot">·</span> <b>${fmtEUR(r.items.filter(i=>i.date===prossima.date&&!scadenzaPagata(i)).reduce((s,i)=>s+i.amount,0))}</b></div>`:''}
    ${pagate.length?`<div class="metricLine" style="margin-top:6px"><span class="tag verde">Già pagate</span> ${pagate.length===1?'1 voce':pagate.length+' voci'} <span class="dot">·</span> ${fmtEUR(somPagate)}</div>`:''}
    ${(()=>{const b=r.items.filter(i=>i.kind==='bollo');if(!b.length)return '';
      const versato=versatoBollo(year);const dovuto=b.reduce((s,i)=>s+i.amount,0);
      const resta=Math.max(0,dovuto-versato);
      return `<div class="calc" style="margin-top:12px">
        <b>Imposta di bollo ${year}</b>
        <div class="metricLine" style="margin-top:8px">Dovuta ${fmtEUR(dovuto)} <span class="dot">·</span> versata ${fmtEUR(versato)}${resta>0?` <span class="dot">·</span> <b>resta ${fmtEUR(resta)}</b>`:' <span class="tag verde">tutto versato</span>'}</div>
        <div class="small" style="margin-top:8px">Il bollo si paga sul portale <b>Fatture e Corrispettivi</b> dell'Agenzia delle Entrate, che lo calcola da sé. Quando l'hai versato, registralo qui: le scadenze si scalano da sole, dalla più vecchia.</div>
        <button type="button" class="secondary" style="margin-top:12px" onclick="registraBollo(${year},${resta>0?resta.toFixed(2):dovuto.toFixed(2)})">Ho versato il bollo</button>
        <button type="button" class="secondary" style="margin-top:8px" onclick="go('taxPayments')">Vedi tutti i versamenti</button></div>`;})()}

    ${(()=>{const acc=accantonamento(r.items,oggi);return acc?`<div class="salvadanaio"><div class="salvaCifra">${fmtEUR(acc.mese)}<span>al mese</span></div>
      <div class="salvaTesto">per arrivare a ${dataEstesa(acc.ultima)} con ${fmtEUR(acc.tot)} da parte.
      Sono ${acc.mesi===1?'poco più di un mese':acc.mesi+' mesi'} da oggi.</div></div>`:''})()}
    ${r.items.length?sceltaVistaTasse():''}${corpo}</div>`;
}
function tasseFuture(){const year=currentYear();return appShell(`<h1>Tasse future ${year}</h1><p class="sub">Scadenze previste per contributi, imposta sostitutiva e bollo. Regime forfettario, base cassa. Stime indicative da verificare col commercialista.</p>${taxScheduleCard(year,'cassa','Prospetto A · solo incassato reale','Calcolato solo su quanto realmente incassato ad oggi. È il dato prudenziale.')}${taxScheduleCard(year,'previsione','Prospetto B · incassato + previsione',"Include anche da incassare, da fatturare e pianificato: quanto dovrai versare se tutto verrà incassato nell'anno.")}<details class="card moreFields"><summary>Note di calcolo e regole applicate</summary><div class="desc" style="margin-top:6px">· Contributi INPS Gestione Separata: acconto pari all'80% del dovuto, in due rate uguali (30/06 e 30/11).<br>· Imposta sostitutiva: acconto 100% del dovuto (40% + 60%); nessun acconto sotto ${fmtEUR(ACCONTO_MIN_IMPOSTA)}, unica rata a novembre sotto ${fmtEUR(ACCONTO_UNICA_SOGLIA)}.<br>· Imposta di bollo: ${fmtEUR(bolloCalc(year).unit)} per fattura sopra ${fmtEUR(BOLLO_SOGLIA)}, versamento trimestrale.<br>· L'imposta sostitutiva è calcolata al netto dei contributi INPS <b>effettivamente versati</b>.<br>· Base imponibile: compensi, rimborsi spese addebitati in fattura e rivalsa INPS <b>concorrono</b> al reddito; la marca da bollo riaddebitata è esclusa (anticipazione art. 15 DPR 633/72).<br>· Nel prospetto B la parte non ancora fatturata è maggiorata della rivalsa INPS, che sarà anch'essa ricavo imponibile.</div></details><div class="actions"><button type="button" class="secondary" onclick="go('tax')">Torna a Fiscalità</button></div>`)}
function forecastCalc(year=currentYear()){
  const ts=currentTaxSetting(year);const at=annualTotals(year);
  const coeff=Number(ts.profitability_coefficient||0)/100;const gsRate=Number(ts.inps_gs_rate??26.07)/100;const taxRate=Number(ts.substitute_tax_rate||0)/100;
  const consuntivato=at.consuntivato,pianificato=at.pianificato||0;const ricavi=consuntivato+pianificato;
  const forfait=ricavi*coeff;const inps=forfait*gsRate;const imposta=Math.max(0,forfait-inps)*taxRate;
  const costi=(at.costi||0)+bolloCalc(year).aCarico;const oneri=inps+imposta;const utileNetto=ricavi-costi-oneri;
  return {ts,consuntivato,pianificato,ricavi,forfait,inps,imposta,oneri,costi,utileNetto,fatturato:at.fatturato,fatturatoBase:at.fatturatoBase,daFatturare:at.daFatturare,limit:Number(ts.annual_revenue_limit||85000),coeff,gsRate,taxRate};
}
function previsioneRicaviCard(){const year=currentYear();const f=forecastCalc(year);if(f.pianificato<=0&&f.daFatturare<=0)return '';return `<div class="card"><b>Previsione ricavi ${year}</b><div class="desc" style="margin-top:2px">Consuntivato maturato + giorni pianificati futuri.</div><div class="kpiGrid three" style="margin-top:14px"><div><span>Consuntivato</span><strong>${fmtEUR(f.consuntivato)}</strong></div><div><span>Pianificato</span><strong>${fmtEUR(f.pianificato)}</strong></div><div><span>Previsione</span><strong>${fmtEUR(f.ricavi)}</strong></div></div><div class="metricLine" style="margin-top:10px">Già fatturato ${fmtEUR(f.fatturatoBase)} <span class="dot">·</span> Da fatturare ${fmtEUR(f.daFatturare)} <span class="dot">·</span> <span class="tag blue">Pianificato</span> ${fmtEUR(f.pianificato)}</div></div>`;}
function previsioneTasseCard(){const year=currentYear();const f=forecastCalc(year);if(f.ricavi<=0)return '';return `<div class="card"><b>Previsione imposte e contributi ${year}</b><div class="desc" style="margin-top:2px">Stima su base consuntivato + pianificato (competenza), coeff. ${fmtNum(f.coeff*100,0)}%. Le imposte effettive sono su base cassa (incassato).</div><div class="list" style="box-shadow:none;margin:12px 0 0"><div class="row"><div></div><div><div class="title">Base previsione (ricavi)</div><div class="desc">consuntivato ${fmtEUR(f.consuntivato)} + pianificato ${fmtEUR(f.pianificato)}</div></div><div class="value">${fmtEUR(f.ricavi)}</div></div><div class="row"><div></div><div><div class="title">Reddito forfettario</div><div class="desc">coeff. ${fmtNum(f.coeff*100,0)}%</div></div><div class="value">${fmtEUR(f.forfait)}</div></div><div class="row"><div></div><div><div class="title" style="color:var(--red)">− Contributi INPS ${fmtNum(f.gsRate*100,2)}%</div></div><div class="value" style="color:var(--red)">${fmtEUR(f.inps)}</div></div><div class="row"><div></div><div><div class="title" style="color:var(--red)">− Imposta sostitutiva ${fmtNum(f.taxRate*100,0)}%</div></div><div class="value" style="color:var(--red)">${fmtEUR(f.imposta)}</div></div><div class="row"><div></div><div><div class="title"><b>= Totale imposte e contributi previsti</b></div></div><div class="value"><b>${fmtEUR(f.oneri)}</b></div></div></div></div>`;}
function previsioneBilancioCard(){const year=currentYear();const f=forecastCalc(year);if(f.pianificato<=0)return '';return `<div class="card"><b>Previsione bilancio ${year}</b><div class="desc" style="margin-top:2px">Conto economico proiettato con ricavi = consuntivato + pianificato. Stima gestionale.</div><div class="list" style="box-shadow:none;margin:12px 0 0"><div class="row"><div></div><div><div class="title">Ricavi previsti</div><div class="desc">consuntivato + pianificato</div></div><div class="value">${fmtEUR(f.ricavi)}</div></div><div class="row"><div></div><div><div class="title" style="color:var(--red)">− Spese a mio carico</div></div><div class="value" style="color:var(--red)">${fmtEUR(f.costi)}</div></div><div class="row"><div></div><div><div class="title" style="color:var(--red)">− Imposte e contributi previsti</div></div><div class="value" style="color:var(--red)">${fmtEUR(f.oneri)}</div></div><div class="row"><div></div><div><div class="title"><b>= Utile netto previsto</b></div></div><div class="value"><b>${fmtEUR(f.utileNetto)}</b></div></div></div></div>`;}
function balFull(){return settingValue('bal_full')==='1'}
async function toggleBalFull(){const r=await saveSetting('bal_full',balFull()?'0':'1');if(r.error)return setMsg(r.error.message,7000);await reload();render()}
function balance(){const year=currentYear();const c=annualTaxCalc(year);const at=c;const ex=billingExtras(year);const gsRate=Number(c.settings.inps_gs_rate??26.07)/100;const inpsDovuto=c.forfaitIncome*gsRate;const imposta=c.substituteTax;const bo=bolloCalc(year);const totRicavi=at.compensi+at.rimborsiFattura+ex.rivalsa+ex.bollo;const totCosti=at.costi+at.rimborsiFattura+ex.bollo+bo.aCarico;const margine=totRicavi-totCosti;const oneri=inpsDovuto+imposta;const utileNetto=margine-oneri;return appShell(`<h1>Bilancio ${year}</h1><p class="sub">Conto economico completo: ricavi, costi, imposte e contributi. Rimborsi spese e bolli sono partite di giro (ricavo = costo).</p>
${balFull()?`
<div class="card"><b>Ricavi ${year}</b><div class="list" style="box-shadow:none;margin:12px 0 0"><div class="row"><div></div><div><div class="title">Compensi professionali</div><div class="desc">consulenze, consuntivato del lavoro</div></div><div class="value">${fmtEUR(at.compensi)}</div></div><div class="row"><div></div><div><div class="title">Rivalsa INPS addebitata</div><div class="desc">4% riaddebitato al cliente in fattura</div></div><div class="value">${fmtEUR(ex.rivalsa)}</div></div><div class="row"><div></div><div><div class="title">Rimborsi spese in fattura</div><div class="desc">spese riaddebitate al cliente</div></div><div class="value">${fmtEUR(at.rimborsiFattura)}</div></div><div class="row"><div></div><div><div class="title">Marca da bollo addebitata</div><div class="desc">bolli riaddebitati in fattura</div></div><div class="value">${fmtEUR(ex.bollo)}</div></div><div class="row"><div></div><div><div class="title"><b>= Totale ricavi</b></div><div class="desc">fatturato dell'anno</div></div><div class="value"><b>${fmtEUR(totRicavi)}</b></div></div></div></div>
<div class="card"><b>Costi ${year}</b><div class="list" style="box-shadow:none;margin:12px 0 0"><div class="row" onclick="go('expenses')"><div></div><div><div class="title" style="color:var(--red)">− Spese a mio carico</div><div class="desc">spese non rimborsate</div></div><div class="value" style="color:var(--red)">${fmtEUR(at.costi)}</div></div><div class="row"><div></div><div><div class="title">− Spese anticipate rimborsate</div><div class="desc">costo sostenuto e riaddebitato · partita di giro</div></div><div class="value">${fmtEUR(at.rimborsiFattura)}</div></div><div class="row" onclick="go('tax')"><div></div><div><div class="title" style="color:var(--red)">− Marca da bollo a mio carico</div><div class="desc">${bo.nFatture} fatture sopra ${fmtEUR(bo.soglia)} × ${fmtEUR(bo.unit)} · dovuta ${fmtEUR(bo.dovuto)}, non riaddebitata al cliente</div></div><div class="value" style="color:var(--red)">${fmtEUR(bo.aCarico)}</div></div><div class="row"><div></div><div><div class="title">− Marca da bollo pagata</div><div class="desc">bolli versati · partita di giro</div></div><div class="value">${fmtEUR(ex.bollo)}</div></div><div class="row"><div></div><div><div class="title"><b>= Totale costi</b></div><div class="desc">costi dell'anno</div></div><div class="value"><b>${fmtEUR(totCosti)}</b></div></div></div></div>
<div class="card"><b>Margine operativo ${year}</b><div class="amount" style="margin-top:8px">${fmtEUR(margine)}</div><div class="desc">Ricavi − costi. Rimborsi e bolli si compensano: resta compensi + rivalsa INPS − spese a mio carico.</div></div>
`:''}<div class="card"><b>Dove vanno i ricavi ${year}</b><div class="desc" style="margin-top:2px">Ripartizione tra spese, contributi, imposte e utile netto</div>${balanceCompositionBar(at.costi+bo.aCarico,inpsDovuto,imposta,utileNetto)}</div>
<div class="card"><b>Rimborsi ${year} (partite di giro)</b><div class="statRow" style="margin-top:14px"><div class="stat tint-blue"><div class="statHead"><span class="statDot"></span><span class="statLbl">Rimborsi in fattura</span></div><strong>${fmtEUR(at.rimborsiFattura)}</strong></div><div class="stat tint-sage"><div class="statHead"><span class="statDot"></span><span class="statLbl">Piè di lista</span></div><strong>${fmtEUR(at.pieDiLista)}</strong></div></div><div class="metricLine" style="margin-top:12px">Fatturato ${fmtEUR(at.fatturato)} <span class="dot">·</span> Incassato ${fmtEUR(at.incassato)}</div></div>
<div class="card"><b>Imposte e contributi ${year} (stima)</b><div class="desc" style="margin-top:2px">Regime forfettario · calcolo su base cassa (incassato). Da verificare col commercialista.</div><div class="list" style="box-shadow:none;margin:12px 0 0"><div class="row" onclick="go('taxPayments')"><div></div><div><div class="title" style="color:var(--red)">− Contributi INPS Gestione Separata</div><div class="desc">${fmtNum(gsRate*100,2)}% sul reddito forfettario · versati ${fmtEUR(c.paidContrib)}</div></div><div class="value" style="color:var(--red)">${fmtEUR(inpsDovuto)}</div></div><div class="row" onclick="go('tax')"><div></div><div><div class="title" style="color:var(--red)">− Imposta sostitutiva</div><div class="desc">aliquota ${fmtNum(c.settings.substitute_tax_rate,0)}% su reddito forfettario netto contributi</div></div><div class="value" style="color:var(--red)">${fmtEUR(imposta)}</div></div><div class="row"><div></div><div><div class="title"><b>= Totale imposte e contributi</b></div></div><div class="value"><b>${fmtEUR(oneri)}</b></div></div></div></div>
<div class="card"><b>Utile netto stimato ${year}</b><div class="amount" style="margin-top:8px">${fmtEUR(utileNetto)}</div><div class="desc">Margine operativo − imposte − contributi. Stima gestionale, non sostituisce il commercialista. Dettaglio e proiezione in Tassazione ›</div></div>${previsioneBilancioCard()}
${costsByCategoryBars(year)?`<div class="card"><b>Costi a mio carico per voce ${year}</b>${costsByCategoryBars(year)}</div>`:''}<div class="card"><b>Margine mensile ${year}</b><div class="desc" style="margin-top:2px">Compensi − costi a mio carico, mese per mese</div>${balanceMarginBars(year)}</div><h2>Andamento mensile ${year}</h2><div class="list">${annualMonthData(year).filter(m=>m.compensi||m.costi||m.rimborsiFattura||m.pieDiLista).map(m=>`<div class="row" onclick="openMonthExpenses(${year},${m.month})"><div class="date">${m.label}</div><div><div class="title">${monthNames[m.month-1]}</div><div class="desc">Compensi ${fmtEUR(m.compensi)} · Costi ${fmtEUR(m.costi)}</div></div><div class="value">${fmtEUR(m.compensi-m.costi)}</div></div>`).join('')||`<div class="empty">Nessun dato nel ${year}.</div>`}</div><button type="button" class="secondary dashToggle" onclick="toggleBalFull()">${balFull()?'▴ Nascondi dettaglio ricavi e costi':'▾ Mostra dettaglio ricavi e costi'}</button>`)}
function openMonthExpenses(year,month){state.month=`${year}-${String(month).padStart(2,'0')}`;navigateTo('expenses')}
function expenseTypeTag(e){const t=expType(e);const cls=t==='own'?'orange':t==='invoice'?'blue':'green';return `<span class="tag ${cls}">${reimbLabel(t)}</span>`}
// ─── Pagina Spese: due viste ────────────────────────────────────────
// «Per trasferta» raggruppa, «Tutte le spese» e' l'elenco per giorno
// di sempre: chi cerca la lista piatta la trova dov'e' sempre stata.
const SPESE_VISTE=[['trasferte','Per trasferta'],['tutte','Tutte le spese']];
let vistaSpeseScelta=null;
function vistaSpese(){
  if(!trasferteReady())return 'tutte';
  const v=vistaSpeseScelta!==null?vistaSpeseScelta:settingValue('spese_vista');
  return SPESE_VISTE.some(x=>x[0]===v)?v:'trasferte';
}
async function cambiaVistaSpese(v){
  const prima=vistaSpeseScelta;
  vistaSpeseScelta=v;
  render();
  try{
    const res=await saveSetting('spese_vista',v);
    if(res&&res.error)throw res.error;
  }catch(e){
    vistaSpeseScelta=prima;
    setMsg('La scelta non si è salvata: '+motivoLeggibile(e),5000);
    render();
  }
}
function sceltaVistaSpese(){
  const v=vistaSpese();
  return `<div class="tabs" role="tablist" aria-label="Come guardare le spese">${SPESE_VISTE.map(([k,l])=>
    `<button type="button" role="tab" aria-selected="${k===v}" class="${k===v?'active':''}" onclick="cambiaVistaSpese('${k}')">${l}</button>`).join('')}</div>`;
}

// Le trasferte si aprono tutte: in un mese sono poche, e una scheda
// chiusa che nasconde l'unica spesa del mese non aiuta nessuno.
function trasfertaChiusa(id){return (state.trasferteChiuse||[]).includes(id)}
function apriChiudiTrasferta(id){
  state.trasferteChiuse=state.trasferteChiuse||[];
  state.trasferteChiuse=trasfertaChiusa(id)?state.trasferteChiuse.filter(x=>x!==id):state.trasferteChiuse.concat([id]);
  render();
}

// La riga di una chilometrica diceva solo «Rimborso KM 94,50 €»: ora
// dice il tragitto, cosi' due righe identiche si distinguono.
function dettaglioSpesa(e){
  const perc=percorsoDi(e);
  const pezzi=[dateIT(e.expense_date)];
  if(perc)pezzi.push(perc);
  if(e.description)pezzi.push(esc(e.description));
  if(e.project_id)pezzi.push(esc(projectName(e.project_id)));
  return pezzi.join(' · ');
}
function tagDaSistemare(e){
  if(!spesaDaSistemare(e))return '';
  const perche=e.payment_method&&!metodoTracciabile(e.payment_method)?'non tracciabile':'senza ricevuta';
  return ` <span class="tag orange tagManca" title="Da sistemare: ${perche}">${perche}</span>`;
}
function rigaSpesa(e){
  return `<div class="row" onclick="editEntry('${e.id}','expense')"><div></div><div><div class="title">${esc(expenseCategoryName(e.expense_category_id))} ${expenseTypeTag(e)}${tagDaSistemare(e)}</div><div class="desc">${dettaglioSpesa(e)}</div></div><div class="value">${fmtEUR(e.amount||0)}</div></div>`;
}

// Due nature diverse nella stessa trasferta: il volo e' un rimborso
// analitico, i chilometri sono forfettari e restano compenso. L'app non
// lo diceva, e sono trattamenti fiscali opposti.
function naturaTrasferta(spese){
  const righe=(spese||[]).filter(expIsInvoice);
  if(!righe.length)return '';
  const km=righe.filter(spesaChilometrica).reduce((s,e)=>s+Number(e.amount||0),0);
  const an=righe.filter(e=>!spesaChilometrica(e)).reduce((s,e)=>s+Number(e.amount||0),0);
  if(!km||!an)return '';
  return `<div class="desc" style="margin-top:5px">di cui <b>${fmtEUR(an)}</b> analitici <span class="dot">\u00b7</span> <b>${fmtEUR(km)}</b> chilometrici, che restano compenso perch\u00e9 forfettari</div>`;
}
function schedaTrasferta(t){
  const spese=tripSpese(t.id).slice().sort((a,b)=>String(a.expense_date).localeCompare(String(b.expense_date)));
  const tot=spese.reduce((s,e)=>s+Number(e.amount||0),0);
  const daRiadd=spese.filter(e=>!expIsOwn(e)).reduce((s,e)=>s+Number(e.amount||0),0);
  const mio=spese.filter(expIsOwn).reduce((s,e)=>s+Number(e.amount||0),0);
  const chiusa=trasfertaChiusa(t.id);
  return `<div class="cliGruppo trip"><div class="cliHead"><button type="button" class="cliToggle" aria-expanded="${!chiusa}" onclick="apriChiudiTrasferta('${t.id}')"><span class="cliChev">${chiusa?'▸':'▾'}</span><span><b>${esc(tripTitolo(t))}</b><small>${esc(tripPeriodo(t))}${t.client_id?' · '+esc(clientName(t.client_id)):''} · ${spese.length} ${spese.length===1?'spesa':'spese'}</small></span></button><div class="cliAzioni"><span class="tag ${tripStatoClass(t.status)}">${tripStatoLabel(t.status)}</span><span class="tripTot">${fmtEUR(tot)}</span></div></div>${chiusa?'':`<div class="tripCorpo"><div class="tripRighe">${spese.map(rigaSpesa).join('')||'<div class="empty">Nessuna spesa ancora in questa trasferta.</div>'}</div><div class="tripPiede"><div class="metricLine">${daRiadd>0?`Da riaddebitare <b>${fmtEUR(daRiadd)}</b>`:'Niente da riaddebitare'}${mio>0?` <span class="dot">·</span> A mio carico <b>${fmtEUR(mio)}</b>`:''}</div>${naturaTrasferta(spese)}${t.purpose?`<div class="desc">${esc(t.purpose)}</div>`:''}<div class="tripBtn"><button type="button" class="secondary" onclick="nuovaSpesaInTrasferta('${t.id}')">+ Spesa in questa trasferta</button><button type="button" class="secondary" onclick="editTrip('${t.id}')">Modifica trasferta</button></div></div></div>`}</div>`;
}

// ─── Raggruppare quello che c'e' gia' ───────────────────────────────
// Senza questo, le spese inserite prima delle trasferte resterebbero
// slegate per sempre: nessuno le riprende una per una a mano.
function propostaTrasferte(righe){
  const m=new Map();
  righe.filter(e=>!e.trip_id&&e.client_id).forEach(e=>{
    const citta=norm(e.work_city||e.work_site)||'';
    const k=e.client_id+'|'+citta.toLowerCase();
    if(!m.has(k))m.set(k,{client_id:e.client_id,citta,project_id:e.project_id||null,items:[]});
    m.get(k).items.push(e);
  });
  return [...m.values()].map(g=>{
    const date=g.items.map(e=>String(e.expense_date||'')).filter(Boolean).sort();
    return {...g,dal:date[0]||'',al:date[date.length-1]||'',
      tot:g.items.reduce((s,e)=>s+Number(e.amount||0),0)};
  }).sort((a,b)=>String(b.dal).localeCompare(String(a.dal)));
}
// Le spese fuori trasferta: non basta proporre di raggrupparle, vanno
// anche MOSTRATE. Prima questo blocco elencava solo i gruppi, con
// cliente, date e totale: una spesa senza citta' finiva in un gruppo
// che non diceva niente di lei, e il suo percorso si poteva leggere
// solo passando all'altra vista. Una spesa invisibile nella vista che
// si apre per prima e' una spesa persa.
function bloccoProposte(righe){
  const p=propostaTrasferte(righe);
  if(!p.length)return '';
  return `<div class="card proposte"><b>Spese non ancora in una trasferta</b><p class="sub">Un tocco e diventano una trasferta, con destinazione e date prese dalle spese stesse.</p>${p.map(g=>`<div class="propGruppo"><div class="propHead"><div><div class="title">${esc(g.citta||'Senza citt\u00e0')} \u00b7 ${esc(clientName(g.client_id))}</div><div class="desc">${g.dal===g.al?dateIT(g.dal):dateIT(g.dal)+' \u2013 '+dateIT(g.al)} \u00b7 ${g.items.length} ${g.items.length===1?'spesa':'spese'} \u00b7 ${fmtEUR(g.tot)}</div></div><button type="button" class="secondary" onclick="creaTrasfertaDaSpese('${g.client_id}','${encodeURIComponent(g.citta)}')">Crea la trasferta</button></div><div class="list propRighe">${g.items.slice().sort((a,b)=>String(a.expense_date).localeCompare(String(b.expense_date))).map(rigaSpesa).join('')}</div></div>`).join('')}</div>`;
}
async function creaTrasfertaDaSpese(clientId,cittaEnc){
  const citta=decodeURIComponent(String(cittaEnc||''));
  const righe=expenseRows().filter(e=>!e.trip_id&&e.client_id===clientId&&norm(e.work_city||e.work_site||'').toLowerCase()===citta.toLowerCase());
  if(!righe.length)return setMsg('Non ci sono più spese libere per questo gruppo: ricarica la pagina.',5000);
  const date=righe.map(e=>String(e.expense_date||'')).filter(Boolean).sort();
  const daRiadd=righe.some(e=>!expIsOwn(e));
  setMsg('Creo la trasferta…',2500);
  const payload={client_id:clientId,project_id:righe[0].project_id||null,
    destination_city:citta||null,
    start_date:date[0]||todayISO(),
    end_date:date[date.length-1]||date[0]||todayISO(),
    purpose:null,status:daRiadd?'to_recharge':'draft',notes:null};
  const res=await insertReturningResilient('trips',payload);
  if(res.error)return setMsg('Non si è potuta creare la trasferta: '+motivoLeggibile(res.error),9000);
  const tripId=res.data&&res.data.id;
  if(!tripId){await reload();return setMsg('La trasferta è stata creata ma non si è potuto agganciarci le spese. Apri la trasferta e aggiungile.',9000)}
  let falliti=0;
  for(const e of righe){
    const r=await updateResilient('travel_expenses',{trip_id:tripId},e.id);
    if(r.error)falliti++;
  }
  await reload();
  if(falliti)return setMsg('Trasferta creata, ma '+falliti+' '+(falliti===1?'spesa non si è agganciata':'spese non si sono agganciate')+'.',9000);
  setMsg('Trasferta creata con '+righe.length+' '+(righe.length===1?'spesa':'spese')+'.',5000);
}

function expenses(){
  const rows=expenseRows().slice().sort((a,b)=>String(b.expense_date).localeCompare(String(a.expense_date)));
  const costiMese=rows.filter(expIsOwn).reduce((s,e)=>s+Number(e.amount||0),0);
  const rimbMese=rows.filter(e=>!expIsOwn(e)).reduce((s,e)=>s+Number(e.amount||0),0);
  const vista=vistaSpese();
  const testata=`<h1>Spese</h1>${monthSelector()}<div class="card"><b>Riepilogo ${monthLabel(state.month)}</b><div class="statRow" style="margin-top:14px"><div class="stat tint-orange"><div class="statHead"><span class="statDot"></span><span class="statLbl">A mio carico</span></div><strong>${fmtEUR(costiMese)}</strong><small>non rimborsati</small></div><div class="stat tint-blue"><div class="statHead"><span class="statDot"></span><span class="statLbl">Rimborsi</span></div><strong>${fmtEUR(rimbMese)}</strong><small>fattura + piè di lista</small></div></div></div>`;
  const azioni=`<button class="primary" onclick="go('expenseForm')">+ Nuova spesa</button>${trasferteReady()?`<button class="secondary" onclick="go('tripNew')">+ Nuova trasferta</button>`:''}<label class="secondary" style="display:block;text-align:center;cursor:pointer">Importa spese da CSV<input type="file" accept=".csv,text/csv" style="display:none" onchange="importCostsCsv(event)"></label>`;
  if(vista==='trasferte'){
    const viaggi=trasferteDelMese();
    const libere=rows.filter(e=>!e.trip_id);
    const corpo=viaggi.map(schedaTrasferta).join('');
    return appShell(testata+sceltaVistaSpese()+azioni+corpo+bloccoProposte(rows)+
      (viaggi.length||libere.length?'':emptyState('Nessuna trasferta e nessuna spesa in questo mese.','+ Aggiungi una spesa',"go('expenseForm')")));
  }
  const byDay={};
  rows.forEach(e=>{const d=String(e.expense_date||'').slice(0,10);(byDay[d]=byDay[d]||[]).push(e)});
  const days=Object.keys(byDay).sort((a,b)=>b.localeCompare(a));
  const elenco=days.map(d=>{
    const list=byDay[d];
    const sub=list.reduce((s,e)=>s+Number(e.amount||0),0);
    const cli=list[0]?clientName(list[0].client_id):'';
    const city=list.map(e=>e.work_city).find(Boolean)||'';
    return `<div class="card" style="padding:0;overflow:hidden"><div class="dayHead"><div><b>${dateIT(d)}</b> · ${esc(cli)}${city?' · '+esc(city):''}</div><div>${fmtEUR(sub)}</div></div><div class="list" style="box-shadow:none;border:0;margin:0">${list.map(e=>`<div class="row" onclick="editEntry('${e.id}','expense')"><div></div><div><div class="title">${esc(expenseCategoryName(e.expense_category_id))} ${expenseTypeTag(e)}${tagDaSistemare(e)}</div><div class="desc">${[percorsoDi(e),esc(e.description||''),e.project_id?esc(projectName(e.project_id)):'',e.trip_id?esc(tripTitolo(tripById(e.trip_id)||{})):''].filter(Boolean).join(' · ')}</div></div><div class="value">${fmtEUR(e.amount||0)}</div></div>`).join('')}</div></div>`;
  }).join('')||emptyState('Nessuna spesa in questo mese.','+ Aggiungi una spesa',"go('expenseForm')");
  return appShell(testata+(trasferteReady()?sceltaVistaSpese():'')+azioni+elenco);
}

// ─── Il modulo della trasferta ──────────────────────────────────────
function tripCampi(t={}){
  const clients=activeClients();
  const sel=t.client_id||clients[0]?.id||'';
  return `<div class="field"><label>Destinazione</label><input name="destination_city" value="${esc(t.destination_city||'')}" placeholder="Es. Catania" required></div><div class="field"><label>Paese</label><input name="destination_country" value="${esc(t.destination_country||'')}" placeholder="IT, CH, DE…" maxlength="3" oninput="this.value=this.value.toUpperCase()"></div><div class="field"><label>Dal</label><input name="start_date" type="date" value="${esc(t.start_date||todayISO())}" required></div><div class="field"><label>Al</label><input name="end_date" type="date" value="${esc(t.end_date||t.start_date||todayISO())}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}"${c.id===sel?' selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(sel,t.project_id||'')}</select></div><div class="field"><label>Motivo</label><input name="purpose" value="${esc(t.purpose||'')}" placeholder="Es. Go-live Omnichannel"></div><div class="field"><label>Stato</label><select name="status">${TRIP_STATI.map(([v,l])=>`<option value="${v}"${(t.status||'draft')===v?' selected':''}>${l}</option>`).join('')}</select></div><div class="field"><label>Note</label><textarea name="notes">${esc(t.notes||'')}</textarea></div>`;
}
function tripNew(){
  const clients=activeClients();
  if(!clients.length)return appShell(`<h1>Nuova trasferta</h1><div class="card">Crea prima un cliente in Impostazioni.</div>`);
  return appShell(`<h1>Nuova trasferta</h1><p class="sub">La trasferta tiene insieme le spese di un viaggio: volo, albergo, pasti, chilometri. Le spese si aggiungono dopo, da dentro la trasferta.</p><form class="form" onsubmit="saveTrip(event)">${tripCampi({})}<div class="actions"><button class="primary" data-busy="Salvataggio…">Salva trasferta</button><button type="button" class="secondary" onclick="go('expenses')">Annulla</button></div></form>`);
}
function tripPayload(f){
  return {client_id:f.client_id||null,project_id:f.project_id||null,
    destination_city:norm(f.destination_city)||null,
    destination_country:norm(f.destination_country)||null,
    start_date:f.start_date||null,end_date:f.end_date||f.start_date||null,
    purpose:norm(f.purpose)||null,status:f.status||'draft',notes:f.notes||null};
}
async function saveTrip(ev){
  ev.preventDefault();
  const f=Object.fromEntries(new FormData(ev.target));
  const res=await insertReturningResilient('trips',tripPayload(f));
  if(res.error)return setMsg('Non si è potuta salvare la trasferta: '+motivoLeggibile(res.error),9000);
  await reload();
  state.view='expenses';
  vistaSpeseScelta='trasferte';
  render();
  setMsg('Trasferta creata. Ora aggiungici le spese.',5000);
}
function editTrip(id){navigateTo('tripEdit',{edit:id})}
function tripEdit(){
  const t=tripById(state.edit);
  if(!t)return expenses();
  const spese=tripSpese(t.id);
  return appShell(`<h1>Modifica trasferta</h1><p class="sub">${esc(tripTitolo(t))} · ${esc(tripPeriodo(t))} · ${spese.length} ${spese.length===1?'spesa':'spese'} · ${fmtEUR(tripTotale(t.id))}</p><form class="form" onsubmit="saveTripEdit(event)">${tripCampi(t)}<div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary" onclick="nuovaSpesaInTrasferta('${t.id}')">+ Spesa in questa trasferta</button><button type="button" class="secondary danger" onclick="deleteTrip('${t.id}')">Elimina trasferta</button><button type="button" class="secondary" onclick="go('expenses')">Annulla</button></div></form>`);
}
async function saveTripEdit(ev){
  ev.preventDefault();
  const f=Object.fromEntries(new FormData(ev.target));
  const res=await updateResilient('trips',tripPayload(f),state.edit);
  if(res.error)return setMsg('Non si sono potute salvare le modifiche: '+motivoLeggibile(res.error),9000);
  await reload();
  state.view='expenses';state.edit=null;render();
  setMsg('Trasferta aggiornata.',4000);
}
// Eliminare la trasferta non deve mai portarsi via le spese: si
// sganciano e tornano libere nell'elenco, dove si vedono ancora.
async function deleteTrip(id){
  const spese=tripSpese(id);
  const avviso=spese.length
    ? 'Eliminare questa trasferta? Le '+spese.length+' spese NON vengono cancellate: tornano libere nell’elenco.'
    : 'Eliminare questa trasferta?';
  if(!confirm(avviso))return;
  for(const e of spese){
    const r=await updateResilient('travel_expenses',{trip_id:null},e.id);
    if(r.error)return setMsg('Non si è potuta sganciare una spesa, la trasferta non è stata eliminata: '+motivoLeggibile(r.error),9000);
  }
  const {error}=await sb.from('trips').delete().eq('id',id);
  if(error)return setMsg('Non si è potuta eliminare la trasferta: '+motivoLeggibile(error),9000);
  await reload();
  state.view='expenses';state.edit=null;render();
  setMsg(spese.length?'Trasferta eliminata. Le spese sono tornate libere nell’elenco.':'Trasferta eliminata.',5000);
}
function nuovaSpesaInTrasferta(id){navigateTo('expenseForm',{prefill:{trip_id:id}})}

async function ensureExpenseCategory(name,reimbursable){if(!name)return null;let c=data.expenseCategories.find(x=>x.name.toLowerCase()===name.toLowerCase());if(c)return c;const {data:row,error}=await insertReturningResilient('expense_categories',{name,calculation_type:'manual_amount',invoice_macro:'Spese di trasferta',reimbursable:reimbursable!==false,active:true},['reimbursable']);if(error)throw error;data.expenseCategories.push(row);return row}
function excelSerialToDate(v){const n=Number(String(v).replace(',','.'));if(!isFinite(n)||n<20000||n>90000)return '';return new Date(Date.UTC(1899,11,30)+Math.round(n)*86400000).toISOString().slice(0,10)}
function parseReimbType(v){const s=String(v||'').toLowerCase().trim();if(!s)return '';if(/expense[_ ]?report|pie|piè|piede|lista/.test(s))return 'expense_report';if(/invoice|fattura/.test(s))return 'invoice';if(/own|carico|costo|proprio|non\s*rimbors/.test(s))return 'own';return ''}
async function importCostsCsv(ev){const file=ev.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{try{const text=reader.result.replace(/^﻿/,'').trim();if(!text)return setMsg('CSV vuoto.');const lines=text.split(/\r?\n/).filter(Boolean);const sep=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';const headers=parseCsvLine(lines.shift(),sep).map(canonHeader);const get=(row,names)=>{for(const n of names.map(canonHeader)){const i=headers.indexOf(n);if(i>=0)return row[i]||''}return''};let count=0,updated=0,skipped=0;for(const line of lines){const row=parseCsvLine(line,sep);if(!row.some(x=>norm(x))){skipped++;continue}const qty=parseAmount(get(row,['quantita','quantità','quantity','qta']));const unit=parseAmount(get(row,['costo','tariffa x km','tariffa','unit_rate','costo unitario']));let amount=parseAmount(get(row,['totale','total','importo','amount']));if(!amount&&qty&&unit)amount=qty*unit;if(!amount&&unit)amount=unit;if(!amount){skipped++;continue}const dRaw=norm(get(row,['data','date']));const date=toDate(dRaw)||excelSerialToDate(dRaw)||new Date().toISOString().slice(0,10);const note=norm(get(row,['note','notes']));const rimbRaw=norm(get(row,['rimborsabile','reimbursable'])).toLowerCase();const flagYes=['si','sì','yes','true','1','y','x','vero'].includes(rimbRaw);let rt=parseReimbType(get(row,['tipo rimborso','tipo_rimborso','tipo di rimborso','tipo rimborso spesa','rimborso','reimbursement_type','reimbursement type']));if(!rt){const noteL=note.toLowerCase();rt='own';if(/fattura/.test(noteL))rt='invoice';else if(/lista|pie|piè/.test(noteL))rt='expense_report';else if(flagYes)rt='invoice';}const reimbursable=rt!=='own';const catName=norm(get(row,['spesa','categoria','voce','voce spesa','category']))||'Spesa';const cat=await ensureExpenseCategory(catName,reimbursable);const clientNm=norm(get(row,['cliente','client']));let client=null;if(clientNm)client=await ensureClient(clientNm,'daily');const projNm=norm(get(row,['cliente progetto','cliente/progetto','progetto','project']));let project=null;if(client&&projNm)project=await ensureProject(client.id,projNm);const city=norm(get(row,['sede','luogo/citta','luogo/città','citta','città','luogo','work_city','city']));const desc=norm(get(row,['descrizione','description','causale']))||catName;const idv=norm(get(row,['id','import_id','riga','key','chiave']));const payload={expense_date:date,client_id:client?.id||null,project_id:project?.id||null,expense_category_id:cat?.id||null,work_city:city||null,description:desc,quantity:qty||null,unit_rate:unit||null,amount,reimbursement_type:rt,reimbursable,notes:note||null};const key=idv?importKey(['te',idv]):importKey(['te',date,client?.id||'',project?.id||'',cat?.id||'',amount,city]);const {res,updated:u}=await upsertByKey('travel_expenses',data.travelExpenses,payload,key,['reimbursement_type']);if(res.error)throw res.error;if(u)updated++;else count++;}await fetchAll();state.view='costs';setMsg(`Import completato: ${count} inserite, ${updated} aggiornate. Scartate: ${skipped}.`,9000)}catch(e){console.error(e);setMsg('Errore import: '+(e.message||e),9000)}};reader.readAsText(file,'windows-1252')}
function account(){const p=(data.profiles&&data.profiles[0])||{};const email=session?.user?.email||p.email||'';return appShell(`<h1>Account</h1><p class="sub">I tuoi dati di accesso e contatto.</p><form class="form" onsubmit="saveAccount(event)"><div class="field"><label>Email di accesso</label><input value="${esc(email)}" disabled></div><div class="field"><label>Nome</label><input name="first_name" value="${esc(p.first_name||'')}"></div><div class="field"><label>Cognome</label><input name="last_name" value="${esc(p.last_name||'')}"></div><div class="field"><label>Telefono</label><input name="phone" value="${esc(p.phone||'')}" inputmode="tel" placeholder="+39 ..."></div><div class="field"><label>Azienda / Ragione sociale</label><input name="company_name" value="${esc(p.company_name||'')}"></div><div class="field"><label>P.IVA</label><input name="vat_number" value="${esc(p.vat_number||'')}"></div><button class="primary">Salva dati account</button></form><h2>Cambia password</h2><form class="form" onsubmit="changePassword(event)"><div class="field"><label>Nuova password</label><input name="password" type="password" minlength="6" autocomplete="new-password" placeholder="Almeno 6 caratteri" required></div><div class="field"><label>Conferma nuova password</label><input name="password2" type="password" minlength="6" autocomplete="new-password" required></div><button class="primary">Aggiorna password</button></form><button type="button" class="secondary" onclick="go('settings')" style="margin-top:14px">Indietro</button>`)}
async function saveAccount(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const p=(data.profiles&&data.profiles[0]);const payload={first_name:norm(f.first_name)||null,last_name:norm(f.last_name)||null,phone:norm(f.phone)||null,company_name:norm(f.company_name)||null,vat_number:norm(f.vat_number)||null};let error;if(p){({error}=await updateResilient('user_profiles',payload,p.id,['phone']));}else{({error}=await insertResilient('user_profiles',{...payload,user_id:session?.user?.id,email:session?.user?.email},['phone']));}if(error)return setMsg(error.message,7000);await reload();state.view='account';setMsg('Dati account aggiornati.',4000)}
async function changePassword(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));if(f.password!==f.password2)return setMsg('Le due password non coincidono.',6000);state.message='Aggiornamento password...';render();const {error}=await sb.auth.updateUser({password:f.password});if(error)return setMsg(error.message,7000);setMsg('Password aggiornata con successo.',5000)}
function settingsRow(view,icon,title,desc,onclick){return `<div class="row" onclick="${onclick||`go('${view}')`}"><div class="roundIcon blue">${icon}</div><div><div class="title">${title}</div><div class="desc">${desc}</div></div><div>›</div></div>`}
function settings(){const email=esc(session?.user?.email||'');return appShell(`<div class="screenTitle">Impostazioni</div>
<h2>Account</h2><div class="list">${settingsRow('account','◔','Profilo e password',email||'Dati di contatto e accesso')}</div>
<h2>Anagrafiche</h2>${wbsReady()?`<p class="sub">Si parte dal cliente e si scende: <b>Cliente › Progetto / cliente finale › Commessa › Attività</b>.
    Ogni livello si crea da dentro quello sopra, così non ci sono elenchi separati da tenere allineati a mano.</p>`:''}<div class="list">${settingsRow('clients','👤','Clienti','Da qui si scende a progetti, commesse e attività')}${wbsReady()?settingsRow('projects','📁','Progetti / Clienti finali','Elenco di tutti i progetti, per ritrovarli'):settingsRow('projects','📁','Progetti / Clienti finali','Collegati al cliente principale')}${wbsReady()?settingsRow('engagements','📄','Commesse','Elenco di tutte le commesse, per ritrovarle'):''}${settingsRow('activities','🏷️','Attività','PM, AMS, Gestione... l\'elenco unico da cui pescare')}</div>
<h2>Trasferte e spese</h2><p class="sub">Come si registrano e si riaddebitano le spese: le voci, i veicoli per la chilometrica, e i limiti che ogni cliente ammette.</p><div class="list">${settingsRow('expenseCategories','🧾','Voci di spesa','Volo, albergo, pasti, chilometri: rimborsabili e non')}${settingsRow('vehicles','🚗','Veicoli e rimborso km','La tariffa €/km la scrivi tu, e cambia a gennaio')}${settingsRow('policyRimborsi','📋','Policy rimborsi per cliente','Chi paga cosa, e fino a quanto')}</div>
<h2>Fatturazione e fisco</h2><div class="list">${settingsRow('invoiceTemplates','📄','Template fattura','Descrizioni da copiare su Fiscozen')}${settingsRow('taxSettings','%','Configurazione fiscale','Forfettario, ATECO, aliquote e proiezione')}${settingsRow('taxPayments','◈','Pagamenti fiscali','Contributi INPS e versamenti')}</div>
<h2>Analisi e dati</h2><div class="list">${settingsRow('exportTimesheet','⬇','Export Timesheet Excel','Scarica il dettaglio mensile')}<label class="row" style="cursor:pointer"><div class="roundIcon blue">⬆</div><div><div class="title">Importa da CSV</div><div class="desc">Consuntivi in blocco</div></div><div>›</div><input type="file" accept=".csv,text/csv" style="display:none" onchange="importCsv(event)"></label></div>
<h2>App</h2><div class="list">${settingsRow('appearance','◐','Aspetto / Tema','Chiaro o scuro')}<div class="row"><div class="roundIcon blue">☁</div><div><div class="title">Database</div><div class="desc">Supabase PostgreSQL${email?' · '+email:''}</div></div><div></div></div></div>
<div class="grid" style="margin-top:16px"><button class="secondary" onclick="reload()">Ricarica dati</button><button class="secondary danger" onclick="logout()">Esci</button></div>`)}

function appearance(){return appShell(`<div class="screenTitle">Aspetto / Tema</div><p class="sub">Scegli il template grafico da usare su telefono e PC.</p><div class="card"><div class="themeChoice"><button class="${state.theme==='light'?'active':''}" onclick="saveThemeChoice('light')"><b>Chiaro / Giorno</b><span>sfondo chiaro, card bianche, ideale per uso diurno</span></button><button class="${state.theme==='dark'?'active':''}" onclick="saveThemeChoice('dark')"><b>Scuro / Sera</b><span>sfondo navy, card scure, ideale per smartphone e sera</span></button><button class="${state.theme==='auto'?'active':''}" onclick="saveThemeChoice('auto')"><b>Automatico di sistema</b><span>segue l'impostazione del dispositivo: ora attivo il tema ${systemTheme()==='dark'?'scuro':'chiaro'}</span></button></div></div><button class="secondary" onclick="go('settings')">Indietro</button>`)}

function exportTimesheetViewOptions(){const clients=activeClients();const selected=clients[0]?.id||'';return `<div class="field"><label>Mese</label><input name="month" type="month" value="${state.month}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)"><option value="">Tutti i clienti (solo per archivio)</option>${clients.map(c=>`<option value="${c.id}"${c.id===selected?' selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id"><option value="">Tutti i progetti</option>${projectOptions(selected)}</select></div><div class="field"><label>Includi importi</label><select name="include_amount"><option value="false">No, solo dettaglio operativo</option><option value="true">Sì, includi importi</option></select></div>`}
function exportTimesheet(){return appShell(`<div class="screenTitle">Export Timesheet Excel</div><p class="sub">Scarica il dettaglio mensile da inviare al cliente.</p><form class="form" onsubmit="downloadTimesheetExcel(event)">${exportTimesheetViewOptions()}<div class="actions"><button class="primary">Scarica Excel</button><button type="button" class="secondary" onclick="go('settings')">Annulla</button></div></form>`)}

function clients(){return appShell(`<h1>Clienti</h1><form class="form" onsubmit="addClient(event)"><div class="field"><label>Nome cliente</label><input name="name" required></div><div class="field"><label>Codice cliente</label><input name="code" maxlength="5" placeholder="Es. SO" oninput="this.value=normCode(this.value)"><div class="small">Da 2 a 5 lettere o cifre. Entra nel codice di ogni commessa: una volta usato non si cambia piu'.</div></div><div class="field"><label>Tipo compenso</label><select name="compensation_type"><option value="daily_rate_8h">Tariffa giornaliera 8h</option><option value="monthly_flat">Una tantum mensile</option></select></div><div class="field"><label>Tariffa giornaliera</label><input name="daily_rate" type="number" step="0.01" value="0"></div><button class="primary">Aggiungi cliente</button></form>${sortControl('clients')}<div class="list">${sortEntities('clients',data.clients).map(c=>`<div class="row" onclick="${wbsReady()?`openClient('${c.id}')`:`editClient('${c.id}')`}"><div></div><div><div class="title">${esc(c.name)}</div><div class="desc">${c.compensation_type==='daily_rate_8h'?'Tariffa giornaliera 8h · '+fmtEUR(c.daily_rate||0):'Una tantum mensile'} · ${c.active?'Attivo':'Disattivo'}</div></div>${moveBtns('clients',c.id)}</div>`).join('')||emptyForm('Nessun cliente ancora inserito.')}</div>`)}
function editClient(id){navigateTo('clientEdit',{edit:id})}
// \u2500\u2500\u2500 Policy rimborsi: una pagina sua \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Stava in fondo al modulo di modifica cliente, una tendina per voce,
// senza una riga che spiegasse cosa si stesse impostando. E non aveva
// limiti, che sono la cosa per cui una policy esiste.
function policyClienteScelto(){
  const cl=activeClients();
  const id=state.edit&&clientById(state.edit)?state.edit:(cl[0]?.id||'');
  return id;
}
function apriPolicy(id){navigateTo('policyRimborsi',{edit:id})}
function cambiaClientePolicy(id){navigateTo('policyRimborsi',{edit:id,track:false})}
function policyRimborsi(){
  const cl=activeClients();
  if(!cl.length)return appShell(`<div class="screenTitle">Policy rimborsi</div><div class="card">Crea prima un cliente.</div>`);
  const id=policyClienteScelto();
  const c=clientById(id)||cl[0];
  const pol=parsePolicy(c);
  const riga=cid=>pol.find(r=>r.category_id===cid)||{};
  const cats=(data.expenseCategories||[]).filter(x=>x.active);
  if(!cats.length)return appShell(`<div class="screenTitle">Policy rimborsi</div><div class="card">Crea prima delle voci di spesa: la policy dice cosa fare di ognuna.</div><button class="secondary" onclick="go('expenseCategories')">Vai alle voci di spesa</button>`);
  return appShell(`<div class="screenTitle">Policy rimborsi</div><p class="sub">Per ogni voce di spesa: <b>chi la paga</b> e, se il cliente ha un tetto, <b>fino a quanto</b>. Il limite non impedisce di sforare: quando lo superi l'app te lo dice mentre inserisci, e ti offre di spezzare la spesa in due \u2014 la parte entro il tetto in fattura, l'eccedenza a tuo carico. <b>Massimo 0 = nessun limite.</b></p><div class="field"><label>Cliente</label><select onchange="cambiaClientePolicy(this.value)">${cl.map(x=>`<option value="${x.id}"${x.id===c.id?' selected':''}>${esc(x.name)}</option>`).join('')}</select></div><form class="form" onsubmit="savePolicy(event)"><input type="hidden" name="client_id" value="${c.id}">${cats.map(cat=>{
    const r=riga(cat.id);
    const unita=cat.unit_label?esc(cat.unit_label):'';
    return `<div class="bloccoCampi policyVoce"><div class="bloccoTit">${esc(cat.name)}</div><div class="field"><label>Chi la paga</label><select name="policy_${cat.id}">${reimbTypeOptions(r.type||'own')}</select></div><div class="field"><label>Massimo \u20ac</label><input name="cap_${cat.id}" type="number" step="0.01" value="${Number(r.cap||0)||''}" placeholder="0 = nessun limite"></div>${unita?`<div class="field"><label>Il massimo vale</label><select name="perunit_${cat.id}"><option value="false"${r.per_unit?'':' selected'}>per l\u2019intera spesa</option><option value="true"${r.per_unit?' selected':''}>per ogni ${unita}</option></select></div>`:`<input type="hidden" name="perunit_${cat.id}" value="false">`}</div>`;
  }).join('')}<div class="actions"><button class="primary">Salva la policy di ${esc(c.name)}</button><button type="button" class="secondary" onclick="go('settings')">Indietro</button></div></form>`);
}
async function savePolicy(ev){
  ev.preventDefault();
  const f=Object.fromEntries(new FormData(ev.target));
  const id=f.client_id;
  const policy=collectPolicyFromForm(f,parsePolicy(clientById(id)));
  const res=await updateResilient('clients',{expense_policy:policy},id,['expense_policy']);
  if(res.error)return setMsg('Non si \u00e8 potuta salvare la policy: '+motivoLeggibile(res.error),9000);
  await reload();
  state.view='policyRimborsi';state.edit=id;render();
  setMsg('Policy di '+clientName(id)+' salvata.',4000);
}
function clientEdit(){const c=clientById(state.edit);if(!c)return clients();return appShell(`<h1>Modifica cliente</h1><form class="form" onsubmit="saveClient(event)"><div class="field"><label>Nome cliente</label><input name="name" value="${esc(c.name)}" required></div><div class="field"><label>Codice cliente</label><input name="code" maxlength="5" value="${esc(c.code||'')}" oninput="this.value=normCode(this.value)"${projectsOfClient(c.id).some(p=>p.code)?' readonly title="Ha gia\' dei progetti: il codice non si cambia"':''}><div class="small">${projectsOfClient(c.id).some(p=>p.code)?'Bloccato: da questo codice dipendono i codici dei progetti.':'Da 2 a 5 lettere o cifre.'}</div></div><div class="field"><label>Tipo compenso</label><select name="compensation_type"><option value="daily_rate_8h" ${c.compensation_type==='daily_rate_8h'?'selected':''}>Tariffa giornaliera 8h</option><option value="monthly_flat" ${c.compensation_type==='monthly_flat'?'selected':''}>Una tantum mensile</option></select></div><div class="field"><label>Tariffa giornaliera</label><input name="daily_rate" type="number" step="0.01" value="${Number(c.daily_rate||0)}"></div><div class="field"><label>Ore standard giornata</label><input name="standard_hours" type="number" step="0.25" value="${Number(c.standard_hours||8)}"></div><div class="field"><label>Sede operativa (base trasferte)</label><input name="base_city" value="${esc(c.base_city||'')}" placeholder="Es. Milano"></div><div class="field"><label>Attivo</label><select name="active"><option value="true" ${c.active?'selected':''}>Sì</option><option value="false" ${!c.active?'selected':''}>No</option></select></div><h2>Policy rimborsi spese</h2><p class="sub">Per ogni voce di spesa scegli come viene gestita con questo cliente. L'app la proporrà in automatico quando inserisci una spesa.</p><div class="card"><b>Policy rimborsi</b><div class="desc" style="margin-top:4px">Chi paga ogni voce di spesa e fino a quanto. Sta in una pagina sua, così c'è spazio per i limiti.</div><button type="button" class="secondary" style="margin-top:12px" onclick="apriPolicy('${c.id}')">Apri la policy di ${esc(c.name)}</button></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteClient('${c.id}')">Elimina cliente</button><button type="button" class="secondary" onclick="${wbsReady()?`openClient('${c.id}')`:`go('clients')`}">Annulla</button></div></form>`)}
async function addClient(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));
  // il codice cliente regge tutta la catena dei codici sotto: se non
  // lo si scrive, dal cliente non si riesce piu' a creare un progetto
  const payload={name:norm(f.name),code:normCode(f.code)||null,compensation_type:f.compensation_type,daily_rate:Number(f.daily_rate||0),standard_hours:8,active:true};const {error}=await insertResilient('clients',payload,['code']);if(error)return setMsg(error.message,7000);await reload();state.view='clients';render()}
// Se il modulo non contiene nemmeno un campo della policy, la policy
// non si tocca. Senza questa riga, salvare il cliente da un modulo
// senza editor scriverebbe una policy vuota e i limiti sparirebbero
// in silenzio.
function collectPolicyFromForm(f,esistente){
  const presenti=(data.expenseCategories||[]).some(cat=>f['policy_'+cat.id]!==undefined||f['cap_'+cat.id]!==undefined);
  if(!presenti)return esistente||[];
  const pol=[];
  (data.expenseCategories||[]).forEach(cat=>{
    const tipo=f['policy_'+cat.id]||'own';
    const cap=Number(f['cap_'+cat.id]||0)||0;
    const perUnit=f['perunit_'+cat.id]==='true';
    if(tipo==='own'&&!cap)return;
    const riga={category_id:cat.id,category:cat.name,type:tipo};
    if(cap>0){riga.cap=cap;riga.per_unit=perUnit}
    pol.push(riga);
  });
  return pol;
}
async function saveClient(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const policy=collectPolicyFromForm(f,parsePolicy(clientById(state.edit)));const payload={name:norm(f.name),compensation_type:f.compensation_type,daily_rate:Number(f.daily_rate||0),standard_hours:Number(f.standard_hours||8),active:f.active==='true',base_city:norm(f.base_city)||null,expense_policy:policy};
  // il codice si scrive solo se il modulo lo ha lasciato modificabile:
  // dove ci sono gia' dei progetti e' bloccato, e non va sovrascritto
  if(f.code!==undefined&&normCode(f.code))payload.code=normCode(f.code);
  const {error}=await updateResilient('clients',payload,state.edit,['base_city','expense_policy','code']);if(error)return setMsg(error.message,7000);await reload();state.view='clients';state.edit=null;render()}
async function deleteClient(idv){if(!confirm('Eliminare il cliente? Se esistono consuntivi collegati, il database potrebbe bloccare la cancellazione. In quel caso usa Disattivo.'))return;const {error}=await sb.from('clients').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='clients';render()}
// Elenco di tutti i progetti. Quando la gerarchia c'e' e' di sola
// consultazione: un progetto si crea dal cliente, perche' il suo
// codice viene da li' e perche' il passo dopo e' la commessa. La
// vecchia maschera, che attaccava il progetto al cliente e basta,
// resta solo per chi non ha ancora migrato.
function projects(){
  if(!wbsReady())return projectsLegacy();
  const tutti=(data.projects||[]).slice()
    .sort((a,b)=>String(a.code||a.name).localeCompare(String(b.code||b.name),'it'));
  return appShell(`<h1>Progetti / Clienti finali</h1>
    <p class="sub">Tutti i progetti, per ritrovarli. Un progetto nuovo nasce sotto il suo cliente —
    il codice viene da lì — e il passo subito dopo è aprirgli la commessa.</p>
    <div class="list">${tutti.map(p=>{
      const eng=engagementsOfProject(p.id);
      return `<div class="row" onclick="openProject('${p.id}')">
        <div></div>
        <div><div class="title">${esc(p.code||p.name)} ${statoTag(p.status||'active')}</div>
          <div class="desc">${esc(clientName(p.client_id))} › ${esc(p.name)}</div>
          <div class="desc">${eng.length===1?'1 commessa':eng.length+' commesse'}</div></div>
        <div class="chev">›</div></div>`}).join('')||emptyForm('Nessun progetto ancora. Creane uno qui sotto.')}</div>
    <button type="button" class="primary cta" onclick="nuovoProgettoScegliCliente()">+ Nuovo progetto / cliente finale</button>`);
}
// Il progetto si crea sotto un cliente, perche' il suo codice viene da
// li'. Se il cliente e' uno solo non c'e' niente da chiedere: questa
// pagina era un vicolo cieco, elencava e basta.
function nuovoProgettoScegliCliente(){
  const cl=(data.clients||[]).filter(c=>c.active!==false);
  if(cl.length===1)return nuovoProgettoDi(cl[0].id);
  go('clients');
  setMsg('Scegli il cliente: il progetto nasce dalla sua scheda, perché il codice viene dal suo.',6000);
}
function projectsLegacy(){return appShell(`<h1>Progetti / Clienti finali</h1><form class="form" onsubmit="addProject(event)"><div class="field"><label>Cliente collegato</label><select name="client_id">${data.clients.map(c=>`<option value="${c.id}"${c.id===selected?' selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Nome progetto / cliente finale</label><input name="name" required></div><button class="primary">Aggiungi progetto</button></form>${sortControl('projects')}<div class="list">${sortEntities('projects',data.projects).map(p=>`<div class="row" onclick="editProject('${p.id}')"><div></div><div><div class="title">${esc(clientName(p.client_id))}</div><div class="desc">${esc(p.name)} · ${p.active?'Attivo':'Disattivo'}</div></div>${moveBtns('projects',p.id)}</div>`).join('')||emptyForm('Nessun progetto.')}</div>`)}
function editProject(id){navigateTo('projectEdit',{edit:id})}
// Con la gerarchia attiva il progetto ha dei campi suoi (codice breve,
// unita' di fatturazione, cliente finale) che il modulo storico non
// mostrava: si apriva, si salvava, e quei campi restavano com'erano
// senza che si capisse perche'.
function projectEdit(){
  const p=projectById(state.edit);if(!p)return projects();
  if(!wbsReady())return projectEditLegacy(p);
  const bloccato=totimeProjectInUse(p.id);
  return appShell(`<h1>Modifica progetto</h1>
    <p class="sub">${esc(clientName(p.client_id))}${p.code?' · '+esc(p.code):''}</p>
    <form class="form" onsubmit="saveProjectFull(event)">
      <div class="field"><label>Codice breve</label>
        <input name="short_code" maxlength="6" value="${esc(p.short_code||'')}" ${bloccato?'readonly':'oninput="this.value=normCode(this.value)"'}>
        <div class="small">${bloccato?'Bloccato: su questo progetto ci sono gia\' delle registrazioni, il codice non si cambia.':'Entra nel codice del progetto e in quelli delle sue commesse.'}</div></div>
      <div class="field"><label>Nome del progetto</label><input name="name" value="${esc(p.name)}" required></div>
      <div class="field"><label>Cliente finale</label><input name="end_client_name" value="${esc(p.end_client_name||'')}" placeholder="Se diverso dal cliente che paga"></div>
      <div class="field"><label>Unità di fatturazione</label><select name="billing_unit">
        <option value="day" ${p.billing_unit!=='hour'?'selected':''}>Giornate</option>
        <option value="hour" ${p.billing_unit==='hour'?'selected':''}>Ore</option></select></div>
      <div class="field"><label>Descrizione predefinita della riga di fattura</label>
        <input name="invoice_line_description" value="${esc(p.invoice_line_description||'')}" placeholder="Se vuoto si usa il nome del progetto"></div>
      <div class="field"><label>Data di inizio</label><input name="start_date" type="date" value="${esc(p.start_date||'')}"></div>
      <div class="field"><label>Data di fine</label><input name="end_date" type="date" value="${esc(p.end_date||'')}"></div>
      <div class="field"><label>Stato</label><select name="status">${Object.entries(STATI).map(([k,v])=>`<option value="${k}" ${(p.status||'active')===k?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Note</label><textarea name="notes">${esc(p.notes||'')}</textarea></div>
      <div class="actions"><button class="primary">Salva modifiche</button>
        ${engagementsOfProject(p.id).length?'':`<button type="button" class="secondary danger" onclick="deleteProject('${p.id}')">Elimina progetto</button>`}
        <button type="button" class="secondary" onclick="openProject('${p.id}')">Annulla</button></div>
    </form>`);
}
// Il progetto e' "in uso" se ci pendono registrazioni, sue o delle
// attivita' delle sue commesse: allora il codice non si tocca piu'.
function totimeProjectInUse(projectId){
  if((data.entries||[]).some(e=>e.project_id===projectId))return true;
  if((data.manualEntries||[]).some(e=>e.project_id===projectId))return true;
  if((data.travelExpenses||[]).some(e=>e.project_id===projectId))return true;
  return engagementsOfProject(projectId).some(e=>wbsOfEngagement(e.id).some(w=>wbsUsage(w.id).tot>0));
}
async function saveProjectFull(ev){
  ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));
  const p=projectById(state.edit);if(!p)return;
  const payload={name:norm(f.name),end_client_name:norm(f.end_client_name)||null,
    billing_unit:f.billing_unit||'day',invoice_line_description:norm(f.invoice_line_description)||null,
    start_date:f.start_date||null,end_date:f.end_date||null,status:f.status||'active',
    notes:norm(f.notes)||null,active:f.status!=='closed'&&f.status!=='cancelled'};
  if(!totimeProjectInUse(p.id))payload.short_code=normCode(f.short_code);
  const r=await updateResilient('projects',payload,p.id);
  if(r.error)return setMsg(/duplicate key|unique/i.test(String(r.error.message))?
    'Questo cliente ha già un progetto con questo codice breve.':r.error.message,8000);
  await reload();navigateTo('projectDetail',{edit:p.id});
  setMsg('Progetto aggiornato.',3000);
}
function projectEditLegacy(p){return appShell(`<h1>Modifica progetto</h1><form class="form" onsubmit="saveProject(event)"><div class="field"><label>Cliente collegato</label><select name="client_id">${data.clients.map(c=>`<option value="${c.id}" ${c.id===p.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Nome progetto / cliente finale</label><input name="name" value="${esc(p.name)}" required></div><div class="field"><label>Attivo</label><select name="active"><option value="true" ${p.active?'selected':''}>Sì</option><option value="false" ${!p.active?'selected':''}>No</option></select></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteProject('${p.id}')">Elimina progetto</button><button type="button" class="secondary" onclick="go('projects')">Annulla</button></div></form>`)}
async function addProject(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const {error}=await insertResilient('projects',{client_id:f.client_id,name:norm(f.name),active:true});if(error)return setMsg(error.message,7000);await reload();state.view='projects';render()}
async function saveProject(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const {error}=await updateResilient('projects',{client_id:f.client_id,name:norm(f.name),active:f.active==='true'},state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='projects';state.edit=null;render()}
async function deleteProject(idv){if(!confirm('Eliminare il progetto? Se esistono consuntivi collegati, il database potrebbe bloccare la cancellazione.'))return;const {error}=await sb.from('projects').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='projects';render()}
function activities(){return appShell(`<h1>Attività</h1><form class="form" onsubmit="addActivity(event)"><div class="field"><label>Nome attività</label><input name="name" required></div><button class="primary">Aggiungi attività</button></form>${sortControl('activities')}<div class="list">${sortEntities('activities',data.activities).map(a=>`<div class="row" onclick="editActivity('${a.id}')"><div></div><div><div class="title">${esc(a.name)}</div><div class="desc">${a.active?'Attiva':'Disattiva'}</div></div>${moveBtns('activities',a.id)}</div>`).join('')||emptyForm('Nessuna attività ancora inserita.')}</div>`)}
function editActivity(id){navigateTo('activityEdit',{edit:id})}
function activityEdit(){const a=activityById(state.edit);if(!a)return activities();return appShell(`<h1>Modifica attività</h1><form class="form" onsubmit="saveActivity(event)"><div class="field"><label>Nome attività</label><input name="name" value="${esc(a.name)}" required></div><div class="field"><label>Attiva</label><select name="active"><option value="true" ${a.active?'selected':''}>Sì</option><option value="false" ${!a.active?'selected':''}>No</option></select></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteActivity('${a.id}')">Elimina attività</button><button type="button" class="secondary" onclick="go('activities')">Annulla</button></div></form>`)}
async function addActivity(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const {error}=await insertResilient('activities',{name:norm(f.name),active:true});if(error)return setMsg(error.message,7000);await reload();state.view='activities';render()}
async function saveActivity(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const {error}=await updateResilient('activities',{name:norm(f.name),active:f.active==='true'},state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='activities';state.edit=null;render()}
async function deleteActivity(idv){if(!confirm('Eliminare attività? Se usata nei consuntivi, il database potrebbe bloccare la cancellazione.'))return;const {error}=await sb.from('activities').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='activities';render()}

// \u2500\u2500\u2500 Veicoli e rimborso km \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// La tariffa non la pesca l'app da nessuna parte: la metti tu. Qui c'e'
// scritto da dove viene e quando va rivista, perche' e' l'unica cosa di
// questa pagina che si dimentica.
function vehicles(){
  if(!veicoliReady())
    return appShell(`<div class="screenTitle">Veicoli e rimborso km</div><div class="card">Questa parte ha bisogno della migrazione <b>2026-10-06_veicoli-e-chilometrica.sql</b>. Finch\u00e9 non \u00e8 stata lanciata, i chilometri si registrano come sempre: km e tariffa a mano sulla singola spesa.</div><button class="secondary" onclick="go('settings')">Indietro</button>`);
  const list=(data.vehicles||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'it'));
  const anno=new Date().getFullYear();
  return appShell(`<div class="screenTitle">Veicoli e rimborso km</div><p class="sub">La tariffa \u20ac/km <b>la scrivi tu</b>: si consulta sul portale <b>ACI</b> (costikm.aci.it) e <b>cambia ogni anno a gennaio</b>, quindi vale la pena rivederla a inizio anno. Quella del veicolo \u00e8 solo il valore proposto: sulla singola spesa si corregge, e una chilometrica si pu\u00f2 registrare anche senza veicolo.</p><form class="form" onsubmit="addVehicle(event)"><div class="field"><label>Nome</label><input name="name" placeholder="Es. Panda" required></div><div class="field"><label>Targa</label><input name="plate" placeholder="AB123CD" oninput="this.value=this.value.toUpperCase()"></div><div class="field"><label>Alimentazione</label><select name="fuel_type"><option value=""></option>${CARBURANTI.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div><div class="field"><label>Tariffa \u20ac/km</label><input name="rate_per_km" type="number" step="0.0001" value="0"></div><div class="field"><label>Anno della tabella ACI</label><input name="aci_year" type="number" step="1" value="${anno}"><div class="small">Serve solo a ricordarti da quale tabella viene la tariffa.</div></div><button class="primary">Aggiungi veicolo</button></form><div class="list">${list.map(v=>`<div class="row" onclick="editVehicle('${v.id}')"><div></div><div><div class="title">${esc(v.name)}${v.active===false?' <span class="tag gray">disattivo</span>':''}</div><div class="desc">${[v.plate?esc(v.plate):'',carburanteLabel(v.fuel_type),Number(v.rate_per_km||0)>0?fmtNum(v.rate_per_km,2)+' \u20ac/km':'tariffa da mettere',v.aci_year?'tabella ACI '+v.aci_year:''].filter(Boolean).join(' \u00b7 ')}</div></div><div>\u203a</div></div>`).join('')||emptyForm('Nessun veicolo ancora inserito.')}</div><button class="secondary" onclick="go('settings')">Indietro</button>`);
}
function vehiclePayload(f){
  return {name:norm(f.name),plate:norm(f.plate)||null,fuel_type:f.fuel_type||null,
    rate_per_km:Number(f.rate_per_km||0)||null,aci_year:Number(f.aci_year||0)||null,
    notes:f.notes||null,active:f.active==null?true:f.active==='true'};
}
async function addVehicle(ev){
  ev.preventDefault();
  const f=Object.fromEntries(new FormData(ev.target));
  const res=await insertResilient('vehicles',vehiclePayload(f));
  if(res.error)return setMsg('Non si \u00e8 potuto salvare il veicolo: '+motivoLeggibile(res.error),9000);
  await reload();state.view='vehicles';render();
  setMsg('Veicolo aggiunto.',4000);
}
function editVehicle(id){navigateTo('vehicleEdit',{edit:id})}
function vehicleEdit(){
  const v=vehicleById(state.edit);
  if(!v)return vehicles();
  const usate=(data.travelExpenses||[]).filter(e=>e.vehicle_id===v.id).length;
  return appShell(`<div class="screenTitle">Modifica veicolo</div>${usate?`<p class="sub">Usato in ${usate} ${usate===1?'spesa':'spese'}. Cambiare la tariffa qui <b>non</b> ricalcola le spese gi\u00e0 registrate: quelle tengono la tariffa con cui sono nate.</p>`:''}<form class="form" onsubmit="saveVehicle(event)"><div class="field"><label>Nome</label><input name="name" value="${esc(v.name||'')}" required></div><div class="field"><label>Targa</label><input name="plate" value="${esc(v.plate||'')}" oninput="this.value=this.value.toUpperCase()"></div><div class="field"><label>Alimentazione</label><select name="fuel_type"><option value=""></option>${CARBURANTI.map(([x,l])=>`<option value="${x}"${v.fuel_type===x?' selected':''}>${l}</option>`).join('')}</select></div><div class="field"><label>Tariffa \u20ac/km</label><input name="rate_per_km" type="number" step="0.0001" value="${Number(v.rate_per_km||0)}"></div><div class="field"><label>Anno della tabella ACI</label><input name="aci_year" type="number" step="1" value="${Number(v.aci_year||0)||''}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(v.notes||'')}</textarea></div><div class="field"><label>Attivo</label><select name="active"><option value="true"${v.active!==false?' selected':''}>S\u00ec</option><option value="false"${v.active===false?' selected':''}>No</option></select></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteVehicle('${v.id}')">Elimina</button><button type="button" class="secondary" onclick="go('vehicles')">Annulla</button></div></form>`);
}
async function saveVehicle(ev){
  ev.preventDefault();
  const f=Object.fromEntries(new FormData(ev.target));
  const res=await updateResilient('vehicles',vehiclePayload(f),state.edit);
  if(res.error)return setMsg('Non si sono potute salvare le modifiche: '+motivoLeggibile(res.error),9000);
  await reload();state.view='vehicles';state.edit=null;render();
  setMsg('Veicolo aggiornato.',4000);
}
// Eliminare un veicolo non deve portarsi via le spese: si sganciano e
// tengono la tariffa con cui sono nate.
async function deleteVehicle(id){
  const usate=(data.travelExpenses||[]).filter(e=>e.vehicle_id===id).length;
  const avviso=usate
    ? 'Eliminare questo veicolo? Le '+usate+' spese che lo usano NON vengono cancellate: restano con i loro km e la loro tariffa.'
    : 'Eliminare questo veicolo?';
  if(!confirm(avviso))return;
  const {error}=await sb.from('vehicles').delete().eq('id',id);
  if(error)return setMsg('Non si \u00e8 potuto eliminare: '+motivoLeggibile(error),9000);
  await reload();state.view='vehicles';state.edit=null;render();
  setMsg('Veicolo eliminato.',4000);
}
function expenseCategories(){return appShell(`<h1>Voci di costo / spesa</h1><p class="sub">Ogni voce può essere <b>rimborsabile</b> (la addebiti al cliente in fattura) o <b>non rimborsabile</b> (costo a tuo carico, che riduce il margine).</p><form class="form" onsubmit="addExpenseCategory(event)"><div class="field"><label>Nome voce</label><input name="name" required></div><div class="field"><label>Rimborsabile dal cliente</label><select name="reimbursable"><option value="true">Sì · rimborsabile (in fattura)</option><option value="false">No · costo a mio carico</option></select></div><div class="field"><label>Tipo calcolo</label><select name="calculation_type"><option value="manual_amount">Importo manuale</option><option value="quantity_rate">Quantità × tariffa</option></select></div><div class="field"><label>Unità</label><input name="unit_label" placeholder="km, notte, ticket..."></div><div class="field"><label>È un rimborso chilometrico</label><select name="is_mileage"><option value="false">No</option><option value="true">Sì · chiede veicolo, percorso e km</option></select></div><div class="field"><label>Tariffa default</label><input name="default_unit_rate" type="number" step="0.0001" value="0"></div><button class="primary">Aggiungi voce</button></form>${sortControl('expenseCategories')}<div class="list">${sortEntities('expenseCategories',data.expenseCategories).map(c=>`<div class="row" onclick="editExpenseCategory('${c.id}')"><div></div><div><div class="title">${esc(c.name)}</div><div class="desc">${c.reimbursable===false?'<b>Non rimborsabile (costo)</b>':'Rimborsabile'} · ${c.calculation_type==='quantity_rate'?'Quantità × tariffa':'Importo manuale'} · ${c.active?'Attiva':'Disattiva'}</div></div><div>›</div></div>`).join('')||emptyForm('Nessuna voce di costo o spesa.')}</div>`)}
function editExpenseCategory(id){navigateTo('expenseCategoryEdit',{edit:id})}
function expenseCategoryEdit(){const c=expenseCategoryById(state.edit);if(!c)return expenseCategories();return appShell(`<h1>Modifica voce di costo / spesa</h1><form class="form" onsubmit="saveExpenseCategory(event)"><div class="field"><label>Nome voce</label><input name="name" value="${esc(c.name)}" required></div><div class="field"><label>Rimborsabile dal cliente</label><select name="reimbursable"><option value="true" ${c.reimbursable!==false?'selected':''}>Sì · rimborsabile (in fattura)</option><option value="false" ${c.reimbursable===false?'selected':''}>No · costo a mio carico</option></select></div><div class="field"><label>Tipo calcolo</label><select name="calculation_type"><option value="manual_amount" ${c.calculation_type==='manual_amount'?'selected':''}>Importo manuale</option><option value="quantity_rate" ${c.calculation_type==='quantity_rate'?'selected':''}>Quantità × tariffa</option></select></div><div class="field"><label>Unità</label><input name="unit_label" value="${esc(c.unit_label||'')}"></div><div class="field"><label>È un rimborso chilometrico</label><select name="is_mileage"><option value="false" ${eVoceChilometrica(c)?'':'selected'}>No</option><option value="true" ${eVoceChilometrica(c)?'selected':''}>Sì · chiede veicolo, percorso e km</option></select></div><div class="field"><label>Tariffa default</label><input name="default_unit_rate" type="number" step="0.0001" value="${Number(c.default_unit_rate||0)}"></div><div class="field"><label>Macro voce fattura</label><input name="invoice_macro" value="${esc(c.invoice_macro||'Spese di trasferta')}"></div><div class="field"><label>Attiva</label><select name="active"><option value="true" ${c.active?'selected':''}>Sì</option><option value="false" ${!c.active?'selected':''}>No</option></select></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteExpenseCategory('${c.id}')">Elimina</button><button type="button" class="secondary" onclick="go('expenseCategories')">Annulla</button></div></form>`)}
async function addExpenseCategory(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={name:norm(f.name),calculation_type:f.calculation_type,unit_label:norm(f.unit_label)||null,is_mileage:f.is_mileage==='true',default_unit_rate:Number(f.default_unit_rate||0)||null,invoice_macro:'Spese di trasferta',reimbursable:f.reimbursable!=='false',active:true};const {error}=await insertResilient('expense_categories',payload,['reimbursable','is_mileage']);if(error)return setMsg(error.message,7000);await reload();state.view='expenseCategories';render()}
async function saveExpenseCategory(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={name:norm(f.name),calculation_type:f.calculation_type,unit_label:norm(f.unit_label)||null,is_mileage:f.is_mileage==='true',default_unit_rate:Number(f.default_unit_rate||0)||null,invoice_macro:norm(f.invoice_macro)||'Spese di trasferta',reimbursable:f.reimbursable!=='false',active:f.active==='true'};const {error}=await updateResilient('expense_categories',payload,state.edit,['reimbursable','is_mileage']);if(error)return setMsg(error.message,7000);await reload();state.view='expenseCategories';state.edit=null;render()}
async function deleteExpenseCategory(idv){if(!confirm('Eliminare voce spesa? Se usata in spese già inserite, il database potrebbe bloccare la cancellazione.'))return;const {error}=await sb.from('expense_categories').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='expenseCategories';render()}

function invoiceTemplates(){return appShell(`<h1>Template fattura / Fiscozen</h1><p class="sub">Gestisci qui cosa copiare su Fiscozen. I consuntivi non chiedono la voce fattura.</p><form class="form" onsubmit="addInvoiceTemplate(event)"><div class="field"><label>Codice</label><input name="template_code" placeholder="ES. CONSULENZA_CUSTOM" required></div><div class="field"><label>Nome</label><input name="name" required></div><div class="field"><label>Tipo riga</label><select name="entry_type"><option value="daily_rate_8h">Consulenza a ore/gg</option><option value="monthly_flat">Compenso mensile</option><option value="manual_entry">Consuntivo manuale</option><option value="travel_expenses">Spese di trasferta</option></select></div><div class="field"><label>Template testo</label><textarea name="template_text" required>Consulenza - [Mese Anno] - Cliente/Progetto: [Progetto]</textarea></div><button class="primary">Aggiungi template</button></form><div class="list">${data.invoiceTemplates.map(t=>`<div class="row" onclick="editInvoiceTemplate('${t.id}')"><div></div><div><div class="title">${esc(t.name)}</div><div class="desc">${esc(t.entry_type)} · ${esc(t.template_text)}</div></div><div>›</div></div>`).join('')||emptyForm('Nessun template fattura.')}</div>`)}
function editInvoiceTemplate(id){navigateTo('invoiceTemplateEdit',{edit:id})}
function invoiceTemplateEdit(){const t=data.invoiceTemplates.find(x=>x.id===state.edit);if(!t)return invoiceTemplates();return appShell(`<h1>Modifica template</h1><form class="form" onsubmit="saveInvoiceTemplate(event)"><div class="field"><label>Codice</label><input name="template_code" value="${esc(t.template_code)}" required></div><div class="field"><label>Nome</label><input name="name" value="${esc(t.name)}" required></div><div class="field"><label>Tipo riga</label><select name="entry_type"><option value="daily_rate_8h" ${t.entry_type==='daily_rate_8h'?'selected':''}>Consulenza a ore/gg</option><option value="monthly_flat" ${t.entry_type==='monthly_flat'?'selected':''}>Compenso mensile</option><option value="manual_entry" ${t.entry_type==='manual_entry'?'selected':''}>Consuntivo manuale</option><option value="travel_expenses" ${t.entry_type==='travel_expenses'?'selected':''}>Spese di trasferta</option></select></div><div class="field"><label>Template testo</label><textarea name="template_text" required>${esc(t.template_text)}</textarea></div><div class="field"><label>Attivo</label><select name="active"><option value="true" ${t.active?'selected':''}>Sì</option><option value="false" ${!t.active?'selected':''}>No</option></select></div><div class="field"><label>Ordine</label><input name="sort_order" type="number" value="${Number(t.sort_order||0)}"></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteInvoiceTemplate('${t.id}')">Elimina</button><button type="button" class="secondary" onclick="go('invoiceTemplates')">Annulla</button></div></form>`)}
async function addInvoiceTemplate(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={template_code:norm(f.template_code),name:norm(f.name),entry_type:f.entry_type,template_text:f.template_text,active:true,sort_order:99};const {error}=await insertResilient('invoice_templates',payload);if(error)return setMsg(error.message,7000);await reload();state.view='invoiceTemplates';render()}
async function saveInvoiceTemplate(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={template_code:norm(f.template_code),name:norm(f.name),entry_type:f.entry_type,template_text:f.template_text,active:f.active==='true',sort_order:Number(f.sort_order||0)};const {error}=await updateResilient('invoice_templates',payload,state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='invoiceTemplates';state.edit=null;render()}
async function deleteInvoiceTemplate(idv){if(!confirm('Eliminare template?'))return;const {error}=await sb.from('invoice_templates').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='invoiceTemplates';render()}

async function ensureClient(name,type,rowRate=0){let c=data.clients.find(x=>x.name.toLowerCase()===name.toLowerCase());if(c)return c;const {data:row,error}=await insertReturningResilient('clients',{name,compensation_type:type==='monthly'?'monthly_flat':'daily_rate_8h',daily_rate:Number(rowRate||0),standard_hours:8,active:true});if(error)throw error;data.clients.push(row);return row}
async function ensureProject(clientId,name){if(!name)return null;let p=data.projects.find(x=>x.client_id===clientId&&x.name.toLowerCase()===name.toLowerCase());if(p)return p;const {data:row,error}=await insertReturningResilient('projects',{client_id:clientId,name,active:true});if(error)throw error;data.projects.push(row);return row}
async function ensureActivity(name){if(!name)return null;let a=data.activities.find(x=>x.name.toLowerCase()===name.toLowerCase());if(a)return a;const {data:row,error}=await insertReturningResilient('activities',{name,active:true});if(error)throw error;data.activities.push(row);return row}
function parseCsvLine(line,sep){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(ch===sep&&!q){out.push(cur);cur=''}else cur+=ch}out.push(cur);return out.map(x=>x.trim())}
function canonHeader(h){return String(h||'').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w/ ]+/g,'').replace(/\s+/g,' ')}
function parseAmount(v){return Number(String(v||'0').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''))||0}
function toDate(v){v=norm(v);if(!v)return'';if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const m=v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);if(m)return`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return''}
function toMonth(v){const d=toDate(v);if(d)return d.slice(0,7);v=norm(v);if(/^\d{4}-\d{2}$/.test(v))return v;return''}
function exportRowsFor(month,clientId,projectId){const byFilters=(x,cid,pid)=>{if(clientId&&cid!==clientId)return false;if(projectId&&(pid||'')!==projectId)return false;return true};let rows=[];data.entries.filter(e=>String(e.entry_date||'').startsWith(month)&&byFilters(e,e.client_id,e.project_id)).forEach(e=>rows.push({tipo:'Consuntivo',data:e.entry_date,cliente:clientName(e.client_id),progetto:projectName(e.project_id),attivita:activityName(e.activity_id),descrizione:e.description||'',ore:Number(e.hours||0),quantita:'',sede:e.work_site||'',citta:e.work_city||'',note:e.notes||'',importo:dailyAmount(e)}));data.manualEntries.filter(e=>String(e.entry_date||'').startsWith(month)&&byFilters(e,e.client_id,e.project_id)).forEach(e=>rows.push({tipo:'Manuale',data:e.entry_date,cliente:clientName(e.client_id),progetto:projectName(e.project_id),attivita:activityName(e.activity_id),descrizione:e.description||'',ore:'',quantita:'',sede:e.work_site||'',citta:e.work_city||'',note:e.notes||'',importo:Number(e.amount||0)}));data.travelExpenses.filter(e=>String(e.expense_date||'').startsWith(month)&&byFilters(e,e.client_id,e.project_id)).forEach(e=>rows.push({tipo:'Spesa trasferta',data:e.expense_date,cliente:clientName(e.client_id),progetto:projectName(e.project_id),attivita:expenseCategoryName(e.expense_category_id),descrizione:e.description||'',ore:'',quantita:e.quantity||'',sede:e.work_site||'',citta:e.work_city||'',note:e.notes||'',importo:Number(e.amount||0)}));return rows.sort((a,b)=>String(a.data).localeCompare(String(b.data)))}
function downloadTimesheetExcel(ev){
  ev.preventDefault();
  const f=Object.fromEntries(new FormData(ev.target));
  const month=f.month||state.month;
  const include=f.include_amount==='true';
  const rows=exportRowsFor(month,f.client_id||'',f.project_id||'');
  if(!rows.length)return setMsg('Nessuna riga da esportare per i filtri selezionati.',5000);
  const hdr={b:true,fill:'0B1B31',bianco:true}, tot={b:true,fill:'EAF2FF'};
  const intest=['Tipo','Data','Cliente','Cliente/Progetto','Attività / Voce','Descrizione',
                'Ore','Quantità','Sede','Luogo/Città','Note'].concat(include?['Importo']:[]);
  const righe=[intest.map(h=>({v:h,s:hdr}))];
  const totOre=rows.reduce((s,r)=>s+(Number(r.ore)||0),0);
  const totImp=rows.reduce((s,r)=>s+(Number(r.importo)||0),0);
  rows.forEach(r=>{
    // la data come data vera, le ore e gli importi come numeri: in Excel
    // si ordinano, si filtrano e si sommano. Prima erano testo.
    const riga=[{v:r.tipo},{v:r.data,t:'d',s:{fmt:'dd/mm/yyyy'}},{v:r.cliente},{v:r.progetto},
      {v:r.attivita},{v:r.descrizione},
      r.ore!==''?{v:Number(r.ore),t:'n',s:{fmt:'0.00'}}:{v:''},
      {v:r.quantita},{v:r.sede},{v:r.citta},{v:r.note}];
    if(include)riga.push({v:Number(r.importo)||0,t:'n',s:{fmt:'0.00'}});
    righe.push(riga);
  });
  const finale=[{v:'Totale',s:tot},{v:'',s:tot},{v:'',s:tot},{v:'',s:tot},{v:'',s:tot},{v:'',s:tot},
                {v:totOre,t:'n',s:{b:true,fill:'EAF2FF',fmt:'0.00'}},
                {v:'',s:tot},{v:'',s:tot},{v:'',s:tot},{v:'',s:tot}];
  if(include)finale.push({v:totImp,t:'n',s:{b:true,fill:'EAF2FF',fmt:'0.00'}});
  righe.push(finale);
  const cols=[15,11,20,20,20,30,8,10,14,16,24].concat(include?[12]:[]);
  const blob=xlsxBlob([{nome:'Timesheet',cols,righe,blocca:1}]);
  const c=f.client_id?clientName(f.client_id).replace(/\W+/g,'_'):'TuttiClienti';
  const p=f.project_id?projectName(f.project_id).replace(/\W+/g,'_'):'TuttiProgetti';
  const a=document.createElement('a');
  const url=URL.createObjectURL(blob);
  a.href=url;a.download=`TOTIME_Timesheet_${c}_${p}_${month}.xlsx`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  setMsg(`Export creato: ${rows.length} righe.`,5000);
}

async function importCsv(ev){const file=ev.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{try{const text=reader.result.replace(/^\uFEFF/,'').trim();if(!text)return setMsg('CSV vuoto.');const lines=text.split(/\r?\n/).filter(Boolean);const sep=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';const headers=parseCsvLine(lines.shift(),sep).map(canonHeader);const get=(row,names)=>{for(const n of names.map(canonHeader)){const i=headers.indexOf(n);if(i>=0)return row[i]||''}return''};let count=0,updated=0,skipped=0,createdClients=0,createdProjects=0,createdActivities=0;for(const line of lines){const row=parseCsvLine(line,sep);if(!row.some(x=>norm(x))){skipped++;continue}const cliente=norm(get(row,['cliente','client']));if(!cliente){skipped++;continue}const tipoRaw=get(row,['tipo','type']);const tipo=(tipoRaw||'Tariffa giornaliera 8h').toLowerCase();const isMonthly=tipo.includes('mens')||tipo.includes('monthly')||tipo.includes('una tantum');const ore=parseAmount(get(row,['ore','hours']));const amount=parseAmount(get(row,['importo','amount']));let rowRate=amount>0&&ore>0?amount/ore*8:0;const beforeC=data.clients.length;const client=await ensureClient(cliente,isMonthly?'monthly':'daily',rowRate);if(data.clients.length>beforeC)createdClients++;if(!client.daily_rate&&rowRate>0){await updateResilient('clients',{daily_rate:rowRate},client.id);client.daily_rate=rowRate}const progetto=norm(get(row,['cliente/progetto','progetto','cliente finale','project']));const beforeP=data.projects.length;const project=await ensureProject(client.id,progetto);if(data.projects.length>beforeP)createdProjects++;const att=norm(get(row,['attività','attivita','activity']));const beforeA=data.activities.length;const activity=await ensureActivity(att);if(data.activities.length>beforeA)createdActivities++;const descrizione=get(row,['descrizione','description']);const sede=norm(get(row,['sede','work_site','site']));const citta=norm(get(row,['luogo/città','luogo/citta','città','citta','luogo','work_city','city','location']));const luogo=[sede,citta].filter(Boolean).join(' - ');const note=get(row,['note','notes']);const idv=norm(get(row,['id','import_id','riga','key','chiave']));if(isMonthly){const mese=norm(get(row,['mese','month']))||toMonth(get(row,['data','date']))||state.month;const [year,month]=mese.split('-').map(Number);const payload={year,month,client_id:client.id,project_id:project?.id||null,description:descrizione||null,notes:note||null,amount};const key=idv?importKey(['mc',idv]):importKey(['mc',year,month,client.id,project?.id||'']);const {res,updated:u}=await upsertByKey('monthly_compensations',data.monthly,payload,key);if(res.error)throw res.error;if(u)updated++;else count++;}else{const date=toDate(get(row,['data','date']))||new Date().toISOString().slice(0,10);const rate=rowRate||Number(client.daily_rate||0);const payload={entry_date:date,client_id:client.id,project_id:project?.id||null,activity_id:activity?.id||null,work_location:luogo||null,work_site:sede||null,work_city:citta||null,description:descrizione||null,notes:note||null,hours:ore,daily_rate_snapshot:rate,standard_hours_snapshot:8};const key=idv?importKey(['ts',idv]):importKey(['ts',date,client.id,project?.id||'',activity?.id||'',descrizione,ore]);const {res,updated:u}=await upsertByKey('timesheet_entries',data.entries,payload,key);if(res.error)throw res.error;if(u)updated++;else count++;}}
await fetchAll();state.view='timesheet';setMsg(`Import completato: ${count} inserite, ${updated} aggiornate. Clienti creati: ${createdClients}. Progetti: ${createdProjects}. Attività: ${createdActivities}. Scartate: ${skipped}.`,9000)}catch(e){console.error(e);setMsg('Errore import CSV: '+(e.message||e),9000)}};reader.readAsText(file,'windows-1252')}
function exportData(){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='totime-supabase-backup.json';a.click()}
/* ==================================================================
   Commesse, progetti e WBS
   Gerarchia: Cliente -> Commessa -> Progetto -> WBS -> registrazioni.
   Regola di fondo: si registra e si controlla sulla WBS, ma si
   fattura sempre a livello di commessa/progetto. La WBS non diventa
   mai una riga di fattura.
   Tutto qui dentro si spegne da solo se la migrazione non e' stata
   applicata: wbsReady() e' falso e le voci non compaiono.
   ================================================================== */
const STATI={draft:'Bozza',active:'Attiva',suspended:'Sospesa',closed:'Chiusa',cancelled:'Annullata'};
const TIPI_WBS={activity:'Attività',project_management:'Project management',analysis:'Analisi',
  development:'Sviluppo / supporto',travel:'Trasferta',internal:'Attività interna',expense:'Spesa',other:'Altro'};
const STATI_APERTI=['draft','active'];
function normCode(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function wbsReady(){return (!state.missingTables||!state.missingTables.has('wbs_items'))&&versoNuovo()}
// Le tabelle possono esserci ma nel verso vecchio, se la migrazione di
// inversione non e' ancora stata lanciata. In quel caso i collegamenti
// che l'app cerca non esistono e la gerarchia risulterebbe vuota senza
// dire perche': meglio accorgersene e dirlo.
function versoNuovo(){
  const eng=data.engagements||[];
  if(!eng.length)return true;                       // niente da giudicare
  return eng.some(e=>e.project_id);                 // il verso nuovo ha questo campo
}
function engagementById(id){return (data.engagements||[]).find(e=>e.id===id)}
function engagementsOf(clientId){return (data.engagements||[]).filter(e=>e.client_id===clientId)}
// Una commessa nasce con una WBS sola, che l'app crea da se'. Chi
// vuole spezzare il lavoro in piu' voci puo' farlo, ma non e' il
// percorso normale: dove la WBS e' una sola l'app non la nomina
// nemmeno, e si registra su cliente, progetto e commessa.
function wbsUnica(engId){const l=wbsOfEngagement(engId);return l.length===1?l[0]:null}
function wbsDaScegliere(engId){return wbsOfEngagement(engId).length>1}
// Il verso: Cliente > Progetto (cliente finale) > Commessa > Attivita'.
// Il progetto e' l'entita' che dura, e sotto ci si appendono le
// commesse man mano: contratto 2026, contratto 2027, ordini distinti.
function projectsOfClient(clientId){return (data.projects||[]).filter(p=>p.client_id===clientId)
  .sort((a,b)=>String(a.code||a.name).localeCompare(String(b.code||b.name),'it'))}
function engagementsOfProject(projId){return (data.engagements||[]).filter(e=>e.project_id===projId)
  .sort((a,b)=>(b.year-a.year)||(b.seq-a.seq))}
function wbsById(id){return (data.wbsItems||[]).find(w=>w.id===id)}
function wbsOfEngagement(engId){return (data.wbsItems||[]).filter(w=>w.engagement_id===engId)
  .sort((a,b)=>(a.sort_order-b.sort_order)||String(a.activity_code).localeCompare(String(b.activity_code),'it'))}
function wbsAperte(engId){return wbsOfEngagement(engId).filter(w=>STATI_APERTI.includes(w.status))}
function engagementLabel(e){return e?`${e.code} · ${e.name}`:''}
function wbsLabel(w){return w?`${w.code} · ${w.name}`:''}
function projectFullCode(p){return p&&p.code?p.code:(p?p.name:'')}
// Quante registrazioni pendono da una WBS: serve prima di chiuderla
function wbsUsage(id){
  const t=(data.entries||[]).filter(e=>e.wbs_id===id).length;
  const m=(data.manualEntries||[]).filter(e=>e.wbs_id===id).length;
  const x=(data.travelExpenses||[]).filter(e=>e.wbs_id===id).length;
  return {t,m,x,tot:t+m+x};
}
function statoTag(st){const cls=st==='active'?'green':st==='closed'||st==='cancelled'?'gray':'orange';
  return `<span class="tag ${cls}">${STATI[st]||st}</span>`}

/* ---------- Elenco commesse ---------- */
function engagementFilters(){
  const f=state.engFilter||{};
  const anni=[...new Set((data.engagements||[]).map(e=>e.year))].sort((a,b)=>b-a);
  return `<div class="miniActions" style="grid-template-columns:1fr 1fr">
    <select class="miniBtn" onchange="setEngFilter('client_id',this.value)"><option value="">Tutti i clienti (solo per archivio)</option>
      ${(data.clients||[]).map(c=>`<option value="${c.id}" ${f.client_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
    <select class="miniBtn" onchange="setEngFilter('year',this.value)"><option value="">Tutti gli anni</option>
      ${anni.map(y=>`<option value="${y}" ${String(f.year)===String(y)?'selected':''}>${y}</option>`).join('')}</select>
    <select class="miniBtn" onchange="setEngFilter('status',this.value)"><option value="">Tutti gli stati</option>
      ${Object.entries(STATI).map(([k,v])=>`<option value="${k}" ${f.status===k?'selected':''}>${v}</option>`).join('')}</select>
    <input class="miniBtn" placeholder="Cerca codice o nome" value="${esc(f.q||'')}" oninput="setEngFilter('q',this.value)">
  </div>`;
}
function setEngFilter(k,v){state.engFilter={...(state.engFilter||{}),[k]:v};render()}
function engagementRows(){
  const f=state.engFilter||{};
  return (data.engagements||[]).filter(e=>
    (!f.client_id||e.client_id===f.client_id)&&
    (!f.year||String(e.year)===String(f.year))&&
    (!f.status||e.status===f.status)&&
    (!f.q||(`${e.code} ${e.name}`).toLowerCase().includes(String(f.q).toLowerCase()))
  ).sort((a,b)=>String(b.code).localeCompare(String(a.code),'it'));
}
function engagements(){
  if(!wbsReady())return migrazioneMancante('Commesse');
  const rows=engagementRows();
  return appShell(`<h1>Commesse</h1>
    <p class="sub">Elenco di tutte le commesse. Per aprirne una nuova si passa dal progetto:
    Cliente › Progetto › + Nuova commessa. Il codice si compone da solo.</p>
    ${engagementFilters()}
    <div class="list">${rows.map(e=>{
      const prj=(data.projects||[]).find(x=>x.id===e.project_id);
      const ws=wbsOfEngagement(e.id);
      return `<div class="row" onclick="openEngagement('${e.id}')">
        <div class="date">${e.year}</div>
        <div><div class="title">${esc(e.code)} ${statoTag(e.status)}</div>
          <div class="desc">${esc(clientName(e.client_id))}${prj?' › '+esc(prj.name):''} · ${esc(e.name)}</div>
          <div class="desc">${ws.length===1?'1 attività':ws.length+' attività'}${e.engagement_letter?' · '+esc(e.engagement_letter):''}</div></div>
        <div class="chev">›</div></div>`}).join('')||
      '<div class="empty">Nessuna commessa.'+(( data.engagements||[]).length?' Nessuna corrisponde ai filtri.':'')+'</div>'}</div>`);
}
function migrazioneMancante(titolo){
  if(!versoNuovo())return appShell(`<h1>${esc(titolo)}</h1>
    <div class="card"><b>Manca l'inversione di progetto e commessa</b>
    <div class="desc" style="margin-top:6px">Le tabelle ci sono, ma sono ancora nel verso vecchio
    (Cliente › Commessa › Progetto). Questa versione dell'app lavora nel verso nuovo
    (Cliente › Progetto › Commessa › Attività). Lancia nel SQL Editor di Supabase, in quest'ordine:</div>
    <div class="copybox">migrations/2026-09-10_inversione-anteprima.sql
&nbsp;&nbsp;(sola lettura: mostra cosa cambierà)
migrations/2026-09-10_inversione-progetto-commessa.sql</div>
    <div class="desc">Fino ad allora il resto dell'app funziona normalmente.</div></div>
    <button type="button" class="secondary" onclick="go('settings')">Torna a Impostazioni</button>`);
  return appShell(`<h1>${esc(titolo)}</h1>
    <div class="card"><b>Migrazione non ancora applicata</b>
    <div class="desc" style="margin-top:6px">Questa sezione richiede le tabelle di commesse e WBS.
    Esegui nel SQL Editor di Supabase, in quest'ordine:</div>
    <div class="copybox">migrations/2026-09-09_commesse-progetti-wbs.sql
migrations/2026-09-09_backfill-a-codici-cliente.sql
&nbsp;&nbsp;(rivedi i codici cliente proposti)
migrations/2026-09-09_backfill-b-commesse-wbs.sql</div>
    <div class="desc">Fino ad allora il resto dell'app funziona normalmente.</div></div>
    <button type="button" class="secondary" onclick="go('settings')">Torna a Impostazioni</button>`);
}

/* ---------- Dettaglio commessa ---------- */
function openEngagement(id){navigateTo('engagementDetail',{edit:id})}
function engagementDetail(){
  if(!wbsReady())return migrazioneMancante('Commessa');
  const e=engagementById(state.edit);if(!e)return engagements();
  const p=(data.projects||[]).find(x=>x.id===e.project_id);
  const ws=wbsOfEngagement(e.id);
  const refs=(data.engagementReferences||[]).filter(r=>r.engagement_id===e.id);
  const oreDi=w=>(data.entries||[]).filter(x=>x.wbs_id===w.id).reduce((t,x)=>t+Number(x.hours||0),0);
  return appShell(`<h1>${esc(e.code)}</h1>
    <p class="sub">${esc(clientName(e.client_id))}${p?' › '+esc(p.name):''} · ${esc(e.name)} ${statoTag(e.status)}</p>
    <div class="card"><b>Dati della commessa</b>
      <div class="list" style="box-shadow:none;margin:10px 0 0">
        ${rigaDato('Cliente contrattuale',clientName(e.client_id))}
        ${rigaDato('Anno / progressivo',e.year+' / '+String(e.seq).padStart(3,'0'))}
        ${rigaDato("Lettera d'incarico",e.engagement_letter||'—')}
        ${rigaDato('Riferimento in fattura',e.invoice_reference||'—')}
        ${rigaDato('Ordine cliente (PO)',e.purchase_order||'—')}
        ${rigaDato('Periodo',[e.start_date?dateIT(e.start_date):'',e.end_date?dateIT(e.end_date):''].filter(Boolean).join(' → ')||'—')}
        ${e.budget_amount?rigaDato('Budget',fmtEUR(e.budget_amount)):''}
      </div>
      <button type="button" class="secondary" style="margin-top:12px" onclick="navigateTo('engagementEdit',{edit:'${e.id}'})">Modifica commessa</button>
    </div>
    <h2>${ws.length>1?'Attività':'Su cosa si registra'}</h2>
    <p class="sub">${ws.length>1
      ? `Le ore si registrano sull'attività. In fattura confluiscono tutte in una riga sola di progetto. Codici a decine — 10, 20, 30… — così puoi inserire una 15 in mezzo senza rinumerare niente.`
      : `Questa commessa ha una voce sola: registri qui sopra senza dover scegliere niente. Se un giorno ti serve separare il lavoro — per esempio incident e progetti — puoi aggiungere altre voci qui sotto.`}</p>
    <div class="list">${ws.map(w=>{
      const ore=oreDi(w);const u=wbsUsage(w.id);
      return `<div class="row" onclick="editWbs('${w.id}')">
        <div class="date">${esc(w.activity_code)}</div>
        <div><div class="title">${esc(w.name)} ${statoTag(w.status)}${w.billable?'':' <span class="tag gray">non fatturabile</span>'}</div>
          <div class="desc">${esc(w.code)} · ${TIPI_WBS[w.kind]||w.kind}</div>
          <div class="desc">${fmtNum(ore,1)} h consuntivate${w.budget_hours?' su '+fmtNum(w.budget_hours,1)+' h di budget':''}${u.tot?' · '+u.tot+' registrazion'+(u.tot===1?'e':'i'):''}</div></div>
        <div class="chev">›</div></div>`}).join('')||'<div class="empty">Nessuna attività. Aggiungine una qui sotto.</div>'}</div>
    <details class="moreFields" ${ws.length?'':'open'}><summary>${ws.length?'Dividi in più attività (facoltativo)':'+ Aggiungi la voce su cui registrare'}</summary>
      <form class="form" onsubmit="addWbs(event)" style="margin-top:10px">
        <div class="field"><label>Codice attività</label>
          <input name="activity_code" maxlength="6" value="${String((ws.length+1)*10)}" oninput="this.value=normCode(this.value);previewWbsCode()">
          <div class="small">Anteprima: <span id="wbsCodePreview">${esc(e.code||'')}-${(ws.length+1)*10}</span></div></div>
        <div class="field"><label>Descrizione</label><input name="name" required placeholder="Es. Project Management"></div>
        <div class="field"><label>Dall'anagrafica attività</label><select name="activity_id">${activityOptions()}</select>
          <div class="small">Facoltativo: collega questa voce all'elenco attività, per ritrovarla nei report.</div></div>
        <div class="field"><label>Tipologia</label><select name="kind">${Object.entries(TIPI_WBS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label>Fatturabile</label><select name="billable"><option value="1">Sì, le ore vanno in fattura</option><option value="0">No, attività non fatturabile</option></select></div>
        <div class="field"><label>Budget ore (facoltativo)</label><input name="budget_hours" type="number" step="0.5"></div>
        <button class="primary">Aggiungi attività</button></form></details>
    <h2>Riferimenti contrattuali</h2>
    <p class="sub">Una proroga non cambia la commessa: aggiunge un riferimento. Lo storico resta.</p>
    <div class="list">${refs.map(r=>`<div class="row"><div></div>
      <div><div class="title">${esc(r.engagement_letter||r.purchase_order||'Riferimento')}</div>
        <div class="desc">${[r.valid_from?dateIT(r.valid_from):'',r.valid_to?dateIT(r.valid_to):''].filter(Boolean).join(' → ')||'senza scadenza'}${r.invoice_reference?' · '+esc(r.invoice_reference):''}</div></div>
      <div class="value">${STATI_RIF[r.status]||r.status}</div></div>`).join('')||'<div class="empty">Nessun riferimento storicizzato.</div>'}</div>
    <details class="moreFields"><summary>+ Aggiungi riferimento</summary>
      <form class="form" onsubmit="addEngagementRef(event)" style="margin-top:10px">
        <div class="field"><label>Lettera d'incarico</label><input name="engagement_letter" placeholder="Es. LI_202601"></div>
        <div class="field"><label>Ordine cliente (PO)</label><input name="purchase_order"></div>
        <div class="field"><label>Riferimento da riportare in fattura</label><input name="invoice_reference" placeholder="Es. LI_202601_Nome_Cognome"></div>
        <div class="field"><label>Valido dal</label><input name="valid_from" type="date"></div>
        <div class="field"><label>Valido al</label><input name="valid_to" type="date"></div>
        <button class="primary">Aggiungi riferimento</button></form></details>
    <h2>Report di questa commessa</h2>
    <div class="list">
      <div class="row" onclick="go('fatturazioneCommessa')"><div></div>
        <div><div class="title">Fatturazione per commessa</div>
        <div class="desc">Quanto è maturato e quanto è già stato fatturato.</div></div><div class="chev">›</div></div>
      <div class="row" onclick="go('reportWbs')"><div></div>
        <div><div class="title">Report analitico WBS</div>
        <div class="desc">Il dettaglio per voce di lavoro.</div></div><div class="chev">›</div></div>
    </div>
    <button type="button" class="secondary" onclick="${p?`openProject('${p.id}')`:`go('engagements')`}">${p?'Torna al progetto':'Torna alle commesse'}</button>`);
}
const STATI_RIF={active:'Attivo',expired:'Scaduto',superseded:'Sostituito',cancelled:'Annullato'};
function rigaDato(etichetta,valore){return `<div class="row"><div></div><div><div class="title">${esc(etichetta)}</div></div><div class="value">${esc(String(valore))}</div></div>`}

/* ---------- Creazione e modifica commessa ---------- */
// Si apre sempre da un progetto: e' il progetto a reggere le commesse.
function nuovaCommessaDi(projectId){navigateTo('engagementNew',{parent:projectId})}
function engagementForm(e){
  const nuovo=!e;
  // Il progetto da cui si e' arrivati va sempre incluso, anche se il
  // codice non risulta ancora: se sparisse dall'elenco il modulo ne
  // sceglierebbe un altro da se', e la commessa finirebbe sotto il
  // progetto sbagliato senza che nessuno se ne accorga.
  const conCodice=(data.projects||[]).filter(p=>p.code||p.id===state.parent);
  const senzaCodice=(data.projects||[]).filter(p=>!p.code&&p.id!==state.parent);
  if(nuovo&&!conCodice.length)return appShell(`<h1>Nuova commessa</h1>
    <div class="card"><b>Serve prima un progetto con codice</b>
    <div class="desc" style="margin-top:6px">Il codice della commessa si compone da quello del progetto,
    che a sua volta viene dal codice del cliente. Apri il cliente e creagli il progetto (o cliente finale).</div></div>
    <button type="button" class="secondary" onclick="go('clients')">Vai ai clienti</button>`);
  const p0=e?e.project_id:(state.parent||(conCodice[0]||{}).id);
  return appShell(`<h1>${nuovo?'Nuova commessa':'Modifica '+esc(e.code)}</h1>
    <p class="sub">Il codice si compone da solo. Lettera d'incarico e PO sono campi a parte: non entrano nel codice.</p>
    <form class="form" onsubmit="${nuovo?'addEngagement':'saveEngagement'}(event)">
      <div class="field"><label>Progetto / cliente finale</label>
        <select name="project_id" ${nuovo?'onchange="previewEngCode()"':'disabled'}>
          ${conCodice.map(p=>`<option value="${p.id}" ${p.id===p0?'selected':''}>${esc(p.code)} · ${esc(clientName(p.client_id))} › ${esc(p.name)}</option>`).join('')}
        </select>${senzaCodice.length?`<div class="small">${senzaCodice.length} progett${senzaCodice.length===1?'o senza codice non è selezionabile':'i senza codice non sono selezionabili'}.</div>`:''}</div>
      <div class="field"><label>Anno</label><input name="year" type="number" value="${e?e.year:new Date().getFullYear()}" ${nuovo?'onchange="previewEngCode()"':'disabled'}></div>
      ${nuovo?`<div class="field"><label>Codice che verrà assegnato</label><div class="copybox" id="engCodePreview">—</div>
        <div class="small">Il progressivo definitivo lo assegna il database al salvataggio.</div></div>`:
        `<div class="field"><label>Codice</label><div class="copybox">${esc(e.code)}</div></div>`}
      <div class="field"><label>Nome o descrizione</label><input name="name" value="${e?esc(e.name):''}" required></div>
      <div class="field"><label>Lettera d'incarico</label><input name="engagement_letter" value="${e?esc(e.engagement_letter||''):''}" placeholder="Es. LI_202601"></div>
      <div class="field"><label>Riferimento da riportare in fattura</label><input name="invoice_reference" value="${e?esc(e.invoice_reference||''):''}" placeholder="Es. LI_202601_Nome_Cognome"></div>
      <div class="field"><label>Ordine cliente (PO)</label><input name="purchase_order" value="${e?esc(e.purchase_order||''):''}"></div>
      <div class="field"><label>Data di inizio</label><input name="start_date" type="date" value="${e?esc(e.start_date||''):''}"></div>
      <div class="field"><label>Data di fine prevista</label><input name="end_date" type="date" value="${e?esc(e.end_date||''):''}"></div>
      <div class="field"><label>Budget (facoltativo)</label><input name="budget_amount" type="number" step="0.01" value="${e&&e.budget_amount!=null?e.budget_amount:''}"></div>
      <div class="field"><label>Stato</label><select name="status">${Object.entries(STATI).map(([k,v])=>`<option value="${k}" ${(e?e.status:'active')===k?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Note</label><textarea name="notes">${e?esc(e.notes||''):''}</textarea></div>
      <div class="actions"><button class="primary">${nuovo?'Crea commessa':'Salva modifiche'}</button>
        <button type="button" class="secondary" onclick="${nuovo?(state.parent?`openProject('${state.parent}')`:`go('engagements')`):`navigateTo('engagementDetail',{edit:'${e.id}'})`}">Annulla</button></div>
    </form>`);
}
function engagementNew(){return wbsReady()?engagementForm(null):migrazioneMancante('Nuova commessa')}
function engagementEdit(){const e=engagementById(state.edit);return e?engagementForm(e):engagements()}
// Anteprima del codice mentre si compila: il valore vero lo assegna
// comunque il database.
function previewEngCode(){
  const f=document.querySelector('form.form');if(!f)return;
  const prj=(data.projects||[]).find(x=>x.id===f.project_id.value);
  const y=f.year.value||new Date().getFullYear();
  // il progressivo riparte per progetto e anno, non piu' per cliente
  const usate=engagementsOfProject(f.project_id.value).filter(e=>String(e.year)===String(y)).length;
  const box=document.getElementById('engCodePreview');
  if(box)box.textContent=prj&&prj.code?`${prj.code}-${y}-${String(usate+1).padStart(3,'0')}`:'—';
}

/* ---------- Progetto: dati e WBS ---------- */
function openProject(id){navigateTo('projectDetail',{edit:id})}
// Compatibilita': i vecchi collegamenti puntavano alla pagina WBS del
// progetto, che adesso e' la pagina della commessa.
function openProjectWbs(id){openProject(id)}
function projectDetail(){
  if(!wbsReady())return migrazioneMancante('Progetto');
  const p=(data.projects||[]).find(x=>x.id===state.edit);if(!p)return engagements();
  const eng=engagementsOfProject(p.id);
  const oreDiCommessa=e=>wbsOfEngagement(e.id).reduce((t,w)=>
    t+(data.entries||[]).filter(x=>x.wbs_id===w.id).reduce((a,x)=>a+Number(x.hours||0),0),0);
  return appShell(`<h1>${esc(p.code||p.name)}</h1>
    <p class="sub">${esc(clientName(p.client_id))} · ${esc(p.name)}${p.end_client_name?' · cliente finale '+esc(p.end_client_name):''} ${statoTag(p.status||'active')}</p>
    <div class="card"><b>Il progetto è il livello a cui si fattura</b>
      <div class="desc" style="margin-top:6px">Sotto ci stanno le commesse: un contratto nuovo, un ordine
      aggiuntivo, l'anno dopo. Le ore si registrano sulle attività dentro la commessa, ma in fattura
      confluiscono in una riga sola intestata a questo progetto.</div>
      <div class="list" style="box-shadow:none;margin:10px 0 0">
        ${rigaDato('Codice',p.code||'—')}
        ${rigaDato('Unità di fatturazione',p.billing_unit==='hour'?'Ore':'Giornate')}
        ${rigaDato('Descrizione riga fattura',p.invoice_line_description||'— (si usa il nome del progetto)')}
      </div>
      <button type="button" class="secondary" style="margin-top:12px" onclick="navigateTo('projectEdit',{edit:'${p.id}'})">Modifica progetto</button>
    </div>
    <h2>Commesse</h2>
    <div class="list">${eng.map(e=>{
      const ws=wbsOfEngagement(e.id);
      return `<div class="row" onclick="openEngagement('${e.id}')">
        <div class="date">${e.year}</div>
        <div><div class="title">${esc(e.code)} ${statoTag(e.status)}</div>
          <div class="desc">${esc(e.name)}${e.engagement_letter?' · '+esc(e.engagement_letter):''}</div>
          <div class="desc">${ws.length===1?'1 attività':ws.length+' attività'} · ${fmtNum(oreDiCommessa(e),1)} h</div></div>
        <div class="chev">›</div></div>`}).join('')||'<div class="empty">Nessuna commessa su questo progetto.</div>'}</div>
    <button type="button" class="secondary" onclick="nuovaCommessaDi('${p.id}')">+ Nuova commessa</button>
    <button type="button" class="secondary" onclick="openClient('${p.client_id}')">Torna al cliente</button>`);
}
function previewWbsCode(){
  const f=document.querySelector("form.form");const e=engagementById(state.edit);
  const box=document.getElementById("wbsCodePreview");
  if(f&&e&&box)box.textContent=(e.code||"")+"-"+normCode(f.activity_code.value);
}
function editWbs(id){navigateTo("wbsEdit",{edit:id,parent:state.edit})}
function wbsEdit(){
  const w=wbsById(state.edit);if(!w)return engagements();
  const u=wbsUsage(w.id);const bloccato=u.tot>0;
  return appShell(`<h1>${esc(w.code)}</h1>
    <p class="sub">${esc(w.name)} ${statoTag(w.status)}</p>
    <form class="form" onsubmit="saveWbs(event)">
      <div class="field"><label>Codice attività</label>
        <input name="activity_code" value="${esc(w.activity_code)}" ${bloccato?"readonly":'oninput="this.value=normCode(this.value)"'}>
        <div class="small">${bloccato?"Bloccato: ci sono "+u.tot+" registrazion"+(u.tot===1?"e":"i")+" su questa WBS. La descrizione si può comunque cambiare.":"Ancora modificabile: nessuna registrazione la usa."}</div></div>
      <div class="field"><label>Descrizione</label><input name="name" value="${esc(w.name)}" required></div>
      <div class="field"><label>Dall'anagrafica attività</label>
        <select name="activity_id">${activityOptions(w.activity_id||'')}</select>
        <div class="small">Facoltativo: collega questa voce all'elenco attività, per ritrovarla nei report fra commesse diverse.</div></div>
      <div class="field"><label>Tipologia</label><select name="kind">${Object.entries(TIPI_WBS).map(([k,v])=>`<option value="${k}" ${w.kind===k?"selected":""}>${v}</option>`).join("")}</select></div>
      <div class="field"><label>Fatturabile</label><select name="billable"><option value="1" ${w.billable?"selected":""}>Sì, le ore vanno in fattura</option><option value="0" ${w.billable?"":"selected"}>No, attività non fatturabile</option></select></div>
      <div class="field"><label>Budget ore</label><input name="budget_hours" type="number" step="0.5" value="${w.budget_hours!=null?w.budget_hours:""}"></div>
      <div class="field"><label>Ordinamento</label><input name="sort_order" type="number" value="${w.sort_order||0}"></div>
      <div class="field"><label>Stato</label><select name="status">${Object.entries(STATI).map(([k,v])=>`<option value="${k}" ${w.status===k?"selected":""}>${v}</option>`).join("")}</select>
        <div class="small">Una WBS chiusa non accetta nuove registrazioni, ma resta nello storico e nei report.</div></div>
      <div class="field"><label>Note</label><textarea name="notes">${esc(w.notes||"")}</textarea></div>
      ${bloccato?wbsSpostaOptions(w):""}
      <div class="actions"><button class="primary">Salva modifiche</button>
        ${bloccato?"":`<button type="button" class="secondary danger" onclick="deleteWbs('${w.id}')">Elimina</button>`}
        <button type="button" class="secondary" onclick="openEngagement('${w.engagement_id}')">Annulla</button></div>
    </form>`);
}

/* ---------- Azioni ---------- */
async function addEngagement(ev){
  ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));
  const prj=(data.projects||[]).find(x=>x.id===f.project_id);
  const payload={project_id:f.project_id,client_id:prj?prj.client_id:null,
    year:Number(f.year)||new Date().getFullYear(),name:norm(f.name),
    engagement_letter:norm(f.engagement_letter)||null,invoice_reference:norm(f.invoice_reference)||null,
    purchase_order:norm(f.purchase_order)||null,start_date:f.start_date||null,end_date:f.end_date||null,
    budget_amount:f.budget_amount?Number(f.budget_amount):null,status:f.status||"active",notes:norm(f.notes)||null};
  const {error}=await insertResilient("engagements",payload);
  if(error)return setMsg(messaggioCommessa(error),8000);
  await reload();
  // La commessa nasce gia' con la sua WBS: e' quella su cui si
  // registra. Spezzarla in piu' voci resta possibile, ma nessuno deve
  // essere costretto a farlo per poter consuntivare.
  const nuova=(data.engagements||[]).find(x=>x.project_id===f.project_id
    && String(x.year)===String(payload.year) && !wbsOfEngagement(x.id).length);
  if(nuova){
    await insertResilient("wbs_items",{engagement_id:nuova.id,activity_code:"10",
      name:prj?prj.name:norm(f.name),kind:"activity",billable:true,status:"active",sort_order:10});
    await reload();
  }
  navigateTo("projectDetail",{edit:f.project_id});
  setMsg("Commessa creata: puoi già registrarci sopra.",4000);
}
async function saveEngagement(ev){
  ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));
  const payload={name:norm(f.name),engagement_letter:norm(f.engagement_letter)||null,
    invoice_reference:norm(f.invoice_reference)||null,purchase_order:norm(f.purchase_order)||null,
    start_date:f.start_date||null,end_date:f.end_date||null,
    budget_amount:f.budget_amount?Number(f.budget_amount):null,status:f.status,notes:norm(f.notes)||null};
  const r=await updateResilient("engagements",payload,state.edit);
  if(r.error)return setMsg(messaggioCommessa(r.error),8000);
  await reload();state.view="engagementDetail";render();
}
async function addEngagementRef(ev){
  ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));
  if(!norm(f.engagement_letter)&&!norm(f.purchase_order))return setMsg("Serve almeno una lettera d'incarico o un PO.",5000);
  const {error}=await insertResilient("engagement_references",{engagement_id:state.edit,
    engagement_letter:norm(f.engagement_letter)||null,purchase_order:norm(f.purchase_order)||null,
    invoice_reference:norm(f.invoice_reference)||null,valid_from:f.valid_from||null,valid_to:f.valid_to||null,
    reference_type:norm(f.purchase_order)&&!norm(f.engagement_letter)?"purchase_order":"engagement_letter"});
  if(error)return setMsg(error.message,7000);
  await reload();render();setMsg("Riferimento aggiunto. Lo storico precedente resta.",4000);
}
async function addWbs(ev){
  ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));
  const {error}=await insertResilient("wbs_items",{engagement_id:state.edit,activity_code:normCode(f.activity_code),
    name:norm(f.name),kind:f.kind||"activity",billable:f.billable==="1",
    activity_id:f.activity_id||null,
    budget_hours:f.budget_hours?Number(f.budget_hours):null,sort_order:Number(normCode(f.activity_code))||0});
  if(error)return setMsg(messaggioWbs(error),8000);
  await reload();render();setMsg("Attività aggiunta.",3000);
}
async function saveWbs(ev){
  ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));
  const w=wbsById(state.edit);if(!w)return;
  const payload={name:norm(f.name),kind:f.kind,billable:f.billable==="1",
    activity_id:f.activity_id||null,
    budget_hours:f.budget_hours?Number(f.budget_hours):null,sort_order:Number(f.sort_order)||0,
    status:f.status,notes:norm(f.notes)||null};
  if(!wbsUsage(w.id).tot)payload.activity_code=normCode(f.activity_code);
  const r=await updateResilient("wbs_items",payload,w.id);
  if(r.error)return setMsg(messaggioWbs(r.error),8000);
  await reload();navigateTo("engagementDetail",{edit:w.engagement_id});
}
async function deleteWbs(id){
  const w=wbsById(id);if(!w)return;
  if(wbsUsage(id).tot)return setMsg("Questa attività ha delle registrazioni: si può chiudere, non eliminare.",6000);
  if(!confirm("Eliminare l'attività "+w.code+"? Non è mai stata usata, quindi non si perde nulla."))return;
  const {error}=await sb.from("wbs_items").delete().eq("id",id);
  if(error)return setMsg(error.message,7000);
  await reload();navigateTo("engagementDetail",{edit:w.engagement_id});
}
// Messaggi comprensibili al posto degli errori del database
function messaggioCommessa(e){
  const m=String(e&&e.message||e);
  if(/non ha un codice/.test(m))return "Manca un codice a monte: il cliente deve avere il suo (Impostazioni → Clienti) e il progetto il suo codice breve.";
  if(/duplicate key|unique/i.test(m))return "Esiste già una commessa con questo codice.";
  return m;
}
function messaggioWbs(e){
  const m=String(e&&e.message||e);
  if(/gia. usato/i.test(m))return "Questa WBS è già usata in consuntivi o spese: il codice non si può più cambiare. La descrizione sì.";
  if(/duplicate key|unique/i.test(m))return "Esiste già un'attività con questo codice in questa commessa.";
  if(/non e. attiva/i.test(m))return "L'attività non è attiva: non accetta nuove registrazioni.";
  if(/non ha un codice completo/.test(m))return "La commessa non ha un codice completo: controlla il codice del cliente e quello breve del progetto.";
  return m;
}

/* ==================================================================
   Caricare i consuntivi da un foglio di calcolo

   Il tracciato e' quello che l'app stessa esporta: Data, Cliente,
   Progetto, Attivita', Sede, Descrizione, Ore. Cosi' il giro si
   chiude — si scarica, si lavora in Excel, si ricarica.

   Il file puo' arrivare in tre forme e si riconoscono dal contenuto,
   non dall'estensione: l'XML di Excel (quello che scarichi da qui),
   una tabella HTML (l'altro export), oppure CSV. Il .xlsx vero e'
   un archivio compresso e non si legge senza una libreria: in quel
   caso si dice chiaro cosa fare invece di fallire in silenzio.
   ================================================================== */
const IMPORT_COLONNE=['data','cliente','progetto','attività','sede','descrizione','note','ore'];
function normIntestazione(t){return String(t||'').trim().toLowerCase()
  .replace(/\s+/g,' ').replace(/attivita'?/,'attività').replace(/^cliente\/progetto$/,'progetto');}

// --- lettura del file ---------------------------------------------
function leggiTabella(testo){
  const t=String(testo||'');
  if(/<\?mso-application|<Workbook/i.test(t))return daXmlExcel(t);
  if(/<table/i.test(t))return daTabellaHtml(t);
  return daCsv(t);
}
function daXmlExcel(t){
  const doc=new DOMParser().parseFromString(t,'application/xml');
  if(doc.querySelector('parsererror'))throw new Error('Il file XML non si lascia leggere.');
  // il foglio giusto e' quello che ha le colonne attese
  const fogli=[...doc.getElementsByTagName('Worksheet')];
  for(const f of fogli){
    const righe=[...f.getElementsByTagName('Row')].map(r=>
      [...r.getElementsByTagName('Cell')].map(c=>{
        const d=c.getElementsByTagName('Data')[0];return d?d.textContent:'';}));
    const trovato=trovaIntestazione(righe);
    if(trovato)return trovato;
  }
  throw new Error('Nel file non c\'è un foglio con le colonne Data, Cliente, Progetto, Attività, Ore.');
}
function daTabellaHtml(t){
  const doc=new DOMParser().parseFromString(t,'text/html');
  for(const tab of [...doc.getElementsByTagName('table')]){
    const righe=[...tab.getElementsByTagName('tr')].map(tr=>
      [...tr.children].map(td=>td.textContent));
    const trovato=trovaIntestazione(righe);
    if(trovato)return trovato;
  }
  throw new Error('Nel file non c\'è una tabella con le colonne attese.');
}
function daCsv(t){
  const sep=(t.split('\n')[0]||'').includes(';')?';':(t.includes('\t')?'\t':',');
  const righe=t.split(/\r?\n/).filter(r=>r.trim()!=='').map(r=>splitCsv(r,sep));
  const trovato=trovaIntestazione(righe);
  if(!trovato)throw new Error('Nella prima riga non ci sono le colonne Data, Cliente, Progetto, Attività, Ore.');
  return trovato;
}
// Una riga CSV puo' avere virgole e a capo dentro le virgolette.
function splitCsv(riga,sep){
  const out=[];let cur='',dentro=false;
  for(let i=0;i<riga.length;i++){
    const ch=riga[i];
    if(ch==='"'){ if(dentro&&riga[i+1]==='"'){cur+='"';i++} else dentro=!dentro; }
    else if(ch===sep&&!dentro){out.push(cur);cur=''}
    else cur+=ch;
  }
  out.push(cur);return out.map(x=>x.trim());
}
// L'intestazione non e' per forza la prima riga: nell'export dell'app
// sopra c'e' il titolo. Si cerca la riga che contiene le colonne.
function trovaIntestazione(righe){
  for(let i=0;i<righe.length;i++){
    const h=righe[i].map(normIntestazione);
    if(h.includes('data')&&h.includes('cliente')&&h.includes('ore')){
      const idx={};IMPORT_COLONNE.forEach(c=>{idx[c]=h.indexOf(c)});
      const corpo=righe.slice(i+1)
        .filter(r=>r.some(x=>String(x).trim()!==''))
        .filter(r=>!/^totale$/i.test(String(r[idx.data]||'').trim()))
        .map(r=>{const o={};IMPORT_COLONNE.forEach(c=>{o[c]=idx[c]>=0?String(r[idx[c]]||'').trim():''});return o});
      return {colonne:h,righe:corpo};
    }
  }
  return null;
}

// --- interpretazione dei valori -----------------------------------
function dataDaFoglio(v){
  const t=String(v||'').trim();
  let m=t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);       // 01/09/2026
  if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m=t.match(/^(\d{4})-(\d{2})-(\d{2})/);                             // 2026-09-01
  if(m)return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function oreDaFoglio(v){
  const t=String(v||'').trim().replace(/\s/g,'').replace(',','.');
  if(t==='')return null;
  const n=Number(t);
  return Number.isFinite(n)&&n>0?n:null;
}
// Il codice di una voce nuova non si ricava da quante voci ci sono:
// basta un buco — una voce cancellata, o codici non a decine — e il
// conteggio punta su un codice gia' occupato, che il database rifiuta
// con «duplicate key value violates unique constraint». Si guarda
// quali codici ci sono davvero e si prende il primo libero.
function codiceWbsLibero(engId,presi){
  const occupati=new Set(wbsOfEngagement(engId).map(w=>String(w.activity_code||'').trim()));
  if(presi)presi.forEach(c=>occupati.add(c));
  const numeri=[...occupati].map(c=>Number(c)).filter(n=>Number.isFinite(n)&&n>0);
  let n=numeri.length?Math.floor(Math.max(...numeri)/10)*10+10:10;
  while(occupati.has(String(n))&&n<999990)n+=10;
  return String(n);
}
// Il database parla in inglese e per nomi di vincolo. Qui si dice cosa
// e' successo in italiano: «duplicate key value violates unique
// constraint "wbs_items_user_code_key"» non dice a nessuno cosa fare.
function motivoLeggibile(e){
  const m=String((e&&(e.message||e.details))||e||'').trim();
  if(/wbs_items_(engagement_activity_code|user_code)_key/.test(m))
    return 'il codice dell\'attività nuova era già usato nella commessa';
  if(/wbs_items_activity_code_format/.test(m))
    return 'il codice dell\'attività nuova non è valido';
  if(/duplicate key value/.test(m))return 'questa riga risulta già inserita';
  if(/violates foreign key/.test(m))
    return 'un collegamento (cliente, progetto o commessa) non esiste più';
  if(/row-level security|permission denied|JWT|not authenticated/i.test(m))
    return 'il database ha rifiutato la scrittura: esci e rientra, poi riprova';
  if(/Failed to fetch|NetworkError|network/i.test(m))
    return 'connessione persa durante il caricamento';
  return m||'errore sconosciuto';
}
const perNome=(lista,nome)=>{
  const n=String(nome||'').trim().toLowerCase();
  return n?(lista||[]).find(x=>String(x.name||'').trim().toLowerCase()===n):null;
};
// L'Excel che l'app esporta scrive nella colonna Attivita' il nome
// dell'anagrafica; l'import cercava solo fra i nomi delle voci di
// commessa. Quando i due nomi non coincidono, il file uscito da qui
// non rientrava da qui: ogni riga sembrava portare un'attivita' nuova.
// Si cerca per tutti e due i nomi.
const perNomeWbs=(lista,nome)=>{
  const n=String(nome||'').trim().toLowerCase();
  if(!n)return null;
  const uguale=t=>String(t||'').trim().toLowerCase()===n;
  return (lista||[]).find(w=>uguale(w.name))
      || (lista||[]).find(w=>uguale(activityName(w.activity_id)))
      || null;
};

// --- cosa succederebbe, riga per riga -----------------------------
// Si guarda tutto prima di scrivere: chi ha il posto suo, chi porta
// un'attivita' nuova da creare, chi non si riesce ad agganciare, e chi
// c'e' gia'. Un import che scrive e poi dice com'e' andata e' un
// import che non si puo' annullare.
function analizzaImport(righe){
  return righe.map((r,i)=>{
    const out={n:i+2,...r,esito:'',motivo:'',wbs_id:'',client_id:'',project_id:''};
    const iso=dataDaFoglio(r.data);
    const ore=oreDaFoglio(r.ore);
    if(!iso){out.esito='errore';out.motivo='data non riconosciuta';return out}
    if(ore===null){out.esito='errore';out.motivo='ore non valide';return out}
    out.iso=iso;out.oreNum=ore;
    const cli=perNome(data.clients,r.cliente);
    if(!cli){out.esito='errore';out.motivo='cliente «'+(r.cliente||'vuoto')+'» non trovato';return out}
    out.client_id=cli.id;
    if(!wbsReady()){
      // senza gerarchia si registra come si e' sempre fatto
      const prj=perNome((data.projects||[]).filter(p=>p.client_id===cli.id),r.progetto);
      out.project_id=prj?prj.id:'';
      out.esito=duplicatoImport(out)?'duplicato':'ok';
      return out;
    }
    const prj=perNome(projectsOfClient(cli.id),r.progetto);
    if(!prj){out.esito='errore';out.motivo='progetto «'+(r.progetto||'vuoto')+'» non trovato sotto '+cli.name;return out}
    out.project_id=prj.id;
    const comm=engagementsOfProject(prj.id);
    if(!comm.length){out.esito='errore';out.motivo='il progetto '+prj.name+' non ha commesse';return out}
    // l'attivita' si cerca in tutte le commesse del progetto
    let w=null;
    for(const e of comm){ w=perNomeWbs(wbsOfEngagement(e.id),r.attività); if(w)break; }
    if(w){out.wbs_id=w.id;out.esito=duplicatoImport(out)?'duplicato':'ok';return out}
    if(!String(r.attività||'').trim()){
      // nessuna attivita' indicata: se ce n'e' una sola si usa quella
      const sola=wbsUnica(comm[0].id);
      if(sola){out.wbs_id=sola.id;out.esito=duplicatoImport(out)?'duplicato':'ok';return out}
      out.esito='errore';out.motivo='attività non indicata e la commessa ne ha più d\'una';return out;
    }
    out.esito='nuova';out.engagement_id=comm[0].id;out.motivo='attività «'+r.attività+'» da creare in '+comm[0].code;
    return out;
  });
}
function chiaveImport(r){return importKey(['consuntivo',r.iso,r.cliente,r.progetto,r.attività,r.descrizione,r.oreNum]);}
function duplicatoImport(r){const k=chiaveImport(r);return (data.entries||[]).some(e=>e.import_key===k);}
function contaImport(a){const c={ok:0,nuova:0,duplicato:0,errore:0,caricata:0};
  a.forEach(r=>{c[r.esito]=(c[r.esito]||0)+1});return c}
// Due righe che portano la stessa attivita' nuova sono UNA attivita' da
// creare, non due. Il prospetto contava le righe e annunciava il doppio
// del lavoro che avrebbe fatto.
function nuoveAttivita(a){
  const s=new Set();
  (a||[]).forEach(r=>{if(r.esito==='nuova')
    s.add(r.engagement_id+'|'+String(r.attività||'').trim().toLowerCase())});
  return s.size;
}

// --- la schermata ---------------------------------------------------
function importaConsuntivi(){
  const a=state.importAnalisi;
  const c=a?contaImport(a):null;
  return appShell(`<h1>Carica consuntivi da foglio</h1>
    <p class="sub">Il tracciato è quello che l'app esporta: <b>Data · Cliente · Progetto · Attività · Sede · Descrizione · Ore</b>.
    Scarichi l'Excel del mese, lo lavori, e lo ricarichi qui.</p>
    <div class="card"><b>Scegli il file</b>
      <div class="field" style="margin-top:12px">
        <input type="file" accept=".xlsx,.xls,.xml,.csv,.txt,text/csv" onchange="importaFile(this)">
        <div class="small">Va bene l'<b>.xlsx</b> che scarichi da qui, un file salvato da <b>Excel</b>, oppure un <b>CSV</b>.
        </div></div>
      ${state.importErrore?`<div class="copybox">${esc(state.importErrore)}</div>`:''}
    </div>
    ${a?`<div class="card"><b>Cosa succederà</b>
      <div class="kpiGrid three" style="margin-top:14px">
        <div><span>Da caricare</span><strong>${c.ok+c.nuova}</strong><small>righe</small></div>
        <div><span>Già presenti</span><strong>${c.duplicato}</strong><small>si saltano</small></div>
        <div><span>Da sistemare</span><strong>${c.errore}</strong><small>righe</small></div>
      </div>
      ${nuoveAttivita(a)?`<div class="metricLine" style="margin-top:10px"><span class="tag orange">Attività nuove</span> ${nuoveAttivita(a)===1?'1 da creare':nuoveAttivita(a)+' da creare'} nella commessa</div>`:''}
      ${c.caricata?`<div class="metricLine" style="margin-top:10px"><span class="tag green">Già caricate</span> ${c.caricata} ${c.caricata===1?'riga di questo file':'righe di questo file'}</div>`:''}
      ${state.importEsito&&state.importEsito.falliti.length?`<div class="calc" style="margin-top:12px">
        <b>Queste righe non sono passate</b>
        <div class="list" style="box-shadow:none;margin:10px 0 0">${state.importEsito.falliti.map(f=>
          `<div class="row"><div class="date">riga ${f.n}</div><div><div class="desc">${esc(f.motivo)}</div></div><div></div></div>`).join('')}</div>
        <div class="small" style="margin-top:10px">Riprovare non duplica niente: le righe già caricate vengono riconosciute e saltate.</div></div>`:''}
      <div class="scrollGriglia" style="margin-top:12px"><table class="griglia prospetto numeriRiga">
        <thead><tr><th class="riga">Riga</th><th>Data</th><th>Cliente · Progetto</th><th>Attività</th><th>Ore</th><th>Esito</th></tr></thead>
        <tbody>${a.slice(0,80).map(r=>`<tr>
          <td class="riga"><div class="n">${r.n}</div></td>
          <td>${esc(r.iso?fmtDMY(r.iso):(r.data||''))}</td>
          <td>${esc(r.cliente||'')} · ${esc(r.progetto||'')}</td>
          <td>${esc(r.attività||'—')}</td>
          <td class="num">${esc(r.ore||'')}</td>
          <td>${esitoImport(r)}</td></tr>`).join('')}</tbody>
      </table></div>
      ${a.length>80?`<div class="desc" style="margin-top:8px">Mostrate le prime 80 di ${a.length}.</div>`:''}
      <div class="actions" style="margin-top:14px">
        ${(c.ok+c.nuova)?`<button type="button" class="primary" data-busy="Caricamento…" onclick="eseguiImport()">${state.importEsito?(c.ok+c.nuova===1?'Riprova la riga rimasta':'Riprova le '+(c.ok+c.nuova)+' righe rimaste'):'Carica '+(c.ok+c.nuova)+(c.ok+c.nuova===1?' riga':' righe')}</button>`:''}
        <button type="button" class="secondary" onclick="annullaImport()">Scegli un altro file</button></div>
    </div>`:''}
    <button type="button" class="secondary" onclick="go('timesheet')">Torna al timesheet</button>`);
}
function esitoImport(r){
  if(r.fallita)return '<span class="tag red">'+esc(r.motivo||'non passata')+'</span>';
  if(r.esito==='caricata')return '<span class="tag green">caricata</span>';
  if(r.esito==='ok')return '<span class="tag green">si carica</span>';
  if(r.esito==='nuova')return '<span class="tag orange">attività da creare</span>';
  if(r.esito==='duplicato')return '<span class="tag gray">già presente</span>';
  return '<span class="tag red">'+esc(r.motivo||'errore')+'</span>';
}
function annullaImport(){state.importAnalisi=null;state.importErrore='';state.importEsito=null;render()}
async function importaFile(input){
  const f=input.files&&input.files[0];if(!f)return;
  try{
    const buf=await f.arrayBuffer();
    const testa=new Uint8Array(buf.slice(0,4));
    // un .xlsx e' un archivio: comincia per PK. Tutto il resto e' testo.
    const xlsx=testa[0]===0x50&&testa[1]===0x4B&&testa[2]===0x03&&testa[3]===0x04;
    let righe;
    if(xlsx){
      const t=trovaIntestazione(await leggiXlsx(buf));
      if(!t)throw new Error('Nella prima riga non ci sono le colonne Data, Cliente, Progetto, Attività, Ore.');
      righe=t.righe;
    }else{
      righe=leggiTabella(new TextDecoder('utf-8').decode(buf)).righe;
    }
    if(!righe.length)throw new Error('Il foglio non ha righe sotto l\'intestazione.');
    state.importErrore='';state.importEsito=null;state.importAnalisi=analizzaImport(righe);
  }catch(e){ state.importAnalisi=null;state.importEsito=null;state.importErrore=String(e&&e.message||e); }
  render();
}
// Scrive solo quello che l'anteprima ha promesso. La chiave di
// importazione fa si' che ricaricare lo stesso foglio non duplichi:
// si riconosce la riga e la si aggiorna invece di aggiungerla.
async function eseguiImport(){
  const a=state.importAnalisi;if(!a)return;
  const daFare=a.filter(r=>r.esito==='ok'||r.esito==='nuova');
  if(!daFare.length)return setMsg('Non c\'è niente da caricare.',4000);
  state.busy=true;state.importEsito=null;render();
  let fatte=0,create=0;const falliti=[];
  // Due righe che portano la stessa attivita' nuova la creano una volta
  // sola. Prima ci provavano tutt'e due: la seconda o falliva, o
  // lasciava nella commessa due voci con lo stesso nome.
  const nuove=new Map(), codiciPresi=new Map();
  for(const r of daFare){
    try{
      let wbs=r.wbs_id;
      if(r.esito==='nuova'){
        const chiave=r.engagement_id+'|'+String(r.attività||'').trim().toLowerCase();
        if(nuove.has(chiave))wbs=nuove.get(chiave);
        else{
          if(!codiciPresi.has(r.engagement_id))codiciPresi.set(r.engagement_id,new Set());
          const presi=codiciPresi.get(r.engagement_id);
          const codice=codiceWbsLibero(r.engagement_id,presi);
          presi.add(codice);
          const ins=await insertResilient('wbs_items',{engagement_id:r.engagement_id,activity_code:codice,
            name:r.attività,kind:'activity',billable:true,status:'active',sort_order:Number(codice)});
          if(ins.error)throw ins.error;
          await reload();
          // si ritrova per codice, non per nome: il codice l'abbiamo
          // scelto noi, il nome puo' tornare normalizzato dal database
          const w=wbsOfEngagement(r.engagement_id).find(x=>String(x.activity_code)===codice);
          if(!w)throw new Error('attività creata ma non ritrovata');
          wbs=w.id;create++;nuove.set(chiave,wbs);
        }
      }
      const c=clientById(r.client_id)||{};
      const payload={entry_date:r.iso,client_id:r.client_id,project_id:r.project_id||null,
        wbs_id:wbs||null,hours:r.oreNum,
        work_site:r.sede||SEDE_DEFAULT,work_location:r.sede||SEDE_DEFAULT,description:r.descrizione||null,notes:r.note||null,
        daily_rate_snapshot:Number(c.daily_rate||0),standard_hours_snapshot:Number(c.standard_hours||8)};
      const {res}=await upsertByKey('timesheet_entries',data.entries,payload,chiaveImport(r),['wbs_id']);
      if(res.error)throw res.error;
      fatte++;r.esito='caricata';r.motivo='';r.fallita=false;
    }catch(e){
      // l'esito resta quello di prima, cosi' la riga si puo' riprovare:
      // il caricamento va per chiave, quindi riprovare non duplica
      r.fallita=true;r.motivo=motivoLeggibile(e);
      falliti.push({n:r.n,motivo:r.motivo});
    }
  }
  state.busy=false;
  await reload();
  // Se qualcosa non e' passato, il prospetto non si butta via: si resta
  // qui con scritto riga per riga cosa manca, e si puo' riprovare solo
  // quelle. Prima si finiva sul timesheet con un messaggio solo, e le
  // righe rimaste non si sapeva piu' quali fossero.
  if(falliti.length){
    state.importEsito={fatte,create,falliti};
    render();
    setMsg(fatte+' righe caricate'+(create?', '+create+' attività create':'')+
      ' · '+falliti.length+(falliti.length===1?' riga non è passata':' righe non sono passate')+
      ': sono qui sotto, in rosso.',10000);
    return;
  }
  state.importAnalisi=null;state.importEsito=null;
  navigateTo('timesheet');
  setMsg(fatte+(fatte===1?' riga caricata':' righe caricate')+
    (create?', '+create+(create===1?' attività creata':' attività create'):'')+'.',6000);
}

/* ---------- Scheda cliente: la testa della cascata ----------
   Da qui si scende: progetto (cliente finale) > commessa > attivita'.
   Non ci sono anagrafiche separate da tenere allineate a mano. */
function openClient(id){navigateTo('clientDetail',{edit:id})}
function clientDetail(){
  const c=clientById(state.edit);if(!c)return clients();
  if(!wbsReady())return clientEdit();
  const prj=projectsOfClient(c.id);
  return appShell(`<h1>${esc(c.name)}</h1>
    <p class="sub">${c.code?esc(c.code)+' · ':''}${c.compensation_type==='daily_rate_8h'?'Tariffa giornaliera 8h · '+fmtEUR(c.daily_rate||0):'Una tantum mensile'} · ${c.active?'Attivo':'Disattivo'}</p>
    ${c.code?'':`<div class="card"><b>Manca il codice cliente</b>
      <div class="desc" style="margin-top:6px">Serve per comporre i codici di progetti e commesse.
      Assegnalo prima di creare il primo progetto.</div>
      <button type="button" class="secondary" style="margin-top:12px" onclick="editClient('${c.id}')">Assegna il codice</button></div>`}
    <h2>Progetti / clienti finali</h2>
    <p class="sub">Il progetto è quello che dura. Sotto ci si appendono le commesse: il contratto di quest'anno,
    un ordine aggiuntivo, quello dell'anno prossimo.</p>
    <div class="list">${prj.map(p=>{
      const eng=engagementsOfProject(p.id);
      const att=eng.reduce((t,e)=>t+wbsOfEngagement(e.id).length,0);
      return `<div class="row" onclick="openProject('${p.id}')">
        <div></div>
        <div><div class="title">${esc(p.code||p.name)} ${statoTag(p.status||'active')}</div>
          <div class="desc">${esc(p.name)}${p.end_client_name?' · cliente finale '+esc(p.end_client_name):''}</div>
          <div class="desc">${eng.length===1?'1 commessa':eng.length+' commesse'} · ${att===1?'1 attività':att+' attività'}</div></div>
        <div class="chev">›</div></div>`}).join('')||'<div class="empty">Nessun progetto. Creane uno: è il passo prima della commessa.</div>'}</div>
    <button type="button" class="primary cta" onclick="${c.code?`nuovoProgettoDi('${c.id}')`:`editClient('${c.id}')`}">+ Nuovo progetto / cliente finale</button>
    <div class="actions" style="margin-top:18px">
      <button type="button" class="secondary" onclick="editClient('${c.id}')">Modifica dati del cliente</button>
      <button type="button" class="secondary" onclick="go('clients')">Torna ai clienti</button></div>`);
}

/* ---------- Nuovo progetto / cliente finale, sotto il cliente ---------- */
function nuovoProgettoDi(clientId){navigateTo('projectNew',{parent:clientId})}
function projectNew(){
  if(!wbsReady())return migrazioneMancante("Nuovo progetto");
  const c=clientById(state.parent||state.edit);
  if(!c)return clients();
  if(!c.code)return appShell(`<h1>Nuovo progetto</h1>
    <div class="card"><b>Serve prima il codice del cliente</b>
    <div class="desc" style="margin-top:6px">Il codice del progetto si compone da quello del cliente.
    Assegna un codice a ${esc(c.name)} e poi torna qui.</div></div>
    <button type="button" class="secondary" onclick="editClient('${c.id}')">Assegna il codice</button>`);
  const usati=projectsOfClient(c.id).map(p=>p.short_code).filter(Boolean);
  return appShell(`<h1>Nuovo progetto / cliente finale</h1>
    <p class="sub">Per chi lavori, sotto ${esc(c.code)} · ${esc(c.name)}. Due campi e basta:
    la commessa e la voce su cui registrare le apre l'app da sé.</p>
    <form class="form" onsubmit="addProjectOfClient(event)">
      <div class="field"><label>Nome</label><input name="name" required placeholder="Es. EQUANS" autofocus></div>
      <div class="field"><label>Codice breve</label>
        <input name="short_code" maxlength="6" required placeholder="Es. EQU" oninput="this.value=normCode(this.value);previewPrjCode()">
        <div class="small">Anteprima: <span id="prjCodePreview">${esc(c.code)}-…</span>${usati.length?" · già usati: "+usati.map(esc).join(", "):""}</div></div>
      <details class="moreFields"><summary>Altri dettagli (fatturazione, date)</summary>
        <div class="field"><label>Cliente finale</label><input name="end_client_name" placeholder="Solo se in fattura va un nome diverso"></div>
        <div class="field"><label>Unità di fatturazione</label><select name="billing_unit"><option value="day">Giornate</option><option value="hour">Ore</option></select></div>
        <div class="field"><label>Descrizione predefinita della riga di fattura</label><input name="invoice_line_description" placeholder="Se vuoto si usa il nome del progetto"></div>
        <div class="field"><label>Data di inizio</label><input name="start_date" type="date"></div>
        <div class="field"><label>Data di fine</label><input name="end_date" type="date"></div>
      </details>
      <div class="actions"><button class="primary" data-busy="Creazione…">Crea progetto</button>
        <button type="button" class="secondary" onclick="openClient('${c.id}')">Annulla</button></div>
    </form>`);
}
function previewPrjCode(){
  const f=document.querySelector("form.form");const c=clientById(state.parent||state.edit);
  const box=document.getElementById("prjCodePreview");
  if(f&&c&&box)box.textContent=(c.code||"")+"-"+(normCode(f.short_code.value)||"…");
}
// Creare un progetto e' UN gesto solo. La commessa e la voce su cui
// registrare nascono da sole: servono al database e alla fatturazione,
// non a chi sta aprendo un cliente nuovo. Chi ha bisogno di una
// seconda commessa la aggiunge dalla scheda del progetto.
async function addProjectOfClient(ev){
  ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));
  const c=clientById(state.parent||state.edit);if(!c)return;
  const nome=norm(f.name);
  const codice=normCode(f.short_code);
  const {error}=await insertResilient("projects",{client_id:c.id,
    short_code:codice,name:nome,end_client_name:norm(f.end_client_name)||null,
    billing_unit:f.billing_unit||"day",invoice_line_description:norm(f.invoice_line_description)||null,
    start_date:f.start_date||null,end_date:f.end_date||null,status:"active",active:true});
  if(error)return setMsg(/duplicate key|unique/i.test(String(error.message))?
    "Questo cliente ha già un progetto con questo codice breve.":error.message,8000);
  await reload();
  const prj=(data.projects||[]).find(p=>p.client_id===c.id&&p.short_code===codice);
  if(!prj){render();return setMsg("Progetto creato.",3000)}

  // la commessa: l'anno in corso, con un nome che si puo' cambiare dopo
  const anno=new Date().getFullYear();
  const e1=await insertResilient("engagements",{project_id:prj.id,client_id:c.id,
    year:anno,name:nome+" "+anno,status:"active"});
  if(e1.error){
    navigateTo("projectDetail",{edit:prj.id});
    return setMsg("Progetto creato, ma la commessa no: "+messaggioCommessa(e1.error)+
      " Puoi aprirla da qui.",9000);
  }
  await reload();
  const eng=engagementsOfProject(prj.id)[0];
  if(eng&&!wbsOfEngagement(eng.id).length){
    await insertResilient("wbs_items",{engagement_id:eng.id,activity_code:"10",
      name:nome,kind:"activity",billable:true,status:"active",sort_order:10});
    await reload();
  }
  navigateTo("clientDetail",{edit:c.id});
  setMsg("Progetto "+nome+" creato: puoi già registrarci le ore sopra.",5000);
}

/* ---------- Selezione gerarchica Cliente > Commessa > Progetto > WBS ----------
   Compare solo dove la gerarchia esiste davvero. Se un cliente non ha
   ancora commesse, il modulo resta quello di prima: cosi' chi non ha
   ancora migrato tutto continua a lavorare. */
function hierAvailable(clientId){
  return wbsReady() && projectsOfClient(clientId).some(p=>engagementsOfProject(p.id).some(e=>wbsAperte(e.id).length));
}
// Distinto da projectOptions() piu' in alto, che serve alle maschere
// senza WBS: quella elenca i progetti attivi, questa quelli della
// gerarchia, con il codice davanti.
function projectOptionsOfClient(clientId,selected=''){
  const list=projectsOfClient(clientId).filter(p=>!p.status||STATI_APERTI.includes(p.status)||p.id===selected);
  return `<option value="">— progetto / cliente finale —</option>`+list.map(p=>
    `<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.code||p.name)} · ${esc(p.name)}</option>`).join('');
}
function engagementOptionsOfProject(projId,selected=''){
  const list=engagementsOfProject(projId).filter(e=>STATI_APERTI.includes(e.status)||e.id===selected);
  return `<option value="">— commessa —</option>`+list.map(e=>
    `<option value="${e.id}" ${e.id===selected?'selected':''}>${esc(e.code)} · ${esc(e.name)}</option>`).join('');
}
function wbsOptions(engId,selected=''){
  const list=wbsOfEngagement(engId).filter(w=>STATI_APERTI.includes(w.status)||w.id===selected);
  return `<option value="">— scegli l'attività —</option>`+list.map(w=>
    `<option value="${w.id}" ${w.id===selected?'selected':''}>${esc(w.activity_code)} · ${esc(w.name)}${w.billable?'':' (non fatturabile)'}</option>`).join('');
}
// Da una WBS si risale a tutto il resto: non si duplica niente a mano
function wbsLineage(wbsId){
  const w=wbsById(wbsId);if(!w)return null;
  const e=engagementById(w.engagement_id);if(!e)return null;
  const p=(data.projects||[]).find(x=>x.id===e.project_id);if(!p)return null;
  return {wbs:w,project:p,engagement:e,client_id:p.client_id};
}
// I tre menu a tendina della gerarchia, per i moduli di consuntivo
// Un livello con una sola scelta non e' una scelta: si sceglie da se'
// e non compare. Per chi ha un cliente, un progetto e una commessa il
// modulo torna a essere quello di sempre — cliente e ore — e la
// gerarchia resta sotto, senza chiedere niente.
function soloUno(lista){return lista.length===1?lista[0].id:''}
function apertiPrj(clientId){return projectsOfClient(clientId).filter(p=>!p.status||STATI_APERTI.includes(p.status))}
function apertiEng(projId){return engagementsOfProject(projId).filter(e=>STATI_APERTI.includes(e.status))}
function hierFields(clientId,wbsId){
  const lin=wbsId?wbsLineage(wbsId):null;
  const prjList=apertiPrj(clientId);
  const prjSel=lin?lin.project.id:soloUno(prjList);
  const engList=prjSel?apertiEng(prjSel):[];
  const engSel=lin&&lin.engagement?lin.engagement.id:soloUno(engList);
  const wList=engSel?wbsAperte(engSel):[];
  const wSel=wbsId||soloUno(wList);
  return `<div class="field" id="prjField" ${prjList.length<2?'hidden':''}><label>Progetto / cliente finale</label>
      <select name="hier_project_id" onchange="hierChanged(this.form,'project')">${projectOptionsOfClient(clientId,prjSel)}</select></div>
    <div class="field" id="engField" ${engList.length<2?'hidden':''}><label>Commessa</label>
      <select name="engagement_id" onchange="hierChanged(this.form,'engagement')">${prjSel?engagementOptionsOfProject(prjSel,engSel):'<option value="">— prima scegli il progetto —</option>'}</select></div>
    <div class="field" id="wbsField" ${wList.length<2?'hidden':''}><label>Attività della commessa</label>
      <select name="wbs_id" onchange="hierChanged(this.form,'wbs')">${engSel?wbsOptions(engSel,wSel):'<option value="">— prima scegli la commessa —</option>'}</select></div>
    <div class="small" id="wbsHint">${wSel&&wbsById(wSel)?esc(wbsById(wSel).code)+(wbsById(wSel).billable?'':' · non fatturabile'):'Le ore si registrano sulla commessa. In fattura confluiscono nel progetto.'}</div>`;
}
function hierChanged(form,livello){
  if(!form)return;
  const mostra=(id,cond)=>{const el=document.getElementById(id);if(el)el.hidden=!cond};
  if(livello==='client'){
    const cli=form.client_id?form.client_id.value:'';
    const prj=apertiPrj(cli);
    if(form.hier_project_id){form.hier_project_id.innerHTML=projectOptionsOfClient(cli,'');
      if(prj.length===1)form.hier_project_id.value=prj[0].id;}
    mostra('prjField',prj.length>1);
    livello='project';
  }
  if(livello==='project'){
    const prjId=form.hier_project_id?form.hier_project_id.value:'';
    const eng=prjId?apertiEng(prjId):[];
    if(form.engagement_id){form.engagement_id.innerHTML=prjId?engagementOptionsOfProject(prjId,''):'<option value="">— prima scegli il progetto —</option>';
      if(eng.length===1)form.engagement_id.value=eng[0].id;}
    mostra('engField',eng.length>1);
    livello='engagement';
  }
  if(livello==='engagement'){
    const engId=form.engagement_id?form.engagement_id.value:'';
    const w=engId?wbsAperte(engId):[];
    if(form.wbs_id){form.wbs_id.innerHTML=engId?wbsOptions(engId,''):'<option value="">— prima scegli la commessa —</option>';
      if(w.length===1)form.wbs_id.value=w[0].id;}
    mostra('wbsField',w.length>1);
  }
  const hint=document.getElementById('wbsHint');
  if(hint){
    const w=form.wbs_id&&form.wbs_id.value?wbsById(form.wbs_id.value):null;
    hint.textContent=w?(w.code+(w.billable?'':' · non fatturabile')):
      'Le ore si registrano sulla commessa. In fattura confluiscono nel progetto.';
  }
}

// Quando si sceglie il cliente, si rifanno commessa/progetto/WBS
function refreshHierForForm(form){
  if(!form||!form.hier_project_id)return;
  form.hier_project_id.innerHTML=projectOptionsOfClient(form.client_id.value,'');
  hierChanged(form,'project');
}

/* ---------- La griglia ragiona per WBS quando c'e' ----------
   La riga mostra la commessa, non solo cliente e progetto: era
   l'informazione che mancava per capire su cosa si sta lavorando. */
// Si legge dall'alto nell'ordine della gerarchia: prima il cliente,
// poi il progetto, poi l'attivita' svolta. Il codice resta in fondo e
// in sordina: serve quando si fattura, non quando si consuntiva.
function gridRigaEtichetta(r){
  const w=r.wbs_id?wbsById(r.wbs_id):null;
  if(w){
    const lin=wbsLineage(w.id);
    const cliente=lin?clientName(lin.client_id):'';
    const progetto=lin?lin.project.name:'';
    // l'attivita' si nomina solo dove ce n'e' piu' d'una: dove la WBS
    // e' unica sarebbe una riga di rumore uguale per tutti
    const piuAttivita=lin&&lin.engagement?wbsDaScegliere(lin.engagement.id):false;
    return `<div class="n">${[cliente,progetto].filter(Boolean).map(esc).join(' › ')||esc(w.name)}</div>
      ${piuAttivita?`<div class="d attivita">${esc(w.name)}</div>`:''}
      <div class="d wbsCode">${esc(w.code)}${w.billable?'':' · non fatturabile'}</div>`;
  }
  return `<div class="n">${esc(clientName(r.client_id)||'Senza cliente')}</div>
    <div class="d">${esc(projectName(r.project_id)||'Senza progetto')} · ${esc(activityName(r.activity_id)||'Senza attività')}</div>`;
}
/* La cascata sotto la griglia */
function gridClienteCambiato(){
  const c=document.getElementById('g-cliente').value;
  const com=document.getElementById('g-commessa');
  if(wbsReady()&&projectsOfClient(c).some(p=>engagementsOfProject(p.id).length)){
    com.hidden=false;
    document.getElementById('g-progetto').innerHTML=projectOptionsOfClient(c,'');
  }else{
    // niente commesse per questo cliente: si torna al percorso di prima
    com.hidden=true;
    document.getElementById('g-attivita').hidden=false;
    document.getElementById('g-wbs').hidden=true;
    gridFillProjects();return;
  }
  document.getElementById('g-attivita').hidden=true;
  document.getElementById('g-wbs').hidden=false;
  gridProgettoCambiato();
}
// Il progetto viene prima: e' lui a reggere le commesse
function gridProgettoCambiato(){
  const p=document.getElementById('g-progetto').value;
  const com=document.getElementById('g-commessa');
  if(com)com.innerHTML=p?engagementOptionsOfProject(p,''):'<option value="">— prima scegli il progetto —</option>';
  gridCommessaCambiata();
}
function gridCommessaCambiata(){
  const e=document.getElementById('g-commessa').value;
  const w=document.getElementById('g-wbs');
  if(!w)return;
  w.innerHTML=e?wbsOptions(e,''):'<option value="">— prima scegli la commessa —</option>';
  // dove la commessa ha una voce sola non la si sceglie: il menu
  // sparisce e la riga si aggiunge con cliente, progetto e commessa
  const sola=e?wbsUnica(e):null;
  if(sola)w.value=sola.id;
  w.hidden=!!sola;
}

/* ---------- Spostare le registrazioni da una WBS a un'altra ----------
   Serve a riorganizzare: le WBS create dalla migrazione portano i nomi
   delle vecchie attivita', e chi usa l'app vuole le proprie. Si crea
   la WBS giusta in anagrafica, ci si spostano sopra le registrazioni,
   e la vecchia si chiude. */
function wbsSpostaOptions(w){
  const altre=wbsOfEngagement(w.engagement_id).filter(x=>x.id!==w.id&&STATI_APERTI.includes(x.status));
  if(!altre.length)return '';
  return `<div class="field"><label>Sposta le registrazioni su un'altra WBS</label>
    <select id="wbsTarget">${altre.map(x=>`<option value="${x.id}">${esc(x.activity_code)} · ${esc(x.name)}</option>`).join('')}</select>
    <div class="small">Le ${wbsUsage(w.id).tot} registrazioni passano alla WBS scelta. Importi e date non cambiano.</div>
    <button type="button" class="secondary" style="margin-top:8px" onclick="spostaWbs('${w.id}')">Sposta e basta</button></div>`;
}
async function spostaWbs(daId){
  const da=wbsById(daId);const aId=document.getElementById('wbsTarget')?.value;
  const a=wbsById(aId);if(!da||!a)return;
  const u=wbsUsage(daId);
  if(!u.tot)return setMsg('Non ci sono registrazioni da spostare.',4000);
  if(!confirm(`Spostare ${u.tot} registrazion${u.tot===1?'e':'i'} da ${da.code} a ${a.code}?\n\nImporti, date e note non cambiano: cambia solo la WBS.`))return;
  state.busy=true;render();
  try{
    for(const [tabella,chiave] of [['timesheet_entries','entries'],['manual_entries','manualEntries'],['travel_expenses','travelExpenses']]){
      const ids=(data[chiave]||[]).filter(e=>e.wbs_id===daId).map(e=>e.id);
      if(!ids.length)continue;
      const {error}=await sb.from(tabella).update({wbs_id:aId}).in('id',ids);
      if(error)throw error;
    }
  }catch(e){state.busy=false;return setMsg(messaggioWbs(e),8000)||render();}
  state.busy=false;
  await reload();
  navigateTo('engagementDetail',{edit:da.engagement_id});
  setMsg(`${u.tot} registrazion${u.tot===1?'e spostata':'i spostate'} su ${a.code}. Ora ${da.code} è vuota e si può chiudere o eliminare.`,6000);
}

/* ==================================================================
   Fatturazione per commessa
   Si registra sulla WBS, si fattura sul PROGETTO. Le WBS servono a
   sapere cosa e' stato fatto e a controllarlo; in fattura confluiscono
   in una riga sola per progetto.
   Questo flusso si aggiunge a quello esistente, non lo sostituisce.
   ================================================================== */

// Quanto di una registrazione risulta gia' fatturato
function oreGiaFatturate(entryId){
  return (data.invoiceAllocations||[])
    .filter(a=>a.source_table==='timesheet_entries'&&a.source_id===entryId)
    .reduce((t,a)=>t+Number(a.quantity||0),0);
}
// Il prospetto analitico per WBS di un progetto in un periodo.
// E' il documento di controllo: dice da dove viene ogni ora.
function prospettoProgetto(projectId,dal,al){
  // le attivita' di un progetto sono quelle di tutte le sue commesse
  const wbs=engagementsOfProject(projectId).flatMap(e=>wbsOfEngagement(e.id));
  const righe=wbs.map(w=>{
    const voci=(data.entries||[]).filter(e=>e.wbs_id===w.id
      && String(e.entry_date||'')>=dal && String(e.entry_date||'')<=al);
    const consuntivate=voci.reduce((t,e)=>t+Number(e.hours||0),0);
    const fatturate=voci.reduce((t,e)=>t+oreGiaFatturate(e.id),0);
    const daFatturare=w.billable?Math.max(0,consuntivate-fatturate):0;
    return {wbs:w,voci,consuntivate,fatturate,daFatturare,
      fatturabili:w.billable?consuntivate:0,
      escluse:w.billable?0:consuntivate};
  }).filter(r=>r.consuntivate>0);
  const tot=righe.reduce((a,r)=>({
    consuntivate:a.consuntivate+r.consuntivate,
    fatturabili:a.fatturabili+r.fatturabili,
    fatturate:a.fatturate+r.fatturate,
    daFatturare:a.daFatturare+r.daFatturare,
    escluse:a.escluse+r.escluse
  }),{consuntivate:0,fatturabili:0,fatturate:0,daFatturare:0,escluse:0});
  return {righe,tot};
}
// L'importo si calcola sulla tariffa del CLIENTE, come e' sempre stato.
// La tariffa di progetto resta documentale e non entra nei conti.
function importoDaOre(clientId,ore){
  const c=clientById(clientId)||{};
  const std=Number(c.standard_hours||8)||8;
  return Number(c.daily_rate||0)/std*Number(ore||0);
}
function unitaProgetto(p){return (p&&p.billing_unit==='hour')?'ore':'giornate'}
function quantitaInUnita(p,ore,clientId){
  if(p&&p.billing_unit==='hour')return Number(ore||0);
  const c=clientById(clientId)||{};
  return Number(ore||0)/(Number(c.standard_hours||8)||8);
}

function fattCommessaState(){
  const s=state.fatt||{};
  return {client_id:s.client_id||'',engagement_id:s.engagement_id||'',
    dal:s.dal||primoDelMese(),al:s.al||ultimoDelMese(),
    progetti:s.progetti||null};
}
function primoDelMese(){return state.month+'-01'}
function ultimoDelMese(){const [y,m]=state.month.split('-').map(Number);
  return `${state.month}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`}
function setFatt(k,v){state.fatt={...(state.fatt||{}),[k]:v};
  if(k==='client_id')state.fatt.engagement_id='';
  if(k==='client_id'||k==='engagement_id')state.fatt.progetti=null;
  render()}
function toggleProgettoFatt(id){
  const s=fattCommessaState();
  const cur=s.progetti===null?progettiFatturabili().map(p=>p.id):s.progetti.slice();
  const i=cur.indexOf(id);
  if(i>=0)cur.splice(i,1);else cur.push(id);
  state.fatt={...(state.fatt||{}),progetti:cur};render();
}
// Un progetto e' fatturabile se ha almeno una commessa sotto: le ore
// stanno li' dentro. Il progetto resta il livello a cui si fattura.
function progettiFatturabili(){
  const s=fattCommessaState();
  const cid=s.client_id||((data.clients||[]).find(c=>projectsOfClient(c.id).some(p=>engagementsOfProject(p.id).length))||{}).id;
  if(!cid)return [];
  return projectsOfClient(cid).filter(p=>engagementsOfProject(p.id).length);
}

function fatturazioneCommessa(){
  if(!wbsReady())return migrazioneMancante('Fatturazione per commessa');
  const s=fattCommessaState();
  const clienti=(data.clients||[]).filter(c=>projectsOfClient(c.id).some(p=>engagementsOfProject(p.id).length));
  if(!clienti.length)return appShell(`<h1>Fatturazione per commessa</h1>
    <div class="card"><b>Nessuna commessa</b><div class="desc" style="margin-top:6px">
    Apri un cliente in Impostazioni → Clienti, creagli il progetto e poi la commessa.</div></div>
    <button type="button" class="secondary" onclick="go('clients')">Vai ai clienti</button>`);
  const cid=s.client_id||clienti[0].id;
  const prj=projectsOfClient(cid).filter(p=>engagementsOfProject(p.id).length);
  const scelti=s.progetti===null?prj.map(p=>p.id):s.progetti;

  const blocchi=prj.filter(p=>scelti.includes(p.id)).map(p=>{
    const pr=prospettoProgetto(p.id,s.dal,s.al);
    if(!pr.righe.length)return `<div class="card"><b>${esc(p.code||p.name)}</b>
      <div class="desc" style="margin-top:6px">Nessun consuntivo nel periodo.</div></div>`;
    const q=quantitaInUnita(p,pr.tot.daFatturare,cid);
    const imp=importoDaOre(cid,pr.tot.daFatturare);
    return `<div class="card"><b>${esc(p.code||p.name)} · ${esc(p.name)}</b>
      <div class="desc" style="margin-top:2px">${esc(p.end_client_name||'')}${p.end_client_name?' · ':''}${engagementsOfProject(p.id).map(x=>esc(x.code)).join(', ')||'nessuna commessa'}</div>
      <div class="desc">Il dettaglio per attività resta qui: in fattura va una riga sola.</div>
      <div class="scrollGriglia" style="margin-top:12px"><table class="griglia prospetto">
        <thead><tr><th class="riga">Attività</th><th>Consuntivato</th><th>Fatturabile</th><th>Già fatturato</th><th>Da fatturare</th></tr></thead>
        <tbody>${pr.righe.map(r=>`<tr>
          <td class="riga"><div class="n">${esc(r.wbs.activity_code)} · ${esc(r.wbs.name)}</div>
            <div class="d">${esc(r.wbs.code)}${r.wbs.billable?'':' · non fatturabile'}</div></td>
          <td class="num">${fmtNum(r.consuntivate,1)} h</td>
          <td class="num">${r.wbs.billable?fmtNum(r.fatturabili,1)+' h':'—'}</td>
          <td class="num">${r.fatturate>0?fmtNum(r.fatturate,1)+' h':'—'}</td>
          <td class="num${r.daFatturare>0?' spicca':''}">${r.daFatturare>0?fmtNum(r.daFatturare,1)+' h':'—'}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td class="riga">Totale progetto</td>
          <td class="num">${fmtNum(pr.tot.consuntivate,1)} h</td>
          <td class="num">${fmtNum(pr.tot.fatturabili,1)} h</td>
          <td class="num">${fmtNum(pr.tot.fatturate,1)} h</td>
          <td class="num spicca">${fmtNum(pr.tot.daFatturare,1)} h</td></tr></tfoot>
      </table></div>
      ${pr.tot.escluse>0?`<div class="metricLine" style="margin-top:10px"><span class="tag gray">Escluse</span> ${fmtNum(pr.tot.escluse,1)} h su attività non fatturabili</div>`:''}
      <div class="metricLine" style="margin-top:10px">
        <b>Andrà in fattura:</b> ${fmtNum(q,2)} ${unitaProgetto(p)} <span class="dot">·</span> <b>${fmtEUR(imp)}</b></div>
      ${pr.tot.daFatturare>0?`<button type="button" class="primary" style="margin-top:12px" onclick="generaRigaFattura('${p.id}')">Genera la riga di fattura per questo progetto</button>`:
        '<div class="desc" style="margin-top:10px">Niente da fatturare in questo periodo.</div>'}
    </div>`;
  }).join('');

  return appShell(`<h1>Fatturazione per commessa</h1>
    <p class="sub">Si registra sull'attività, si fattura sul progetto. Un progetto raccoglie tutte le sue commesse: il dettaglio qui sotto è il prospetto di controllo, non finisce in fattura.</p>
    <div class="card"><b>Cosa fatturare</b>
      <div class="field" style="margin-top:12px"><label>Cliente contrattuale</label>
        <select onchange="setFatt('client_id',this.value)">${clienti.map(c=>`<option value="${c.id}" ${c.id===cid?'selected':''}>${esc(c.code||'')} · ${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Dal</label><input type="date" value="${esc(s.dal)}" onchange="setFatt('dal',this.value)"></div>
      <div class="field"><label>Al</label><input type="date" value="${esc(s.al)}" onchange="setFatt('al',this.value)"></div>
      ${prj.length>1?`<div class="field"><label>Progetti da includere</label>
        <div class="miniActions">${prj.map(p=>`<button type="button" class="miniBtn ${scelti.includes(p.id)?'active':''}" onclick="toggleProgettoFatt('${p.id}')">${scelti.includes(p.id)?'☑':'☐'} ${esc(p.code||p.name)}</button>`).join('')}</div>
        <div class="small">Ogni progetto raccoglie le ore di tutte le sue commesse nel periodo.</div></div>`:''}
    </div>
    ${blocchi||'<div class="empty">Scegli almeno un progetto.</div>'}
    <button type="button" class="secondary" onclick="go('billing')">Vai alla fatturazione mensile di sempre</button>`);
}

/* Genera UNA riga di fattura per il progetto, e la collega alle
   registrazioni che la compongono. E' l'allocazione che impedisce di
   fatturare due volte la stessa ora, non un contrassegno sulla WBS. */
async function generaRigaFattura(projectId){
  const s=fattCommessaState();
  const p=(data.projects||[]).find(x=>x.id===projectId);if(!p)return;
  // la commessa da citare in fattura e' quella delle ore che si stanno
  // fatturando: se ne toccano piu' d'una si prende la piu' recente
  const prospetto=prospettoProgetto(projectId,fattCommessaState().dal,fattCommessaState().al);
  const coinvolte=[...new Set(prospetto.righe.filter(r=>r.daFatturare>0).map(r=>r.wbs.engagement_id))];
  const e=coinvolte.length?engagementById(coinvolte[0]):engagementsOfProject(p.id)[0];
  const cid=s.client_id||(e?e.client_id:null);
  const c=clientById(cid)||{};
  const pr=prospettoProgetto(projectId,s.dal,s.al);
  if(pr.tot.daFatturare<=0)return setMsg('Non c\'è niente da fatturare in questo periodo.',5000);

  const q=quantitaInUnita(p,pr.tot.daFatturare,cid);
  const imp=importoDaOre(cid,pr.tot.daFatturare);
  const dettaglio=pr.righe.filter(r=>r.daFatturare>0)
    .map(r=>`${r.wbs.activity_code} ${r.wbs.name}: ${fmtNum(r.daFatturare,1)} h`).join('\n');
  if(!confirm(`Generare la riga di fattura per ${p.code||p.name}?\n\n`
    +`${fmtNum(q,2)} ${unitaProgetto(p)} · ${fmtEUR(imp)}\n\n`
    +`Composta da:\n${dettaglio}\n\n`
    +`Le registrazioni verranno segnate come fatturate e non potranno essere fatturate di nuovo.`))return;

  state.busy=true;render();
  try{
    // Una testata per cliente e mese, come fa gia' il resto dell'app
    const [anno,mese]=s.al.split('-').map(Number);
    let hdr=(data.billingHeaders||[]).find(h=>h.client_id===cid&&Number(h.year)===anno&&Number(h.month)===mese);
    if(!hdr){
      const r=await insertResilient('billing_headers',{client_id:cid,year:anno,month:mese,status:'draft'});
      if(r.error)throw r.error;
      await reload();
      hdr=(data.billingHeaders||[]).find(h=>h.client_id===cid&&Number(h.year)===anno&&Number(h.month)===mese);
    }
    // La riga punta al progetto, mai alla WBS. Gli snapshot congelano
    // il valore: cambiare poi tariffa o riferimenti non la tocca.
    const riga={billing_header_id:hdr?hdr.id:null,client_id:cid,engagement_id:e?e.id:null,project_id:p.id,
      line_type:'daily_rate_8h',
      description:p.invoice_line_description||`${p.name}${p.end_client_name?' — '+p.end_client_name:''}`,
      period_from:s.dal,period_to:s.al,
      quantity:Number(q.toFixed(2)),unit:p.billing_unit==='hour'?'hour':'day',
      unit_rate:Number(c.daily_rate||0),currency:p.currency||'EUR',amount:Number(imp.toFixed(2)),
      snapshot_client_name:c.name||null,snapshot_client_code:c.code||null,
      snapshot_engagement_code:e?e.code:null,snapshot_project_code:p.code||null,
      snapshot_project_name:p.name||null,snapshot_end_client:p.end_client_name||null,
      snapshot_engagement_letter:e?e.engagement_letter:null,
      snapshot_purchase_order:e?e.purchase_order:null,
      snapshot_invoice_reference:e?e.invoice_reference:null};
    const ins=await insertResilient('billing_lines',riga);
    if(ins.error)throw ins.error;
    await reload();
    const linea=(data.billingLines||[]).slice().sort((a,b)=>
      String(b.created_at||'').localeCompare(String(a.created_at||'')))[0];
    if(!linea)throw new Error('Riga di fattura non trovata dopo il salvataggio');

    // Le allocazioni: da quali registrazioni arriva la quantita'
    const alloc=[];
    for(const r of pr.righe){
      if(r.daFatturare<=0)continue;
      for(const v of r.voci){
        const resto=Number(v.hours||0)-oreGiaFatturate(v.id);
        if(resto<=0.0001)continue;
        alloc.push({billing_line_id:linea.id,source_table:'timesheet_entries',source_id:v.id,
          wbs_id:r.wbs.id,quantity:Number(resto.toFixed(2)),
          amount:Number(importoDaOre(cid,resto).toFixed(2))});
      }
    }
    if(alloc.length){
      const a=await insertManyResilient('invoice_line_allocations',alloc);
      if(a.error)throw a.error;
    }
  }catch(err){state.busy=false;return setMsg(messaggioFattura(err),9000)||render();}
  state.busy=false;
  await reload();render();
  setMsg(`Riga di fattura creata per ${p.code||p.name}. Le ore che la compongono non sono più fatturabili.`,6000);
}
function messaggioFattura(e){
  const m=String(e&&e.message||e);
  if(/gia. fatturata|fatturare due volte/i.test(m))
    return 'Alcune di queste ore risultano già fatturate: ricarica la pagina e rifai il prospetto.';
  if(/does not exist|could not find the table/i.test(m))
    return 'Manca la migrazione delle commesse: esegui prima gli script in migrations/.';
  return m;
}

/* ==================================================================
   Report
   Due livelli distinti, come devono restare: quello analitico ragiona
   per WBS, quello economico aggrega per cliente, commessa e progetto.
   La WBS non e' una dimensione del documento fiscale.
   ================================================================== */
function repState(){const r=state.rep||{};return {dal:r.dal||(currentYear()+'-01-01'),al:r.al||(currentYear()+'-12-31'),client_id:r.client_id||''}}
function setRep(k,v){state.rep={...(state.rep||{}),[k]:v};render()}
function repFiltri(){
  const r=repState();
  return `<div class="card"><b>Periodo</b>
    <div class="field" style="margin-top:12px"><label>Dal</label><input type="date" value="${esc(r.dal)}" onchange="setRep('dal',this.value)"></div>
    <div class="field"><label>Al</label><input type="date" value="${esc(r.al)}" onchange="setRep('al',this.value)"></div>
    <div class="field"><label>Cliente</label><select onchange="setRep('client_id',this.value)">
      <option value="">Tutti i clienti (solo per archivio)</option>
      ${(data.clients||[]).map(c=>`<option value="${c.id}" ${r.client_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
    </select></div></div>`;
}
// Le righe analitiche: una per WBS, con budget e scostamento
function repRigheWbs(){
  const r=repState();
  return (data.wbsItems||[]).map(w=>{
    const lin=wbsLineage(w.id);if(!lin)return null;
    if(r.client_id&&lin.client_id!==r.client_id)return null;
    const voci=(data.entries||[]).filter(e=>e.wbs_id===w.id
      && String(e.entry_date||'')>=r.dal && String(e.entry_date||'')<=r.al);
    const ore=voci.reduce((t,e)=>t+Number(e.hours||0),0);
    const fatturate=voci.reduce((t,e)=>t+oreGiaFatturate(e.id),0);
    if(!ore&&!w.budget_hours)return null;
    const budget=Number(w.budget_hours||0);
    return {w,lin,ore,fatturate,budget,
      scostamento:budget?ore-budget:null,
      fatturabili:w.billable?ore:0};
  }).filter(Boolean).sort((a,b)=>String(a.w.code).localeCompare(String(b.w.code),'it'));
}
function reportWbs(){
  if(!wbsReady())return migrazioneMancante('Report analitico WBS');
  const righe=repRigheWbs();
  const tot=righe.reduce((a,x)=>({ore:a.ore+x.ore,fatturabili:a.fatturabili+x.fatturabili,
    fatturate:a.fatturate+x.fatturate,budget:a.budget+x.budget}),{ore:0,fatturabili:0,fatturate:0,budget:0});
  return appShell(`<h1>Report analitico WBS</h1>
    <p class="sub">Dove è finito il tempo, WBS per WBS. È il livello di controllo, non quello di fatturazione.</p>
    ${repFiltri()}
    <div class="card"><b>Totale periodo</b>
      <div class="kpiGrid three" style="margin-top:14px">
        <div><span>Consuntivato</span><strong>${fmtNum(tot.ore,1)} h</strong><small>${fmtNum(tot.ore/8,2)} gg/u</small></div>
        <div><span>Fatturabile</span><strong>${fmtNum(tot.fatturabili,1)} h</strong><small>${tot.ore>tot.fatturabili?fmtNum(tot.ore-tot.fatturabili,1)+' h non fatturabili':'tutto fatturabile'}</small></div>
        <div><span>Già fatturato</span><strong>${fmtNum(tot.fatturate,1)} h</strong><small>${fmtNum(Math.max(0,tot.fatturabili-tot.fatturate),1)} h da fatturare</small></div>
      </div></div>
    <div class="scrollGriglia"><table class="griglia prospetto">
      <thead><tr><th class="riga">WBS</th><th>Consuntivato</th><th>Fatturabile</th><th>Fatturato</th><th>Budget</th><th>Scostamento</th></tr></thead>
      <tbody>${righe.map(x=>`<tr>
        <td class="riga"><div class="n">${esc(x.w.name)} ${statoTag(x.w.status)}</div>
          <div class="d">${esc(x.lin.engagement?x.lin.engagement.code:'')} · ${esc(x.lin.project.name)}</div>
          <div class="d wbsCode">${esc(x.w.code)}${x.w.billable?'':' · non fatturabile'}</div></td>
        <td class="num">${fmtNum(x.ore,1)} h</td>
        <td class="num">${x.w.billable?fmtNum(x.fatturabili,1)+' h':'—'}</td>
        <td class="num">${x.fatturate>0?fmtNum(x.fatturate,1)+' h':'—'}</td>
        <td class="num">${x.budget?fmtNum(x.budget,1)+' h':'—'}</td>
        <td class="num${x.scostamento>0?' spicca':''}">${x.scostamento===null?'—':(x.scostamento>0?'+':'')+fmtNum(x.scostamento,1)+' h'}</td></tr>`).join('')
        ||`<tr><td class="riga vuota" colspan="6">Nessun consuntivo nel periodo.</td></tr>`}</tbody>
    </table></div>`);
}
// Il report economico: aggregato per cliente, progetto e commessa.
// Nessuna attivita': non e' una dimensione del documento fiscale.
function reportEconomico(){
  if(!wbsReady())return migrazioneMancante('Report economico');
  const r=repState();
  const blocchi=(data.projects||[]).filter(p=>(!r.client_id||p.client_id===r.client_id)&&engagementsOfProject(p.id).length)
    .map(p=>{
      const pr=prospettoProgetto(p.id,r.dal,r.al);
      const spese=(data.travelExpenses||[]).filter(x=>x.project_id===p.id
        && String(x.expense_date||'')>=r.dal && String(x.expense_date||'')<=r.al)
        .reduce((t,x)=>t+Number(x.amount||0),0);
      // una riga per commessa: le attivita' della stessa commessa si sommano
      const comm=engagementsOfProject(p.id).map(e=>{
        const righe=pr.righe.filter(x=>x.wbs.engagement_id===e.id);
        const cons=righe.reduce((t,x)=>t+x.consuntivate,0);
        const daF=righe.reduce((t,x)=>t+x.daFatturare,0);
        const fatt=righe.reduce((t,x)=>t+x.fatturate,0);
        return {e,cons,daF,val:importoDaOre(p.client_id,fatt),res:importoDaOre(p.client_id,daF)};
      }).filter(x=>x.cons>0);
      if(!comm.length&&!spese)return '';
      const t=comm.reduce((a,x)=>({cons:a.cons+x.cons,daF:a.daF+x.daF,val:a.val+x.val,res:a.res+x.res}),
        {cons:0,daF:0,val:0,res:0});
      const budget=comm.reduce((a,x)=>a+Number(x.e.budget_amount||0),0);
      return `<div class="card"><b>${esc(p.code||p.name)} · ${esc(p.name)}</b>
        <div class="desc" style="margin-top:2px">${esc(clientName(p.client_id))}${p.end_client_name?' · cliente finale '+esc(p.end_client_name):''}</div>
        <div class="scrollGriglia" style="margin-top:12px"><table class="griglia prospetto">
          <thead><tr><th class="riga">Commessa</th><th>Consuntivato</th><th>Da fatturare</th><th>Fatturato</th><th>Residuo</th></tr></thead>
          <tbody>${comm.map(x=>`<tr>
            <td class="riga"><div class="n">${esc(x.e.name)}</div><div class="d wbsCode">${esc(x.e.code)}${x.e.invoice_reference?' · '+esc(x.e.invoice_reference):''}</div></td>
            <td class="num">${fmtNum(x.cons,1)} h</td>
            <td class="num">${fmtNum(x.daF,1)} h</td>
            <td class="num">${fmtEUR(x.val)}</td>
            <td class="num${x.res>0?' spicca':''}">${fmtEUR(x.res)}</td></tr>`).join('')
            ||`<tr><td class="riga vuota" colspan="5">Nessun consuntivo nel periodo.</td></tr>`}</tbody>
          <tfoot><tr><td class="riga">Totale progetto</td>
            <td class="num">${fmtNum(t.cons,1)} h</td><td class="num">${fmtNum(t.daF,1)} h</td>
            <td class="num">${fmtEUR(t.val)}</td><td class="num spicca">${fmtEUR(t.res)}</td></tr></tfoot>
        </table></div>
        ${spese?`<div class="metricLine" style="margin-top:10px"><span class="tag gray">Spese</span> ${fmtEUR(spese)}</div>`:''}
        ${budget?`<div class="metricLine" style="margin-top:10px"><span class="tag blue">Budget delle commesse</span> ${fmtEUR(budget)} <span class="dot">·</span> impegnato ${fmtEUR(t.val+t.res)}</div>`:''}
      </div>`;
    }).join('');
  return appShell(`<h1>Report economico</h1>
    <p class="sub">Aggregato per cliente, progetto e commessa: è il livello a cui si fattura. Il dettaglio per attività sta nel report analitico.</p>
    ${repFiltri()}
    ${blocchi||'<div class="empty">Nessun progetto con movimenti nel periodo.</div>'}`);
}

// Disegnare una vista non puo' finire con una pagina bianca. Se
// qualcosa va storto — un dato inatteso, un campo che manca — si vede
// cosa e' successo e da dove ripartire: una schermata vuota non dice
// niente ne' a chi la usa ne' a chi deve ripararla.
// Filtro a testo libero sulle liste dei consuntivi.
//
// La lista di un mese pieno e' lunga e finora si poteva solo scorrere.
// Si cerca su tutto quello che la riga mostra — cliente, progetto,
// attivita', descrizione, note, sede, data — perche' cercare in un
// campo solo obbliga a ricordare dove si era scritta una cosa.
//
// Non si conserva fra una sessione e l'altra: un filtro dimenticato
// acceso e' il modo piu' rapido per convincersi di aver perso dei dati.
function normCerca(v){return String(v==null?'':v).toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()}

function testoDiRiga(e){
  return [fmtDMY(e.entry_date||e.expense_date),clientName(e.client_id),
    projectName(e.project_id),activityName(e.activity_id),
    e.description,e.notes,e.work_site,e.work_city,
    e.wbs_id?wbsLabel(wbsById(e.wbs_id)):''
  ].filter(Boolean).map(normCerca).join(' ');
}

function filtraRighe(righe,testo){
  const q=normCerca(state.cerca);
  if(!q)return righe;
  const parole=q.split(/\s+/).filter(Boolean);
  return righe.filter(r=>{
    const t=typeof testo==='function'?normCerca(testo(r)):testoDiRiga(r);
    return parole.every(w=>t.includes(w));
  });
}

// Il campo. Sobrio: una riga, e il comando per svuotarlo compare solo
// quando c'e' qualcosa da svuotare.
function cercaBox(quante,totale){
  const v=esc(state.cerca||'');
  const attivo=normCerca(state.cerca)!=='';
  return `<div class="cercaRiga">
    <input id="cercaBox" type="search" inputmode="search" value="${v}" placeholder="Cerca fra i consuntivi…"
      aria-label="Cerca fra i consuntivi" oninput="cambiaCerca(this.value)">
    ${attivo?`<button type="button" class="cercaX" onclick="cambiaCerca('')" aria-label="Svuota la ricerca">✕</button>`:''}
  </div>${attivo?`<div class="cercaEsito">${quante} ${quante===1?'riga':'righe'} su ${totale}</div>`:''}`;
}

function cambiaCerca(v){state.cerca=v;state.cercaFuoco=true;render()}

function render(){
  try{
    renderInterno();
    // Il campo viene ricostruito a ogni lettera: senza rimetterci il
    // fuoco e il cursore in fondo, si potrebbe scrivere una lettera sola.
    if(state.cercaFuoco){
      const c=document.getElementById('cercaBox');
      if(c){c.focus();const n=c.value.length;try{c.setSelectionRange(n,n)}catch(e){}}
      else state.cercaFuoco=false;
    }
  }
  catch(err){
    const box=document.getElementById('app');
    if(!box)throw err;
    console.error('TOTIME · errore disegnando la vista',state.view,err);
    box.innerHTML=`<h1>Qualcosa si e' inceppato</h1>
      <div class="card"><b>La pagina «${esc(String(state.view||'?'))}» non si e' potuta disegnare</b>
      <div class="desc" style="margin-top:6px">Il resto dell'app funziona: torna indietro e prosegui da un'altra parte.
      Se ti capita di nuovo, questo e' il dettaglio da riferire.</div>
      <div class="copybox">${esc(String(err&&err.message||err))}</div></div>
      <button type="button" class="primary" onclick="go('home')">Torna alla dashboard</button>`;
  }
}
function renderInterno(){document.documentElement.setAttribute('data-view',state.view||'home');if(state.loading){document.getElementById('app').innerHTML=loadingView();return}if(state.view==='resetPassword'){document.getElementById('app').innerHTML=resetPasswordView();return}if(!session){const authMap={register:registerView,forgotPassword:forgotPasswordView};document.getElementById('app').innerHTML=(authMap[state.view]||loginView)();return}let html='';const map={home,reportWbs,reportEconomico,fatturazioneCommessa,engagements,engagementNew,engagementEdit,engagementDetail,projectNew,projectDetail,clientDetail,wbsEdit,importaConsuntivi,dailyForm,dailyEdit,calendario,giorno,tmForm,tmManage,monthlyForm,monthlyEdit,manualForm,manualEdit,expenseForm,expenseEdit,tripNew,tripEdit,timesheet,griglia,pivot,billing,billingDetail:billingDetailView,settings,clients,projects,activities,clientEdit,projectEdit,activityEdit,expenseCategories,expenseCategoryEdit,vehicles,vehicleEdit,policyRimborsi,invoiceTemplates,invoiceTemplateEdit,appearance,exportTimesheet,tax,taxPayments,taxPaymentEdit,annualMonths,annualInvoices,balance,taxSettings,tasseFuture,fatturatoDetail,expenses,account};html=(map[state.view]||home)();document.getElementById('app').innerHTML=html}

Object.assign(window,{
  setRep,
  generaRigaFattura,
  setFatt,toggleProgettoFatt,prospettoProgetto,
  spostaWbs,
  gridClienteCambiato,gridCommessaCambiata,gridProgettoCambiato,
  hierChanged,refreshHierForForm,wbsLineage,hierAvailable,
  normCode,wbsReady,engagementsOf,openEngagement,openProjectWbs,editWbs,setEngFilter,
  openClient,openProject,nuovoProgettoDi,nuovaCommessaDi,nuovoProgettoScegliCliente,
  importaFile,eseguiImport,annullaImport,
  previewEngCode,previewPrjCode,previewWbsCode,addEngagement,saveEngagement,addEngagementRef,
  addProjectOfClient,saveProjectFull,addWbs,saveWbs,deleteWbs,
  salvaEVai,
  setGridScope,
  gridWeekShift,
  openGriglia,
  saveAssenza,
  removeAssenza,
  saveGrid,
  addGridRow,
  gridFillProjects,
  focusForm,
  setPivotSetting,
  setPivotPreset,
  togglePivotExpenses,
  pivotToggleGroup,
  pivotExpandAll,
  changeYear,
  startSel,
  cancelSel,
  toggleSel,
  toggleSelAll,
  deleteSelected,
  applyTheme,
  logoIcon,
  settingValue,
  loadThemeFromSettings,
  saveThemeChoice,
  monthLabel,
  periodParts,
  changeMonth,
  setMsg,
  clientById,
  projectById,
  activityById,
  expenseCategoryById,
  invoiceTemplateByType,
  clientName,
  projectName,
  activityName,
  expenseCategoryName,
  entryRate,
  entryStd,
  dailyAmount,
  dailyDays,
  rowsForMonth,
  monthlyRows,
  manualRows,
  expenseRows,
  totals,
  metricLine,
  amountLine,
  dateIT,
  go,
  cambiaFatturaPianificato,
  apriChiudiCliente,
  cambiaVistaTasse,
  registraBollo,
  segnaPagata,
  annullaPagata,
  apriChiudiTappa,
  saveSetting,
  cambiaCerca,
  apriGruppo,
  goNav,
  saveTM,
  setSortMode,
  moveEntity,
  toggleFerie,
  ferieRange,
  openDay,
  dayShift,
  newEntryForDay,
  goForDay,
  toggleBalFull,
  goToday,
  systemTheme,
  toggleDashFull,
  updateTMPreview,
  deleteTMBatch,
  downloadMonthExcel,
  shareMonthExcel,
  monthWorkbookFogli,
  viewLabel,
  guardUnsavedChanges,
  pushHistory,
  navigateTo,
  back,
  toggleMainMenu,
  menuDropdown,
  backControl,
  groupSummary,
  renderTemplate,
  fiscoText,
  headerForClient,
  headerStatus,
  statusLabel,
  statusClass,
  currentYear,
  rowsForYear,
  monthlyRowsForYear,
  manualRowsForYear,
  expenseRowsForYear,
  monthIndexFromDate,
  annualMonthData,
  annualTotals,
  currentTaxSetting,
  annualTaxCalc,
  billingCalc,
  invoiceTemplateByCode,
  init,
  fetchAll,
  reload,
  ensureUserProfileFromMetadata,
  appShell,
  monthSelector,
  loadingView,
  loginView,
  registerView,
  switchAuthView,
  forgotPasswordView,
  resetPasswordView,
  requestPasswordReset,
  updatePassword,
  signIn,
  signUpDetailed,
  logout,
  monthSeries,
  annualChartSvg,niceMax,fmtAxis,
  monthChartSvg,
  homeIncassiCard,
  homeFatturatoCard,
  forfettarioBarCard,
  openAnnualMonths,
  openAnnualInvoices,
  openMonthTimesheet,
  openMonthExpenses,
  openInvoiceDetail,
  annualMonths,
  annualInvoices,
  expReimbursable,
  isMissingColumnError,
  missingColumnName,
  importKey,
  upsertByKey,
  runResilient,
  insertResilient,
  updateResilient,
  insertReturningResilient,
  costsForYear,
  balance,
  taxSettings,
  fatturatoDetail,
  billingMonthlyView,
  billingAnnualView,
  expensesForYear,
  expenses,
  expenseTypeTag,
  ensureExpenseCategory,
  excelSerialToDate,
  parseReimbType,
  importCostsCsv,
  account,
  saveAccount,
  changePassword,
  settingsRow,
  home,
  newEntryChoice,
  sediOptions,
  projectOptions,
  activityOptions,
  expenseOptions,
  refreshProjectsForForm,
  activeClients,
  dailyClients,
  monthlyClients,
  dailyForm,
  saveDaily,
  dailyEdit,
  saveDailyEdit,
  duplicateDaily,
  deleteDaily,
  monthlyForm,
  saveMonthly,
  monthlyEdit,
  saveMonthlyEdit,
  duplicateMonthly,
  deleteMonthly,
  manualForm,
  saveManual,
  manualEdit,
  saveManualEdit,
  duplicateManual,
  deleteManual,
  expenseForm,
  updateExpenseCalc,
  cambiaVistaSpese,
  cambiaRimborsiFuoriReddito,
  rimborsiFuoriReddito,
  scomposizioneRimborsi,
  annualTaxCalc,
  cambiaClientePolicy,
  savePolicy,
  apriPolicy,
  trasfertaCambiata,
  clienteSpesaCambiato,
  voceSpesaCambiata,
  totaleAMano,
  veicoloCambiato,
  aggiornaCalcoloEAvviso,
  aggiornaAvvisoPolicy,
  aggiornaTracciabilita,
  setMsgLeggero,
  spesaAllEstero,
  avvisoScartate,
  caricaRicevuta,
  apriRicevuta,
  togliRicevuta,
  kmCambiati,
  addVehicle,
  editVehicle,
  saveVehicle,
  deleteVehicle,
  apriChiudiTrasferta,
  creaTrasfertaDaSpese,
  saveTrip,
  saveTripEdit,
  editTrip,
  deleteTrip,
  nuovaSpesaInTrasferta,

  saveExpense,
  expenseEdit,
  saveExpenseEdit,
  duplicateExpense,
  deleteExpense,
  editEntry,
  timesheet,
  timesheetRow,
  annualSummaryCard,
  billingGroupsByClient,
  billing,
  openBillingClient,
  billingDetailView,
  saveBillingHeader,
  copyText,
  parseExcludedMonths,
  projectionCalc,
  projectionCard,
  tax,
  saveTaxSettings,
  inpsGsCalc,
  inpsGsCard,
  taxPaymentTypeLabel,
  taxPaymentTypeOptions,
  taxPayments,
  editTaxPayment,
  taxPaymentEdit,
  addTaxPayment,
  saveTaxPayment,
  deleteTaxPayment,
  settings,
  appearance,
  exportTimesheetViewOptions,
  exportTimesheet,
  clients,
  editClient,
  clientEdit,
  addClient,
  saveClient,
  deleteClient,
  projects,
  editProject,
  projectEdit,
  addProject,
  saveProject,
  deleteProject,
  activities,
  editActivity,
  activityEdit,
  addActivity,
  saveActivity,
  deleteActivity,
  expenseCategories,
  editExpenseCategory,
  expenseCategoryEdit,
  addExpenseCategory,
  saveExpenseCategory,
  deleteExpenseCategory,
  invoiceTemplates,
  editInvoiceTemplate,
  invoiceTemplateEdit,
  addInvoiceTemplate,
  saveInvoiceTemplate,
  deleteInvoiceTemplate,
  ensureClient,
  ensureProject,
  ensureActivity,
  parseCsvLine,
  canonHeader,
  parseAmount,
  toDate,
  toMonth,
  exportRowsFor,
  downloadTimesheetExcel,
  importCsv,
  exportData,
  render
});
document.addEventListener('input',e=>{if(e.target.closest?.('.form'))state.dirty=true});
document.addEventListener('change',e=>{if(e.target.closest?.('.form')&&e.target.type!=='file')state.dirty=true});
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{})}
init();
