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
let state={view:'home',month:ym(today),edit:null,editType:null,loading:true,message:'',theme:localStorage.getItem('totime-theme')||'light',menuOpen:false,history:[],dirty:false};
let session=null;
let data={clients:[],projects:[],activities:[],entries:[],monthly:[],billingHeaders:[],profiles:[],expenseCategories:[],travelExpenses:[],manualEntries:[],invoiceTemplates:[],appSettings:[],taxSettings:[],taxPayments:[]};
applyTheme();


function applyTheme(){document.documentElement.setAttribute('data-theme',state.theme||'light');localStorage.setItem('totime-theme',state.theme||'light')}
function logoIcon(){return (state.theme||'light')==='dark'?'assets/TOTIME_logo_only_dark.png':'assets/TOTIME_logo_only.png'}
function logoWordmark(){return (state.theme||'light')==='dark'?'assets/TOTIME_logo_wordmark_dark.png':'assets/TOTIME_logo_wordmark.png'}
function settingValue(key){return data.appSettings?.find(s=>s.setting_key===key)?.setting_value}
function loadThemeFromSettings(){const val=settingValue('theme'); if(typeof val==='string' && ['light','dark'].includes(val)){state.theme=val} applyTheme()}
async function saveThemeChoice(theme){state.theme=theme;applyTheme();const existing=data.appSettings?.find(s=>s.setting_key==='theme');const payload={setting_key:'theme',setting_value:theme};let res;if(existing)res=await sb.from('app_settings').update(payload).eq('id',existing.id);else res=await sb.from('app_settings').insert(payload);if(res.error)return setMsg(res.error.message,7000);await reload();state.view='appearance';setMsg('Tema aggiornato.',3000)}

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
function expenseCategoryName(id){return expenseCategoryById(id)?.name||'Spesa'}
function entryRate(e){return Number(e.daily_rate_snapshot ?? clientById(e.client_id)?.daily_rate ?? 0)}
function entryStd(e){return Number(e.standard_hours_snapshot ?? clientById(e.client_id)?.standard_hours ?? 8) || 8}
function dailyAmount(e){return entryRate(e)/entryStd(e)*Number(e.hours||0)}
function dailyDays(e){return Number(e.hours||0)/entryStd(e)}
function rowsForMonth(){return data.entries.filter(e=>String(e.entry_date||'').startsWith(state.month))}
function monthlyRows(){const {year,month}=periodParts();return data.monthly.filter(e=>Number(e.year)===year&&Number(e.month)===month)}
function manualRows(){return data.manualEntries.filter(e=>String(e.entry_date||'').startsWith(state.month))}
function expenseRows(){return data.travelExpenses.filter(e=>String(e.expense_date||'').startsWith(state.month))}
function totals(){let h=0,a=0;rowsForMonth().forEach(e=>{h+=Number(e.hours||0);a+=dailyAmount(e)});monthlyRows().forEach(e=>a+=Number(e.amount||0));manualRows().forEach(e=>a+=Number(e.amount||0));expenseRows().forEach(e=>a+=Number(e.amount||0));return {hours:h,days:h/8,amount:a}}
function metricLine(hours,amount){return `${fmtNum(hours,1)} h <span class="dot">·</span> ${fmtNum(Number(hours||0)/8,1)} gg/u <span class="dot">·</span> ${fmtEUR(amount)}`}
function amountLine(label,amount){return `${esc(label)} <span class="dot">·</span> ${fmtEUR(amount)}`}
function dateIT(v){if(!v)return'';const s=String(v);return `${s.slice(8,10)}/${s.slice(5,7)}`}
function viewLabel(v){return ({home:'Home',timesheet:'Timesheet',summary:'Riepilogo',billing:'Fatture',billingDetail:'Dettaglio fattura',tax:'Fiscalità',settings:'Configurazione',clients:'Clienti',clientEdit:'Cliente',projects:'Progetti',projectEdit:'Progetto',activities:'Attività',activityEdit:'Attività',expenseCategories:'Voci spesa',expenseCategoryEdit:'Voce spesa',invoiceTemplates:'Template fattura',invoiceTemplateEdit:'Template fattura',appearance:'Aspetto',exportTimesheet:'Export timesheet',newChoice:'Nuovo consuntivo',dailyForm:'Consuntivo giornaliero',dailyEdit:'Consuntivo giornaliero',monthlyForm:'Compenso mensile',monthlyEdit:'Compenso mensile',manualForm:'Consuntivo manuale',manualEdit:'Consuntivo manuale',expenseForm:'Spesa trasferta',expenseEdit:'Spesa trasferta'})[v]||'schermata precedente'}
function guardUnsavedChanges(){if(!state.dirty)return true;const leave=confirm('Hai modifiche non salvate. Vuoi uscire da questa schermata e perdere i dati inseriti?');if(leave){state.dirty=false;return true}return false}
function pushHistory(){const last=state.history[state.history.length-1];const cur={view:state.view,edit:state.edit,editType:state.editType};if(!last||last.view!==cur.view||last.edit!==cur.edit||last.editType!==cur.editType)state.history.push(cur);if(state.history.length>30)state.history.shift()}
function navigateTo(v,{edit=null,editType=null,track=true,resetEdit=true}={}){if(!guardUnsavedChanges())return;if(track&&state.view!==v)pushHistory();state.view=v;state.edit=resetEdit?edit:state.edit;state.editType=resetEdit?editType:state.editType;state.menuOpen=false;render()}
function go(v){navigateTo(v)}
function back(){if(!guardUnsavedChanges())return;const prev=state.history.pop()||{view:'home',edit:null,editType:null};state.view=prev.view||'home';state.edit=prev.edit||null;state.editType=prev.editType||null;state.menuOpen=false;render()}
function toggleMainMenu(){if(!guardUnsavedChanges())return;state.menuOpen=!state.menuOpen;render()}
const NAV_ITEMS=[['home','⌂','Home'],['timesheet','◷','Timesheet'],['summary','▥','Riepilogo'],['billing','▤','Fatture'],['tax','◌','Fiscalità'],['settings','•••','Configurazione']];
function navButtons(tag){return NAV_ITEMS.map(([v,ic,l])=>`<button class="${state.view===v?'active':''}" onclick="go('${v}')"><span>${ic}</span><${tag}>${l}</${tag}></button>`).join('')}
function menuDropdown(){if(!state.menuOpen)return'';return `<div class="topMenu" role="menu"><button class="topMenuClose" onclick="toggleMainMenu()" aria-label="Chiudi menu">✕</button><img class="topMenuLogo" src="${logoWordmark()}" alt="TOTIME">${navButtons('b')}</div>`}
function backControl(){if(!state.history.length||state.view==='home')return'';return `<button class="backArrow" onclick="back()" aria-label="Indietro" title="Indietro">‹</button>`}

function groupSummary(){
  const map={};
  rowsForMonth().forEach(e=>{const k=`${e.client_id}|${e.project_id||''}|daily_rate_8h`; if(!map[k]) map[k]={client_id:e.client_id,project_id:e.project_id,type:'daily_rate_8h',label:'Consulenza',hours:0,amount:0,items:[]}; map[k].hours+=Number(e.hours||0); map[k].amount+=dailyAmount(e); map[k].items.push(e)});
  monthlyRows().forEach(e=>{const k=`${e.client_id}|${e.project_id||''}|monthly_flat`; if(!map[k]) map[k]={client_id:e.client_id,project_id:e.project_id,type:'monthly_flat',label:'Compenso mensile',hours:null,amount:0,items:[]}; map[k].amount+=Number(e.amount||0); map[k].items.push(e)});
  manualRows().forEach(e=>{const k=`${e.client_id}|${e.project_id||''}|manual_entry`; if(!map[k]) map[k]={client_id:e.client_id,project_id:e.project_id,type:'manual_entry',label:'Consuntivo manuale',hours:null,amount:0,items:[]}; map[k].amount+=Number(e.amount||0); map[k].items.push(e)});
  expenseRows().forEach(e=>{const k=`${e.client_id}|${e.project_id||''}|travel_expenses`; if(!map[k]) map[k]={client_id:e.client_id,project_id:e.project_id,type:'travel_expenses',label:'Spese di trasferta',hours:null,amount:0,items:[]}; map[k].amount+=Number(e.amount||0); map[k].items.push(e)});
  return Object.values(map).sort((a,b)=>`${clientName(a.client_id)}|${projectName(a.project_id)||''}|${a.type}`.localeCompare(`${clientName(b.client_id)}|${projectName(b.project_id)||''}|${b.type}`));
}
function renderTemplate(tpl,row){
  const fallback={daily_rate_8h:'Consulenza - [Mese Anno] - Cliente/Progetto: [Progetto] | Giorni: [Giorni]',monthly_flat:'Consulenza - [Mese Anno] - Cliente/Progetto: [Progetto]',manual_entry:'Prestazione professionale - [Mese Anno] - Cliente/Progetto: [Progetto]',travel_expenses:'Spese di trasferta - [Mese Anno] - Cliente/Progetto: [Progetto]'}[row.type]||'[Mese Anno] - [Progetto]';
  const text=(tpl?.template_text||fallback);
  const project=projectName(row.project_id)||clientName(row.client_id)||'';
  return text.replaceAll('[Mese Anno]',monthLabel(state.month)).replaceAll('[Progetto]',project).replaceAll('[Cliente]',clientName(row.client_id)||'').replaceAll('[Giorni]',fmtNum((row.hours||0)/8,1)).replaceAll('[Ore]',fmtNum(row.hours||0,1)).replaceAll('[Importo]',fmtEUR(row.amount||0));
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
  const arr=Array.from({length:12},(_,i)=>({month:i+1,label:monthNames[i].slice(0,3),consuntivato:0,fatturato:0,incassato:0}));
  rowsForYear(year).forEach(e=>arr[monthIndexFromDate(e.entry_date)].consuntivato+=dailyAmount(e));
  monthlyRowsForYear(year).forEach(e=>arr[Number(e.month||1)-1].consuntivato+=Number(e.amount||0));
  manualRowsForYear(year).forEach(e=>arr[monthIndexFromDate(e.entry_date)].consuntivato+=Number(e.amount||0));
  expenseRowsForYear(year).forEach(e=>arr[monthIndexFromDate(e.expense_date)].consuntivato+=Number(e.amount||0));
  data.billingHeaders.filter(h=>Number(h.year)===Number(year)).forEach(h=>{const i=Number(h.month||1)-1;const inv=Number(h.invoice_total_amount||h.total_amount||0);if(['invoice_issued','collected'].includes(h.status))arr[i].fatturato+=inv;if(h.status==='collected')arr[i].incassato+=Number(h.collected_amount||inv||0)});
  return arr;
}
function annualTotals(year=currentYear()){const a=annualMonthData(year);const t=a.reduce((t,m)=>{t.consuntivato+=m.consuntivato;t.fatturato+=m.fatturato;t.incassato+=m.incassato;return t},{consuntivato:0,fatturato:0,incassato:0,daIncassare:0});t.daIncassare=Math.max(0,t.fatturato-t.incassato);return t}
function currentTaxSetting(year=currentYear()){return data.taxSettings.find(t=>Number(t.fiscal_year)===Number(year))||{fiscal_year:year,regime:'forfettario',ateco_code:'62.20.10',ateco_description:'Consulenza informatica',profitability_coefficient:67,substitute_tax_rate:5,inps_recharge_enabled:true,inps_recharge_rate:4,stamp_duty_enabled:true,stamp_duty_amount:2,annual_revenue_limit:85000,activity_start_date:DEFAULT_DEFAULT_ACTIVITY_START_DATE,projection_method:'weighted_average',projection_excluded_months:[],projection_include_current_month:true,projection_prudent_factor:0.85,projection_optimistic_factor:1.10,risk_low_threshold:70,risk_medium_threshold:90,risk_high_threshold:100}}
function annualTaxCalc(year=currentYear()){
  const ts=currentTaxSetting(year);const totalsY=annualTotals(year);
  const revenue=totalsY.incassato;const coeff=Number(ts.profitability_coefficient||0)/100;const taxRate=Number(ts.substitute_tax_rate||0)/100;
  const paidContrib=data.taxPayments.filter(p=>Number(p.fiscal_year)===Number(year)&&String(p.payment_type||'').includes('inps')&&p.status==='paid').reduce((s,p)=>s+Number(p.amount||0),0);
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
    const {error}=await sb.from('user_profiles').insert(payload); if(error)console.warn('user_profiles insert',error);
  }catch(e){console.warn('ensureUserProfileFromMetadata',e)}
}

function appShell(content){return `<div class="shell"><aside class="sidebar"><div class="sidebarBrand"><img class="sidebarLogo" src="${logoWordmark()}" alt="TOTIME" onclick="go('home')" role="button" title="Torna alla Home"></div><nav class="sidebarNav">${navButtons('b')}</nav><div class="sidebarFoot"><div class="version">${APP_VERSION} · Database Edition</div></div></aside><div class="shellMain"><div class="topbar"><div class="headerMenuWrap"><button class="headerIcon" onclick="toggleMainMenu()" title="Apri menu" aria-label="Apri menu">☰</button>${menuDropdown()}</div><img class="topbarLogo" src="${logoIcon()}" alt="TOTIME" onclick="go('home')" role="button" title="Torna alla Home"><button class="headerIcon" onclick="go('settings')" title="Configurazione">⚙</button></div><div class="app">${backControl()}${state.message?`<div class="toast">${esc(state.message)}</div>`:''}${content}<div class="version mobileVersion">${APP_VERSION} · Database Edition</div></div></div></div>`}
function monthSelector(){return `<div class="month"><button onclick="changeMonth(-1)">‹</button><strong>${monthLabel(state.month)}</strong><button onclick="changeMonth(1)">›</button></div>`}
function loadingView(){return `<div class="authScreen"><div class="authBox"><img class="authLogo" src="${logoWordmark()}" alt="TOTIME"><h1>Caricamento...</h1><p class="sub">Connessione al database Supabase.</p></div></div>`}
function switchAuthView(v){state.view=v;state.message='';render()}
function loginView(){return `<div class="authScreen"><div class="authBox"><img class="authLogo" src="${logoWordmark()}" alt="TOTIME"><h1>Accedi al tuo profilo</h1>${state.message?`<p class="small">${esc(state.message)}</p>`:''}<div class="card authCard"><form class="form" onsubmit="signIn(event)"><div class="field"><label>Email</label><input name="email" type="email" placeholder="Inserisci il tuo indirizzo email" autocomplete="email" required></div><div class="field"><label>Password</label><input name="password" type="password" placeholder="Inserisci la tua password" autocomplete="current-password" required></div><a href="#" class="small forgotLink" onclick="event.preventDefault();switchAuthView('forgotPassword')">Password dimenticata?</a><button class="primary">Accedi</button></form></div><p class="sub authSwitch">Non hai un account? <a href="#" onclick="event.preventDefault();switchAuthView('register')">Registrati</a></p></div></div>`}
function forgotPasswordView(){return `<div class="authScreen"><div class="authBox"><img class="authLogo" src="${logoWordmark()}" alt="TOTIME"><h1>Recupera password</h1><p class="sub">Inserisci l'email del tuo account: ti mandiamo un link per reimpostare la password.</p>${state.message?`<p class="small">${esc(state.message)}</p>`:''}<div class="card authCard"><form class="form" onsubmit="requestPasswordReset(event)"><div class="field"><label>Email</label><input name="email" type="email" placeholder="Inserisci il tuo indirizzo email" autocomplete="email" required></div><button class="primary">Invia link di reset</button></form></div><p class="sub authSwitch">Ricordi la password? <a href="#" onclick="event.preventDefault();switchAuthView('login')">Torna al login</a></p></div></div>`}
function resetPasswordView(){return `<div class="authScreen"><div class="authBox"><img class="authLogo" src="${logoWordmark()}" alt="TOTIME"><h1>Imposta nuova password</h1><p class="sub">Scegli una nuova password per il tuo account TOTIME.</p>${state.message?`<p class="small">${esc(state.message)}</p>`:''}<div class="card authCard"><form class="form" onsubmit="updatePassword(event)"><div class="field"><label>Nuova password</label><input name="password" type="password" placeholder="Almeno 6 caratteri" minlength="6" autocomplete="new-password" required></div><button class="primary">Salva nuova password</button></form></div></div></div>`}
async function requestPasswordReset(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));state.message='Invio link in corso...';render();const {error}=await sb.auth.resetPasswordForEmail(f.email,{redirectTo:location.origin+location.pathname});if(error)return setMsg(error.message,7000);state.message="Se l'indirizzo esiste riceverai un'email con il link per reimpostare la password. Controlla anche lo spam.";render()}
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
    const {error:profileError}=await sb.from('user_profiles').insert({user_id:userId,first_name:f.first_name,last_name:f.last_name,company_name:f.company_name,vat_number:f.vat_number,email:f.email});
    if(profileError && !String(profileError.message||'').includes('duplicate')) console.warn(profileError);
  }
  await sb.auth.signOut(); session=null; state.view='login';
  state.message=signData?.session?'Registrazione completata. Accedi con le credenziali scelte.':"Registrazione completata. Controlla la tua email (anche lo spam) e clicca il link di conferma prima di accedere.";
  render();
}
async function logout(){await sb.auth.signOut()}

function monthSeries(){const {year,month}=periodParts();const last=new Date(year,month,0).getDate();const daily=Array(last).fill(0);rowsForMonth().forEach(e=>{const d=Number(String(e.entry_date).slice(8,10));if(d>=1&&d<=last)daily[d-1]+=dailyAmount(e)});manualRows().forEach(e=>{const d=Number(String(e.entry_date).slice(8,10));if(d>=1&&d<=last)daily[d-1]+=Number(e.amount||0)});expenseRows().forEach(e=>{const d=Number(String(e.expense_date).slice(8,10));if(d>=1&&d<=last)daily[d-1]+=Number(e.amount||0)});let cum=0;return daily.map(v=>cum+=v)}
function annualChartSvg(){
  const year=currentYear();
  const rows=annualMonthData(year).map(x=>x.consuntivato);
  const now=new Date();
  const actualEnd=year<now.getFullYear()?11:(year===now.getFullYear()?now.getMonth():-1);
  const visible=actualEnd>=0?rows.slice(0,actualEnd+1):[];
  const max=Math.max(...visible,1);
  const pts=visible.map((v,i)=>`${(i/11)*100},${52-(v/max)*46}`).join(' ');
  return `<div class="annualChartBox"><svg class="lineChart" viewBox="0 0 100 58" preserveAspectRatio="none"><line x1="0" y1="52" x2="100" y2="52"></line><line x1="0" y1="30" x2="100" y2="30"></line>${pts?`<polyline points="${pts}"></polyline>`:''}</svg><div class="chartMonths">${monthNames.map((m,i)=>`<span class="${i>actualEnd?'future':''}">${m.slice(0,3)}</span>`).join('')}</div></div>`
}
function monthChartSvg(){const series=monthSeries();const max=Math.max(...series,1);const pts=series.map((v,i)=>`${(i/(series.length-1||1))*100},${52-(v/max)*46}`).join(' ');return `<svg class="lineChart" viewBox="0 0 100 58" preserveAspectRatio="none"><line x1="0" y1="52" x2="100" y2="52"></line><line x1="0" y1="30" x2="100" y2="30"></line><polyline points="${pts}"></polyline></svg>`}
function homeIncassiCard(){const yr=currentYear();const cur=annualTotals(yr);const daIncassare=Math.max(0,cur.fatturato-cur.incassato);return `<div class="card"><b>I tuoi incassi ${yr}</b><div class="kpiGrid" style="margin-top:14px"><div><span>Incassato</span><strong>${fmtEUR(cur.incassato)}</strong></div><div><span>Da incassare</span><strong>${fmtEUR(daIncassare)}</strong></div></div></div>`}
function home(){const t=totals();const y=annualTotals(currentYear());return appShell(`<button class="primary cta" onclick="newEntryChoice()">+ Nuovo consuntivo</button><div class="homeTop">${monthSelector()}</div><div class="card"><b>Consuntivo mese</b><div class="kpiGrid" style="margin-top:14px"><div><span>Ore consuntivate</span><strong>${fmtNum(t.hours,1)} h</strong><small>${fmtNum(t.days,1)} gg/u</small></div><div><span>Importo mese</span><strong>${fmtEUR(t.amount)}</strong><small>${monthLabel(state.month)}</small></div></div></div><div class="dashboardCard heroCard"><b>Consuntivato anno ${currentYear()}</b><div class="kpiGrid" style="grid-template-columns:1fr;margin-top:14px"><div style="border-right:0"><span>Anno in corso</span><strong>${fmtEUR(y.consuntivato)}</strong><small>consuntivato</small></div></div><div class="chartWrap"><div class="chartTitle"><span>Andamento reale anno ${currentYear()}</span><span>linea fino al mese corrente</span></div>${annualChartSvg()}</div></div>${homeIncassiCard()}`)}
function newEntryChoice(){navigateTo('newChoice')}
function newChoice(){return appShell(`<h1>Nuovo consuntivo</h1><p class="sub">Cosa vuoi registrare?</p><div class="actions"><button class="menuBtn" onclick="go('dailyForm')"><span><b>Consuntivo giornaliero</b><br><span class='sub'>Ore su tariffa giornaliera 8h</span></span><span>›</span></button><button class="menuBtn" onclick="go('manualForm')"><span><b>Consuntivo manuale</b><br><span class='sub'>Importo libero, non legato a ore</span></span><span>›</span></button><button class="menuBtn" onclick="go('monthlyForm')"><span><b>Compenso mensile</b><br><span class='sub'>Una tantum senza ore e giorni</span></span><span>›</span></button><button class="menuBtn" onclick="go('expenseForm')"><span><b>Spesa di trasferta</b><br><span class='sub'>Rimborso KM, hotel, pranzo, parcheggio...</span></span><span>›</span></button></div>`)}
function sediOptions(selected=''){const sedi=['Remoto','Casa','Ufficio','Sede cliente','Onsite cliente','Altro'];return `<option></option>${sedi.map(x=>`<option value="${esc(x)}" ${x===selected?'selected':''}>${esc(x)}</option>`).join('')}`}
function projectOptions(clientId,selected=''){return `<option value=""></option>${data.projects.filter(p=>p.active&&p.client_id===clientId).map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('')}`}
function activityOptions(selected=''){return `<option value=""></option>${data.activities.filter(a=>a.active).map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.name)}</option>`).join('')}`}
function expenseOptions(selected=''){return `<option value=""></option>${data.expenseCategories.filter(x=>x.active).map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${esc(x.name)}</option>`).join('')}`}
function refreshProjectsForForm(form){const client=form.client_id.value;const project=form.project_id;if(project)project.innerHTML=projectOptions(client,'')}
function activeClients(){return data.clients.filter(c=>c.active)}
function dailyClients(){return data.clients.filter(c=>c.compensation_type==='daily_rate_8h'&&c.active)}
function monthlyClients(){return data.clients.filter(c=>c.compensation_type==='monthly_flat'&&c.active)}

function dailyForm(){const clients=dailyClients();const selected=clients[0]?.id||'';return appShell(`<h1>Consuntivo giornaliero</h1>${clients.length?`<form class="form" onsubmit="saveDaily(event)"><div class="field"><label>Data</label><input name="entry_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(selected)}</select></div><div class="field"><label>Attività</label><select name="activity_id">${activityOptions()}</select></div><div class="field"><label>Sede</label><select name="work_site">${sediOptions()}</select></div><div class="field"><label>Luogo/Città</label><input name="work_city" placeholder="Es. Verona, Milano, Canicattì"></div><div class="field"><label>Descrizione</label><textarea name="description"></textarea></div><div class="field"><label>Ore consuntivate</label><input name="hours" type="number" step="0.25" value="8"></div><div class="field"><label>Note</label><textarea name="notes" placeholder="Note interne opzionali"></textarea></div><div class="actions"><button class="primary">Salva</button><button type="button" class="secondary" onclick="go('home')">Annulla</button></div></form>`:`<div class="card">Crea prima un cliente con tariffa giornaliera in Configurazione.</div>`}`)}
async function saveDaily(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const c=clientById(f.client_id);const payload={entry_date:f.entry_date,client_id:f.client_id,project_id:f.project_id||null,activity_id:f.activity_id||null,work_location:[norm(f.work_site),norm(f.work_city)].filter(Boolean).join(' - ')||null,work_site:norm(f.work_site)||null,work_city:norm(f.work_city)||null,description:f.description||null,notes:f.notes||null,hours:Number(f.hours||0),daily_rate_snapshot:Number(c?.daily_rate||0),standard_hours_snapshot:Number(c?.standard_hours||8)};const {error}=await sb.from('timesheet_entries').insert(payload);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
function dailyEdit(){const e=data.entries.find(x=>x.id===state.edit);if(!e)return timesheet();const clients=dailyClients();return appShell(`<h1>Modifica consuntivo</h1><form class="form" onsubmit="saveDailyEdit(event)"><div class="field"><label>Data</label><input name="entry_date" type="date" value="${esc(e.entry_date)}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}" ${c.id===e.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(e.client_id,e.project_id||'')}</select></div><div class="field"><label>Attività</label><select name="activity_id">${activityOptions(e.activity_id||'')}</select></div><div class="field"><label>Sede</label><select name="work_site">${sediOptions(e.work_site||'')}</select></div><div class="field"><label>Luogo/Città</label><input name="work_city" value="${esc(e.work_city||'')}" placeholder="Es. Verona, Milano, Canicattì"></div><div class="field"><label>Descrizione</label><textarea name="description">${esc(e.description||'')}</textarea></div><div class="field"><label>Ore consuntivate</label><input name="hours" type="number" step="0.25" value="${Number(e.hours||0)}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(e.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary" onclick="duplicateDaily('${e.id}')">Duplica</button><button type="button" class="secondary danger" onclick="deleteDaily('${e.id}')">Elimina</button><button type="button" class="secondary" onclick="go('timesheet')">Annulla</button></div></form>`)}
async function saveDailyEdit(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const c=clientById(f.client_id);const payload={entry_date:f.entry_date,client_id:f.client_id,project_id:f.project_id||null,activity_id:f.activity_id||null,work_location:[norm(f.work_site),norm(f.work_city)].filter(Boolean).join(' - ')||null,work_site:norm(f.work_site)||null,work_city:norm(f.work_city)||null,description:f.description||null,notes:f.notes||null,hours:Number(f.hours||0),daily_rate_snapshot:Number(c?.daily_rate||0),standard_hours_snapshot:Number(c?.standard_hours||8)};const {error}=await sb.from('timesheet_entries').update(payload).eq('id',state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';state.edit=null;render()}
async function duplicateDaily(idv){const e=data.entries.find(x=>x.id===idv);if(!e)return;const copy={entry_date:new Date().toISOString().slice(0,10),client_id:e.client_id,project_id:e.project_id,activity_id:e.activity_id,work_location:e.work_location,work_site:e.work_site,work_city:e.work_city,description:e.description,notes:e.notes,hours:e.hours,daily_rate_snapshot:e.daily_rate_snapshot,standard_hours_snapshot:e.standard_hours_snapshot};const {error}=await sb.from('timesheet_entries').insert(copy);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
async function deleteDaily(idv){if(!confirm('Eliminare questo consuntivo?'))return;const {error}=await sb.from('timesheet_entries').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}

function monthlyForm(){const clients=monthlyClients();const selected=clients[0]?.id||'';return appShell(`<h1>Compenso mensile</h1>${clients.length?`<form class="form" onsubmit="saveMonthly(event)"><div class="field"><label>Mese</label><input name="month" type="month" value="${state.month}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(selected)}</select></div><div class="field"><label>Descrizione</label><textarea name="description"></textarea></div><div class="field"><label>Importo</label><input name="amount" type="number" step="0.01" value="0"></div><div class="field"><label>Note</label><textarea name="notes" placeholder="Note interne opzionali"></textarea></div><div class="actions"><button class="primary">Salva</button><button type="button" class="secondary" onclick="go('home')">Annulla</button></div></form>`:`<div class="card">Crea prima un cliente una tantum mensile in Configurazione.</div>`}`)}
async function saveMonthly(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const [year,month]=String(f.month||state.month).split('-').map(Number);const payload={year,month,client_id:f.client_id,project_id:f.project_id||null,description:f.description||null,notes:f.notes||null,amount:Number(f.amount||0)};const {error}=await sb.from('monthly_compensations').insert(payload);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
function monthlyEdit(){const m=data.monthly.find(x=>x.id===state.edit);if(!m)return timesheet();const clients=monthlyClients();const mm=`${m.year}-${String(m.month).padStart(2,'0')}`;return appShell(`<h1>Modifica compenso mensile</h1><form class="form" onsubmit="saveMonthlyEdit(event)"><div class="field"><label>Mese</label><input name="month" type="month" value="${mm}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}" ${c.id===m.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(m.client_id,m.project_id||'')}</select></div><div class="field"><label>Descrizione</label><textarea name="description">${esc(m.description||'')}</textarea></div><div class="field"><label>Importo</label><input name="amount" type="number" step="0.01" value="${Number(m.amount||0)}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(m.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary" onclick="duplicateMonthly('${m.id}')">Duplica</button><button type="button" class="secondary danger" onclick="deleteMonthly('${m.id}')">Elimina</button><button type="button" class="secondary" onclick="go('timesheet')">Annulla</button></div></form>`)}
async function saveMonthlyEdit(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const [year,month]=String(f.month||state.month).split('-').map(Number);const payload={year,month,client_id:f.client_id,project_id:f.project_id||null,description:f.description||null,notes:f.notes||null,amount:Number(f.amount||0)};const {error}=await sb.from('monthly_compensations').update(payload).eq('id',state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';state.edit=null;render()}
async function duplicateMonthly(idv){const m=data.monthly.find(x=>x.id===idv);if(!m)return;const {year,month}=periodParts();const copy={year,month,client_id:m.client_id,project_id:m.project_id,description:m.description,notes:m.notes,amount:m.amount};const {error}=await sb.from('monthly_compensations').insert(copy);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
async function deleteMonthly(idv){if(!confirm('Eliminare questo compenso mensile?'))return;const {error}=await sb.from('monthly_compensations').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}

function manualForm(){const clients=activeClients();const selected=clients[0]?.id||'';return appShell(`<h1>Consuntivo manuale</h1>${clients.length?`<form class="form" onsubmit="saveManual(event)"><div class="field"><label>Data</label><input name="entry_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(selected)}</select></div><div class="field"><label>Attività</label><select name="activity_id">${activityOptions()}</select></div><div class="field"><label>Sede</label><select name="work_site">${sediOptions()}</select></div><div class="field"><label>Luogo/Città</label><input name="work_city"></div><div class="field"><label>Descrizione</label><textarea name="description"></textarea></div><div class="field"><label>Importo manuale</label><input name="amount" type="number" step="0.01" value="0"></div><div class="field"><label>Note</label><textarea name="notes"></textarea></div><div class="actions"><button class="primary">Salva</button><button type="button" class="secondary" onclick="go('home')">Annulla</button></div></form>`:`<div class="card">Crea prima un cliente in Configurazione.</div>`}`)}
async function saveManual(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={entry_date:f.entry_date,client_id:f.client_id,project_id:f.project_id||null,activity_id:f.activity_id||null,work_site:norm(f.work_site)||null,work_city:norm(f.work_city)||null,description:f.description||null,amount:Number(f.amount||0),notes:f.notes||null};const {error}=await sb.from('manual_entries').insert(payload);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
function manualEdit(){const e=data.manualEntries.find(x=>x.id===state.edit);if(!e)return timesheet();const clients=activeClients();return appShell(`<h1>Modifica consuntivo manuale</h1><form class="form" onsubmit="saveManualEdit(event)"><div class="field"><label>Data</label><input name="entry_date" type="date" value="${esc(e.entry_date)}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}" ${c.id===e.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(e.client_id,e.project_id||'')}</select></div><div class="field"><label>Attività</label><select name="activity_id">${activityOptions(e.activity_id||'')}</select></div><div class="field"><label>Sede</label><select name="work_site">${sediOptions(e.work_site||'')}</select></div><div class="field"><label>Luogo/Città</label><input name="work_city" value="${esc(e.work_city||'')}"></div><div class="field"><label>Descrizione</label><textarea name="description">${esc(e.description||'')}</textarea></div><div class="field"><label>Importo manuale</label><input name="amount" type="number" step="0.01" value="${Number(e.amount||0)}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(e.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary" onclick="duplicateManual('${e.id}')">Duplica</button><button type="button" class="secondary danger" onclick="deleteManual('${e.id}')">Elimina</button><button type="button" class="secondary" onclick="go('timesheet')">Annulla</button></div></form>`)}
async function saveManualEdit(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={entry_date:f.entry_date,client_id:f.client_id,project_id:f.project_id||null,activity_id:f.activity_id||null,work_site:norm(f.work_site)||null,work_city:norm(f.work_city)||null,description:f.description||null,amount:Number(f.amount||0),notes:f.notes||null};const {error}=await sb.from('manual_entries').update(payload).eq('id',state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';state.edit=null;render()}
async function duplicateManual(idv){const e=data.manualEntries.find(x=>x.id===idv);if(!e)return;const copy={entry_date:new Date().toISOString().slice(0,10),client_id:e.client_id,project_id:e.project_id,activity_id:e.activity_id,work_site:e.work_site,work_city:e.work_city,description:e.description,amount:e.amount,notes:e.notes};const {error}=await sb.from('manual_entries').insert(copy);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
async function deleteManual(idv){if(!confirm('Eliminare questo consuntivo manuale?'))return;const {error}=await sb.from('manual_entries').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}

function expenseForm(){const clients=activeClients();const selected=clients[0]?.id||'';return appShell(`<h1>Spesa di trasferta</h1>${clients.length?`<form class="form" onsubmit="saveExpense(event)"><div class="field"><label>Data</label><input name="expense_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(selected)}</select></div><div class="field"><label>Voce spesa</label><select name="expense_category_id" onchange="updateExpenseCalc(this.form)">${expenseOptions()}</select></div><div class="field"><label>Sede</label><select name="work_site">${sediOptions()}</select></div><div class="field"><label>Luogo/Città</label><input name="work_city"></div><div class="field"><label>Descrizione</label><textarea name="description"></textarea></div><div class="field"><label>Quantità</label><input name="quantity" type="number" step="0.01" value="1" oninput="updateExpenseCalc(this.form)"></div><div class="field"><label>Tariffa / importo unitario</label><input name="unit_rate" type="number" step="0.0001" value="0" oninput="updateExpenseCalc(this.form)"></div><div class="field"><label>Importo totale</label><input name="amount" type="number" step="0.01" value="0"></div><div class="field"><label>Note</label><textarea name="notes"></textarea></div><div class="actions"><button class="primary">Salva</button><button type="button" class="secondary" onclick="go('home')">Annulla</button></div></form>`:`<div class="card">Crea prima un cliente in Configurazione.</div>`}`)}
function updateExpenseCalc(form){const cat=expenseCategoryById(form.expense_category_id?.value);if(!cat)return; if(cat.calculation_type==='quantity_rate'){if((!form.unit_rate.value||Number(form.unit_rate.value)===0)&&cat.default_unit_rate)form.unit_rate.value=Number(cat.default_unit_rate);form.amount.value=(Number(form.quantity.value||0)*Number(form.unit_rate.value||0)).toFixed(2)}}
async function saveExpense(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={expense_date:f.expense_date,client_id:f.client_id,project_id:f.project_id||null,expense_category_id:f.expense_category_id,work_site:norm(f.work_site)||null,work_city:norm(f.work_city)||null,description:f.description||null,quantity:Number(f.quantity||0)||null,unit_rate:Number(f.unit_rate||0)||null,amount:Number(f.amount||0),notes:f.notes||null};const {error}=await sb.from('travel_expenses').insert(payload);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
function expenseEdit(){const e=data.travelExpenses.find(x=>x.id===state.edit);if(!e)return timesheet();const clients=activeClients();return appShell(`<h1>Modifica spesa di trasferta</h1><form class="form" onsubmit="saveExpenseEdit(event)"><div class="field"><label>Data</label><input name="expense_date" type="date" value="${esc(e.expense_date)}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)">${clients.map(c=>`<option value="${c.id}" ${c.id===e.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id">${projectOptions(e.client_id,e.project_id||'')}</select></div><div class="field"><label>Voce spesa</label><select name="expense_category_id" onchange="updateExpenseCalc(this.form)">${expenseOptions(e.expense_category_id||'')}</select></div><div class="field"><label>Sede</label><select name="work_site">${sediOptions(e.work_site||'')}</select></div><div class="field"><label>Luogo/Città</label><input name="work_city" value="${esc(e.work_city||'')}"></div><div class="field"><label>Descrizione</label><textarea name="description">${esc(e.description||'')}</textarea></div><div class="field"><label>Quantità</label><input name="quantity" type="number" step="0.01" value="${Number(e.quantity||0)}" oninput="updateExpenseCalc(this.form)"></div><div class="field"><label>Tariffa / importo unitario</label><input name="unit_rate" type="number" step="0.0001" value="${Number(e.unit_rate||0)}" oninput="updateExpenseCalc(this.form)"></div><div class="field"><label>Importo totale</label><input name="amount" type="number" step="0.01" value="${Number(e.amount||0)}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(e.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary" onclick="duplicateExpense('${e.id}')">Duplica</button><button type="button" class="secondary danger" onclick="deleteExpense('${e.id}')">Elimina</button><button type="button" class="secondary" onclick="go('timesheet')">Annulla</button></div></form>`)}
async function saveExpenseEdit(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={expense_date:f.expense_date,client_id:f.client_id,project_id:f.project_id||null,expense_category_id:f.expense_category_id,work_site:norm(f.work_site)||null,work_city:norm(f.work_city)||null,description:f.description||null,quantity:Number(f.quantity||0)||null,unit_rate:Number(f.unit_rate||0)||null,amount:Number(f.amount||0),notes:f.notes||null};const {error}=await sb.from('travel_expenses').update(payload).eq('id',state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';state.edit=null;render()}
async function duplicateExpense(idv){const e=data.travelExpenses.find(x=>x.id===idv);if(!e)return;const copy={expense_date:new Date().toISOString().slice(0,10),client_id:e.client_id,project_id:e.project_id,expense_category_id:e.expense_category_id,work_site:e.work_site,work_city:e.work_city,description:e.description,quantity:e.quantity,unit_rate:e.unit_rate,amount:e.amount,notes:e.notes};const {error}=await sb.from('travel_expenses').insert(copy);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}
async function deleteExpense(idv){if(!confirm('Eliminare questa spesa di trasferta?'))return;const {error}=await sb.from('travel_expenses').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='timesheet';render()}

function editEntry(id,type){navigateTo(type==='monthly'?'monthlyEdit':type==='manual'?'manualEdit':type==='expense'?'expenseEdit':'dailyEdit',{edit:id})}
function timesheet(){const rows=rowsForMonth().map(e=>({...e,kind:'daily',date:e.entry_date})).concat(monthlyRows().map(m=>({...m,kind:'monthly',date:`${m.year}-${String(m.month).padStart(2,'0')}-01`}))).concat(manualRows().map(e=>({...e,kind:'manual',date:e.entry_date}))).concat(expenseRows().map(e=>({...e,kind:'expense',date:e.expense_date}))).sort((a,b)=>String(b.date).localeCompare(String(a.date)));const t=totals();return appShell(`<h1>Timesheet</h1>${monthSelector()}<div class="card"><b>Totale operativo</b><div class="sub">${fmtNum(t.hours,1)} h · ${fmtNum(t.days,1)} gg/u</div></div><button class="primary" onclick="newEntryChoice()">+ Nuovo consuntivo</button><div class="list">${rows.map(r=>timesheetRow(r)).join('')||'<div class="empty">Nessun consuntivo nel mese.</div>'}</div>`)}
function timesheetRow(r){if(r.kind==='daily')return `<div class="row" onclick="editEntry('${r.id}','daily')"><div class="date">${dateIT(r.entry_date)}</div><div><div class="title">${esc(clientName(r.client_id))}${projectName(r.project_id)?' / '+esc(projectName(r.project_id)):''}</div><div class="desc">${esc(activityName(r.activity_id)||'')} ${r.work_site||r.work_city?'· '+esc([r.work_site,r.work_city].filter(Boolean).join(' - ')):''}</div><div class="desc">${esc(r.description||'')}</div>${r.notes?`<div class="desc">Note: ${esc(r.notes)}</div>`:''}</div><div class="value">${fmtNum(r.hours,1)} h</div></div>`;
if(r.kind==='monthly')return `<div class="row" onclick="editEntry('${r.id}','monthly')"><div class="date">${String(r.month).padStart(2,'0')}/${r.year}</div><div><div class="title">${esc(clientName(r.client_id))}${projectName(r.project_id)?' / '+esc(projectName(r.project_id)):''}</div><div class="desc">Una tantum mensile</div><div class="desc">${esc(r.description||'')}</div></div><div class="value">Mensile</div></div>`;
if(r.kind==='manual')return `<div class="row" onclick="editEntry('${r.id}','manual')"><div class="date">${dateIT(r.entry_date)}</div><div><div class="title">${esc(clientName(r.client_id))}${projectName(r.project_id)?' / '+esc(projectName(r.project_id)):''}</div><div class="desc">Manuale · ${esc(activityName(r.activity_id)||'')} ${r.work_site||r.work_city?'· '+esc([r.work_site,r.work_city].filter(Boolean).join(' - ')):''}</div><div class="desc">${esc(r.description||'')}</div></div><div class="value">Manuale</div></div>`;
return `<div class="row" onclick="editEntry('${r.id}','expense')"><div class="date">${dateIT(r.expense_date)}</div><div><div class="title">${esc(clientName(r.client_id))}${projectName(r.project_id)?' / '+esc(projectName(r.project_id)):''}</div><div class="desc">Spesa · ${esc(expenseCategoryName(r.expense_category_id))} ${r.work_site||r.work_city?'· '+esc([r.work_site,r.work_city].filter(Boolean).join(' - ')):''}</div><div class="desc">${esc(r.description||'')}</div></div><div class="value">Spesa</div></div>`}

function annualSummaryCard(){const y=currentYear();const at=annualTotals(y);return `<div class="card"><b>Riepilogo annuale ${y}</b><div class="kpiGrid three" style="margin-top:14px"><div><span>Consuntivato</span><strong>${fmtEUR(at.consuntivato)}</strong></div><div><span>Fatturato</span><strong>${fmtEUR(at.fatturato)}</strong></div><div><span>Incassato</span><strong>${fmtEUR(at.incassato)}</strong></div></div><div class="metricLine" style="margin-top:12px">Da incassare <span class="dot">·</span> ${fmtEUR(at.daIncassare)}</div></div>`}
function summary(){const groups=groupSummary();const t=totals();return appShell(`<h1>Riepilogo</h1>${monthSelector()}${annualSummaryCard()}<div class="card"><b>Totale mese</b><div class="metricLine">${metricLine(t.hours,t.amount)}</div><div class="chartWrap"><div class="chartTitle"><span>Andamento mese</span><span>1 → fine mese</span></div>${monthChartSvg()}</div></div><div class="list">${groups.map(r=>`<div class="row summaryRow"><div></div><div><div class="title">${esc(clientName(r.client_id))}</div><div class="desc">${esc(projectName(r.project_id)||'Senza progetto')} · ${esc(r.label)}</div><div class="metricLine">${r.type==='daily_rate_8h'?metricLine(r.hours,r.amount):amountLine(r.label,r.amount)}</div></div><div class="value"></div></div>`).join('')||'<div class="empty">Nessun riepilogo.</div>'}</div>`)}
function billingGroupsByClient(){const lines=groupSummary();const by={};lines.forEach(l=>{if(!by[l.client_id])by[l.client_id]={client_id:l.client_id,lines:[],baseTotal:0,total:0,hours:0};by[l.client_id].lines.push(l);by[l.client_id].baseTotal+=Number(l.amount||0);by[l.client_id].hours+=Number(l.hours||0)});Object.values(by).forEach(g=>{const header=headerForClient(g.client_id)||{};g.calc=billingCalc(g,header);g.total=g.calc.total});return Object.values(by).sort((a,b)=>clientName(a.client_id).localeCompare(clientName(b.client_id)))}
function billing(){const groups=billingGroupsByClient();const total=groups.reduce((s,g)=>s+g.total,0);return appShell(`<h1>Fatturazione</h1>${monthSelector()}<div class="card"><b>Totale fatturazione mese</b><div class="amount" style="font-size:30px;margin-top:8px">${fmtEUR(total)}</div><div class="sub">Include eventuale rivalsa INPS 4% e marca da bollo se attive.</div></div><div class="list">${groups.map(g=>{const st=headerStatus(g.client_id);return `<div class="row" onclick="openBillingClient('${g.client_id}')"><div></div><div><div class="title">${esc(clientName(g.client_id))}</div><div class="metricLine">${metricLine(g.hours,g.total)}</div><div class="desc">Base ${fmtEUR(g.calc.subtotal)} · Rivalsa ${fmtEUR(g.calc.inpsAmount)} · Bollo ${fmtEUR(g.calc.stampAmount)}</div><span class="tag ${statusClass(st)}">${statusLabel(st)}</span></div><div class="value">›</div></div>`}).join('')||'<div class="empty">Nessuna riga fatturabile.</div>'}</div>`)}
function openBillingClient(clientId){navigateTo('billingDetail',{edit:clientId})}
function billingDetailView(){const clientId=state.edit;const group=billingGroupsByClient().find(g=>g.client_id===clientId);if(!group)return billing();const header=headerForClient(clientId)||{};const st=header.status||'to_invoice';const calc=billingCalc(group,header);const inpsText=renderTemplate(invoiceTemplateByCode('RIVALSA_INPS_4'),{type:'manual_entry',client_id:clientId,project_id:null,amount:calc.inpsAmount,hours:0});const bolloText=renderTemplate(invoiceTemplateByCode('MARCA_BOLLO'),{type:'manual_entry',client_id:clientId,project_id:null,amount:calc.stampAmount,hours:0});return appShell(`<h1>${esc(clientName(clientId))}</h1><p class="sub">Fattura ${monthLabel(state.month)}</p><div class="card"><b>Totale cliente</b><div class="amount" style="font-size:32px;margin-top:8px">${fmtEUR(calc.total)}</div><div class="metricLine">Base ${fmtEUR(calc.subtotal)} <span class="dot">·</span> Rivalsa ${fmtEUR(calc.inpsAmount)} <span class="dot">·</span> Bollo ${fmtEUR(calc.stampAmount)}</div><span class="tag ${statusClass(st)}">${statusLabel(st)}</span></div><h2>Righe Fiscozen</h2><div class="list">${group.lines.map((l,i)=>`<div class="row"><div>${i+1}</div><div><div class="title">${esc(projectName(l.project_id)||'Senza progetto')}</div><div class="desc">${esc(l.label)}</div><div class="metricLine">${l.type==='daily_rate_8h'?metricLine(l.hours,l.amount):amountLine(l.label,l.amount)}</div><div class="copybox" id="copy-${i}">${esc(fiscoText(l))}</div><button class="secondary" onclick="copyText('${esc(fiscoText(l)).replace(/'/g,'&#39;')}')">Copia descrizione</button></div><div></div></div>`).join('')}${calc.inpsEnabled&&calc.inpsAmount>0?`<div class="row"><div>+</div><div><div class="title">Rivalsa INPS ${fmtNum(calc.inpsRate,2)}%</div><div class="metricLine">${fmtEUR(calc.inpsAmount)}</div><div class="copybox">${esc(inpsText)}</div><button class="secondary" onclick="copyText('${esc(inpsText).replace(/'/g,'&#39;')}')">Copia descrizione</button></div><div></div></div>`:''}${calc.stampEnabled&&calc.stampAmount>0?`<div class="row"><div>+</div><div><div class="title">Marca da bollo</div><div class="metricLine">${fmtEUR(calc.stampAmount)}</div><div class="copybox">${esc(bolloText)}</div><button class="secondary" onclick="copyText('${esc(bolloText).replace(/'/g,'&#39;')}')">Copia descrizione</button></div><div></div></div>`:''}</div><h2>Dati fattura / incasso</h2><form class="form" onsubmit="saveBillingHeader(event)"><div class="field"><label>Stato</label><select name="status"><option value="to_invoice" ${st==='to_invoice'?'selected':''}>Da fatturare</option><option value="invoice_issued" ${st==='invoice_issued'?'selected':''}>Fattura emessa</option><option value="collected" ${st==='collected'?'selected':''}>Incassato</option><option value="excluded" ${st==='excluded'?'selected':''}>Escluso</option></select></div><div class="field"><label>Rivalsa INPS</label><select name="inps_recharge_enabled"><option value="true" ${calc.inpsEnabled?'selected':''}>Sì</option><option value="false" ${!calc.inpsEnabled?'selected':''}>No</option></select></div><div class="field"><label>Percentuale rivalsa INPS</label><input name="inps_recharge_rate" type="number" step="0.01" value="${Number(calc.inpsRate||4)}"></div><div class="field"><label>Marca da bollo</label><select name="stamp_duty_enabled"><option value="true" ${calc.stampEnabled?'selected':''}>Sì</option><option value="false" ${!calc.stampEnabled?'selected':''}>No</option></select></div><div class="field"><label>Importo bollo</label><input name="stamp_duty_amount" type="number" step="0.01" value="${Number(calc.stampAmount||0)||Number(currentTaxSetting().stamp_duty_amount||2)}"></div><div class="field"><label>Numero fattura</label><input name="invoice_number" value="${esc(header.invoice_number||'')}"></div><div class="field"><label>Data fattura</label><input name="invoice_date" type="date" value="${esc(header.invoice_date||'')}"></div><div class="field"><label>Data incasso</label><input name="collection_date" type="date" value="${esc(header.collection_date||'')}"></div><div class="field"><label>Importo incassato</label><input name="collected_amount" type="number" step="0.01" value="${Number(header.collected_amount||0)}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(header.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva stato fattura</button><button type="button" class="secondary" onclick="go('billing')">Indietro</button></div></form>`)}
async function saveBillingHeader(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const clientId=state.edit;const group=billingGroupsByClient().find(g=>g.client_id===clientId);const {year,month}=periodParts();const tempCalc=billingCalc(group,{inps_recharge_enabled:f.inps_recharge_enabled==='true',inps_recharge_rate:Number(f.inps_recharge_rate||4),stamp_duty_enabled:f.stamp_duty_enabled==='true',stamp_duty_amount:Number(f.stamp_duty_amount||0)});const payload={year,month,client_id:clientId,total_amount:Number(tempCalc.subtotal||0),services_amount:tempCalc.services,expenses_amount:tempCalc.expenses,manual_amount:tempCalc.manual,taxable_base_amount:tempCalc.taxableBase,inps_recharge_enabled:tempCalc.inpsEnabled,inps_recharge_rate:tempCalc.inpsRate,inps_recharge_amount:tempCalc.inpsAmount,stamp_duty_enabled:tempCalc.stampEnabled,stamp_duty_amount:tempCalc.stampAmount,invoice_total_amount:tempCalc.total,status:f.status,invoice_number:norm(f.invoice_number)||null,invoice_date:f.invoice_date||null,collection_date:f.collection_date||null,collected_amount:Number(f.collected_amount||0)||null,notes:f.notes||null};const existing=headerForClient(clientId);let error;if(existing){({error}=await sb.from('billing_headers').update(payload).eq('id',existing.id));}else{({error}=await sb.from('billing_headers').insert(payload));}if(error)return setMsg(error.message,7000);await reload();state.view='billingDetail';state.edit=clientId;render()}
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

function tax(){const year=currentYear();const c=annualTaxCalc(year);const ts=c.settings;return appShell(`<div class="screenTitle">Fiscalità</div><p class="sub">Stima regime forfettario per l'anno ${year}. Valori configurabili, da verificare con il consulente fiscale.</p>${projectionCard()}<div class="card"><b>Stima tasse forfettario</b><div class="list" style="box-shadow:none;margin-bottom:0"><div class="row"><div></div><div><div class="title">ATECO ${esc(ts.ateco_code||'')}</div><div class="desc">${esc(ts.ateco_description||'')}</div></div><div></div></div><div class="row"><div></div><div><div class="title">Incassato anno</div><div class="desc">base di calcolo provvisoria</div></div><div class="value">${fmtEUR(c.revenue)}</div></div><div class="row"><div></div><div><div class="title">Reddito forfettario lordo</div><div class="desc">coefficiente ${fmtNum(ts.profitability_coefficient,2)}%</div></div><div class="value">${fmtEUR(c.forfaitIncome)}</div></div><div class="row"><div></div><div><div class="title">Contributi INPS pagati</div><div class="desc">deduzione stimata da pagamenti fiscali</div></div><div class="value">${fmtEUR(c.paidContrib)}</div></div><div class="row"><div></div><div><div class="title">Imponibile fiscale stimato</div><div class="desc">reddito forfettario - contributi</div></div><div class="value">${fmtEUR(c.taxable)}</div></div><div class="row"><div></div><div><div class="title">Imposta sostitutiva stimata</div><div class="desc">aliquota ${fmtNum(ts.substitute_tax_rate,2)}%</div></div><div class="value">${fmtEUR(c.substituteTax)}</div></div><div class="row"><div></div><div><div class="title">Netto stimato dopo imposta</div><div class="desc">incassato - contributi - imposta</div></div><div class="value">${fmtEUR(c.net)}</div></div></div></div><form class="form" onsubmit="saveTaxSettings(event)"><h2>ATECO, regime e tasse</h2><p class="sub">Determinano il calcolo delle tasse sul tuo codice ATECO.</p><div class="field"><label>Anno fiscale</label><input name="fiscal_year" type="number" value="${year}"></div><div class="field"><label>Regime fiscale</label><select name="regime"><option value="forfettario" ${ts.regime==='forfettario'?'selected':''}>Forfettario</option><option value="ordinario" ${ts.regime==='ordinario'?'selected':''}>Ordinario</option><option value="semplificato" ${ts.regime==='semplificato'?'selected':''}>Semplificato</option></select></div><div class="field"><label>Codice ATECO</label><input name="ateco_code" value="${esc(ts.ateco_code||'')}"></div><div class="field"><label>Descrizione ATECO</label><input name="ateco_description" value="${esc(ts.ateco_description||'')}"></div><div class="field"><label>Coefficiente redditività %</label><input name="profitability_coefficient" type="number" step="0.01" value="${Number(ts.profitability_coefficient||67)}"></div><div class="field"><label>Aliquota imposta sostitutiva %</label><input name="substitute_tax_rate" type="number" step="0.01" value="${Number(ts.substitute_tax_rate||5)}"></div><div class="field"><label>Limite ricavi annuo forfettario</label><input name="annual_revenue_limit" type="number" step="0.01" value="${Number(ts.annual_revenue_limit||85000)}"></div><div class="field"><label>Data avvio attività</label><input name="activity_start_date" type="date" value="${esc(ts.activity_start_date||DEFAULT_DEFAULT_ACTIVITY_START_DATE)}"></div><h2>Rivalsa INPS e marca da bollo</h2><p class="sub">Voci aggiuntive da esporre in fattura oltre al compenso.</p><div class="field"><label>Gestione previdenziale</label><input name="inps_management" value="${esc(ts.inps_management||'gestione_separata')}"></div><div class="field"><label>Rivalsa INPS</label><select name="inps_recharge_enabled"><option value="true" ${ts.inps_recharge_enabled?'selected':''}>Sì</option><option value="false" ${!ts.inps_recharge_enabled?'selected':''}>No</option></select></div><div class="field"><label>Percentuale rivalsa INPS</label><input name="inps_recharge_rate" type="number" step="0.01" value="${Number(ts.inps_recharge_rate||4)}"></div><div class="field"><label>Marca da bollo</label><select name="stamp_duty_enabled"><option value="true" ${ts.stamp_duty_enabled?'selected':''}>Sì</option><option value="false" ${!ts.stamp_duty_enabled?'selected':''}>No</option></select></div><div class="field"><label>Importo marca da bollo</label><input name="stamp_duty_amount" type="number" step="0.01" value="${Number(ts.stamp_duty_amount||2)}"></div><h2>Proiezione annua (avanzato)</h2><p class="sub">Parametri opzionali per affinare la stima "Prudente / Base / Ottimistico".</p><div class="field"><label>Includi mese corrente nella proiezione</label><select name="projection_include_current_month"><option value="true" ${ts.projection_include_current_month!==false?'selected':''}>Sì</option><option value="false" ${ts.projection_include_current_month===false?'selected':''}>No</option></select></div><div class="field"><label>Mesi esclusi dalla proiezione</label><input name="projection_excluded_months" placeholder="es. 1,8" value="${esc(parseExcludedMonths(ts.projection_excluded_months).join(','))}"></div><div class="field"><label>Fattore scenario prudente</label><input name="projection_prudent_factor" type="number" step="0.01" value="${Number(ts.projection_prudent_factor??0.85)}"></div><div class="field"><label>Fattore scenario ottimistico</label><input name="projection_optimistic_factor" type="number" step="0.01" value="${Number(ts.projection_optimistic_factor??1.10)}"></div><div class="field"><label>Soglia rischio basso %</label><input name="risk_low_threshold" type="number" step="0.01" value="${Number(ts.risk_low_threshold??70)}"></div><div class="field"><label>Soglia rischio medio %</label><input name="risk_medium_threshold" type="number" step="0.01" value="${Number(ts.risk_medium_threshold??90)}"></div><div class="field"><label>Soglia rischio alto %</label><input name="risk_high_threshold" type="number" step="0.01" value="${Number(ts.risk_high_threshold??100)}"></div><h2>Note</h2><div class="field"><textarea name="notes">${esc(ts.notes||'')}</textarea></div><div class="actions"><button class="primary">Salva configurazione fiscale</button><button type="button" class="secondary" onclick="go('settings')">Indietro</button></div></form>`)}
async function saveTaxSettings(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const year=Number(f.fiscal_year||currentYear());const payload={fiscal_year:year,regime:f.regime,ateco_code:norm(f.ateco_code)||null,ateco_description:norm(f.ateco_description)||null,profitability_coefficient:Number(f.profitability_coefficient||0),substitute_tax_rate:Number(f.substitute_tax_rate||0),inps_management:norm(f.inps_management)||null,inps_recharge_enabled:f.inps_recharge_enabled==='true',inps_recharge_rate:Number(f.inps_recharge_rate||0),stamp_duty_enabled:f.stamp_duty_enabled==='true',stamp_duty_amount:Number(f.stamp_duty_amount||0),annual_revenue_limit:Number(f.annual_revenue_limit||0),activity_start_date:f.activity_start_date||null,projection_method:'weighted_average',projection_include_current_month:f.projection_include_current_month==='true',projection_excluded_months:parseExcludedMonths(f.projection_excluded_months),projection_prudent_factor:Number(f.projection_prudent_factor||0.85),projection_optimistic_factor:Number(f.projection_optimistic_factor||1.10),risk_low_threshold:Number(f.risk_low_threshold||70),risk_medium_threshold:Number(f.risk_medium_threshold||90),risk_high_threshold:Number(f.risk_high_threshold||100),notes:f.notes||null};const existing=data.taxSettings.find(t=>Number(t.fiscal_year)===year);let res;if(existing)res=await sb.from('tax_settings').update(payload).eq('id',existing.id);else res=await sb.from('tax_settings').insert(payload);if(res.error)return setMsg(res.error.message,7000);await reload();state.view='tax';setMsg('Configurazione fiscale aggiornata.',4000)}

function settings(){return appShell(`<div class="screenTitle">Configurazione</div><div class="list"><div class="row" onclick="go('clients')"><div class="roundIcon blue">👤</div><div><div class="title">Clienti</div><div class="desc">Tariffe e tipo compenso</div></div><div>›</div></div><div class="row" onclick="go('projects')"><div class="roundIcon blue">📁</div><div><div class="title">Progetti / Clienti finali</div><div class="desc">Collegati al cliente principale</div></div><div>›</div></div><div class="row" onclick="go('activities')"><div class="roundIcon blue">🏷️</div><div><div class="title">Attività</div><div class="desc">PM, AMS, Gestione...</div></div><div>›</div></div><div class="row" onclick="go('expenseCategories')"><div class="roundIcon blue">✈</div><div><div class="title">Voci spesa</div><div class="desc">Rimborso KM, hotel, pranzo, parcheggio...</div></div><div>›</div></div><div class="row" onclick="go('invoiceTemplates')"><div class="roundIcon blue">🧾</div><div><div class="title">Template fattura / Fiscozen</div><div class="desc">Personalizza descrizioni da copiare</div></div><div>›</div></div><div class="row" onclick="go('tax')"><div class="roundIcon blue">%</div><div><div class="title">Fiscalità</div><div class="desc">Forfettario, ATECO, tasse e rivalsa</div></div><div>›</div></div><div class="row" onclick="go('appearance')"><div class="roundIcon blue">◐</div><div><div class="title">Aspetto / Tema</div><div class="desc">Chiaro giorno o scuro sera</div></div><div>›</div></div><div class="row" onclick="go('exportTimesheet')"><div class="roundIcon blue">⬇</div><div><div class="title">Export Timesheet Excel</div><div class="desc">Scarica il dettaglio mensile per cliente</div></div><div>›</div></div><div class="row"><div class="roundIcon blue">☁</div><div><div class="title">Database</div><div class="desc">Supabase PostgreSQL · ${esc(session?.user?.email||'')}</div></div><div></div></div></div><div class="grid"><label class="secondary" style="display:block;text-align:center;cursor:pointer">Importa CSV<input type="file" accept=".csv,text/csv" style="display:none" onchange="importCsv(event)"></label><button class="secondary" onclick="reload()">Ricarica da database</button><button class="secondary danger" onclick="logout()">Esci</button></div>`)}

function appearance(){return appShell(`<div class="screenTitle">Aspetto / Tema</div><p class="sub">Scegli il template grafico da usare su telefono e PC.</p><div class="card"><div class="themeChoice"><button class="${state.theme==='light'?'active':''}" onclick="saveThemeChoice('light')"><b>Chiaro / Giorno</b><span>sfondo chiaro, card bianche, ideale per uso diurno</span></button><button class="${state.theme==='dark'?'active':''}" onclick="saveThemeChoice('dark')"><b>Scuro / Sera</b><span>sfondo navy, card scure, ideale per smartphone e sera</span></button></div></div><button class="secondary" onclick="go('settings')">Indietro</button>`)}

function exportTimesheetViewOptions(){const clients=activeClients();const selected=clients[0]?.id||'';return `<div class="field"><label>Mese</label><input name="month" type="month" value="${state.month}"></div><div class="field"><label>Cliente</label><select name="client_id" onchange="refreshProjectsForForm(this.form)"><option value="">Tutti i clienti</option>${clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente/Progetto</label><select name="project_id"><option value="">Tutti i progetti</option>${projectOptions(selected)}</select></div><div class="field"><label>Includi importi</label><select name="include_amount"><option value="false">No, solo dettaglio operativo</option><option value="true">Sì, includi importi</option></select></div>`}
function exportTimesheet(){return appShell(`<div class="screenTitle">Export Timesheet Excel</div><p class="sub">Scarica il dettaglio mensile da inviare al cliente.</p><form class="form" onsubmit="downloadTimesheetExcel(event)">${exportTimesheetViewOptions()}<div class="actions"><button class="primary">Scarica Excel</button><button type="button" class="secondary" onclick="go('settings')">Annulla</button></div></form>`)}

function clients(){return appShell(`<h1>Clienti</h1><form class="form" onsubmit="addClient(event)"><div class="field"><label>Nome cliente</label><input name="name" required></div><div class="field"><label>Tipo compenso</label><select name="compensation_type"><option value="daily_rate_8h">Tariffa giornaliera 8h</option><option value="monthly_flat">Una tantum mensile</option></select></div><div class="field"><label>Tariffa giornaliera</label><input name="daily_rate" type="number" step="0.01" value="0"></div><button class="primary">Aggiungi cliente</button></form><div class="list">${data.clients.map(c=>`<div class="row" onclick="editClient('${c.id}')"><div></div><div><div class="title">${esc(c.name)}</div><div class="desc">${c.compensation_type==='daily_rate_8h'?'Tariffa giornaliera 8h · '+fmtEUR(c.daily_rate||0):'Una tantum mensile'} · ${c.active?'Attivo':'Disattivo'}</div></div><div>›</div></div>`).join('')||'<div class="empty">Nessun cliente.</div>'}</div>`)}
function editClient(id){navigateTo('clientEdit',{edit:id})}
function clientEdit(){const c=clientById(state.edit);if(!c)return clients();return appShell(`<h1>Modifica cliente</h1><form class="form" onsubmit="saveClient(event)"><div class="field"><label>Nome cliente</label><input name="name" value="${esc(c.name)}" required></div><div class="field"><label>Tipo compenso</label><select name="compensation_type"><option value="daily_rate_8h" ${c.compensation_type==='daily_rate_8h'?'selected':''}>Tariffa giornaliera 8h</option><option value="monthly_flat" ${c.compensation_type==='monthly_flat'?'selected':''}>Una tantum mensile</option></select></div><div class="field"><label>Tariffa giornaliera</label><input name="daily_rate" type="number" step="0.01" value="${Number(c.daily_rate||0)}"></div><div class="field"><label>Ore standard giornata</label><input name="standard_hours" type="number" step="0.25" value="${Number(c.standard_hours||8)}"></div><div class="field"><label>Attivo</label><select name="active"><option value="true" ${c.active?'selected':''}>Sì</option><option value="false" ${!c.active?'selected':''}>No</option></select></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteClient('${c.id}')">Elimina cliente</button><button type="button" class="secondary" onclick="go('clients')">Annulla</button></div></form>`)}
async function addClient(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={name:norm(f.name),compensation_type:f.compensation_type,daily_rate:Number(f.daily_rate||0),standard_hours:8,active:true};const {error}=await sb.from('clients').insert(payload);if(error)return setMsg(error.message,7000);await reload();state.view='clients';render()}
async function saveClient(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={name:norm(f.name),compensation_type:f.compensation_type,daily_rate:Number(f.daily_rate||0),standard_hours:Number(f.standard_hours||8),active:f.active==='true'};const {error}=await sb.from('clients').update(payload).eq('id',state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='clients';state.edit=null;render()}
async function deleteClient(idv){if(!confirm('Eliminare il cliente? Se esistono consuntivi collegati, il database potrebbe bloccare la cancellazione. In quel caso usa Disattivo.'))return;const {error}=await sb.from('clients').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='clients';render()}
function projects(){return appShell(`<h1>Progetti / Clienti finali</h1><form class="form" onsubmit="addProject(event)"><div class="field"><label>Cliente collegato</label><select name="client_id">${data.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Nome progetto / cliente finale</label><input name="name" required></div><button class="primary">Aggiungi progetto</button></form><div class="list">${data.projects.map(p=>`<div class="row" onclick="editProject('${p.id}')"><div></div><div><div class="title">${esc(clientName(p.client_id))}</div><div class="desc">${esc(p.name)} · ${p.active?'Attivo':'Disattivo'}</div></div><div>›</div></div>`).join('')||'<div class="empty">Nessun progetto.</div>'}</div>`)}
function editProject(id){navigateTo('projectEdit',{edit:id})}
function projectEdit(){const p=projectById(state.edit);if(!p)return projects();return appShell(`<h1>Modifica progetto</h1><form class="form" onsubmit="saveProject(event)"><div class="field"><label>Cliente collegato</label><select name="client_id">${data.clients.map(c=>`<option value="${c.id}" ${c.id===p.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Nome progetto / cliente finale</label><input name="name" value="${esc(p.name)}" required></div><div class="field"><label>Attivo</label><select name="active"><option value="true" ${p.active?'selected':''}>Sì</option><option value="false" ${!p.active?'selected':''}>No</option></select></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteProject('${p.id}')">Elimina progetto</button><button type="button" class="secondary" onclick="go('projects')">Annulla</button></div></form>`)}
async function addProject(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const {error}=await sb.from('projects').insert({client_id:f.client_id,name:norm(f.name),active:true});if(error)return setMsg(error.message,7000);await reload();state.view='projects';render()}
async function saveProject(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const {error}=await sb.from('projects').update({client_id:f.client_id,name:norm(f.name),active:f.active==='true'}).eq('id',state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='projects';state.edit=null;render()}
async function deleteProject(idv){if(!confirm('Eliminare il progetto? Se esistono consuntivi collegati, il database potrebbe bloccare la cancellazione.'))return;const {error}=await sb.from('projects').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='projects';render()}
function activities(){return appShell(`<h1>Attività</h1><form class="form" onsubmit="addActivity(event)"><div class="field"><label>Nome attività</label><input name="name" required></div><button class="primary">Aggiungi attività</button></form><div class="list">${data.activities.map(a=>`<div class="row" onclick="editActivity('${a.id}')"><div></div><div><div class="title">${esc(a.name)}</div><div class="desc">${a.active?'Attiva':'Disattiva'}</div></div><div>›</div></div>`).join('')||'<div class="empty">Nessuna attività.</div>'}</div>`)}
function editActivity(id){navigateTo('activityEdit',{edit:id})}
function activityEdit(){const a=activityById(state.edit);if(!a)return activities();return appShell(`<h1>Modifica attività</h1><form class="form" onsubmit="saveActivity(event)"><div class="field"><label>Nome attività</label><input name="name" value="${esc(a.name)}" required></div><div class="field"><label>Attiva</label><select name="active"><option value="true" ${a.active?'selected':''}>Sì</option><option value="false" ${!a.active?'selected':''}>No</option></select></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteActivity('${a.id}')">Elimina attività</button><button type="button" class="secondary" onclick="go('activities')">Annulla</button></div></form>`)}
async function addActivity(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const {error}=await sb.from('activities').insert({name:norm(f.name),active:true});if(error)return setMsg(error.message,7000);await reload();state.view='activities';render()}
async function saveActivity(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const {error}=await sb.from('activities').update({name:norm(f.name),active:f.active==='true'}).eq('id',state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='activities';state.edit=null;render()}
async function deleteActivity(idv){if(!confirm('Eliminare attività? Se usata nei consuntivi, il database potrebbe bloccare la cancellazione.'))return;const {error}=await sb.from('activities').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='activities';render()}

function expenseCategories(){return appShell(`<h1>Voci spesa</h1><form class="form" onsubmit="addExpenseCategory(event)"><div class="field"><label>Nome voce</label><input name="name" required></div><div class="field"><label>Tipo calcolo</label><select name="calculation_type"><option value="manual_amount">Importo manuale</option><option value="quantity_rate">Quantità × tariffa</option></select></div><div class="field"><label>Unità</label><input name="unit_label" placeholder="km, notte, ticket..."></div><div class="field"><label>Tariffa default</label><input name="default_unit_rate" type="number" step="0.0001" value="0"></div><button class="primary">Aggiungi voce spesa</button></form><div class="list">${data.expenseCategories.map(c=>`<div class="row" onclick="editExpenseCategory('${c.id}')"><div></div><div><div class="title">${esc(c.name)}</div><div class="desc">${c.calculation_type==='quantity_rate'?'Quantità × tariffa':'Importo manuale'} · Macro: ${esc(c.invoice_macro||'Spese di trasferta')} · ${c.active?'Attiva':'Disattiva'}</div></div><div>›</div></div>`).join('')||'<div class="empty">Nessuna voce spesa.</div>'}</div>`)}
function editExpenseCategory(id){navigateTo('expenseCategoryEdit',{edit:id})}
function expenseCategoryEdit(){const c=expenseCategoryById(state.edit);if(!c)return expenseCategories();return appShell(`<h1>Modifica voce spesa</h1><form class="form" onsubmit="saveExpenseCategory(event)"><div class="field"><label>Nome voce</label><input name="name" value="${esc(c.name)}" required></div><div class="field"><label>Tipo calcolo</label><select name="calculation_type"><option value="manual_amount" ${c.calculation_type==='manual_amount'?'selected':''}>Importo manuale</option><option value="quantity_rate" ${c.calculation_type==='quantity_rate'?'selected':''}>Quantità × tariffa</option></select></div><div class="field"><label>Unità</label><input name="unit_label" value="${esc(c.unit_label||'')}"></div><div class="field"><label>Tariffa default</label><input name="default_unit_rate" type="number" step="0.0001" value="${Number(c.default_unit_rate||0)}"></div><div class="field"><label>Macro voce fattura</label><input name="invoice_macro" value="${esc(c.invoice_macro||'Spese di trasferta')}"></div><div class="field"><label>Attiva</label><select name="active"><option value="true" ${c.active?'selected':''}>Sì</option><option value="false" ${!c.active?'selected':''}>No</option></select></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteExpenseCategory('${c.id}')">Elimina</button><button type="button" class="secondary" onclick="go('expenseCategories')">Annulla</button></div></form>`)}
async function addExpenseCategory(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={name:norm(f.name),calculation_type:f.calculation_type,unit_label:norm(f.unit_label)||null,default_unit_rate:Number(f.default_unit_rate||0)||null,invoice_macro:'Spese di trasferta',active:true};const {error}=await sb.from('expense_categories').insert(payload);if(error)return setMsg(error.message,7000);await reload();state.view='expenseCategories';render()}
async function saveExpenseCategory(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={name:norm(f.name),calculation_type:f.calculation_type,unit_label:norm(f.unit_label)||null,default_unit_rate:Number(f.default_unit_rate||0)||null,invoice_macro:norm(f.invoice_macro)||'Spese di trasferta',active:f.active==='true'};const {error}=await sb.from('expense_categories').update(payload).eq('id',state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='expenseCategories';state.edit=null;render()}
async function deleteExpenseCategory(idv){if(!confirm('Eliminare voce spesa? Se usata in spese già inserite, il database potrebbe bloccare la cancellazione.'))return;const {error}=await sb.from('expense_categories').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='expenseCategories';render()}

function invoiceTemplates(){return appShell(`<h1>Template fattura / Fiscozen</h1><p class="sub">Gestisci qui cosa copiare su Fiscozen. I consuntivi non chiedono la voce fattura.</p><form class="form" onsubmit="addInvoiceTemplate(event)"><div class="field"><label>Codice</label><input name="template_code" placeholder="ES. CONSULENZA_CUSTOM" required></div><div class="field"><label>Nome</label><input name="name" required></div><div class="field"><label>Tipo riga</label><select name="entry_type"><option value="daily_rate_8h">Consulenza a ore/gg</option><option value="monthly_flat">Compenso mensile</option><option value="manual_entry">Consuntivo manuale</option><option value="travel_expenses">Spese di trasferta</option></select></div><div class="field"><label>Template testo</label><textarea name="template_text" required>Consulenza - [Mese Anno] - Cliente/Progetto: [Progetto]</textarea></div><button class="primary">Aggiungi template</button></form><div class="list">${data.invoiceTemplates.map(t=>`<div class="row" onclick="editInvoiceTemplate('${t.id}')"><div></div><div><div class="title">${esc(t.name)}</div><div class="desc">${esc(t.entry_type)} · ${esc(t.template_text)}</div></div><div>›</div></div>`).join('')||'<div class="empty">Nessun template.</div>'}</div>`)}
function editInvoiceTemplate(id){navigateTo('invoiceTemplateEdit',{edit:id})}
function invoiceTemplateEdit(){const t=data.invoiceTemplates.find(x=>x.id===state.edit);if(!t)return invoiceTemplates();return appShell(`<h1>Modifica template</h1><form class="form" onsubmit="saveInvoiceTemplate(event)"><div class="field"><label>Codice</label><input name="template_code" value="${esc(t.template_code)}" required></div><div class="field"><label>Nome</label><input name="name" value="${esc(t.name)}" required></div><div class="field"><label>Tipo riga</label><select name="entry_type"><option value="daily_rate_8h" ${t.entry_type==='daily_rate_8h'?'selected':''}>Consulenza a ore/gg</option><option value="monthly_flat" ${t.entry_type==='monthly_flat'?'selected':''}>Compenso mensile</option><option value="manual_entry" ${t.entry_type==='manual_entry'?'selected':''}>Consuntivo manuale</option><option value="travel_expenses" ${t.entry_type==='travel_expenses'?'selected':''}>Spese di trasferta</option></select></div><div class="field"><label>Template testo</label><textarea name="template_text" required>${esc(t.template_text)}</textarea></div><div class="field"><label>Attivo</label><select name="active"><option value="true" ${t.active?'selected':''}>Sì</option><option value="false" ${!t.active?'selected':''}>No</option></select></div><div class="field"><label>Ordine</label><input name="sort_order" type="number" value="${Number(t.sort_order||0)}"></div><div class="actions"><button class="primary">Salva modifiche</button><button type="button" class="secondary danger" onclick="deleteInvoiceTemplate('${t.id}')">Elimina</button><button type="button" class="secondary" onclick="go('invoiceTemplates')">Annulla</button></div></form>`)}
async function addInvoiceTemplate(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={template_code:norm(f.template_code),name:norm(f.name),entry_type:f.entry_type,template_text:f.template_text,active:true,sort_order:99};const {error}=await sb.from('invoice_templates').insert(payload);if(error)return setMsg(error.message,7000);await reload();state.view='invoiceTemplates';render()}
async function saveInvoiceTemplate(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const payload={template_code:norm(f.template_code),name:norm(f.name),entry_type:f.entry_type,template_text:f.template_text,active:f.active==='true',sort_order:Number(f.sort_order||0)};const {error}=await sb.from('invoice_templates').update(payload).eq('id',state.edit);if(error)return setMsg(error.message,7000);await reload();state.view='invoiceTemplates';state.edit=null;render()}
async function deleteInvoiceTemplate(idv){if(!confirm('Eliminare template?'))return;const {error}=await sb.from('invoice_templates').delete().eq('id',idv);if(error)return setMsg(error.message,7000);await reload();state.view='invoiceTemplates';render()}

async function ensureClient(name,type,rowRate=0){let c=data.clients.find(x=>x.name.toLowerCase()===name.toLowerCase());if(c)return c;const {data:row,error}=await sb.from('clients').insert({name,compensation_type:type==='monthly'?'monthly_flat':'daily_rate_8h',daily_rate:Number(rowRate||0),standard_hours:8,active:true}).select().single();if(error)throw error;data.clients.push(row);return row}
async function ensureProject(clientId,name){if(!name)return null;let p=data.projects.find(x=>x.client_id===clientId&&x.name.toLowerCase()===name.toLowerCase());if(p)return p;const {data:row,error}=await sb.from('projects').insert({client_id:clientId,name,active:true}).select().single();if(error)throw error;data.projects.push(row);return row}
async function ensureActivity(name){if(!name)return null;let a=data.activities.find(x=>x.name.toLowerCase()===name.toLowerCase());if(a)return a;const {data:row,error}=await sb.from('activities').insert({name,active:true}).select().single();if(error)throw error;data.activities.push(row);return row}
function parseCsvLine(line,sep){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(ch===sep&&!q){out.push(cur);cur=''}else cur+=ch}out.push(cur);return out.map(x=>x.trim())}
function canonHeader(h){return String(h||'').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w/ ]+/g,'').replace(/\s+/g,' ')}
function parseAmount(v){return Number(String(v||'0').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''))||0}
function toDate(v){v=norm(v);if(!v)return'';if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const m=v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);if(m)return`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return''}
function toMonth(v){const d=toDate(v);if(d)return d.slice(0,7);v=norm(v);if(/^\d{4}-\d{2}$/.test(v))return v;return''}
function excelSafe(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function exportRowsFor(month,clientId,projectId){const byFilters=(x,cid,pid)=>{if(clientId&&cid!==clientId)return false;if(projectId&&(pid||'')!==projectId)return false;return true};let rows=[];data.entries.filter(e=>String(e.entry_date||'').startsWith(month)&&byFilters(e,e.client_id,e.project_id)).forEach(e=>rows.push({tipo:'Consuntivo',data:e.entry_date,cliente:clientName(e.client_id),progetto:projectName(e.project_id),attivita:activityName(e.activity_id),descrizione:e.description||'',ore:Number(e.hours||0),quantita:'',sede:e.work_site||'',citta:e.work_city||'',note:e.notes||'',importo:dailyAmount(e)}));data.manualEntries.filter(e=>String(e.entry_date||'').startsWith(month)&&byFilters(e,e.client_id,e.project_id)).forEach(e=>rows.push({tipo:'Manuale',data:e.entry_date,cliente:clientName(e.client_id),progetto:projectName(e.project_id),attivita:activityName(e.activity_id),descrizione:e.description||'',ore:'',quantita:'',sede:e.work_site||'',citta:e.work_city||'',note:e.notes||'',importo:Number(e.amount||0)}));data.travelExpenses.filter(e=>String(e.expense_date||'').startsWith(month)&&byFilters(e,e.client_id,e.project_id)).forEach(e=>rows.push({tipo:'Spesa trasferta',data:e.expense_date,cliente:clientName(e.client_id),progetto:projectName(e.project_id),attivita:expenseCategoryName(e.expense_category_id),descrizione:e.description||'',ore:'',quantita:e.quantity||'',sede:e.work_site||'',citta:e.work_city||'',note:e.notes||'',importo:Number(e.amount||0)}));return rows.sort((a,b)=>String(a.data).localeCompare(String(b.data)))}
function downloadTimesheetExcel(ev){ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));const month=f.month||state.month;const include=f.include_amount==='true';const rows=exportRowsFor(month,f.client_id||'',f.project_id||'');if(!rows.length)return setMsg('Nessuna riga da esportare per i filtri selezionati.',5000);const headers=['Tipo','Data','Cliente','Cliente/Progetto','Attività / Voce','Descrizione','Ore','Quantità','Sede','Luogo/Città','Note'].concat(include?['Importo']:[]);const totalHours=rows.reduce((s,r)=>s+(Number(r.ore)||0),0);const totalAmount=rows.reduce((s,r)=>s+(Number(r.importo)||0),0);const html=`<html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11pt}th{background:#0b1b31;color:white;font-weight:bold}td,th{border:1px solid #b7c0cf;padding:6px}.tot{font-weight:bold;background:#eaf2ff}</style></head><body><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td>${excelSafe(r.tipo)}</td><td>${excelSafe(dateIT(r.data))}</td><td>${excelSafe(r.cliente)}</td><td>${excelSafe(r.progetto)}</td><td>${excelSafe(r.attivita)}</td><td>${excelSafe(r.descrizione)}</td><td>${r.ore!==''?fmtNum(r.ore,2):''}</td><td>${excelSafe(r.quantita)}</td><td>${excelSafe(r.sede)}</td><td>${excelSafe(r.citta)}</td><td>${excelSafe(r.note)}</td>${include?`<td>${fmtNum(r.importo,2)}</td>`:''}</tr>`).join('')}<tr class="tot"><td colspan="6">Totale</td><td>${fmtNum(totalHours,2)}</td><td></td><td></td><td></td><td></td>${include?`<td>${fmtNum(totalAmount,2)}</td>`:''}</tr></tbody></table></body></html>`;const blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'});const a=document.createElement('a');const c=f.client_id?clientName(f.client_id).replace(/\W+/g,'_'):'TuttiClienti';const p=f.project_id?projectName(f.project_id).replace(/\W+/g,'_'):'TuttiProgetti';a.href=URL.createObjectURL(blob);a.download=`TOTIME_Timesheet_${c}_${p}_${month}.xls`;a.click();setMsg(`Export creato: ${rows.length} righe.`,5000)}

async function importCsv(ev){const file=ev.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{try{const text=reader.result.replace(/^\uFEFF/,'').trim();if(!text)return setMsg('CSV vuoto.');const lines=text.split(/\r?\n/).filter(Boolean);const sep=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';const headers=parseCsvLine(lines.shift(),sep).map(canonHeader);const get=(row,names)=>{for(const n of names.map(canonHeader)){const i=headers.indexOf(n);if(i>=0)return row[i]||''}return''};let count=0,skipped=0,createdClients=0,createdProjects=0,createdActivities=0;for(const line of lines){const row=parseCsvLine(line,sep);if(!row.some(x=>norm(x))){skipped++;continue}const cliente=norm(get(row,['cliente','client']));if(!cliente){skipped++;continue}const tipoRaw=get(row,['tipo','type']);const tipo=(tipoRaw||'Tariffa giornaliera 8h').toLowerCase();const isMonthly=tipo.includes('mens')||tipo.includes('monthly')||tipo.includes('una tantum');const ore=parseAmount(get(row,['ore','hours']));const amount=parseAmount(get(row,['importo','amount']));let rowRate=amount>0&&ore>0?amount/ore*8:0;const beforeC=data.clients.length;const client=await ensureClient(cliente,isMonthly?'monthly':'daily',rowRate);if(data.clients.length>beforeC)createdClients++;if(!client.daily_rate&&rowRate>0){await sb.from('clients').update({daily_rate:rowRate}).eq('id',client.id);client.daily_rate=rowRate}const progetto=norm(get(row,['cliente/progetto','progetto','cliente finale','project']));const beforeP=data.projects.length;const project=await ensureProject(client.id,progetto);if(data.projects.length>beforeP)createdProjects++;const att=norm(get(row,['attività','attivita','activity']));const beforeA=data.activities.length;const activity=await ensureActivity(att);if(data.activities.length>beforeA)createdActivities++;const descrizione=get(row,['descrizione','description']);const sede=norm(get(row,['sede','work_site','site']));const citta=norm(get(row,['luogo/città','luogo/citta','città','citta','luogo','work_city','city','location']));const luogo=[sede,citta].filter(Boolean).join(' - ');const note=get(row,['note','notes']);if(isMonthly){const mese=norm(get(row,['mese','month']))||toMonth(get(row,['data','date']))||state.month;const [year,month]=mese.split('-').map(Number);const payload={year,month,client_id:client.id,project_id:project?.id||null,description:descrizione||null,notes:note||null,amount};const {error}=await sb.from('monthly_compensations').insert(payload);if(error)throw error;count++;}else{const date=toDate(get(row,['data','date']))||new Date().toISOString().slice(0,10);const rate=rowRate||Number(client.daily_rate||0);const payload={entry_date:date,client_id:client.id,project_id:project?.id||null,activity_id:activity?.id||null,work_location:luogo||null,work_site:sede||null,work_city:citta||null,description:descrizione||null,notes:note||null,hours:ore,daily_rate_snapshot:rate,standard_hours_snapshot:8};const {error}=await sb.from('timesheet_entries').insert(payload);if(error)throw error;count++;}}
await fetchAll();state.view='timesheet';setMsg(`Import completato: ${count} righe. Clienti creati: ${createdClients}. Progetti creati: ${createdProjects}. Attività create: ${createdActivities}. Righe scartate: ${skipped}.`,9000)}catch(e){console.error(e);setMsg('Errore import CSV: '+(e.message||e),9000)}};reader.readAsText(file,'windows-1252')}
function exportData(){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='totime-supabase-backup.json';a.click()}
function render(){if(state.loading){document.getElementById('app').innerHTML=loadingView();return}if(state.view==='resetPassword'){document.getElementById('app').innerHTML=resetPasswordView();return}if(!session){const authMap={register:registerView,forgotPassword:forgotPasswordView};document.getElementById('app').innerHTML=(authMap[state.view]||loginView)();return}let html='';const map={home,newChoice,dailyForm,dailyEdit,monthlyForm,monthlyEdit,manualForm,manualEdit,expenseForm,expenseEdit,timesheet,summary,billing,billingDetail:billingDetailView,settings,clients,projects,activities,clientEdit,projectEdit,activityEdit,expenseCategories,expenseCategoryEdit,invoiceTemplates,invoiceTemplateEdit,appearance,exportTimesheet,tax};html=(map[state.view]||home)();document.getElementById('app').innerHTML=html}

Object.assign(window,{
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
