# Phase 0 Baseline

Goal: create a reliable snapshot of the current TOTIME behavior before deeper refactoring.

This document is descriptive only. It does not introduce database changes, Supabase key changes or feature removals.

## Existing features to preserve

### Login and registration

- Email/password login is shown when no Supabase session exists.
- Registration collects first name, last name, company name, VAT number, email and password.
- User profile data is stored in `user_profiles` after signup or restored from Supabase user metadata when missing.

### Supabase integration

- The app uses the Supabase JavaScript client loaded from jsDelivr.
- `app.js` creates the Supabase client from the configured URL and publishable key.
- Auth state changes reload application data and return the user to Home when authenticated.
- Table data is loaded through `fetchAll()` and kept in the frontend `data` object.

### Timesheet

- Supports daily entries based on client daily rate and standard hours.
- Supports monthly flat compensations.
- Supports manual amount entries.
- Supports travel expenses with expense categories, quantity/rate or manual amount.
- Monthly totals aggregate daily, monthly, manual and travel-expense rows.

### Import CSV

- CSV import is available from Configurazione / Altro.
- Separator autodetection supports `;` and `,`.
- Header normalization accepts accented and non-accented variants.
- Missing clients, projects and activities can be created during import.
- Imported rows become daily timesheet entries or monthly compensations depending on the type/month data.

### Export Excel

- Timesheet export is available from Configurazione / Altro.
- Export supports month, client and project filters.
- Export can include or omit amounts.
- The generated file uses an Excel-compatible HTML table saved as `.xls`.

### Billing

- Billing groups monthly rows by client.
- Invoice lines are generated from daily, monthly, manual and travel expense summaries.
- Billing calculation supports services, manual rows, expenses, INPS recharge and stamp duty.
- Billing headers track invoice status, invoice metadata, collection data and notes.

### Fiscalità

- Fiscalità shows yearly totals, collected revenue, estimated forfait income, deductible INPS payments, taxable amount, substitute tax and net estimate.
- Fiscal settings are configurable per fiscal year.
- No fiscal estimate should be treated as professional tax advice.

### Annual projections

- Annual projections use monthly consuntivato data.
- Projection settings include activity start date, excluded months, current-month inclusion, prudent/optimistic factors and risk thresholds.
- Projection risk is based on expected usage of annual revenue limit.

### PWA and service worker

- `sw.js` caches static app assets.
- Supabase and jsDelivr requests bypass the cache and go to the network.
- Cache name must change when release assets change.

### Light/dark theme

- Theme defaults to local storage or dark mode.
- Theme can be saved to `app_settings`.
- Light and dark logo/icon variants are selected according to the current theme.
