import assert from 'node:assert/strict';

const appNode = { innerHTML: '' };
const month = '2026-06';
const tableRows = {
  clients: [{ id: 'client-1', name: 'Acme', daily_rate: 800, standard_hours: 8, compensation_type: 'daily_rate_8h', active: true }],
  projects: [{ id: 'project-1', client_id: 'client-1', name: 'Project A', active: true }],
  activities: [{ id: 'activity-1', name: 'Delivery', active: true }],
  user_profiles: [{ id: 'profile-1', user_id: 'user-1', email: 'test@example.com' }],
  timesheet_entries: [
    { id: 'entry-1', entry_date: `${month}-03`, client_id: 'client-1', project_id: 'project-1', activity_id: 'activity-1', hours: 4, daily_rate_snapshot: 800, standard_hours_snapshot: 8 },
    { id: 'entry-2', entry_date: '2026-01-10', client_id: 'client-1', project_id: 'project-1', activity_id: 'activity-1', hours: 8, daily_rate_snapshot: 800, standard_hours_snapshot: 8 }
  ],
  monthly_compensations: [{ id: 'monthly-1', year: 2026, month: 6, client_id: 'client-1', project_id: 'project-1', amount: 1000 }],
  billing_headers: [
    { id: 'billing-jan', year: 2026, month: 1, client_id: 'client-1', status: 'collected', invoice_total_amount: 800, collected_amount: 800 },
    { id: 'billing-jun', year: 2026, month: 6, client_id: 'client-1', status: 'collected', invoice_total_amount: 1500, collected_amount: 1500 }
  ],
  expense_categories: [{ id: 'expense-cat-1', name: 'KM', active: true }],
  travel_expenses: [{ id: 'expense-1', expense_date: `${month}-05`, client_id: 'client-1', project_id: 'project-1', expense_category_id: 'expense-cat-1', amount: 50 }],
  manual_entries: [{ id: 'manual-1', entry_date: `${month}-04`, client_id: 'client-1', project_id: 'project-1', activity_id: 'activity-1', amount: 200 }],
  invoice_templates: [],
  app_settings: [],
  tax_settings: [{ fiscal_year: 2026, profitability_coefficient: 67, substitute_tax_rate: 5, annual_revenue_limit: 85000, projection_include_current_month: true, projection_excluded_months: [], projection_prudent_factor: 0.85, projection_optimistic_factor: 1.10, risk_low_threshold: 70, risk_medium_threshold: 90, risk_high_threshold: 100, activity_start_date: '2026-01-01' }],
  tax_payments: [{ fiscal_year: 2026, payment_type: 'inps_acconto', status: 'paid', amount: 100 }]
};

function queryFor(table) {
  const query = {
    select() { return this; },
    order() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: tableRows[table]?.[0] || null, error: null }; },
    then(resolve) { return Promise.resolve({ data: tableRows[table] || [], error: null }).then(resolve); }
  };
  return query;
}

globalThis.localStorage = { store: new Map(), getItem(key) { return this.store.get(key) ?? null; }, setItem(key, value) { this.store.set(key, String(value)); } };
globalThis.document = { documentElement: { setAttribute() {} }, getElementById: () => appNode, addEventListener() {}, createElement: () => ({ click() {} }) };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: { register: () => Promise.resolve() }, clipboard: { writeText: () => Promise.resolve() } } });
globalThis.window = globalThis;
window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1', email: 'test@example.com', user_metadata: {} } } } }), onAuthStateChange() {} }, from: queryFor }) };
globalThis.confirm = () => true;
globalThis.prompt = () => '';
globalThis.URL = { createObjectURL: () => 'blob:mock' };
globalThis.Blob = class BlobMock {};
globalThis.FormData = class FormDataMock {};
globalThis.FileReader = class FileReaderMock {};

await import('../app.js');
await new Promise(resolve => setTimeout(resolve, 0));
await new Promise(resolve => setTimeout(resolve, 0));

assert.equal(window.dailyAmount(tableRows.timesheet_entries[0]), 400);
assert.equal(window.dailyDays(tableRows.timesheet_entries[0]), 0.5);

const summary = window.groupSummary();
assert.equal(summary.length, 4);
assert.equal(summary.find(row => row.type === 'daily_rate_8h').amount, 400);
assert.equal(summary.find(row => row.type === 'monthly_flat').amount, 1000);
assert.equal(summary.find(row => row.type === 'manual_entry').amount, 200);
assert.equal(summary.find(row => row.type === 'travel_expenses').amount, 50);

const billing = window.billingCalc({ lines: summary }, { inps_recharge_enabled: true, inps_recharge_rate: 4, stamp_duty_enabled: true, stamp_duty_amount: 2 });
assert.equal(billing.services, 1400);
assert.equal(billing.manual, 200);
assert.equal(billing.expenses, 50);
assert.equal(billing.taxableBase, 1600);
assert.equal(billing.inpsAmount, 64);
assert.equal(billing.stampAmount, 2);
assert.equal(billing.total, 1716);

const annual = window.annualTaxCalc(2026);
assert.equal(annual.revenue, 2300);
assert.equal(annual.paidContrib, 100);
assert.equal(Math.round(annual.forfaitIncome), 1541);
assert.equal(Math.round(annual.substituteTax * 100) / 100, 72.05);

const projection = window.projectionCalc(2026);
assert.equal(projection.year, 2026);
assert.ok(projection.base >= projection.actualToDate);
assert.ok(['Basso', 'Medio', 'Alto', 'Critico'].includes(projection.risk));

assert.deepEqual(window.parseCsvLine('cliente;"descrizione; con ;";ore', ';'), ['cliente', 'descrizione; con ;', 'ore']);
assert.equal(window.parseAmount('1.234,56 €'), 1234.56);
assert.equal(window.toDate('05/06/2026'), '2026-06-05');
assert.equal(window.toMonth('05/06/2026'), '2026-06');

console.log('phase 0 pure functions regression passed');
