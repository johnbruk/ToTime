-- La marca da bollo: due cose diverse in un interruttore solo
--
-- «stamp_duty_enabled» diceva insieme che il bollo E' DOVUTO e che lo
-- si ADDEBITA al cliente. Chi lo mette in fattura ma lo versa di tasca
-- propria all'Agenzia delle Entrate non aveva modo di dirlo:
-- spegnendolo il totale tornava giusto, ma il lettore di fatture
-- segnalava uno scostamento falso a ogni fattura e smetteva di
-- controllare il caso che conta davvero — sopra i 77,47 euro di
-- importi esenti il bollo ci vuole, chiunque lo paghi.
--
-- Da qui le due cose si dicono separate:
--   'charged' = in fattura, addebitata al cliente (si somma al totale)
--   'mine'    = in fattura, ma la pago io (il totale non la comprende)
--   'none'    = non si applica
--
-- Il travaso tiene fermo il comportamento di prima: acceso diventa
-- 'charged', spento diventa 'none'. Chi non aveva mai scelto resta
-- senza scelta, che non e' la stessa cosa di aver scelto «no».

alter table public.tax_settings
  add column if not exists stamp_duty_mode text;

update public.tax_settings
   set stamp_duty_mode = case
         when stamp_duty_enabled is true  then 'charged'
         when stamp_duty_enabled is false then 'none'
         else null end
 where stamp_duty_mode is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tax_settings_stamp_duty_mode_check'
  ) then
    alter table public.tax_settings
      add constraint tax_settings_stamp_duty_mode_check
      check (stamp_duty_mode is null or stamp_duty_mode in ('charged','mine','none'));
  end if;
end $$;

-- Verifica
select fiscal_year, stamp_duty_enabled, stamp_duty_mode, stamp_duty_amount
  from public.tax_settings
 order by fiscal_year desc;
