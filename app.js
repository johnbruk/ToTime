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
import { createRepository } from './src/dataRepository.js';
import { loadAppData } from './src/appDataLoader.js';

const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const repository=createRepository(sb);
let state={view:'home',month:ym(today),edit:null,editType:null,loading:true,message:'',theme:localStorage.getItem('totime-theme')||'light',menuOpen:false,history:[],dirty:false,selMode:false,sel:[]};
let session=null;
let data={clients:[],projects:[],activities:[],entries:[],monthly:[],billingHeaders:[],profiles:[],expenseCategories:[],travelExpenses:[],manualEntries:[],invoiceTemplates:[],appSettings:[],taxSettings:[],taxPayments:[]};
applyTheme();watchSystemTheme();


function systemTheme(){try{return (window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch(e){return 'light'}}
function effectiveTheme(){const t=state.theme||'light';return t==='auto'?systemTheme():t}
function applyTheme(){document.documentElement.setAttribute('data-theme',effectiveTheme());localStorage.setItem('totime-theme',state.theme||'light')}
function watchSystemTheme(){try{const mq=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');if(!mq)return;const h=()=>{if((state.theme||'light')==='auto'){applyTheme();render()}};mq.addEventListener?mq.addEventListener('change',h):mq.addListener(h)}catch(e){}}
function logoIcon(){return (state.theme||'light')==='dark'?'assets/TOTIME_logo_only_dark.png':'assets/TOTIME_logo_only.png'}
function logoWordmark(){return (state.theme||'light')==='dark'?'assets/TOTIME_logo_wordmark_dark.png':'assets/TOTIME_logo_wordmark.png'}
function settingValue(key){return data.appSettings?.find(s=>s.setting_key===key)?.setting_value}
function loadThemeFromSettings(){const val=settingValue('theme'); if(typeof val==='string' && ['light','dark','auto'].includes(val)){state.theme=val} applyTheme()}
async function saveThemeChoice(theme){state.theme=theme;applyTheme();const existing=data.appSettings?.find(s=>s.setting_key==='theme');const payload={setting_key:'theme',setting_value:theme};let res;if(existing)res=await updateResilient('app_settings',payload,existing.id);else res=await insertResilient('app_settings',payload);if(res.error)return setMsg(res.error.message,7000);await reload();state.view='appearance';setMsg('Tema aggiornato.',3000)}

function monthLabel(m){const [y,mo]=m.split('-').map(Number);return `${monthNames[mo-1]} ${y}`}
function periodParts(m=state.month){const [year,month]=m.split('-').map(Number);return {year,month}}
function changeMonth(delta){let [y,m]=state.month.split('-').map(Number);m+=delta;if(m<1){m=12;y--}if(m>12){m=1;y++}state.month=`${y}-${String(m).padStart(2,'0')}`;render()}
function setMsg(msg,timeout=4200){state.message=msg;render();setTimeout(()=>{if(state.message===msg){state.message='';render()}},timeout)}
function clientById(id){return data.clients.find(c=>c.id===id)}
function projectById(id){return data.projects.find(p=>p.id===id)}
function activityById(id){return data.activities.find(a=>a.id===id)}
function expenseCategoryById(id){return data.expenseCategories.find(x=>x.id===id)}
function invoiceTemplateByType(type){return data.invoiceTemplates.filter(t=>t.active&&t.entry_type===type).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))[0]}
function clientName(id){return clientById(id)?.name||'Senza cliente'}
function projectName(id){return projectById(id)?.name||''}
function activityName(id){return activityById(id)?.name||''}
function activityTagClass(id){let h=0;const s=String(id||'');for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return 'act'+(h%6)}
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
function isMissingColumnError(err){return !!err && /column|schema cache|does not exist|could not find/i.test(err.message||'')}
function missingColumnName(err){if(!err)return null;const m=(err.message||'').match(/'([a-zA-Z_]\w*)'\s+column|column\s+'([a-zA-Z_]\w*)'|column\s+"([a-zA-Z_]\w*)"/);return m?(m[1]||m[2]||m[3]):null}
// Esegue la scrittura; se il DB segnala una colonna mancante (schema non ancora
// migrato), la rimuove dal payload e ritenta, finche' la scrittura riesce.
// Cosi' i salvataggi non si bloccano mai per colonne nuove non ancora create.
async function runResilient(makeCall,payload,dropKeys){const p={...payload};let res=await makeCall(p);let guard=0;while(isMissingColumnError(res.error)&&guard++<40){let removed=false;const col=missingColumnName(res.error);if(col&&Object.prototype.hasOwnProperty.call(p,col)){delete p[col];removed=true}if(!removed){(dropKeys||[]).forEach(k=>{if(Object.prototype.hasOwnProperty.call(p,k)){delete p[k];removed=true}})}if(!removed)break;res=await makeCall(p)}return res}
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
function viewLabel(v){return ({home:'Dashboard',timesheet:'Timesheet',summary:'Riepiloghi',billing:'Fatturazione',incassi:'Incassi',billingDetail:'Dettaglio fattura',tax:'Profilo fiscale',taxPayments:'Pagamenti fiscali',taxPaymentEdit:'Pagamento fiscale',annualMonths:'Consuntivato annuale',annualInvoices:'Elenco fatture',settings:'Configurazione',clients:'Clienti',clientEdit:'Cliente',projects:'Progetti',projectEdit:'Progetto',activities:'Attività',activityEdit:'Attività',expenseCategories:'Voci spesa',expenseCategoryEdit:'Voce spesa',invoiceTemplates:'Template fattura',invoiceTemplateEdit:'Template fattura',appearance:'Aspetto',exportTimesheet:'Export timesheet',newChoice:'Nuovo consuntivo',dailyForm:'Consuntivo giornaliero',dailyEdit:'Consuntivo giornaliero',monthlyForm:'Compenso mensile',monthlyEdit:'Compenso mensile',manualForm:'Consuntivo manuale',manualEdit:'Consuntivo manuale',expenseForm:'Spesa trasferta',expenseEdit:'Spesa trasferta'})[v]||'schermata precedente'}
function guardUnsavedChanges(){if(!state.dirty)return true;const leave=confirm('Hai modifiche non salvate. Vuoi uscire da questa schermata e perdere i dati inseriti?');if(leave){state.dirty=false;return true}return false}
function pushHistory(){const last=state.history[state.history.length-1];const cur={view:state.view,edit:state.edit,editType:state.editType};if(!last||last.view!==cur.view||last.edit!==cur.edit||last.editType!==cur.editType)state.history.push(cur);if(state.history.length>30)state.history.shift()}
function navigateTo(v,{edit=null,editType=null,track=true,resetEdit=true}={}){if(!guardUnsavedChanges())return;if(track&&state.view!==v)pushHistory();state.view=v;state.edit=resetEdit?edit:state.edit;state.editType=resetEdit?editType:state.editType;state.menuOpen=false;clearSel();render()}
function go(v){navigateTo(v)}
function back(){if(!guardUnsavedChanges())return;const prev=state.history.pop()||{view:'home',edit:null,editType:null};state.view=prev.view||'home';state.edit=prev.edit||null;state.editType=prev.editType||null;state.menuOpen=false;render()}
function toggleMainMenu(){if(!guardUnsavedChanges())return;state.menuOpen=!state.menuOpen;render()}
const MENU=[
  {v:'home',ic:'⌂',l:'Dashboard'},
  {main:'timesheet',ic:'◷',l:'Timesheet',sub:[{v:'newChoice',l:'Nuovo consuntivo'},{v:'calendario',l:'Calendario'},{v:'griglia',l:'Consuntivo mensile'},{v:'pivot',l:'Analisi consuntivi'},{v:'tmManage',l:'Incarichi continuativi'}]},
  {main:'expenses',ic:'▦',l:'Spese',sub:[{v:'expenseForm',l:'Nuova spesa'}]},
  {v:'billing',ic:'€',l:'Fatturazione'},
  {v:'balance',ic:'∑',l:'Bilancio'},
  {main:'tax',ic:'%',l:'Tassazione',sub:[{v:'tasseFuture',l:'Tasse future'},{v:'taxPayments',l:'Pagamenti fiscali (INPS)'},{v:'taxSettings',l:'Configurazione fiscale'}]},
  {main:'settings',ic:'⚙',l:'Impostazioni',sub:[{v:'clients',l:'Clienti'},{v:'projects',l:'Progetti'},{v:'activities',l:'Attività'},{v:'expenseCategories',l:'Voci di costo/spesa'},{v:'invoiceTemplates',l:'Template fattura'},{v:'appearance',l:'Aspetto / Tema'},{v:'account',l:'Account'}]}
];
const NAV_CHILDREN={
  timesheet:['timesheet','newChoice','calendario','tmManage','dailyForm','dailyEdit','monthlyForm','monthlyEdit','manualForm','manualEdit','annualMonths'],
  expenses:['expenses','expenseForm','expenseEdit'],
  billing:['billing','billingDetail','annualInvoices','incassi','fatturatoDetail'],
  tax:['tax','tasseFuture','taxPayments','taxPaymentEdit','taxSettings'],
  settings:['settings','clients','clientEdit','projects','projectEdit','activities','activityEdit','expenseCategories','expenseCategoryEdit','invoiceTemplates','invoiceTemplateEdit','appearance','account','exportTimesheet']
};
function navSectionLabel(view){for(const m of MENU){const key=m.main||m.v;const kids=NAV_CHILDREN[key]||[key];if(kids.includes(view))return m.l;}return null;}
function navMenu(){const cur=navSectionLabel(state.view);return MENU.map(m=>{
  if(!m.sub)return `<button class="${cur===m.l?'active':''}" onclick="go('${m.v}')"><span>${m.ic}</span><b>${m.l}</b></button>`;
  const open=cur===m.l;
  const parent=`<button class="navParentBtn ${open?'active':''}" onclick="go('${m.main}')"><span>${m.ic}</span><b>${m.l}</b><i class="navChev">${open?'▾':'▸'}</i></button>`;
  const subs=open?`<div class="navSubList">${m.sub.map(s=>`<button class="navSubItem ${state.view===s.v?'active':''}" onclick="${s.edit?`goNav('${s.v}','${s.edit}')`:`go('${s.v}')`}">${s.l}</button>`).join('')}</div>`:'';
  return parent+subs;
}).join('')}
function goNav(v,edit){navigateTo(v,{edit:edit||null})}
function menuDropdown(){if(!state.menuOpen)return'';return `<div class="topMenu" role="menu"><button class="topMenuClose" onclick="toggleMainMenu()" aria-label="Chiudi menu">✕</button><img class="topMenuLogo" src="${logoWordmark()}" alt="TOTIME">${navMenu()}</div>`}
function backControl(){if(!state.history.length||state.view==='home')return'';return `<button class="backArrow" onclick="back()" aria-label="Indietro" title="Indietro">‹</button>`}

function groupSummary(){
  const map={};
  rowsForMonth().forEach(e=>{if(isPlanned(e))return;const tm=isTM(e);const k=`${e.client_id}|${e.project_id||''}|${tm?'tm':'daily_rate_8h'}`; if(!map[k]) map[k]={client_id:e.client_id,project_id:e.project_id,type:'daily_rate_8h',label:tm?'Time & Material':'Consulenza',hours:0,amount:0,items:[]}; map[k].hours+=Number(e.hours||0); map[k].amount+=dailyAmount(e); map[k].items.push(e)});
  monthlyRows().forEach(e=>{const k=`${e.client_id}|${e.project_id||''}|monthly_flat`; if(!map[k]) map[k]={client_id:e.client_id,project_id:e.project_id,type:'monthly_flat',label:'Compenso mensile',hours:null,amount:0,items:[]}; map[k].amount+=Number(e.amount||0); map[k].items.push(e)});
  manualRows().forEach(e=>{if(isPlanned(e))return;const k=`${e.client_id}|${e.project_id||''}|manual_entry`; if(!map[k]) map[k]={client_id:e.client_id,project_id:e.project_id,type:'manual_entry',label:'Consuntivo manuale',hours:null,amount:0,items:[]}; map[k].amount+=Number(e.amount||0); map[k].items.push(e)});
  expenseRows().filter(expIsInvoice).forEach(e=>{const k=`${e.client_id}|${e.project_id||''}|travel_expenses`; if(!map[k]) map[k]={client_id:e.client_id,project_id:e.project_id,type:'travel_expenses',label:'Spese di trasferta',hours:null,amount:0,items:[]}; map[k].amount+=Number(e.amount||0); map[k].items.push(e)});
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
function annualTaxCalc(year=currentYear()){
  const ts=currentTaxSetting(year);const totalsY=annualTotals(year);
  const revenue=totalsY.incassato;const coeff=Number(ts.profitability_coefficient||0)/100;const taxRate=Number(ts.substitute_tax_rate||0)/100;
  const paidContrib=data.taxPayments.filter(p=>Number(p.fiscal_year)===Number(year)&&String(p.payment_type||'').toLowerCase().includes('inps')&&p.status==='paid').reduce((s,p)=>s+Number(p.amount||0),0);
  const forfaitIncome=revenue*coeff;const taxable=Math.max(0,forfaitIncome-paidContrib);const substituteTax=taxable*taxRate;const net=revenue-paidContrib-substituteTax;
  return {settings:ts,revenue,forfaitIncome,paidContrib,taxable,substituteTax,net,...totalsY};
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
    const loaded=await loadAppData({
      repository,
      ensureUserProfile:ensureUserProfileFromMetadata,
      tableError:(table,error)=>{
        console.error(table,error);
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
function fmtK(n){n=Number(n)||0;const a=Math.abs(n);if(a>=1000)return (n/1000).toFixed(a>=10000?0:1).replace('.',',')+'k €';return Math.round(n)+' €'}
function homeMultiChart(){
  const year=currentYear();const md=annualMonthData(year);const net=netMarginByMonth(year);
  const now=new Date();const actualEnd=year<now.getFullYear()?11:(year===now.getFullYear()?now.getMonth():-1);
  if(actualEnd<0)return '';
  const ts=currentTaxSetting(year);const coeff=Number(ts.profitability_coefficient||0)/100;const gsRate=Number(ts.inps_gs_rate??26.07)/100;const taxRate=Number(ts.substitute_tax_rate||0)/100;
  const per=md.map(m=>{const forfait=m.compensi*coeff;const inps=forfait*gsRate;const imposta=Math.max(0,forfait-inps)*taxRate;const tasse=inps+imposta;const spese=(m.costi||0)+(m.rimborsiFattura||0);const netto=m.consuntivato-tasse-spese;return {netto,tasse,spese,cons:m.consuntivato};});
  const cum=sel=>{let s=0;return per.map(p=>s+=sel(p));};
  const cNet=cum(p=>p.netto),cTax=cum(p=>p.tasse),cExp=cum(p=>p.spese),cCons=cum(p=>p.cons);
  const max=Math.max(1,...cCons.slice(0,actualEnd+1));
  const X=i=>(i/11*100).toFixed(1);const Y=v=>(52-(Math.max(0,v)/max)*46).toFixed(1);
  const upTax=cNet.map((v,i)=>v+cTax[i]);const zeros=cNet.map(()=>0);
  const area=(lower,upper,color)=>{const top=[];const bot=[];for(let i=0;i<=actualEnd;i++)top.push(`${X(i)},${Y(upper[i])}`);for(let i=actualEnd;i>=0;i--)bot.push(`${X(i)},${Y(lower[i])}`);return `<polygon points="${top.concat(bot).join(' ')}" style="fill:${color};stroke:none"></polygon>`;};
  const bands=area(zeros,cNet,'#3FB27F')+area(cNet,upTax,'#F7A647')+area(upTax,cCons,'#94A2BE');
  const legend=`<div class="segLegend"><span class="li"><span class="sdot" style="background:transparent;border:1.5px solid var(--muted)"></span>Consuntivato · ${fmtEUR(cCons[actualEnd])}</span><span class="li"><span class="sdot" style="background:#3FB27F"></span>Netto · ${fmtEUR(cNet[actualEnd])}</span><span class="li"><span class="sdot" style="background:#F7A647"></span>Tasse · ${fmtEUR(cTax[actualEnd])}</span><span class="li"><span class="sdot" style="background:#94A2BE"></span>Spese · ${fmtEUR(cExp[actualEnd])}</span></div>`;
  return `<div class="card"><b>Composizione del consuntivato ${year}</b><div class="desc" style="margin-top:2px">Il consuntivato cumulato ripartito in netto (dopo spese e tasse) + tasse + spese</div><div class="lineChartWrap" style="margin-top:14px"><div class="lineChartY"><span>${fmtK(max)}</span><span>${fmtK(max/2)}</span><span>0</span></div><div class="lineChartCol"><svg class="lineChart" viewBox="0 0 100 58" preserveAspectRatio="none"><line x1="0" y1="6" x2="100" y2="6"></line><line x1="0" y1="52" x2="100" y2="52"></line>${bands}</svg></div></div><div class="chartMonths" style="padding-left:58px">${monthNames.map((m,i)=>`<span class="${i>actualEnd?'future':''}">${m.slice(0,3)}</span>`).join('')}</div>${legend}</div>`;
}
function annualChartSvg(){
  const year=currentYear();const md=annualMonthData(year);
  const now=new Date();const actualEnd=year<now.getFullYear()?11:(year===now.getFullYear()?now.getMonth():-1);
  let sc=0,sp=0;const cons=[],prev=[];md.forEach(m=>{sc+=m.consuntivato;cons.push(sc);sp+=m.consuntivato+(m.pianificato||0);prev.push(sp);});
  const max=Math.max(prev[11]||0,cons[11]||0,1);
  const X=i=>(i/11*100).toFixed(1);const Y=v=>(52-(v/max)*46).toFixed(1);
  const consVis=actualEnd>=0?cons.slice(0,actualEnd+1):[];
  const consPts=consVis.map((v,i)=>X(i)+','+Y(v)).join(' ');
  const prevPts=prev.map((v,i)=>X(i)+','+Y(v)).join(' ');
  const hasPrev=prev[11]>cons[actualEnd>=0?actualEnd:11]+0.5;
  const legend='<div class="segLegend" style="margin-top:8px"><span class="li"><span class="sdot" style="background:#7C89A6"></span>Consuntivato · '+fmtEUR(cons[actualEnd>=0?actualEnd:11]||0)+'</span>'+(hasPrev?'<span class="li"><span class="sdot" style="background:#8A6DFF"></span>Con pianificato · '+fmtEUR(prev[11])+'</span>':'')+'</div>';
  return '<div class="annualChartBox"><div class="lineChartWrap"><div class="lineChartY"><span>'+fmtK(max)+'</span><span>'+fmtK(max/2)+'</span><span>0</span></div><div class="lineChartCol"><svg class="lineChart" viewBox="0 0 100 58" preserveAspectRatio="none"><line x1="0" y1="52" x2="100" y2="52"></line><line x1="0" y1="6" x2="100" y2="6"></line>'+(hasPrev&&prevPts?'<polyline points="'+prevPts+'" style="stroke:#8A6DFF;stroke-width:2;stroke-dasharray:2.4 1.6"></polyline>':'')+(consPts?'<polyline points="'+consPts+'"></polyline>':'')+'</svg></div></div><div class="chartMonths" style="padding-left:58px">'+monthNames.map((m,i)=>'<span class="'+(i>actualEnd?'future':'')+'">'+m.slice(0,3)+'</span>').join('')+'</div>'+legend+'</div>';
}
function monthChartSvg(){const series=monthSeries();const max=Math.max(...series,1);const pts=series.map((v,i)=>`${(i/(series.length-1||1))*100},${52-(v/max)*46}`).join(' ');return `<div class="lineChartWrap"><div class="lineChartY"><span>${fmtK(max)}</span><span>${fmtK(max/2)}</span><span>0</span></div><div class="lineChartCol"><svg class="lineChart" viewBox="0 0 100 58" preserveAspectRatio="none"><line x1="0" y1="52" x2="100" y2="52"></line><line x1="0" y1="30" x2="100" y2="30"></line><polyline points="${pts}"></polyline></svg></div></div>`}
function homeIncassiCard(){const yr=currentYear();const cur=annualTotals(yr);const daIncassare=Math.max(0,cur.fatturato-cur.incassato);return `<div class="card cardLink" onclick="openAnnualInvoices('collected')" role="button" title="Elenco incassi ${yr}"><b>I tuoi incassi ${yr} <span class="cardLinkArrow">›</span></b><div class="statRow"><div class="stat tint-sage"><div class="statHead"><span class="statDot"></span><span class="statLbl">Incassato</span></div><strong>${fmtEUR(cur.incassato)}</strong></div><div class="stat tint-pink"><div class="statHead"><span class="statDot"></span><span class="statLbl">Da incassare</span></div><strong>${fmtEUR(daIncassare)}</strong></div></div></div>`}
function forfettarioBarCard(){const yr=currentYear();const ts=currentTaxSetting(yr);const limit=Number(ts.annual_revenue_limit||85000);const incassato=annualTotals(yr).incassato;const pct=limit?Math.min(100,(incassato/limit)*100):0;const remaining=Math.max(0,limit-incassato);const over=incassato>limit;const color=over?'#D9534F':pct>=90?'#D9534F':pct>=70?'#E0A24E':'var(--primary)';return `<div class="card"><div class="threshVals"><strong>${fmtEUR(incassato)}</strong> <span class="threshLimit">/ ${fmtEUR(limit)}</span></div><div class="threshBar"><span style="width:${pct.toFixed(1)}%;background:${color}"></span></div><div class="threshNote">${over?`Hai superato il limite del regime forfettario di <b>${fmtEUR(incassato-limit)}</b>.`:`Puoi incassare ancora <b>${fmtEUR(remaining)}</b> quest'anno per non superare il limite del regime forfettario.`}</div></div>`}
function homeFatturatoCard(){const yr=currentYear();const cur=annualTotals(yr);const daFatturare=cur.daFatturare;return `<div class="card cardLink" onclick="go('fatturatoDetail')" role="button" title="Come si calcolano fatturato e da fatturare"><b>Il tuo fatturato ${yr} <span class="cardLinkArrow">›</span></b><div class="statRow"><div class="stat tint-blue"><div class="statHead"><span class="statDot"></span><span class="statLbl">Fatturato</span></div><strong>${fmtEUR(cur.fatturato)}</strong></div><div class="stat tint-orange"><div class="statHead"><span class="statDot"></span><span class="statLbl">Da fatturare</span></div><strong>${fmtEUR(daFatturare)}</strong></div></div><div class="small" style="margin-top:10px">Imponibile fatturato ${fmtEUR(cur.fatturatoBase)}</div></div>`}
function fatturatoDetail(){const year=currentYear();const at=annualTotals(year);const md=annualMonthData(year);const rows=md.map((m,i)=>({i,cons:m.consuntivato,base:m.fatturatoBase,diff:m.consuntivato-m.fatturatoBase})).filter(r=>r.cons||r.base);return appShell(`<h1>Da fatturare ${year}</h1><p class="sub">Come si ottiene il totale "da fatturare".</p><div class="card"><b>Calcolo ${year}</b><div class="list" style="box-shadow:none;margin:12px 0 0"><div class="row"><div></div><div><div class="title">Consuntivato anno</div><div class="desc">tutto il lavoro registrato (compensi + rimborsi in fattura)</div></div><div class="value">${fmtEUR(at.consuntivato)}</div></div><div class="row"><div></div><div><div class="title" style="color:var(--red)">− Base imponibile fatturata</div><div class="desc">imponibili delle fatture emesse/incassate, senza rivalsa INPS e bollo</div></div><div class="value" style="color:var(--red)">${fmtEUR(at.fatturatoBase)}</div></div><div class="row"><div></div><div><div class="title"><b>= Da fatturare</b></div><div class="desc">lavoro consuntivato non ancora messo in fattura</div></div><div class="value"><b>${fmtEUR(at.daFatturare)}</b></div></div></div><div class="metricLine" style="margin-top:8px">Fatturato lordo ${fmtEUR(at.fatturato)} · include rivalsa INPS 4% e bollo</div></div><div class="card"><b>Dettaglio mensile ${year}</b><div class="desc" style="margin-top:2px">Per ogni mese: consuntivato, base già fatturata e residuo da fatturare. Tocca un mese per il timesheet.</div><div class="list" style="box-shadow:none;margin:10px 0 0">${rows.map(r=>`<div class="row" onclick="openMonthTimesheet(${year},${r.i+1})"><div class="date">${monthNames[r.i].slice(0,3)}</div><div><div class="title">${monthNames[r.i]}</div><div class="desc">Consuntivato ${fmtEUR(r.cons)} · Fatturato base ${fmtEUR(r.base)}</div></div><div class="value" style="${r.diff>0.005?'color:var(--orange)':''}">${fmtEUR(Math.max(0,r.diff))}</div></div>`).join('')||'<div class="empty">Nessun dato nel '+year+'.</div>'}</div></div><button type="button" class="secondary" onclick="openAnnualInvoices('issued')">Vedi fatture emesse ›</button>`)}
function openAnnualMonths(){navigateTo('annualMonths')}
function openAnnualInvoices(mode){navigateTo('annualInvoices',{edit:mode})}
function openMonthTimesheet(year,month){state.month=`${year}-${String(month).padStart(2,'0')}`;navigateTo('timesheet')}
function openInvoiceDetail(clientId,year,month){state.month=`${year}-${String(month).padStart(2,'0')}`;navigateTo('billingDetail',{edit:clientId})}
function annualMonths(){const year=currentYear();const md=annualMonthData(year);const tot=annualTotals(year);return appShell(`<h1>Consuntivato ${year}</h1><p class="sub">Dettaglio mese per mese. Tocca un mese per aprire il relativo timesheet.</p><div class="card"><b>Totale anno ${year}</b><div class="kpiGrid" style="margin-top:14px"><div><span>Consuntivato</span><strong>${fmtEUR(tot.consuntivato)}</strong></div><div><span>Fatturato</span><strong>${fmtEUR(tot.fatturato)}</strong></div><div><span>Incassato</span><strong>${fmtEUR(tot.incassato)}</strong></div><div><span>Speso</span><strong>${fmtEUR(tot.spese)}</strong></div></div>${tot.pianificato>0?`<div class="metricLine" style="margin-top:12px"><span class="tag blue">Pianificato</span> ${fmtEUR(tot.pianificato)} · giorni futuri (non nel consuntivato)</div>`:''}</div><div class="list">${md.map(m=>`<div class="row" onclick="openMonthTimesheet(${year},${m.month})"><div class="date">${m.label}</div><div><div class="title">${monthNames[m.month-1]} ${year}</div><div class="desc">Consuntivato ${fmtEUR(m.consuntivato)} · Fatturato ${fmtEUR(m.fatturato)}<br>Incassato ${fmtEUR(m.incassato)} · Speso ${fmtEUR(m.spese)}${m.pianificato>0?' · Pianificato '+fmtEUR(m.pianificato):''}</div></div><div class="value">${fmtEUR(m.consuntivato)}</div></div>`).join('')}</div>`)}
function incassi(){return annualInvoices('collected')}
function annualInvoices(modeArg){const year=currentYear();const mode=modeArg||(state.edit==='collected'?'collected':'issued');let rows=data.billingHeaders.filter(h=>Number(h.year)===Number(year)&&['invoice_issued','collected'].includes(h.status));if(mode==='collected')rows=rows.filter(h=>h.status==='collected');rows=rows.sort((a,b)=>(Number(b.month)-Number(a.month))||clientName(a.client_id).localeCompare(clientName(b.client_id)));const title=mode==='collected'?`Incassi ${year}`:`Fatture emesse ${year}`;const amountOf=h=>mode==='collected'?Number(h.collected_amount||h.invoice_total_amount||h.total_amount||0):Number(h.invoice_total_amount||h.total_amount||0);const total=rows.reduce((s,h)=>s+amountOf(h),0);return appShell(`<h1>${title}</h1><p class="sub">Tocca una voce per aprire il dettaglio della fattura.</p><div class="card"><b>Totale ${mode==='collected'?'incassato':'fatturato'} ${year}</b><div class="amount" style="margin-top:8px">${fmtEUR(total)}</div></div><div class="list">${rows.map(h=>`<div class="row" onclick="openInvoiceDetail('${h.client_id}',${h.year},${h.month})"><div class="date">${String(h.month).padStart(2,'0')}/${h.year}</div><div><div class="title">${esc(clientName(h.client_id))}</div><div class="desc">${h.invoice_number?'Fattura '+esc(h.invoice_number)+' · ':''}${statusLabel(h.status)}${h.invoice_date?' · '+dateIT(h.invoice_date):''}</div></div><div class="value">${fmtEUR(amountOf(h))}</div></div>`).join('')||`<div class="empty">${mode==='collected'?'Nessun incasso registrato':'Nessuna fattura emessa'} nel ${year}.</div>`}</div>`)}
function home(){const t=totals();const y=annualTotals(currentYear());return appShell(`<h1 class="srOnly">Dashboard</h1><button class="primary cta" onclick="newEntryChoice()">+ Nuovo consuntivo</button><div class="homeTop">${monthSelector()}</div><div class="card cardLink" onclick="go('timesheet')" role="button" title="Apri il timesheet di ${monthLabel(state.month)}"><b>Consuntivo mese <span class="cardLinkArrow">›</span></b><div class="kpiGrid" style="margin-top:14px"><div><span>Ore consuntivate</span><strong>${fmtNum(t.hours,1)} h</strong><small>${fmtNum(t.days,2)} gg/u</small></div><div><span>Importo mese</span><strong>${fmtEUR(t.amount)}</strong><small>consuntivato</small></div></div>${t.plannedAmount>0?`<div class="metricLine" style="margin-top:10px"><span class="tag blue">Pianificato</span> ${fmtNum(t.plannedHours,1)} h · ${fmtEUR(t.plannedAmount)}</div>`:''}</div><div class="dashboardCard heroCard cardLink" onclick="openAnnualMonths()" role="button" title="Dettaglio consuntivato mese per mese"><b>Consuntivato anno ${currentYear()} <span class="cardLinkArrow">›</span></b><div class="kpiGrid" style="${y.pianificato>0?'':'grid-template-columns:1fr;'}margin-top:14px"><div style="${y.pianificato>0?'':'border-right:0'}"><span>Anno in corso</span><strong>${fmtEUR(y.consuntivato)}</strong><small>consuntivato</small></div>${y.pianificato>0?`<div style="border-right:0"><span>Pianificato</span><strong>${fmtEUR(y.pianificato)}</strong><small>giorni futuri</small></div>`:''}</div><div class="chartWrap"><div class="chartTitle"><span>Timesheet · andamento ${currentYear()}</span><span>consuntivato + pianificato</span></div>${annualChartSvg()}</div></div>${homeFatturatoCard()}${homeIncassiCard()}${dashFull()?homeBalanceCharts()+homeMultiChart():''}<button type="button" class="secondary dashToggle" onclick="toggleDashFull()">${dashFull()?'▴ Nascondi analisi e grafici':'▾ Mostra analisi e grafici'}</button>`)}
function dashFull(){return settingValue('dash_full')==='1'}
async function toggleDashFull(){const r=await saveSetting('dash_full',dashFull()?'0':'1');if(r.error)return setMsg(r.error.message,7000);await reload();render()}
function newEntryChoice(){navigateTo('newChoice')}
function openGriglia(){const v=state.editType;if(typeof v==='string'&&v.length===10&&v.charAt(4)==='-')state.month=v.slice(0,7);navigateTo('griglia')}
function newChoice(){return appShell(`<h1>Nuovo consuntivo</h1><p class="sub">Un giorno alla volta, oppure tutto il mese insieme.</p><div class="actions">
<button class="menuBtn" onclick="goForDay('dailyForm')"><span><b>Consuntivo giornaliero</b><br><span class='sub'>Un giorno, una voce: ore lavorate valorizzate secondo tariffa</span></span><span>›</span></button>
<button class="menuBtn" onclick="openGriglia()"><span><b>Consuntivo mensile</b><br><span class='sub'>Tutto il mese in una griglia: una riga per commessa, una colonna per giorno</span></span><span>›</span></button>
<button class="menuBtn" onclick="goForDay('manualForm')"><span><b>Compenso una tantum</b><br><span class='sub'>Importo fisso, indipendente da ore e giornate</span></span><span>›</span></button>
</div>`)}
function sediOptions(selected=''){const sedi=['Remoto','Casa','Ufficio','Sede cliente','Onsite cliente','Altro'];return `<option></option>${sedi.map(x=>`<option value="${esc(x)}" ${x===selected?'selected':''}>${esc(x)}</option>`).join('')}`}
function projectOptions(clientId,selected=''){return `<option value=""></option>${sortEntities('projects',data.projects.filter(p=>p.active&&p.client_id===clientId)).map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('')}`}
function activityOptions(selected=''){return `<option value=""></option>${sortEntities('activities',data.activities.filter(a=>a.active)).map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.name)}</option>`).join('')}`}
function expenseOptions(selected=''){return `<option value=""></option>${sortEntities('expenseCategories',data.expenseCategories.filter(x=>x.active)).map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${esc(x.name)}</option>`).join('')}`}
function refreshProjectsForForm(form){const client=form.client_id.value;const project=form.project_id;if(project)project.innerHTML=projectOptions(client,'')}
async function saveSetting(key,value){const existing=data.appSettings?.find(s=>s.setting_key===key);const payload={setting_key:key,setting_value:String(value)};return existing?updateResilient('app_settings',payload,existing.id):insertResilient('app_settings',payload)}
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
function newEntryForDay(){navigateTo('newChoice',{editType:state.edit||todayISO()})}
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
function tmForm(){const clients=dailyClients();const selected=clients[0]?.id||'';const today=new Date().toISOString().slice(0,10);const initial=tmPreviewHtml(tmComputeVals(selected,today,today,4,true,true));return appShell(`<h1>Impegno continuativo</h1><p class="sub">Genera i consuntivi su tutti i giorni lavorativi tra due date, con un impegno orario fisso. Tariffa oraria = tariffa giornaliera / 8h.</p>${clients.length?`<form class="form" onsubmit="saveTM(event)" oninput="updateTMPreview(this)"><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form);updateTMPreview(this.form)">${clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(selected)}</select></div><div class="field"><label>Attività</label><select name="activity_id">${activityOptions()}</select></div><div class="grid"><div class="field"><label>Data inizio</label><input name="start_date" type="date" value="${today}"></div><div class="field"><label>Data fine</label><input name="end_date" type="date" value="${today}"></div></div><div class="field"><label>Cadenza</label><select name="cadence" onchange="updateTMPreview(this.form)">${TM_CADENCE.map(c=>`<option value="${c[0]}">${c[1]}</option>`).join('')}</select></div><div class="field weekdayField" style="display:none"><label>Giorno della settimana</label><select name="weekday" onchange="updateTMPreview(this.form)">${WEEKDAYS.map(w=>`<option value="${w[0]}" ${w[0]==='4'?'selected':''}>${w[1]}</option>`).join('')}</select></div><div class="field"><label class="hoursLabel">Ore al giorno</label><input name="hours" type="number" step="0.25" min="0.25" value="4"></div><div class="field"><label>Giorni</label><select name="exclude_holidays"><option value="1">Lun-Ven · esclude le festività italiane</option><option value="0">Lun-Ven · include le festività</option></select></div><div class="field"><label>Giorni già consuntivati</label><select name="skip_conflicts"><option value="1">Salta i giorni con consuntivo esistente</option><option value="0">Genera comunque (duplica)</option></select></div><div class="field"><label>Sede</label><select name="work_site">${sediOptions('Remoto')}</select></div><div class="field"><label>Descrizione</label><input name="description" value="Time &amp; Material"></div><div class="field"><label>Note</label><textarea name="notes" placeholder="Note interne opzionali"></textarea></div><div class="card" id="tmPreview" style="margin:6px 0">${initial}</div><div class="actions"><button class="primary">Genera consuntivi</button><button type="button" class="secondary" onclick="go('home')">Annulla</button></div></form>`:`<div class="card">Crea prima un cliente con tariffa giornaliera in Configurazione.</div>`}`);}
async function saveTM(ev){ev.preventDefault();const f=ev.target;const c=clientById(f.client_id.value);const r=tmComputeVals(f.client_id.value,f.start_date.value,f.end_date.value,f.hours.value,f.exclude_holidays.value==='1',f.skip_conflicts.value==='1',f.cadence.value,f.weekday.value);if(r.hours<=0)return setMsg('Inserisci le ore al giorno.',6000);if(!r.days.length)return setMsg('Nessun giorno da generare (verifica intervallo e giorni già consuntivati).',6000);if(r.days.length>366&&!confirm('Stai per generare '+r.days.length+' consuntivi. Procedere?'))return;const tISO=todayISO();const batch='tm_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);const site=norm(f.work_site.value);const desc=norm(f.description.value)||null;const notes=norm(f.notes.value)||null;const rows=r.days.map(iso=>({entry_date:iso,client_id:f.client_id.value,project_id:f.project_id.value||null,activity_id:f.activity_id.value||null,work_location:site||null,work_site:site||null,work_city:null,description:desc,notes:notes,hours:r.hours,status:(iso>tISO?'planned':'actual'),tm_batch_id:batch,daily_rate_snapshot:Number(c?.daily_rate||0),standard_hours_snapshot:Number(c?.standard_hours||8)}));setMsg('Generazione di '+rows.length+' consuntivi in corso...',6000);render();const res=await insertManyResilient('timesheet_entries',rows);if(res.error)return setMsg(res.error.message,8000);await reload();state.month=r.days[0].slice(0,7);state.view='timesheet';setMsg(rows.length+' consuntivi Time & Material generati.',4500);render();}
function tmBatches(){const map={};(data.entries||[]).filter(isTM).forEach(e=>{const k=e.tm_batch_id||['nb',e.client_id,e.project_id||'',e.activity_id||'',e.hours,e.description||''].join('|');if(!map[k])map[k]={key:k,client_id:e.client_id,project_id:e.project_id,activity_id:e.activity_id,hours:Number(e.hours||0),desc:e.description,ids:[],dates:[],hoursSum:0};const b=map[k];b.ids.push(e.id);b.dates.push(String(e.entry_date));b.hoursSum+=Number(e.hours||0);});return Object.values(map).map(b=>{b.dates.sort();b.start=b.dates[0];b.end=b.dates[b.dates.length-1];b.days=b.ids.length;b.planned=b.dates.filter(d=>d>todayISO()).length;return b;}).sort((a,b)=>String(b.start).localeCompare(a.start));}
function tmManage(){const batches=tmBatches();return appShell(`<h1>Incarichi continuativi</h1><p class="sub">Un incarico genera in un colpo solo i consuntivi dei giorni lavorativi di un periodo. Da qui li crei, e puoi eliminare un intero periodo senza toccare i singoli giorni.</p>${batches.length?`<div class="list">${batches.map((b,i)=>`<div class="row"><div></div><div><div class="title">${esc(clientName(b.client_id))}${b.project_id?' / '+esc(projectName(b.project_id)):''}${b.planned?' <span class="tag blue">'+b.planned+' pianif.</span>':''}</div><div class="desc">${esc(activityName(b.activity_id)||'')}${b.desc?' · '+esc(b.desc):''}</div><div class="desc">Dal ${fmtDMY(b.start)} al ${fmtDMY(b.end)} · ${b.days} giorni · ${fmtNum(b.hoursSum,1)} h totali · ${fmtNum(b.hours,2)} h/giorno</div><button class="secondary danger" style="margin-top:10px" onclick="deleteTMBatch(${i})">Elimina intero periodo</button></div><div class="value"></div></div>`).join('')}</div>`:emptyState('Nessun incarico continuativo generato.','+ Crea un incarico continuativo',"go('tmForm')")}<div class="actions"><button class="primary" onclick="go('tmForm')">+ Nuovo incarico continuativo</button><button type="button" class="secondary" onclick="go('timesheet')">Torna al timesheet</button></div>`);}
async function deleteTMBatch(i){const b=tmBatches()[i];if(!b)return;if(!confirm('Eliminare l\'intero periodo Time & Material?\n'+b.days+' consuntivi dal '+fmtDMY(b.start)+' al '+fmtDMY(b.end)+'.'))return;const {error}=await sb.from('timesheet_entries').delete().in('id',b.ids);if(error)return setMsg(error.message,7000);await reload();setMsg(b.days+' consuntivi Time & Material eliminati.',4000);state.view='tmManage';render();}
function prefillDate(){const v=state.editType;return (typeof v==='string'&&v.length===10&&v.charAt(4)==='-')?v:new Date().toISOString().slice(0,10)}
function dailyForm(){const clients=dailyClients();const selected=clients[0]?.id||'';return appShell(`<h1>Consuntivo giornaliero</h1><p class="sub">Ore effettivamente lavorate, valorizzate secondo tariffa (tariffa oraria = tariffa giornaliera / 8h).</p>${clients.length?`<form class="form" onsubmit="saveDaily(event)"><div class="field"><label>Data</label><input name="entry_date" type="date" value="${prefillDate()}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(selected)}</select></div><div class="field"><label>Attività</label><select name="activity_id">${activityOptions()}</select></div><details class="moreFields"><summary>Altri dettagli (sede, luogo, descrizione)</summary><div class="field"><label>Sede</label><select name="work_site">${sediOptions()}</select></div><div class="field"><label>Luogo/Città</label><input name="work_city" placeholder="Es. Verona, Milano, Canicattì"></div><div class="field"><label>Descrizione</label><textarea name="description"></textarea></div></details><div class="field"><label>Ore consuntivate</label><input name="hours" type="number" step="0.25" value="8"></div><div class="field"><label>Note</label><textarea name="notes" placeholder="Note interne opzionali"></textarea></div><div class="actions"><button class="primary" data-busy="Salvataggio…">Salva</button><button type="button" class="secondary" onclick="go('home')">Annulla</button></div></form>`:`<div class="card">Crea prima un cliente con tariffa giornaliera in Configurazione.</div>`}`)}
async function saveDaily(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));if(!guardDay(f.entry_date))return;const c=clientById(f.client_id);const payload={entry_date:f.entry_date,client_id:f.client_id,project_id:f.project_id||null,activity_id:f.activity_id||null,work_location:[norm(f.work_site),norm(f.work_city)].filter(Boolean).join(' - ')||null,work_site:norm(f.work_site)||null,work_city:norm(f.work_city)||null,description:f.description||null,notes:f.notes||null,hours:Number(f.hours||0),daily_rate_snapshot:Number(c?.daily_rate||0),standard_hours_snapshot:Number(c?.standard_hours||8)};const {error}=await insertResilient('timesheet_entries',payload);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
function dailyEdit(){const e=data.entries.find(x=>x.id===state.edit);if(!e)return timesheet();const clients=dailyClients();return appShell(`<h1>Modifica consuntivo</h1><form class="form" onsubmit="saveDailyEdit(event)"><div class="field"><label>Data</label><input name="entry_date" type="date" value="${esc(e.entry_date)}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}" ${c.id===e.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(e.client_id,e.project_id||'')}</select></div><div class="field"><label>Attività</label><select name="activity_id">${activityOptions(e.activity_id||'')}</select></div><div class="field"><label>Sede</label><select name="work_site">${sediOptions(e.work_site||'')}</select></div><div class="field"><label>Luogo/Città</label><input name="work_city" value="${esc(e.work_city||'')}" placeholder="Es. Verona, Milano, Canicattì"></div><div class="field"><label>Descrizione</label><textarea name="description">${esc(e.description||'')}</textarea></div><div class="field"><label>Ore consuntivate</label><input name="hours" type="number" step="0.25" value="${Number(e.hours||0)}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(e.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary" onclick="duplicateDaily('${e.id}')">Duplica</button><button type="button" class="secondary danger" onclick="deleteDaily('${e.id}')">Elimina</button><button type="button" class="secondary" onclick="go('timesheet')">Annulla</button></div></form>`)}
async function saveDailyEdit(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));if(!guardDay(f.entry_date))return;const c=clientById(f.client_id);const payload={entry_date:f.entry_date,client_id:f.client_id,project_id:f.project_id||null,activity_id:f.activity_id||null,work_location:[norm(f.work_site),norm(f.work_city)].filter(Boolean).join(' - ')||null,work_site:norm(f.work_site)||null,work_city:norm(f.work_city)||null,description:f.description||null,notes:f.notes||null,hours:Number(f.hours||0),daily_rate_snapshot:Number(c?.daily_rate||0),standard_hours_snapshot:Number(c?.standard_hours||8)};const {error}=await updateResilient('timesheet_entries',payload,state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';state.edit=null;render()}
async function duplicateDaily(idv){const e=data.entries.find(x=>x.id===idv);if(!e)return;const copy={entry_date:new Date().toISOString().slice(0,10),client_id:e.client_id,project_id:e.project_id,activity_id:e.activity_id,work_location:e.work_location,work_site:e.work_site,work_city:e.work_city,description:e.description,notes:e.notes,hours:e.hours,daily_rate_snapshot:e.daily_rate_snapshot,standard_hours_snapshot:e.standard_hours_snapshot};const {error}=await insertResilient('timesheet_entries',copy);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
async function deleteDaily(idv){if(!confirm('Eliminare questo consuntivo?'))return;const {error}=await sb.from('timesheet_entries').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}

function monthlyForm(){const clients=monthlyClients();const selected=clients[0]?.id||'';return appShell(`<h1>Compenso mensile</h1>${clients.length?`<form class="form" onsubmit="saveMonthly(event)"><div class="field"><label>Mese</label><input name="month" type="month" value="${state.month}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(selected)}</select></div><div class="field"><label>Descrizione</label><textarea name="description"></textarea></div><div class="field"><label>Importo</label><input name="amount" type="number" step="0.01" value="0"></div><div class="field"><label>Note</label><textarea name="notes" placeholder="Note interne opzionali"></textarea></div><div class="actions"><button class="primary" data-busy="Salvataggio…">Salva</button><button type="button" class="secondary" onclick="go('home')">Annulla</button></div></form>`:`<div class="card">Crea prima un cliente una tantum mensile in Configurazione.</div>`}`)}
async function saveMonthly(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const [year,month]=String(f.month||state.month).split('-').map(Number);const payload={year,month,client_id:f.client_id,project_id:f.project_id||null,description:f.description||null,notes:f.notes||null,amount:Number(f.amount||0)};const {error}=await insertResilient('monthly_compensations',payload);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
function monthlyEdit(){const m=data.monthly.find(x=>x.id===state.edit);if(!m)return timesheet();const clients=monthlyClients();const mm=`${m.year}-${String(m.month).padStart(2,'0')}`;return appShell(`<h1>Modifica compenso mensile</h1><form class="form" onsubmit="saveMonthlyEdit(event)"><div class="field"><label>Mese</label><input name="month" type="month" value="${mm}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}" ${c.id===m.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(m.client_id,m.project_id||'')}</select></div><div class="field"><label>Descrizione</label><textarea name="description">${esc(m.description||'')}</textarea></div><div class="field"><label>Importo</label><input name="amount" type="number" step="0.01" value="${Number(m.amount||0)}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(m.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary" onclick="duplicateMonthly('${m.id}')">Duplica</button><button type="button" class="secondary danger" onclick="deleteMonthly('${m.id}')">Elimina</button><button type="button" class="secondary" onclick="go('timesheet')">Annulla</button></div></form>`)}
async function saveMonthlyEdit(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const [year,month]=String(f.month||state.month).split('-').map(Number);const payload={year,month,client_id:f.client_id,project_id:f.project_id||null,description:f.description||null,notes:f.notes||null,amount:Number(f.amount||0)};const {error}=await updateResilient('monthly_compensations',payload,state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';state.edit=null;render()}
async function duplicateMonthly(idv){const m=data.monthly.find(x=>x.id===idv);if(!m)return;const {year,month}=periodParts();const copy={year,month,client_id:m.client_id,project_id:m.project_id,description:m.description,notes:m.notes,amount:m.amount};const {error}=await insertResilient('monthly_compensations',copy);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
async function deleteMonthly(idv){if(!confirm('Eliminare questo compenso mensile?'))return;const {error}=await sb.from('monthly_compensations').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}

function manualForm(){const clients=activeClients();const selected=clients[0]?.id||'';return appShell(`<h1>Compenso una tantum</h1>${clients.length?`<form class="form" onsubmit="saveManual(event)"><div class="field"><label>Data</label><input name="entry_date" type="date" value="${prefillDate()}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(selected)}</select></div><div class="field"><label>Attività</label><select name="activity_id">${activityOptions()}</select></div><details class="moreFields"><summary>Altri dettagli (sede, luogo, descrizione)</summary><div class="field"><label>Sede</label><select name="work_site">${sediOptions()}</select></div><div class="field"><label>Luogo/Città</label><input name="work_city"></div><div class="field"><label>Descrizione</label><textarea name="description"></textarea></div></details><div class="field"><label>Importo manuale</label><input name="amount" type="number" step="0.01" value="0"></div><div class="field"><label>Note</label><textarea name="notes"></textarea></div><div class="actions"><button class="primary" data-busy="Salvataggio…">Salva</button><button type="button" class="secondary" onclick="go('home')">Annulla</button></div></form>`:`<div class="card">Crea prima un cliente in Configurazione.</div>`}`)}
async function saveManual(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));if(!guardDay(f.entry_date))return;const payload={entry_date:f.entry_date,client_id:f.client_id,project_id:f.project_id||null,activity_id:f.activity_id||null,work_site:norm(f.work_site)||null,work_city:norm(f.work_city)||null,description:f.description||null,amount:Number(f.amount||0),notes:f.notes||null};const {error}=await insertResilient('manual_entries',payload);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
function manualEdit(){const e=data.manualEntries.find(x=>x.id===state.edit);if(!e)return timesheet();const clients=activeClients();return appShell(`<h1>Modifica compenso una tantum</h1><form class="form" onsubmit="saveManualEdit(event)"><div class="field"><label>Data</label><input name="entry_date" type="date" value="${esc(e.entry_date)}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}" ${c.id===e.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(e.client_id,e.project_id||'')}</select></div><div class="field"><label>Attività</label><select name="activity_id">${activityOptions(e.activity_id||'')}</select></div><div class="field"><label>Sede</label><select name="work_site">${sediOptions(e.work_site||'')}</select></div><div class="field"><label>Luogo/Città</label><input name="work_city" value="${esc(e.work_city||'')}"></div><div class="field"><label>Descrizione</label><textarea name="description">${esc(e.description||'')}</textarea></div><div class="field"><label>Importo manuale</label><input name="amount" type="number" step="0.01" value="${Number(e.amount||0)}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(e.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary" onclick="duplicateManual('${e.id}')">Duplica</button><button type="button" class="secondary danger" onclick="deleteManual('${e.id}')">Elimina</button><button type="button" class="secondary" onclick="go('timesheet')">Annulla</button></div></form>`)}
async function saveManualEdit(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));if(!guardDay(f.entry_date))return;const payload={entry_date:f.entry_date,client_id:f.client_id,project_id:f.project_id||null,activity_id:f.activity_id||null,work_site:norm(f.work_site)||null,work_city:norm(f.work_city)||null,description:f.description||null,amount:Number(f.amount||0),notes:f.notes||null};const {error}=await updateResilient('manual_entries',payload,state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';state.edit=null;render()}
async function duplicateManual(idv){const e=data.manualEntries.find(x=>x.id===idv);if(!e)return;const copy={entry_date:new Date().toISOString().slice(0,10),client_id:e.client_id,project_id:e.project_id,activity_id:e.activity_id,work_site:e.work_site,work_city:e.work_city,description:e.description,amount:e.amount,notes:e.notes};const {error}=await insertResilient('manual_entries',copy);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
async function deleteManual(idv){if(!confirm('Eliminare questo consuntivo manuale?'))return;const {error}=await sb.from('manual_entries').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}

function reimbTypeOptions(selected){return REIMB_TYPES.map(([v,l])=>`<option value="${v}" ${v===selected?'selected':''}>${l}</option>`).join('')}
function parsePolicy(c){try{const p=c&&c.expense_policy;if(!p)return [];return Array.isArray(p)?p:JSON.parse(p)}catch(e){return []}}
function clientPolicyType(clientId,categoryId){const c=clientById(clientId);if(!c)return '';const pol=parsePolicy(c);const catName=(expenseCategoryById(categoryId)||{}).name;const hit=pol.find(r=>r.category_id===categoryId||(r.category&&catName&&String(r.category).toLowerCase()===String(catName).toLowerCase()));return hit?hit.type:''}
function expenseForm(){const clients=activeClients();const selected=clients[0]?.id||'';return appShell(`<h1>Nuova spesa</h1>${clients.length?`<form class="form" onsubmit="saveExpense(event)"><div class="field"><label>Data</label><input name="expense_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form);updateExpenseCalc(this.form,true)">${clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(selected)}</select></div><div class="field"><label>Voce spesa</label><select name="expense_category_id" onchange="updateExpenseCalc(this.form,true)">${expenseOptions()}</select></div><div class="field"><label>Tipo rimborso</label><select name="reimbursement_type">${reimbTypeOptions('own')}</select></div><div class="field"><label>Sede / Città</label><input name="work_city" placeholder="Es. Verona, Milano"></div><div class="field"><label>Descrizione</label><textarea name="description"></textarea></div><div class="field"><label>Quantità</label><input name="quantity" type="number" step="0.01" value="1" oninput="updateExpenseCalc(this.form)"></div><div class="field"><label>Costo unitario</label><input name="unit_rate" type="number" step="0.0001" value="0" oninput="updateExpenseCalc(this.form)"></div><div class="field"><label>Totale</label><input name="amount" type="number" step="0.01" value="0"></div><div class="field"><label>Note</label><textarea name="notes"></textarea></div><div class="actions"><button class="primary" data-busy="Salvataggio…">Salva</button><button type="button" class="secondary" onclick="go('expenses')">Annulla</button></div></form>`:`<div class="card">Crea prima un cliente in Impostazioni.</div>`}`)}
function updateExpenseCalc(form,proposeType){const cat=expenseCategoryById(form.expense_category_id?.value);if(!cat)return; if(proposeType&&form.reimbursement_type){const proposed=clientPolicyType(form.client_id?.value,cat.id)||(cat.reimbursable===false?'own':'invoice');if(proposed)form.reimbursement_type.value=proposed} if(cat.calculation_type==='quantity_rate'){if((!form.unit_rate.value||Number(form.unit_rate.value)===0)&&cat.default_unit_rate)form.unit_rate.value=Number(cat.default_unit_rate)} if(Number(form.unit_rate.value||0)>0)form.amount.value=(Number(form.quantity.value||0)*Number(form.unit_rate.value||0)).toFixed(2)}
async function saveExpense(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const rt=f.reimbursement_type||'own';const payload={expense_date:f.expense_date,client_id:f.client_id,project_id:f.project_id||null,expense_category_id:f.expense_category_id,work_city:norm(f.work_city)||null,description:f.description||null,quantity:Number(f.quantity||0)||null,unit_rate:Number(f.unit_rate||0)||null,amount:Number(f.amount||0),reimbursement_type:rt,reimbursable:rt!=='own',notes:f.notes||null};const {error}=await insertResilient('travel_expenses',payload,['reimbursement_type']);if(error)return setMsg(error.message,7000);await reload();state.view='expenses';render()}
function expenseEdit(){const e=data.travelExpenses.find(x=>x.id===state.edit);if(!e)return timesheet();const clients=activeClients();return appShell(`<h1>Modifica spesa</h1><form class="form" onsubmit="saveExpenseEdit(event)"><div class="field"><label>Data</label><input name="expense_date" type="date" value="${esc(e.expense_date)}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}" ${c.id===e.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(e.client_id,e.project_id||'')}</select></div><div class="field"><label>Voce spesa</label><select name="expense_category_id" onchange="updateExpenseCalc(this.form)">${expenseOptions(e.expense_category_id||'')}</select></div><div class="field"><label>Tipo rimborso</label><select name="reimbursement_type">${reimbTypeOptions(expType(e))}</select></div><div class="field"><label>Sede / Città</label><input name="work_city" value="${esc(e.work_city||'')}"></div><div class="field"><label>Descrizione</label><textarea name="description">${esc(e.description||'')}</textarea></div><div class="field"><label>Quantità</label><input name="quantity" type="number" step="0.01" value="${Number(e.quantity||0)}" oninput="updateExpenseCalc(this.form)"></div><div class="field"><label>Costo unitario</label><input name="unit_rate" type="number" step="0.0001" value="${Number(e.unit_rate||0)}" oninput="updateExpenseCalc(this.form)"></div><div class="field"><label>Totale</label><input name="amount" type="number" step="0.01" value="${Number(e.amount||0)}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(e.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary" onclick="duplicateExpense('${e.id}')">Duplica</button><button type="button" class="secondary danger" onclick="deleteExpense('${e.id}')">Elimina</button><button type="button" class="secondary" onclick="go('expenses')">Annulla</button></div></form>`)}
async function saveExpenseEdit(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const rt=f.reimbursement_type||'own';const payload={expense_date:f.expense_date,client_id:f.client_id,project_id:f.project_id||null,expense_category_id:f.expense_category_id,work_city:norm(f.work_city)||null,description:f.description||null,quantity:Number(f.quantity||0)||null,unit_rate:Number(f.unit_rate||0)||null,amount:Number(f.amount||0),reimbursement_type:rt,reimbursable:rt!=='own',notes:f.notes||null};const {error}=await updateResilient('travel_expenses',payload,state.edit,['reimbursement_type']);if(error)return setMsg(error.message,7000);await reload();state.view='expenses';state.edit=null;render()}
async function duplicateExpense(idv){const e=data.travelExpenses.find(x=>x.id===idv);if(!e)return;const copy={expense_date:new Date().toISOString().slice(0,10),client_id:e.client_id,project_id:e.project_id,expense_category_id:e.expense_category_id,work_site:e.work_site,work_city:e.work_city,description:e.description,quantity:e.quantity,unit_rate:e.unit_rate,amount:e.amount,reimbursement_type:expType(e),reimbursable:expType(e)!=='own',notes:e.notes};const {error}=await insertResilient('travel_expenses',copy,['reimbursement_type']);if(error)return setMsg(error.message,7000);await reload();state.view='expenses';render()}
async function deleteExpense(idv){if(!confirm('Eliminare questa spesa di trasferta?'))return;const {error}=await sb.from('travel_expenses').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}

function focusForm(){const f=document.querySelector('.app form.form');if(!f)return;const el=f.querySelector('input,select,textarea');if(!el)return;el.scrollIntoView({block:'center',behavior:'smooth'});setTimeout(()=>el.focus({preventScroll:true}),260)}
function emptyState(text,ctaLabel,ctaAction){return `<div class="empty">${text}<button type="button" class="secondary emptyCta" onclick="${ctaAction}">${ctaLabel}</button></div>`}
function emptyForm(text){return emptyState(text,'\u2191 Vai al modulo','focusForm()')}
function editEntry(id,type){navigateTo(type==='monthly'?'monthlyEdit':type==='manual'?'manualEdit':type==='expense'?'expenseEdit':'dailyEdit',{edit:id})}
function fmtDMY(s){const p=String(s||'').split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(s||'');}
function monthWorkbookXml(){
  const [year,mo]=String(state.month).split('-').map(Number);
  const days=new Date(year,mo,0).getDate();
  const rows=rowsForMonth().slice().sort((a,b)=>String(a.entry_date).localeCompare(String(b.entry_date)));
  const prof=(data.profiles||[])[0]||{};
  const uname=[prof.first_name,prof.last_name].filter(Boolean).join(' ')||prof.company_name||'Consulente';
  const monLabel=monthLabel(state.month);
  const palette=['#DDEBF7','#E2EFDA','#FFF2CC','#FCE4D6','#EDEDED','#EAD1DC','#D9E1F2','#FFE699'];
  const pv={},order=[],dayTot=new Array(days+1).fill(0);let grand=0;const clientColor={};let ci=0;
  rows.forEach(e=>{const cName=clientName(e.client_id);const key=cName+' - '+(projectName(e.project_id)||'—')+' - '+(activityName(e.activity_id)||'—');if(!pv[key]){pv[key]={d:new Array(days+1).fill(0),tot:0,client:cName};order.push(key);}if(!(cName in clientColor)){clientColor[cName]=ci%palette.length;ci++;}const d=Number(String(e.entry_date).slice(8,10));const h=Number(e.hours||0);pv[key].d[d]+=h;pv[key].tot+=h;if(d>=1&&d<=days)dayTot[d]+=h;grand+=h;});
  const B='<Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous"/><Border ss:Position="Top" ss:LineStyle="Continuous"/><Border ss:Position="Left" ss:LineStyle="Continuous"/><Border ss:Position="Right" ss:LineStyle="Continuous"/></Borders>';
  const styles='<Style ss:ID="t"><Font ss:Bold="1" ss:Size="13"/></Style>'
    +'<Style ss:ID="nm"><Font ss:Bold="1" ss:Italic="1"/></Style>'
    +'<Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#FFC000" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/>'+B+'</Style>'
    +'<Style ss:ID="hl"><Font ss:Bold="1"/><Interior ss:Color="#FFC000" ss:Pattern="Solid"/>'+B+'</Style>'
    +'<Style ss:ID="n"><Alignment ss:Horizontal="Center"/>'+B+'</Style>'
    +'<Style ss:ID="e">'+B+'</Style>'
    +'<Style ss:ID="num2"><NumberFormat ss:Format="#,##0.00"/>'+B+'</Style>'
    +'<Style ss:ID="tt"><Font ss:Bold="1"/><Interior ss:Color="#F2F2F2" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/>'+B+'</Style>'
    +'<Style ss:ID="tot"><Font ss:Bold="1"/><Interior ss:Color="#D9D9D9" ss:Pattern="Solid"/>'+B+'</Style>'
    +'<Style ss:ID="totn"><Font ss:Bold="1"/><Interior ss:Color="#D9D9D9" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/>'+B+'</Style>'
    +palette.map((c,i)=>'<Style ss:ID="lbl'+i+'"><Font ss:Bold="1"/><Interior ss:Color="'+c+'" ss:Pattern="Solid"/>'+B+'</Style>').join('');
  const cS=(v,st)=>'<Cell ss:StyleID="'+st+'"><Data ss:Type="String">'+esc(v)+'</Data></Cell>';
  const cN=(v,st)=>'<Cell ss:StyleID="'+st+'"><Data ss:Type="Number">'+Number(v||0)+'</Data></Cell>';
  const cE=st=>'<Cell ss:StyleID="'+st+'"/>';
  let dayHdr='';for(let d=1;d<=days;d++)dayHdr+=cN(d,'h');
  let pivotRows='';
  order.forEach(key=>{const r=pv[key];let cells=cS(key,'lbl'+clientColor[r.client]);for(let d=1;d<=days;d++){cells+=r.d[d]>0?cN(r.d[d],'n'):cE('e');}cells+=cN(r.tot,'tt');pivotRows+='<Row>'+cells+'</Row>';});
  let totCells=cS('Totale','tot');for(let d=1;d<=days;d++){totCells+=dayTot[d]>0?cN(dayTot[d],'totn'):cE('tot');}totCells+=cN(grand,'totn');
  let cols='<Column ss:Width="210"/>';for(let d=1;d<=days;d++)cols+='<Column ss:Width="24"/>';cols+='<Column ss:Width="54"/>';
  const pivotSheet='<Worksheet ss:Name="Pivot mese"><Table>'+cols
    +'<Row><Cell ss:StyleID="t"><Data ss:Type="String">Attività mese di: '+esc(monLabel)+'</Data></Cell></Row>'
    +'<Row><Cell ss:StyleID="nm"><Data ss:Type="String">'+esc(uname)+'</Data></Cell></Row>'
    +'<Row>'+cS('Data','hl')+dayHdr+cS('Tot.Ore','h')+'</Row>'
    +pivotRows+'<Row>'+totCells+'</Row></Table></Worksheet>';
  let detRows='';let oreTot=0;
  rows.forEach(e=>{const ore=Number(e.hours||0);oreTot+=ore;const sede=e.work_location||[e.work_site,e.work_city].filter(Boolean).join(' - ')||'';detRows+='<Row>'+cS(fmtDMY(e.entry_date),'e')+cS(clientName(e.client_id),'e')+cS(projectName(e.project_id)||'','e')+cS(activityName(e.activity_id)||'','e')+cS(sede,'e')+cS(e.description||'','e')+cN(ore,'n')+'</Row>';});
  const detHdr='<Row>'+cS('Data','hl')+cS('Cliente','hl')+cS('Progetto','hl')+cS('Attività','hl')+cS('Sede','hl')+cS('Descrizione','hl')+cS('Ore','h')+'</Row>';
  const detTot='<Row>'+cS('Totale','tot')+cE('tot')+cE('tot')+cE('tot')+cE('tot')+cE('tot')+cN(oreTot,'totn')+'</Row>';
  const detCols='<Column ss:Width="70"/><Column ss:Width="110"/><Column ss:Width="140"/><Column ss:Width="120"/><Column ss:Width="120"/><Column ss:Width="220"/><Column ss:Width="50"/>';
  const detailSheet='<Worksheet ss:Name="Dettaglio"><Table>'+detCols+detHdr+detRows+detTot+'</Table></Worksheet>';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles>'+styles+'</Styles>'+detailSheet+pivotSheet+'</Workbook>';
}
function monthExcelBlob(){return new Blob([monthWorkbookXml()],{type:'application/vnd.ms-excel'});}
function monthExcelFilename(){return 'TOTIME_consuntivi_'+state.month+'.xls';}
function downloadMonthExcel(){const url=URL.createObjectURL(monthExcelBlob());const a=document.createElement('a');a.href=url;a.download=monthExcelFilename();document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);setMsg('Excel dei consuntivi di '+monthLabel(state.month)+' generato.',3500);}
async function shareMonthExcel(){const file=new File([monthExcelBlob()],monthExcelFilename(),{type:'application/vnd.ms-excel'});try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'Consuntivi '+monthLabel(state.month),text:'Consuntivi '+monthLabel(state.month)});return;}}catch(err){if(err&&err.name==='AbortError')return;}downloadMonthExcel();}
function timesheetRows(){return rowsForMonth().map(e=>({...e,kind:'daily',date:e.entry_date})).concat(monthlyRows().map(m=>({...m,kind:'monthly',date:`${m.year}-${String(m.month).padStart(2,'0')}-01`}))).concat(manualRows().map(e=>({...e,kind:'manual',date:e.entry_date}))).concat(expenseRows().map(e=>({...e,kind:'expense',date:e.expense_date}))).sort((a,b)=>String(b.date).localeCompare(String(a.date)))}
function timesheet(){const rows=timesheetRows();const t=totals();const groups=groupSummary();return appShell(`<h1>Timesheet</h1>${monthSelector()}<div class="card"><b>Riepilogo ${monthLabel(state.month)}</b><div class="kpiGrid" style="margin-top:14px"><div><span>Ore consuntivate</span><strong>${fmtNum(t.hours,1)} h</strong><small>${fmtNum(t.days,2)} gg/u</small></div><div><span>Importo mese</span><strong>${fmtEUR(t.amount)}</strong><small>consuntivato</small></div></div>${t.plannedAmount>0?`<div class="metricLine" style="margin-top:10px"><span class="tag blue">Pianificato</span> ${fmtNum(t.plannedHours,1)} h · ${fmtNum(t.plannedDays,2)} gg/u · ${fmtEUR(t.plannedAmount)}</div>`:''}<div class="chartWrap"><div class="chartTitle"><span>Andamento mese</span><span>1 → fine mese</span></div>${monthChartSvg()}</div></div><div class="miniActions"><button type="button" class="miniBtn" onclick="go('griglia')" title="Compila tutto il mese in una griglia">Mensile</button><button type="button" class="miniBtn" onclick="go('pivot')" title="Analizza i consuntivi per cliente, progetto, attività">Analisi</button><button type="button" class="miniBtn" onclick="downloadMonthExcel()" title="Scarica l'Excel del mese">⤓ Excel</button><button type="button" class="miniBtn" onclick="shareMonthExcel()" title="Condividi o invia i consuntivi">↗ Condividi</button></div>${groups.length?`<div class="card"><b>Per cliente</b><div class="list" style="box-shadow:none;margin:10px 0 0">${groups.map(r=>`<div class="row"><div></div><div><div class="title">${esc(clientName(r.client_id))}</div><div class="desc">${esc(projectName(r.project_id)||'Senza progetto')} · ${esc(r.label)}</div></div><div class="value">${fmtEUR(r.amount)}</div></div>`).join('')}</div></div>`:''}<button class="primary" onclick="newEntryChoice()">+ Nuovo consuntivo</button>${selBar('timesheet',rows.length)}<div class="list">${rows.map(r=>timesheetRow(r)).join('')||'<div class="empty">Nessun consuntivo in questo mese.<button type="button" class="secondary emptyCta" onclick="newEntryChoice()">+ Aggiungi il primo consuntivo</button></div>'}</div>`)}
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
   Una riga per commessa (cliente · progetto · attività), una colonna per
   giorno. Ogni cella è una voce di timesheet_entries: lo schema non cambia,
   cambia solo il modo di compilarlo. */
function daysInMonth(ymStr){const [y,m]=String(ymStr).split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate()}
function isoOf(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function gridKey(e){return [e.client_id||'',e.project_id||'',e.activity_id||''].join('|')}
function gridRows(){
  const map=new Map();
  rowsForMonth().filter(e=>!isPlanned(e)).forEach(e=>{
    const k=gridKey(e);
    if(!map.has(k))map.set(k,{k,client_id:e.client_id,project_id:e.project_id,activity_id:e.activity_id,hours:{},items:{}});
    const r=map.get(k),d=String(e.entry_date);
    r.hours[d]=(r.hours[d]||0)+Number(e.hours||0);
    (r.items[d]=r.items[d]||[]).push(e);
  });
  (state.gridNew||[]).forEach(r=>{if(!map.has(r.k))map.set(r.k,{...r,hours:{},items:{}})});
  return [...map.values()].sort((a,b)=>
    (clientName(a.client_id)||'').localeCompare(clientName(b.client_id)||'','it')||
    (projectName(a.project_id)||'').localeCompare(projectName(b.project_id)||'','it'));
}
function gridPlannedByDay(){const o={};rowsForMonth().filter(isPlanned).forEach(e=>{const d=String(e.entry_date);o[d]=(o[d]||0)+Number(e.hours||0)});return o}
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
  const days=gridDays(),rows=gridRows(),planned=gridPlannedByDay();
  const wd=['dom','lun','mar','mer','gio','ven','sab'];
  const rowTot=r=>Object.values(r.hours).reduce((t,v)=>t+Number(v||0),0);
  const total=rows.reduce((t,r)=>t+rowTot(r),0);
  const plannedTot=Object.values(planned).reduce((t,v)=>t+Number(v||0),0);

  const scope=gridScope();
  const weeks=gridWeeks(days);
  const wi=gridWeekIndex(weeks);
  const inWeek=new Set((weeks[wi]||[]).map(d=>d.iso));
  const wk=x=>inWeek.has(x.iso)?' wk':'';
  const cells=r=>days.map(x=>{
    const items=r.items[x.iso]||[],v=Number(r.hours[x.iso]||0),locked=items.length>1;
    const cls=['gg',...gridDayClass(x)];if(v>0)cls.push('pieno');if(locked)cls.push('bloccata');if(inWeek.has(x.iso))cls.push('wk');
    const why=gridDayWhy(x);
    const who=`${esc(clientName(r.client_id)||'senza cliente')} giorno ${x.d}`;
    if(locked)return `<td class="${cls.join(' ')}" title="${esc(items.length+' voci in questo giorno: apri il giorno per modificarle')}"><button type="button" class="gCell" onclick="openDay('${x.iso}')" aria-label="${who}, ${items.length} voci">${gridNum(v)}</button></td>`;
    return `<td class="${cls.join(' ')}"${why?` title="${esc(why)}"`:''}><input inputmode="decimal" data-row="${esc(r.k)}" data-day="${x.iso}" value="${v>0?esc(String(v)):''}" aria-label="${who}${why?', '+esc(why):''}"></td>`;
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

  const plannedRow=plannedTot>0?`<tr class="planRow">
      <td class="riga"><div class="n">Pianificato</div><div class="d">Incarichi continuativi sui giorni futuri · non modificabile qui</div></td>
      ${days.map(x=>`<td class="gg ${gridDayClass(x).join(' ')}${wk(x)}"><span class="pl">${planned[x.iso]?gridNum(planned[x.iso]):''}</span></td>`).join('')}
      <td class="tot">${gridNum(plannedTot)}</td></tr>`:'';

  const body=rows.length
    ? rows.map(r=>`<tr>
        <td class="riga"><div class="n">${esc(clientName(r.client_id)||'Senza cliente')}</div>
          <div class="d">${esc(projectName(r.project_id)||'Senza progetto')}${r.activity_id?' · '+esc(activityName(r.activity_id)||''):''}</div></td>
        ${cells(r)}<td class="tot">${gridNum(rowTot(r))}</td></tr>`).join('')
    : ((plannedRow||assRow)?'':`<tr><td class="riga vuota" colspan="${days.length+2}">Nessuna commessa in questo mese. Aggiungine una qui sotto.</td></tr>`);

  const opts=(list,empty)=>`<option value="">${empty}</option>`+list.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');

  return appShell(`<h1>Consuntivo mensile</h1>
    <p class="sub">Una riga per commessa, una colonna per giorno. Si compila con la tastiera — Tab per il giorno dopo — e si salva una volta sola.</p>
    ${monthSelector()}
    <div class="card grigliaCard" data-scope="${scope}">
      <div class="barra">
        <button type="button" class="miniBtn" onclick="go('timesheet')">☰ Passa all'elenco</button>
        <button type="button" class="primary" onclick="saveGrid()"${state.busy?' disabled':''}>${state.busy?'Salvataggio…':'Salva le modifiche'}</button>
      </div>
      <div class="scopeNav"><span class="scopeLbl">Vista</span><div class="tabs"><button type="button" class="${scope==='week'?'active':''}" onclick="setGridScope('week')">Settimana</button><button type="button" class="${scope==='month'?'active':''}" onclick="setGridScope('month')">Mese intero</button></div></div>
      <div class="settimanaNav"><button type="button" onclick="gridWeekShift(-1)"${wi===0?' disabled':''} aria-label="Settimana precedente">‹</button><strong>${wi+1}ª settimana<span>${gridWeekLabel(weeks[wi])} ${esc(monthLabel(state.month).split(' ')[0].toLowerCase())}</span></strong><button type="button" onclick="gridWeekShift(1)"${wi>=weeks.length-1?' disabled':''} aria-label="Settimana successiva">›</button></div>
      <div class="scrollGriglia"><table class="griglia">
        <thead><tr><th class="riga">Commessa</th>${head}<th class="tot"><span class="totMese">Mese</span><span class="totTot">Tot</span></th></tr></thead>
        <tbody>${body}${assRow}${plannedRow}</tbody>
        <tfoot><tr><td class="riga">Totale giornata</td>${foot}<td class="tot">${gridNum(total+assTot)}</td></tr></tfoot>
      </table></div>
      <div class="nuovaRiga">
        <select id="g-cliente" onchange="gridFillProjects()" aria-label="Cliente">${opts(activeClients(),'— cliente —')}</select>
        <select id="g-progetto" aria-label="Progetto"><option value="">— prima scegli il cliente —</option></select>
        <select id="g-attivita" aria-label="Attività">${opts(sortEntities('activities',data.activities.filter(a=>a.active)),'— attività —')}</select>
        <button type="button" class="miniBtn" onclick="addGridRow()">+ Aggiungi riga</button>
      </div>
      <div class="calLegend" style="padding:10px 14px">
        <span><i class="sw we"></i>Weekend</span><span><i class="sw holiday"></i>Festivo</span>
        <span><i class="sw ferie"></i>Giorno off</span><span><i class="sw worked"></i>Oggi</span>
      </div>
    </div>
    <div class="metricLine" style="margin-top:12px">${gridNum(total)} h consuntivate <span class="dot">·</span> ${fmtDays(total)} gg/u${assTot>0?` <span class="dot">·</span> <span class="tag ferieTag">Assenze ${gridNum(assTot)} h</span>`:''}${plannedTot>0?` <span class="dot">·</span> <span class="tag blue">Pianificato ${gridNum(plannedTot)} h</span>`:''}</div>`);
}
function gridFillProjects(){const c=document.getElementById('g-cliente')?.value||'';const p=document.getElementById('g-progetto');if(p)p.innerHTML=`<option value="">— progetto —</option>`+sortEntities('projects',data.projects.filter(x=>x.active&&x.client_id===c)).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}
function addGridRow(){
  const c=document.getElementById('g-cliente')?.value||'';
  const p=document.getElementById('g-progetto')?.value||'';
  const a=document.getElementById('g-attivita')?.value||'';
  if(!c)return setMsg('Scegli almeno il cliente.',5000);
  const k=[c,p,a].join('|');
  state.gridNew=state.gridNew||[];
  if(gridRows().some(r=>r.k===k))return setMsg('Questa commessa è già nella griglia.',5000);
  state.gridNew.push({k,client_id:c,project_id:p||null,activity_id:a||null});
  render();
}
function gridConfirmRed(dates){
  if(!dates.length)return true;
  const lines=dates.sort().map(iso=>{const w=gridDayWhy({iso,holiday:holidayName(iso),we:isWeekendISO(iso),off:isFerie(iso)});return fmtDMY(iso)+(w?' — '+w:'')});
  return confirm('Stai registrando ore in giorni non lavorativi:\n\n'+lines.join('\n')+'\n\nVuoi procedere?');
}
async function saveGrid(){
  const rows=new Map(gridRows().map(r=>[r.k,r]));
  const toCreate=[],toUpdate=[],toDelete=[];
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
      toCreate.push({entry_date:iso,client_id:r.client_id,project_id:r.project_id||null,activity_id:r.activity_id||null,hours:after,daily_rate_snapshot:Number(c?.daily_rate||0),standard_hours_snapshot:Number(c?.standard_hours||8)});}
    else toUpdate.push({id:items[0].id,iso,patch:{hours:after}});
  }
  const n=toCreate.length+toUpdate.length+toDelete.length;
  if(!n){const pruned=(state.gridNew||[]).length;state.gridNew=[];return setMsg(pruned?'Non c\'era niente da salvare. Tolte '+(pruned===1?'la riga aggiunta e mai compilata.':pruned+' righe aggiunte e mai compilate.'):'Non c\'è niente da salvare.',4000)||render();}
  const red=[...new Set(toCreate.map(e=>e.entry_date).concat(toUpdate.map(u=>u.iso)))]
    .filter(iso=>holidayName(iso)||isFerie(iso)||isWeekendISO(iso));
  if(!gridConfirmRed(red))return;
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
  if(!confirm(n===1?'Eliminare la voce selezionata?\n\nL\'operazione non \u00e8 reversibile.':'Eliminare le '+n+' voci selezionate?\n\nL\'operazione non \u00e8 reversibile.'))return;
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
function timesheetRow(r){if(r.kind==='daily')return `<div ${rowAttrs('daily',r.id)}><div class="date">${selBox('daily',r.id)}${dateIT(r.entry_date)}</div><div><div class="title">${esc(clientName(r.client_id))}${projectName(r.project_id)?' / '+esc(projectName(r.project_id)):''}${isTM(r)?' <span class="tag green">T&amp;M</span>':''}${isPlanned(r)?' <span class="tag blue">Pianificato</span>':''}</div><div class="desc">${activityTag(r.activity_id)} ${r.work_site||r.work_city?'· '+esc([r.work_site,r.work_city].filter(Boolean).join(' - ')):''}</div><div class="desc">${esc(r.description||'')}</div>${r.notes?`<div class="desc">Note: ${esc(r.notes)}</div>`:''}</div><div class="value">${fmtNum(r.hours,1)} h</div></div>`;
if(r.kind==='monthly')return `<div ${rowAttrs('monthly',r.id)}><div class="date">${selBox('monthly',r.id)}${String(r.month).padStart(2,'0')}/${r.year}</div><div><div class="title">${esc(clientName(r.client_id))}${projectName(r.project_id)?' / '+esc(projectName(r.project_id)):''}</div><div class="desc">Una tantum mensile</div><div class="desc">${esc(r.description||'')}</div></div><div class="value">Mensile</div></div>`;
if(r.kind==='manual')return `<div ${rowAttrs('manual',r.id)}><div class="date">${selBox('manual',r.id)}${dateIT(r.entry_date)}</div><div><div class="title">${esc(clientName(r.client_id))}${projectName(r.project_id)?' / '+esc(projectName(r.project_id)):''}</div><div class="desc">Forfettario ${activityTag(r.activity_id)} ${r.work_site||r.work_city?'· '+esc([r.work_site,r.work_city].filter(Boolean).join(' - ')):''}</div><div class="desc">${esc(r.description||'')}</div></div><div class="value">Manuale</div></div>`;
return `<div ${rowAttrs('expense',r.id)}><div class="date">${selBox('expense',r.id)}${dateIT(r.expense_date)}</div><div><div class="title">${esc(clientName(r.client_id))}${projectName(r.project_id)?' / '+esc(projectName(r.project_id)):''}</div><div class="desc">Spesa · ${esc(expenseCategoryName(r.expense_category_id))} ${r.work_site||r.work_city?'· '+esc([r.work_site,r.work_city].filter(Boolean).join(' - ')):''}</div><div class="desc">${esc(r.description||'')}</div></div><div class="value">Spesa</div></div>`}

function annualSummaryCard(){const y=currentYear();const at=annualTotals(y);return `<div class="card cardLink" onclick="openAnnualMonths()" role="button" title="Dettaglio consuntivato mese per mese"><b>Annuale ${y} <span class="cardLinkArrow">›</span></b><div class="kpiGrid three" style="margin-top:14px"><div><span>Consuntivato</span><strong>${fmtEUR(at.consuntivato)}</strong></div><div><span>Fatturato</span><strong>${fmtEUR(at.fatturato)}</strong></div><div><span>Incassato</span><strong>${fmtEUR(at.incassato)}</strong></div></div><div class="metricLine" style="margin-top:12px">Da incassare <span class="dot">·</span> ${fmtEUR(at.daIncassare)}</div></div>`}
function summary(){const groups=groupSummary();const t=totals();return appShell(`<h1>Riepilogo</h1><h2>Mese</h2>${monthSelector()}<div class="card"><b>Totale mese</b><div class="metricLine">${metricLine(t.hours,t.amount)}</div><div class="chartWrap"><div class="chartTitle"><span>Andamento mese</span><span>1 → fine mese</span></div>${monthChartSvg()}</div></div><div class="list">${groups.map(r=>`<div class="row summaryRow"><div></div><div><div class="title">${esc(clientName(r.client_id))}</div><div class="desc">${esc(projectName(r.project_id)||'Senza progetto')} · ${esc(r.label)}</div><div class="metricLine">${r.type==='daily_rate_8h'?metricLine(r.hours,r.amount):amountLine(r.label,r.amount)}</div></div><div class="value"></div></div>`).join('')||emptyState('Nessun riepilogo in questo mese.','+ Registra un consuntivo','newEntryChoice()')}</div><h2>Anno</h2>${annualSummaryCard()}`)}
function billingGroupsByClient(){const lines=groupSummary();const by={};lines.forEach(l=>{if(!by[l.client_id])by[l.client_id]={client_id:l.client_id,lines:[],baseTotal:0,total:0,hours:0};by[l.client_id].lines.push(l);by[l.client_id].baseTotal+=Number(l.amount||0);by[l.client_id].hours+=Number(l.hours||0)});Object.values(by).forEach(g=>{const header=headerForClient(g.client_id)||{};g.calc=billingCalc(g,header);g.total=g.calc.total});return Object.values(by).sort((a,b)=>clientName(a.client_id).localeCompare(clientName(b.client_id)))}
function billingMonthlyView(){const {year,month}=periodParts();const md=annualMonthData(year);const m=md[month-1]||{};const fat=m.fatturato||0;const inc=m.incassato||0;const daInc=Math.max(0,fat-inc);const daFat=Math.max(0,(m.consuntivato||0)-(m.fatturatoBase||0));return `<div class="card"><b>Vista mensile · ${monthLabel(state.month)}</b><div class="kpiGrid" style="margin-top:14px"><div><span>Fatturato mese</span><strong>${fmtEUR(fat)}</strong></div><div><span>Incassato mese</span><strong>${fmtEUR(inc)}</strong></div></div><div class="metricLine" style="margin-top:12px">Da fatturare ${fmtEUR(daFat)} <span class="dot">·</span> Da incassare ${fmtEUR(daInc)}</div></div>`}
function billingAnnualView(){const year=currentYear();const at=annualTotals(year);return `<div class="card"><b>Vista annuale · ${year}</b><div class="kpiGrid" style="margin-top:14px"><div><span>Fatturato anno</span><strong>${fmtEUR(at.fatturato)}</strong></div><div><span>Incassato anno</span><strong>${fmtEUR(at.incassato)}</strong></div></div><div class="metricLine" style="margin-top:12px">Da fatturare ${fmtEUR(at.daFatturare)} <span class="dot">·</span> Da incassare ${fmtEUR(at.daIncassare)}</div><div class="grid" style="margin-top:12px"><button class="secondary" onclick="openAnnualInvoices('issued')">Fatture emesse ›</button><button class="secondary" onclick="openAnnualInvoices('collected')">Incassi ›</button></div></div>`}
function billing(){const groups=billingGroupsByClient();const total=groups.reduce((s,g)=>s+g.total,0);return appShell(`<h1>Fatturazione e incassi</h1>${monthSelector()}<div class="card"><b>Totale fatturazione mese</b><div class="amount" style="margin-top:8px">${fmtEUR(total)}</div><div class="sub">Include eventuale rivalsa INPS 4% e marca da bollo se attive.</div></div><div class="list">${groups.map(g=>{const st=headerStatus(g.client_id);return `<div class="row" onclick="openBillingClient('${g.client_id}')"><div></div><div><div class="title">${esc(clientName(g.client_id))}</div><div class="metricLine">${metricLine(g.hours,g.total)}</div><div class="desc">Base ${fmtEUR(g.calc.subtotal)} · Rivalsa ${fmtEUR(g.calc.inpsAmount)} · Bollo ${fmtEUR(g.calc.stampAmount)}</div><span class="tag ${statusClass(st)}">${statusLabel(st)}</span></div><div class="value">›</div></div>`}).join('')||emptyState('Nessuna riga fatturabile in questo mese.','+ Registra un consuntivo','newEntryChoice()')}</div><h2>Riepilogo</h2>${previsioneRicaviCard()}${billingMonthlyView()}${billingAnnualView()}${forfettarioBarCard()}`)}
function openBillingClient(clientId){navigateTo('billingDetail',{edit:clientId})}
function expenseFiscoText(e){const proj=projectName(e.project_id)||clientName(e.client_id)||'';const cat=expenseCategoryName(e.expense_category_id);const extra=[e.description,e.work_city].filter(Boolean).join(' · ');return `Rimborso spese di trasferta - ${monthLabel(state.month)} - ${proj} - ${cat}${extra?' ('+extra+')':''}`}
function billingDetailView(){const clientId=state.edit;const group=billingGroupsByClient().find(g=>g.client_id===clientId);if(!group)return billing();const header=headerForClient(clientId)||{};const st=header.status||'to_invoice';const calc=billingCalc(group,header);const items=[];group.lines.forEach(l=>{if(l.type==='travel_expenses'){(l.items||[]).forEach(e=>items.push({title:expenseCategoryName(e.expense_category_id),desc:'Rimborso in fattura'+(e.work_city?' · '+e.work_city:''),metric:amountLine(expenseCategoryName(e.expense_category_id),Number(e.amount||0)),fisco:expenseFiscoText(e)}))}else{items.push({title:projectName(l.project_id)||'Senza progetto',desc:l.label,metric:l.type==='daily_rate_8h'?metricLine(l.hours,l.amount):amountLine(l.label,l.amount),fisco:fiscoText(l)})}});const inpsText=renderTemplate(invoiceTemplateByCode('RIVALSA_INPS_4'),{type:'manual_entry',client_id:clientId,project_id:null,amount:calc.inpsAmount,hours:0});const bolloText=renderTemplate(invoiceTemplateByCode('MARCA_BOLLO'),{type:'manual_entry',client_id:clientId,project_id:null,amount:calc.stampAmount,hours:0});return appShell(`<h1>${esc(clientName(clientId))}</h1><p class="sub">Fattura ${monthLabel(state.month)}</p><div class="card"><b>Totale cliente</b><div class="amount" style="margin-top:8px">${fmtEUR(calc.total)}</div><div class="metricLine">Base ${fmtEUR(calc.subtotal)} <span class="dot">·</span> Rivalsa ${fmtEUR(calc.inpsAmount)} <span class="dot">·</span> Bollo ${fmtEUR(calc.stampAmount)}</div><span class="tag ${statusClass(st)}">${statusLabel(st)}</span></div><h2>Righe Fiscozen</h2><div class="list">${items.map((it,i)=>`<div class="row"><div>${i+1}</div><div><div class="title">${esc(it.title)}</div><div class="desc">${esc(it.desc)}</div><div class="metricLine">${it.metric}</div><div class="copybox" id="copy-${i}">${esc(it.fisco)}</div><button class="secondary" onclick="copyText('${esc(it.fisco).replace(/'/g,'&#39;')}')">Copia descrizione</button></div><div></div></div>`).join('')}${calc.inpsEnabled&&calc.inpsAmount>0?`<div class="row"><div>+</div><div><div class="title">Rivalsa INPS ${fmtNum(calc.inpsRate,2)}%</div><div class="metricLine">${fmtEUR(calc.inpsAmount)}</div><div class="copybox">${esc(inpsText)}</div><button class="secondary" onclick="copyText('${esc(inpsText).replace(/'/g,'&#39;')}')">Copia descrizione</button></div><div></div></div>`:''}${calc.stampEnabled&&calc.stampAmount>0?`<div class="row"><div>+</div><div><div class="title">Marca da bollo</div><div class="metricLine">${fmtEUR(calc.stampAmount)}</div><div class="copybox">${esc(bolloText)}</div><button class="secondary" onclick="copyText('${esc(bolloText).replace(/'/g,'&#39;')}')">Copia descrizione</button></div><div></div></div>`:''}</div><h2>Dati fattura / incasso</h2><form class="form" onsubmit="saveBillingHeader(event)"><div class="field"><label>Stato</label><select name="status"><option value="to_invoice" ${st==='to_invoice'?'selected':''}>Da fatturare</option><option value="invoice_issued" ${st==='invoice_issued'?'selected':''}>Fattura emessa</option><option value="collected" ${st==='collected'?'selected':''}>Incassato</option><option value="excluded" ${st==='excluded'?'selected':''}>Escluso</option></select></div><div class="field"><label>Rivalsa INPS</label><select name="inps_recharge_enabled"><option value="true" ${calc.inpsEnabled?'selected':''}>Sì</option><option value="false" ${!calc.inpsEnabled?'selected':''}>No</option></select></div><div class="field"><label>Percentuale rivalsa INPS</label><input name="inps_recharge_rate" type="number" step="0.01" value="${Number(calc.inpsRate||4)}"></div><div class="field"><label>Marca da bollo</label><select name="stamp_duty_enabled"><option value="true" ${calc.stampEnabled?'selected':''}>Sì</option><option value="false" ${!calc.stampEnabled?'selected':''}>No</option></select></div><div class="field"><label>Importo bollo</label><input name="stamp_duty_amount" type="number" step="0.01" value="${Number(calc.stampAmount||0)||Number(currentTaxSetting().stamp_duty_amount||2)}"></div><div class="field"><label>Numero fattura</label><input name="invoice_number" value="${esc(header.invoice_number||'')}"></div><div class="field"><label>Data fattura</label><input name="invoice_date" type="date" value="${esc(header.invoice_date||'')}"></div><div class="field"><label>Data incasso</label><input name="collection_date" type="date" value="${esc(header.collection_date||'')}"></div><div class="field"><label>Importo incassato</label><input name="collected_amount" type="number" step="0.01" value="${Number(header.collected_amount||0)}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(header.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva stato fattura</button><button type="button" class="secondary" onclick="go('billing')">Indietro</button></div></form>`)}
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
function taxSettings(){const year=currentYear();const c=annualTaxCalc(year);const ts=c.settings;return appShell(`<div class="screenTitle">Configurazione fiscale</div><p class="sub">ATECO, regime, aliquote e parametri della stima. Il cruscotto imposte è nella voce Tassazione.</p><form class="form" onsubmit="saveTaxSettings(event)"><h2>ATECO, regime e tasse</h2><p class="sub">Determinano il calcolo delle tasse sul tuo codice ATECO.</p><div class="field"><label>Anno fiscale</label><input name="fiscal_year" type="number" value="${year}"></div><div class="field"><label>Regime fiscale</label><select name="regime"><option value="forfettario" ${ts.regime==='forfettario'?'selected':''}>Forfettario</option><option value="ordinario" ${ts.regime==='ordinario'?'selected':''}>Ordinario</option><option value="semplificato" ${ts.regime==='semplificato'?'selected':''}>Semplificato</option></select></div><div class="field"><label>Codice ATECO</label><input name="ateco_code" value="${esc(ts.ateco_code||'')}"></div><div class="field"><label>Descrizione ATECO</label><input name="ateco_description" value="${esc(ts.ateco_description||'')}"></div><div class="field"><label>Coefficiente redditività %</label><input name="profitability_coefficient" type="number" step="0.01" value="${Number(ts.profitability_coefficient||67)}"></div><div class="field"><label>Aliquota imposta sostitutiva %</label><input name="substitute_tax_rate" type="number" step="0.01" value="${Number(ts.substitute_tax_rate||5)}"></div><div class="field"><label>Limite ricavi annuo forfettario</label><input name="annual_revenue_limit" type="number" step="0.01" value="${Number(ts.annual_revenue_limit||85000)}"></div><div class="field"><label>Data avvio attività</label><input name="activity_start_date" type="date" value="${esc(ts.activity_start_date||DEFAULT_DEFAULT_ACTIVITY_START_DATE)}"></div><h2>Rivalsa INPS e marca da bollo</h2><p class="sub">Voci aggiuntive da esporre in fattura oltre al compenso.</p><div class="field"><label>Gestione previdenziale</label><input name="inps_management" value="${esc(ts.inps_management||'gestione_separata')}"></div><div class="field"><label>Aliquota INPS Gestione Separata %</label><input name="inps_gs_rate" type="number" step="0.01" value="${Number(ts.inps_gs_rate??26.07)}"></div><div class="field"><label>Rivalsa INPS</label><select name="inps_recharge_enabled"><option value="true" ${ts.inps_recharge_enabled?'selected':''}>Sì</option><option value="false" ${!ts.inps_recharge_enabled?'selected':''}>No</option></select></div><div class="field"><label>Percentuale rivalsa INPS</label><input name="inps_recharge_rate" type="number" step="0.01" value="${Number(ts.inps_recharge_rate||4)}"></div><div class="field"><label>Marca da bollo</label><select name="stamp_duty_enabled"><option value="true" ${ts.stamp_duty_enabled?'selected':''}>Sì</option><option value="false" ${!ts.stamp_duty_enabled?'selected':''}>No</option></select></div><div class="field"><label>Importo marca da bollo</label><input name="stamp_duty_amount" type="number" step="0.01" value="${Number(ts.stamp_duty_amount||2)}"></div><details class="moreFields"><summary>Proiezione annua (avanzato)</summary><p class="sub">Parametri opzionali per affinare la stima "Prudente / Base / Ottimistico".</p><div class="field"><label>Includi mese corrente nella proiezione</label><select name="projection_include_current_month"><option value="true" ${ts.projection_include_current_month!==false?'selected':''}>Sì</option><option value="false" ${ts.projection_include_current_month===false?'selected':''}>No</option></select></div><div class="field"><label>Mesi esclusi dalla proiezione</label><input name="projection_excluded_months" placeholder="es. 1,8" value="${esc(parseExcludedMonths(ts.projection_excluded_months).join(','))}"></div><div class="field"><label>Fattore scenario prudente</label><input name="projection_prudent_factor" type="number" step="0.01" value="${Number(ts.projection_prudent_factor??0.85)}"></div><div class="field"><label>Fattore scenario ottimistico</label><input name="projection_optimistic_factor" type="number" step="0.01" value="${Number(ts.projection_optimistic_factor??1.10)}"></div><div class="field"><label>Soglia rischio basso %</label><input name="risk_low_threshold" type="number" step="0.01" value="${Number(ts.risk_low_threshold??70)}"></div><div class="field"><label>Soglia rischio medio %</label><input name="risk_medium_threshold" type="number" step="0.01" value="${Number(ts.risk_medium_threshold??90)}"></div><div class="field"><label>Soglia rischio alto %</label><input name="risk_high_threshold" type="number" step="0.01" value="${Number(ts.risk_high_threshold??100)}"></div></details><div class="field"><label>Note</label><textarea name="notes">${esc(ts.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva configurazione fiscale</button><button type="button" class="secondary" onclick="go('settings')">Indietro</button></div></form>`)}
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
function taxPaymentTypeLabel(t){return ({inps:'Contributi INPS',imposta_sostitutiva:'Imposta sostitutiva',acconto_imposta:'Acconto imposta',altro:'Altro'})[t]||t||'Pagamento'}
function taxPaymentTypeOptions(selected=''){return ['inps','imposta_sostitutiva','acconto_imposta','altro'].map(v=>`<option value="${v}" ${v===selected?'selected':''}>${esc(taxPaymentTypeLabel(v))}</option>`).join('')}
function taxPayments(){const year=currentYear();const rows=data.taxPayments.filter(p=>Number(p.fiscal_year)===year).sort((a,b)=>String(b.payment_date||'').localeCompare(String(a.payment_date||'')));const totalPaid=rows.filter(p=>p.status==='paid').reduce((s,p)=>s+Number(p.amount||0),0);return appShell(`<h1>Pagamenti fiscali</h1><p class="sub">Contributi INPS e altri versamenti fiscali per l'anno ${year}. I pagamenti INPS "Pagato" vengono dedotti in Fiscalità dall'imponibile stimato.</p>${inpsGsCard()}<div class="card"><b>Totale pagato ${year}</b><div class="amount" style="margin-top:8px">${fmtEUR(totalPaid)}</div></div><form class="form" onsubmit="addTaxPayment(event)"><div class="field"><label>Anno fiscale</label><input name="fiscal_year" type="number" value="${year}"></div><div class="field"><label>Tipo pagamento</label><select name="payment_type">${taxPaymentTypeOptions('inps')}</select></div><div class="field"><label>Data pagamento</label><input name="payment_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Importo</label><input name="amount" type="number" step="0.01" value="0"></div><div class="field"><label>Stato</label><select name="status"><option value="paid">Pagato</option><option value="planned">Pianificato</option></select></div><div class="field"><label>Note</label><textarea name="notes"></textarea></div><button class="primary">Aggiungi pagamento</button></form><div class="list">${rows.map(p=>`<div class="row" onclick="editTaxPayment('${p.id}')"><div></div><div><div class="title">${esc(taxPaymentTypeLabel(p.payment_type))}</div><div class="desc">${dateIT(p.payment_date)} · ${p.status==='paid'?'Pagato':'Pianificato'}</div></div><div class="value">${fmtEUR(p.amount||0)}</div></div>`).join('')||emptyForm('Nessun pagamento registrato per questo anno.')}</div><button type="button" class="secondary" onclick="go('tax')">Indietro</button>`)}
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
  return {items,total:items.reduce((s,i)=>s+i.amount,0),due:d,bolloTot};
}
function taxScheduleCard(year,mode,title,desc){
  const r=taxScheduleItems(year,mode);const d=r.due;
  const kindClass={bollo:'gray',inps:'blue',imposta:'orange'};
  const refs=[...new Set(r.items.map(i=>Number(i.ref)))].sort((a,b)=>a-b);
  return `<div class="card"><b>${title}</b><div class="desc" style="margin-top:2px">${desc}</div><div class="kpiGrid three" style="margin-top:14px"><div><span>Base</span><strong>${fmtEUR(d.base)}</strong></div><div><span>Imponibile</span><strong>${fmtEUR(d.forfait)}</strong></div><div><span>Da versare</span><strong>${fmtEUR(r.total)}</strong></div></div><div class="metricLine" style="margin-top:8px">${d.parts.map(p=>esc(p[0])+' '+fmtEUR(p[1])).join(' <span class="dot">·</span> ')}</div>${r.items.length?refs.map(rf=>{const its=r.items.filter(i=>Number(i.ref)===rf);const sub=its.reduce((s,i)=>s+i.amount,0);return `<div class="refGroup"><div class="refHead"><b>Riferimento ${rf}</b><span>${fmtEUR(sub)}</span></div><div class="list" style="box-shadow:none;margin:0">${its.map(it=>`<div class="row"><div class="date">${dateIT(it.date)}<br><span class="dateYear">${String(it.date).slice(0,4)}</span></div><div><div class="title">${esc(it.label)}</div><div class="desc"><span class="tag ${kindClass[it.kind]||'gray'}">Prevista</span> scadenza ${dateIT(it.date)}/${String(it.date).slice(0,4)}</div></div><div class="value">${fmtEUR(it.amount)}</div></div>`).join('')}</div></div>`}).join(''):'<div class="empty">Nessuna scadenza prevista.</div>'}</div>`;
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
function expenses(){const rows=expenseRows().slice().sort((a,b)=>String(b.expense_date).localeCompare(String(a.expense_date)));const byDay={};rows.forEach(e=>{const d=String(e.expense_date||'').slice(0,10);(byDay[d]=byDay[d]||[]).push(e)});const days=Object.keys(byDay).sort((a,b)=>b.localeCompare(a));const costiMese=rows.filter(expIsOwn).reduce((s,e)=>s+Number(e.amount||0),0);const rimbMese=rows.filter(e=>!expIsOwn(e)).reduce((s,e)=>s+Number(e.amount||0),0);return appShell(`<h1>Spese</h1>${monthSelector()}<div class="card"><b>Riepilogo ${monthLabel(state.month)}</b><div class="statRow" style="margin-top:14px"><div class="stat tint-orange"><div class="statHead"><span class="statDot"></span><span class="statLbl">A mio carico</span></div><strong>${fmtEUR(costiMese)}</strong><small>non rimborsati</small></div><div class="stat tint-blue"><div class="statHead"><span class="statDot"></span><span class="statLbl">Rimborsi</span></div><strong>${fmtEUR(rimbMese)}</strong><small>fattura + piè di lista</small></div></div></div><button class="primary" onclick="go('expenseForm')">+ Nuova spesa</button><label class="secondary" style="display:block;text-align:center;cursor:pointer">Importa spese da CSV<input type="file" accept=".csv,text/csv" style="display:none" onchange="importCostsCsv(event)"></label>${days.map(d=>{const list=byDay[d];const sub=list.reduce((s,e)=>s+Number(e.amount||0),0);const cli=list[0]?clientName(list[0].client_id):'';const city=list.map(e=>e.work_city).find(Boolean)||'';return `<div class="card" style="padding:0;overflow:hidden"><div class="dayHead"><div><b>${dateIT(d)}</b> · ${esc(cli)}${city?' · '+esc(city):''}</div><div>${fmtEUR(sub)}</div></div><div class="list" style="box-shadow:none;border:0;margin:0">${list.map(e=>`<div class="row" onclick="editEntry('${e.id}','expense')"><div></div><div><div class="title">${esc(expenseCategoryName(e.expense_category_id))} ${expenseTypeTag(e)}</div><div class="desc">${esc(e.description||'')}${e.project_id?' · '+esc(projectName(e.project_id)):''}</div></div><div class="value">${fmtEUR(e.amount||0)}</div></div>`).join('')}</div></div>`}).join('')||emptyState('Nessuna spesa in questo mese.','+ Aggiungi una spesa',"go('expenseForm')")}`)}
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
<h2>Anagrafiche</h2><div class="list">${settingsRow('clients','👤','Clienti','Tariffe e tipo compenso')}${settingsRow('projects','📁','Progetti / Clienti finali','Collegati al cliente principale')}${settingsRow('activities','🏷️','Attività','PM, AMS, Gestione...')}${settingsRow('expenseCategories','🧾','Voci di costo / spesa','Rimborsabili e non rimborsabili')}</div>
<h2>Fatturazione e fisco</h2><div class="list">${settingsRow('invoiceTemplates','📄','Template fattura','Descrizioni da copiare su Fiscozen')}${settingsRow('taxSettings','%','Configurazione fiscale','Forfettario, ATECO, aliquote e proiezione')}${settingsRow('taxPayments','◈','Pagamenti fiscali','Contributi INPS e versamenti')}</div>
<h2>Analisi e dati</h2><div class="list">${settingsRow('exportTimesheet','⬇','Export Timesheet Excel','Scarica il dettaglio mensile')}<label class="row" style="cursor:pointer"><div class="roundIcon blue">⬆</div><div><div class="title">Importa da CSV</div><div class="desc">Consuntivi in blocco</div></div><div>›</div><input type="file" accept=".csv,text/csv" style="display:none" onchange="importCsv(event)"></label></div>
<h2>App</h2><div class="list">${settingsRow('appearance','◐','Aspetto / Tema','Chiaro o scuro')}<div class="row"><div class="roundIcon blue">☁</div><div><div class="title">Database</div><div class="desc">Supabase PostgreSQL · ${email}</div></div><div></div></div></div>
<div class="grid" style="margin-top:16px"><button class="secondary" onclick="reload()">Ricarica dati</button><button class="secondary danger" onclick="logout()">Esci</button></div>`)}

function appearance(){return appShell(`<div class="screenTitle">Aspetto / Tema</div><p class="sub">Scegli il template grafico da usare su telefono e PC.</p><div class="card"><div class="themeChoice"><button class="${state.theme==='light'?'active':''}" onclick="saveThemeChoice('light')"><b>Chiaro / Giorno</b><span>sfondo chiaro, card bianche, ideale per uso diurno</span></button><button class="${state.theme==='dark'?'active':''}" onclick="saveThemeChoice('dark')"><b>Scuro / Sera</b><span>sfondo navy, card scure, ideale per smartphone e sera</span></button><button class="${state.theme==='auto'?'active':''}" onclick="saveThemeChoice('auto')"><b>Automatico di sistema</b><span>segue l'impostazione del dispositivo: ora attivo il tema ${systemTheme()==='dark'?'scuro':'chiaro'}</span></button></div></div><button class="secondary" onclick="go('settings')">Indietro</button>`)}

function exportTimesheetViewOptions(){const clients=activeClients();const selected=clients[0]?.id||'';return `<div class="field"><label>Mese</label><input name="month" type="month" value="${state.month}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)"><option value="">Tutti i clienti</option>${clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id"><option value="">Tutti i progetti</option>${projectOptions(selected)}</select></div><div class="field"><label>Includi importi</label><select name="include_amount"><option value="false">No, solo dettaglio operativo</option><option value="true">Sì, includi importi</option></select></div>`}
function exportTimesheet(){return appShell(`<div class="screenTitle">Export Timesheet Excel</div><p class="sub">Scarica il dettaglio mensile da inviare al cliente.</p><form class="form" onsubmit="downloadTimesheetExcel(event)">${exportTimesheetViewOptions()}<div class="actions"><button class="primary">Scarica Excel</button><button type="button" class="secondary" onclick="go('settings')">Annulla</button></div></form>`)}

function clients(){return appShell(`<h1>Clienti</h1><form class="form" onsubmit="addClient(event)"><div class="field"><label>Nome cliente</label><input name="name" required></div><div class="field"><label>Tipo compenso</label><select name="compensation_type"><option value="daily_rate_8h">Tariffa giornaliera 8h</option><option value="monthly_flat">Una tantum mensile</option></select></div><div class="field"><label>Tariffa giornaliera</label><input name="daily_rate" type="number" step="0.01" value="0"></div><button class="primary">Aggiungi cliente</button></form>${sortControl('clients')}<div class="list">${sortEntities('clients',data.clients).map(c=>`<div class="row" onclick="editClient('${c.id}')"><div></div><div><div class="title">${esc(c.name)}</div><div class="desc">${c.compensation_type==='daily_rate_8h'?'Tariffa giornaliera 8h · '+fmtEUR(c.daily_rate||0):'Una tantum mensile'} · ${c.active?'Attivo':'Disattivo'}</div></div>${moveBtns('clients',c.id)}</div>`).join('')||emptyForm('Nessun cliente ancora inserito.')}</div>`)}
function editClient(id){navigateTo('clientEdit',{edit:id})}
function clientPolicyEditor(c){const pol=parsePolicy(c);const typeOf=id=>{const h=pol.find(r=>r.category_id===id);return h?h.type:'own'};const cats=data.expenseCategories.filter(x=>x.active);if(!cats.length)return '<p class="sub">Crea prima delle voci di spesa per definire la policy.</p>';return `<div class="card" style="margin-top:6px">${cats.map(cat=>`<div class="policyRow"><div><div class="title">${esc(cat.name)}</div></div><select name="policy_${cat.id}">${reimbTypeOptions(typeOf(cat.id))}</select></div>`).join('')}</div>`}
function clientEdit(){const c=clientById(state.edit);if(!c)return clients();return appShell(`<h1>Modifica cliente</h1><form class="form" onsubmit="saveClient(event)"><div class="field"><label>Nome cliente</label><input name="name" value="${esc(c.name)}" required></div><div class="field"><label>Tipo compenso</label><select name="compensation_type"><option value="daily_rate_8h" ${c.compensation_type==='daily_rate_8h'?'selected':''}>Tariffa giornaliera 8h</option><option value="monthly_flat" ${c.compensation_type==='monthly_flat'?'selected':''}>Una tantum mensile</option></select></div><div class="field"><label>Tariffa giornaliera</label><input name="daily_rate" type="number" step="0.01" value="${Number(c.daily_rate||0)}"></div><div class="field"><label>Ore standard giornata</label><input name="standard_hours" type="number" step="0.25" value="${Number(c.standard_hours||8)}"></div><div class="field"><label>Sede operativa (base trasferte)</label><input name="base_city" value="${esc(c.base_city||'')}" placeholder="Es. Milano"></div><div class="field"><label>Attivo</label><select name="active"><option value="true" ${c.active?'selected':''}>Sì</option><option value="false" ${!c.active?'selected':''}>No</option></select></div><h2>Policy rimborsi spese</h2><p class="sub">Per ogni voce di spesa scegli come viene gestita con questo cliente. L'app la proporrà in automatico quando inserisci una spesa.</p>${clientPolicyEditor(c)}<div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteClient('${c.id}')">Elimina cliente</button><button type="button" class="secondary" onclick="go('clients')">Annulla</button></div></form>`)}
async function addClient(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={name:norm(f.name),compensation_type:f.compensation_type,daily_rate:Number(f.daily_rate||0),standard_hours:8,active:true};const {error}=await insertResilient('clients',payload);if(error)return setMsg(error.message,7000);await reload();state.view='clients';render()}
function collectPolicyFromForm(f){const pol=[];data.expenseCategories.forEach(cat=>{const v=f['policy_'+cat.id];if(v&&v!=='own')pol.push({category_id:cat.id,category:cat.name,type:v})});return pol}
async function saveClient(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const policy=collectPolicyFromForm(f);const payload={name:norm(f.name),compensation_type:f.compensation_type,daily_rate:Number(f.daily_rate||0),standard_hours:Number(f.standard_hours||8),active:f.active==='true',base_city:norm(f.base_city)||null,expense_policy:policy};const {error}=await updateResilient('clients',payload,state.edit,['base_city','expense_policy']);if(error)return setMsg(error.message,7000);await reload();state.view='clients';state.edit=null;render()}
async function deleteClient(idv){if(!confirm('Eliminare il cliente? Se esistono consuntivi collegati, il database potrebbe bloccare la cancellazione. In quel caso usa Disattivo.'))return;const {error}=await sb.from('clients').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='clients';render()}
function projects(){return appShell(`<h1>Progetti / Clienti finali</h1><form class="form" onsubmit="addProject(event)"><div class="field"><label>Cliente collegato</label><select name="client_id">${data.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Nome progetto / cliente finale</label><input name="name" required></div><button class="primary">Aggiungi progetto</button></form>${sortControl('projects')}<div class="list">${sortEntities('projects',data.projects).map(p=>`<div class="row" onclick="editProject('${p.id}')"><div></div><div><div class="title">${esc(clientName(p.client_id))}</div><div class="desc">${esc(p.name)} · ${p.active?'Attivo':'Disattivo'}</div></div>${moveBtns('projects',p.id)}</div>`).join('')||emptyForm('Nessun progetto.')}</div>`)}
function editProject(id){navigateTo('projectEdit',{edit:id})}
function projectEdit(){const p=projectById(state.edit);if(!p)return projects();return appShell(`<h1>Modifica progetto</h1><form class="form" onsubmit="saveProject(event)"><div class="field"><label>Cliente collegato</label><select name="client_id">${data.clients.map(c=>`<option value="${c.id}" ${c.id===p.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Nome progetto / cliente finale</label><input name="name" value="${esc(p.name)}" required></div><div class="field"><label>Attivo</label><select name="active"><option value="true" ${p.active?'selected':''}>Sì</option><option value="false" ${!p.active?'selected':''}>No</option></select></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteProject('${p.id}')">Elimina progetto</button><button type="button" class="secondary" onclick="go('projects')">Annulla</button></div></form>`)}
async function addProject(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const {error}=await insertResilient('projects',{client_id:f.client_id,name:norm(f.name),active:true});if(error)return setMsg(error.message,7000);await reload();state.view='projects';render()}
async function saveProject(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const {error}=await updateResilient('projects',{client_id:f.client_id,name:norm(f.name),active:f.active==='true'},state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='projects';state.edit=null;render()}
async function deleteProject(idv){if(!confirm('Eliminare il progetto? Se esistono consuntivi collegati, il database potrebbe bloccare la cancellazione.'))return;const {error}=await sb.from('projects').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='projects';render()}
function activities(){return appShell(`<h1>Attività</h1><form class="form" onsubmit="addActivity(event)"><div class="field"><label>Nome attività</label><input name="name" required></div><button class="primary">Aggiungi attività</button></form>${sortControl('activities')}<div class="list">${sortEntities('activities',data.activities).map(a=>`<div class="row" onclick="editActivity('${a.id}')"><div></div><div><div class="title">${esc(a.name)}</div><div class="desc">${a.active?'Attiva':'Disattiva'}</div></div>${moveBtns('activities',a.id)}</div>`).join('')||emptyForm('Nessuna attività ancora inserita.')}</div>`)}
function editActivity(id){navigateTo('activityEdit',{edit:id})}
function activityEdit(){const a=activityById(state.edit);if(!a)return activities();return appShell(`<h1>Modifica attività</h1><form class="form" onsubmit="saveActivity(event)"><div class="field"><label>Nome attività</label><input name="name" value="${esc(a.name)}" required></div><div class="field"><label>Attiva</label><select name="active"><option value="true" ${a.active?'selected':''}>Sì</option><option value="false" ${!a.active?'selected':''}>No</option></select></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteActivity('${a.id}')">Elimina attività</button><button type="button" class="secondary" onclick="go('activities')">Annulla</button></div></form>`)}
async function addActivity(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const {error}=await insertResilient('activities',{name:norm(f.name),active:true});if(error)return setMsg(error.message,7000);await reload();state.view='activities';render()}
async function saveActivity(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const {error}=await updateResilient('activities',{name:norm(f.name),active:f.active==='true'},state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='activities';state.edit=null;render()}
async function deleteActivity(idv){if(!confirm('Eliminare attività? Se usata nei consuntivi, il database potrebbe bloccare la cancellazione.'))return;const {error}=await sb.from('activities').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='activities';render()}

function expenseCategories(){return appShell(`<h1>Voci di costo / spesa</h1><p class="sub">Ogni voce può essere <b>rimborsabile</b> (la addebiti al cliente in fattura) o <b>non rimborsabile</b> (costo a tuo carico, che riduce il margine).</p><form class="form" onsubmit="addExpenseCategory(event)"><div class="field"><label>Nome voce</label><input name="name" required></div><div class="field"><label>Rimborsabile dal cliente</label><select name="reimbursable"><option value="true">Sì · rimborsabile (in fattura)</option><option value="false">No · costo a mio carico</option></select></div><div class="field"><label>Tipo calcolo</label><select name="calculation_type"><option value="manual_amount">Importo manuale</option><option value="quantity_rate">Quantità × tariffa</option></select></div><div class="field"><label>Unità</label><input name="unit_label" placeholder="km, notte, ticket..."></div><div class="field"><label>Tariffa default</label><input name="default_unit_rate" type="number" step="0.0001" value="0"></div><button class="primary">Aggiungi voce</button></form>${sortControl('expenseCategories')}<div class="list">${sortEntities('expenseCategories',data.expenseCategories).map(c=>`<div class="row" onclick="editExpenseCategory('${c.id}')"><div></div><div><div class="title">${esc(c.name)}</div><div class="desc">${c.reimbursable===false?'<b>Non rimborsabile (costo)</b>':'Rimborsabile'} · ${c.calculation_type==='quantity_rate'?'Quantità × tariffa':'Importo manuale'} · ${c.active?'Attiva':'Disattiva'}</div></div><div>›</div></div>`).join('')||emptyForm('Nessuna voce di costo o spesa.')}</div>`)}
function editExpenseCategory(id){navigateTo('expenseCategoryEdit',{edit:id})}
function expenseCategoryEdit(){const c=expenseCategoryById(state.edit);if(!c)return expenseCategories();return appShell(`<h1>Modifica voce di costo / spesa</h1><form class="form" onsubmit="saveExpenseCategory(event)"><div class="field"><label>Nome voce</label><input name="name" value="${esc(c.name)}" required></div><div class="field"><label>Rimborsabile dal cliente</label><select name="reimbursable"><option value="true" ${c.reimbursable!==false?'selected':''}>Sì · rimborsabile (in fattura)</option><option value="false" ${c.reimbursable===false?'selected':''}>No · costo a mio carico</option></select></div><div class="field"><label>Tipo calcolo</label><select name="calculation_type"><option value="manual_amount" ${c.calculation_type==='manual_amount'?'selected':''}>Importo manuale</option><option value="quantity_rate" ${c.calculation_type==='quantity_rate'?'selected':''}>Quantità × tariffa</option></select></div><div class="field"><label>Unità</label><input name="unit_label" value="${esc(c.unit_label||'')}"></div><div class="field"><label>Tariffa default</label><input name="default_unit_rate" type="number" step="0.0001" value="${Number(c.default_unit_rate||0)}"></div><div class="field"><label>Macro voce fattura</label><input name="invoice_macro" value="${esc(c.invoice_macro||'Spese di trasferta')}"></div><div class="field"><label>Attiva</label><select name="active"><option value="true" ${c.active?'selected':''}>Sì</option><option value="false" ${!c.active?'selected':''}>No</option></select></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteExpenseCategory('${c.id}')">Elimina</button><button type="button" class="secondary" onclick="go('expenseCategories')">Annulla</button></div></form>`)}
async function addExpenseCategory(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={name:norm(f.name),calculation_type:f.calculation_type,unit_label:norm(f.unit_label)||null,default_unit_rate:Number(f.default_unit_rate||0)||null,invoice_macro:'Spese di trasferta',reimbursable:f.reimbursable!=='false',active:true};const {error}=await insertResilient('expense_categories',payload,['reimbursable']);if(error)return setMsg(error.message,7000);await reload();state.view='expenseCategories';render()}
async function saveExpenseCategory(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={name:norm(f.name),calculation_type:f.calculation_type,unit_label:norm(f.unit_label)||null,default_unit_rate:Number(f.default_unit_rate||0)||null,invoice_macro:norm(f.invoice_macro)||'Spese di trasferta',reimbursable:f.reimbursable!=='false',active:f.active==='true'};const {error}=await updateResilient('expense_categories',payload,state.edit,['reimbursable']);if(error)return setMsg(error.message,7000);await reload();state.view='expenseCategories';state.edit=null;render()}
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
function excelSafe(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function exportRowsFor(month,clientId,projectId){const byFilters=(x,cid,pid)=>{if(clientId&&cid!==clientId)return false;if(projectId&&(pid||'')!==projectId)return false;return true};let rows=[];data.entries.filter(e=>String(e.entry_date||'').startsWith(month)&&byFilters(e,e.client_id,e.project_id)).forEach(e=>rows.push({tipo:'Consuntivo',data:e.entry_date,cliente:clientName(e.client_id),progetto:projectName(e.project_id),attivita:activityName(e.activity_id),descrizione:e.description||'',ore:Number(e.hours||0),quantita:'',sede:e.work_site||'',citta:e.work_city||'',note:e.notes||'',importo:dailyAmount(e)}));data.manualEntries.filter(e=>String(e.entry_date||'').startsWith(month)&&byFilters(e,e.client_id,e.project_id)).forEach(e=>rows.push({tipo:'Manuale',data:e.entry_date,cliente:clientName(e.client_id),progetto:projectName(e.project_id),attivita:activityName(e.activity_id),descrizione:e.description||'',ore:'',quantita:'',sede:e.work_site||'',citta:e.work_city||'',note:e.notes||'',importo:Number(e.amount||0)}));data.travelExpenses.filter(e=>String(e.expense_date||'').startsWith(month)&&byFilters(e,e.client_id,e.project_id)).forEach(e=>rows.push({tipo:'Spesa trasferta',data:e.expense_date,cliente:clientName(e.client_id),progetto:projectName(e.project_id),attivita:expenseCategoryName(e.expense_category_id),descrizione:e.description||'',ore:'',quantita:e.quantity||'',sede:e.work_site||'',citta:e.work_city||'',note:e.notes||'',importo:Number(e.amount||0)}));return rows.sort((a,b)=>String(a.data).localeCompare(String(b.data)))}
function downloadTimesheetExcel(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const month=f.month||state.month;const include=f.include_amount==='true';const rows=exportRowsFor(month,f.client_id||'',f.project_id||'');if(!rows.length)return setMsg('Nessuna riga da esportare per i filtri selezionati.',5000);const headers=['Tipo','Data','Cliente','Cliente/Progetto','Attività / Voce','Descrizione','Ore','Quantità','Sede','Luogo/Città','Note'].concat(include?['Importo']:[]);const totalHours=rows.reduce((s,r)=>s+(Number(r.ore)||0),0);const totalAmount=rows.reduce((s,r)=>s+(Number(r.importo)||0),0);const html=`<html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11pt}th{background:#0b1b31;color:white;font-weight:bold}td,th{border:1px solid #b7c0cf;padding:6px}.tot{font-weight:bold;background:#eaf2ff}</style></head><body><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td>${excelSafe(r.tipo)}</td><td>${excelSafe(dateIT(r.data))}</td><td>${excelSafe(r.cliente)}</td><td>${excelSafe(r.progetto)}</td><td>${excelSafe(r.attivita)}</td><td>${excelSafe(r.descrizione)}</td><td>${r.ore!==''?fmtNum(r.ore,2):''}</td><td>${excelSafe(r.quantita)}</td><td>${excelSafe(r.sede)}</td><td>${excelSafe(r.citta)}</td><td>${excelSafe(r.note)}</td>${include?`<td>${fmtNum(r.importo,2)}</td>`:''}</tr>`).join('')}<tr class="tot"><td colspan="6">Totale</td><td>${fmtNum(totalHours,2)}</td><td></td><td></td><td></td><td></td>${include?`<td>${fmtNum(totalAmount,2)}</td>`:''}</tr></tbody></table></body></html>`;const blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'});const a=document.createElement('a');const c=f.client_id?clientName(f.client_id).replace(/\W+/g,'_'):'TuttiClienti';const p=f.project_id?projectName(f.project_id).replace(/\W+/g,'_'):'TuttiProgetti';a.href=URL.createObjectURL(blob);a.download=`TOTIME_Timesheet_${c}_${p}_${month}.xls`;a.click();setMsg(`Export creato: ${rows.length} righe.`,5000)}

async function importCsv(ev){const file=ev.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{try{const text=reader.result.replace(/^\uFEFF/,'').trim();if(!text)return setMsg('CSV vuoto.');const lines=text.split(/\r?\n/).filter(Boolean);const sep=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';const headers=parseCsvLine(lines.shift(),sep).map(canonHeader);const get=(row,names)=>{for(const n of names.map(canonHeader)){const i=headers.indexOf(n);if(i>=0)return row[i]||''}return''};let count=0,updated=0,skipped=0,createdClients=0,createdProjects=0,createdActivities=0;for(const line of lines){const row=parseCsvLine(line,sep);if(!row.some(x=>norm(x))){skipped++;continue}const cliente=norm(get(row,['cliente','client']));if(!cliente){skipped++;continue}const tipoRaw=get(row,['tipo','type']);const tipo=(tipoRaw||'Tariffa giornaliera 8h').toLowerCase();const isMonthly=tipo.includes('mens')||tipo.includes('monthly')||tipo.includes('una tantum');const ore=parseAmount(get(row,['ore','hours']));const amount=parseAmount(get(row,['importo','amount']));let rowRate=amount>0&&ore>0?amount/ore*8:0;const beforeC=data.clients.length;const client=await ensureClient(cliente,isMonthly?'monthly':'daily',rowRate);if(data.clients.length>beforeC)createdClients++;if(!client.daily_rate&&rowRate>0){await updateResilient('clients',{daily_rate:rowRate},client.id);client.daily_rate=rowRate}const progetto=norm(get(row,['cliente/progetto','progetto','cliente finale','project']));const beforeP=data.projects.length;const project=await ensureProject(client.id,progetto);if(data.projects.length>beforeP)createdProjects++;const att=norm(get(row,['attività','attivita','activity']));const beforeA=data.activities.length;const activity=await ensureActivity(att);if(data.activities.length>beforeA)createdActivities++;const descrizione=get(row,['descrizione','description']);const sede=norm(get(row,['sede','work_site','site']));const citta=norm(get(row,['luogo/città','luogo/citta','città','citta','luogo','work_city','city','location']));const luogo=[sede,citta].filter(Boolean).join(' - ');const note=get(row,['note','notes']);const idv=norm(get(row,['id','import_id','riga','key','chiave']));if(isMonthly){const mese=norm(get(row,['mese','month']))||toMonth(get(row,['data','date']))||state.month;const [year,month]=mese.split('-').map(Number);const payload={year,month,client_id:client.id,project_id:project?.id||null,description:descrizione||null,notes:note||null,amount};const key=idv?importKey(['mc',idv]):importKey(['mc',year,month,client.id,project?.id||'']);const {res,updated:u}=await upsertByKey('monthly_compensations',data.monthly,payload,key);if(res.error)throw res.error;if(u)updated++;else count++;}else{const date=toDate(get(row,['data','date']))||new Date().toISOString().slice(0,10);const rate=rowRate||Number(client.daily_rate||0);const payload={entry_date:date,client_id:client.id,project_id:project?.id||null,activity_id:activity?.id||null,work_location:luogo||null,work_site:sede||null,work_city:citta||null,description:descrizione||null,notes:note||null,hours:ore,daily_rate_snapshot:rate,standard_hours_snapshot:8};const key=idv?importKey(['ts',idv]):importKey(['ts',date,client.id,project?.id||'',activity?.id||'',descrizione,ore]);const {res,updated:u}=await upsertByKey('timesheet_entries',data.entries,payload,key);if(res.error)throw res.error;if(u)updated++;else count++;}}
await fetchAll();state.view='timesheet';setMsg(`Import completato: ${count} inserite, ${updated} aggiornate. Clienti creati: ${createdClients}. Progetti: ${createdProjects}. Attività: ${createdActivities}. Scartate: ${skipped}.`,9000)}catch(e){console.error(e);setMsg('Errore import CSV: '+(e.message||e),9000)}};reader.readAsText(file,'windows-1252')}
function exportData(){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='totime-supabase-backup.json';a.click()}
function render(){document.documentElement.setAttribute('data-view',state.view||'home');if(state.loading){document.getElementById('app').innerHTML=loadingView();return}if(state.view==='resetPassword'){document.getElementById('app').innerHTML=resetPasswordView();return}if(!session){const authMap={register:registerView,forgotPassword:forgotPasswordView};document.getElementById('app').innerHTML=(authMap[state.view]||loginView)();return}let html='';const map={home,newChoice,dailyForm,dailyEdit,calendario,giorno,tmForm,tmManage,monthlyForm,monthlyEdit,manualForm,manualEdit,expenseForm,expenseEdit,timesheet,griglia,pivot,summary,billing,billingDetail:billingDetailView,settings,clients,projects,activities,clientEdit,projectEdit,activityEdit,expenseCategories,expenseCategoryEdit,invoiceTemplates,invoiceTemplateEdit,appearance,exportTimesheet,tax,taxPayments,taxPaymentEdit,annualMonths,annualInvoices,incassi,balance,taxSettings,tasseFuture,fatturatoDetail,expenses,account};html=(map[state.view]||home)();document.getElementById('app').innerHTML=html}

Object.assign(window,{
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
  monthWorkbookXml,
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
  annualChartSvg,
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
  incassi,
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
  newChoice,
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
  saveExpense,
  expenseEdit,
  saveExpenseEdit,
  duplicateExpense,
  deleteExpense,
  editEntry,
  timesheet,
  timesheetRow,
  annualSummaryCard,
  summary,
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
  excelSafe,
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
