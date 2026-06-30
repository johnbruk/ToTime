# Phase 0 Manual Regression Checklist

Run this checklist before merging refactors that may affect behavior.

## Login / registration

- [ ] Open the app logged out and verify the login screen appears.
- [ ] Login with a valid account.
- [ ] Logout and verify the login screen returns.
- [ ] Open the registration screen and verify required fields are present.

## Supabase / data loading

- [ ] After login, Home loads without table errors.
- [ ] Use Reload database from Configurazione and verify data refreshes.
- [ ] Confirm no Supabase key or project URL changed unexpectedly.

## Month navigation

- [ ] Move to previous month.
- [ ] Move to next month.
- [ ] Verify totals and charts update for the selected month.

## Timesheet records

- [ ] Create a daily entry.
- [ ] Edit the daily entry.
- [ ] Duplicate the daily entry.
- [ ] Create a monthly compensation.
- [ ] Create a manual entry.
- [ ] Create a travel expense.
- [ ] Verify the Timesheet list shows all row types.

## Summary

- [ ] Open Riepilogo.
- [ ] Verify total month card.
- [ ] Verify yearly summary card.
- [ ] Verify rows are grouped by client/project/type.

## Billing

- [ ] Open Fatture.
- [ ] Open a client billing detail.
- [ ] Verify services/manual/expense totals.
- [ ] Toggle/save invoice status.
- [ ] Save invoice number/date and collection data.
- [ ] Verify collected state affects annual totals.

## Fiscalità and projections

- [ ] Open Fiscalità.
- [ ] Verify annual totals render.
- [ ] Verify tax estimate renders.
- [ ] Verify annual projection card renders.
- [ ] Save fiscal settings and reload to verify persistence.

## CSV import

- [ ] Import CSV with semicolon separator.
- [ ] Import CSV with accented headers.
- [ ] Verify missing client/project/activity creation if expected.
- [ ] Verify invalid/empty rows are skipped.

## Excel export

- [ ] Export monthly timesheet without amounts.
- [ ] Export monthly timesheet with amounts.
- [ ] Open generated `.xls` in Excel or LibreOffice.

## Theme

- [ ] Switch to light theme.
- [ ] Switch to dark theme.
- [ ] Reload and verify selected theme persists.

## PWA/cache

- [ ] Deploy and open with current release query suffix.
- [ ] Verify the app does not show stale assets.
- [ ] Reinstall/clear PWA cache if a previous version remains visible.
