export const APP_VERSION='v1.2.5';
export const SUPABASE_URL='https://mdnttasmkgnaxzkxqaks.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY='sb_publishable_Ftv4e-vlXgWEs2aV7BFSTw_CcX1DVT9';

export const fmtEUR=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n||0));
export const fmtNum=(n,d=1)=>new Intl.NumberFormat('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d}).format(Number(n||0));
export const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
export const norm=s=>String(s||'').trim();
export const monthNames=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
export const today=new Date();
export const DEFAULT_DEFAULT_ACTIVITY_START_DATE='2026-01-02';
export const ym=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
