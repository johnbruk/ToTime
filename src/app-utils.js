export const APP_VERSION='v1.57.0';
export const SUPABASE_URL='https://mdnttasmkgnaxzkxqaks.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY='sb_publishable_Ftv4e-vlXgWEs2aV7BFSTw_CcX1DVT9';

// Gli euro hanno sempre il puntino delle migliaia, anche a quattro
// cifre: Intl in italiano scrive «7000,00 €» ma «17.000,00 €», e le due
// forme fianco a fianco sembravano un errore (vedi eurMigliaia in app.js).
export const fmtEUR=n=>{
  const v=Number(n||0);
  const [i,d]=Math.abs(v).toFixed(2).split('.');
  const neg=v<0&&Number(i+'.'+d)!==0;
  return (neg?'-':'')+i.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+d+'\u00a0€';
};
export const fmtNum=(n,d=1)=>new Intl.NumberFormat('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d}).format(Number(n||0));
export const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
export const norm=s=>String(s||'').trim();
export const monthNames=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
export const today=new Date();
export const DEFAULT_DEFAULT_ACTIVITY_START_DATE='2026-01-02';
export const ym=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
