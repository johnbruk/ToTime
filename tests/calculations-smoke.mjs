import assert from 'node:assert/strict';

import { dailyAmount, dailyDays } from '../src/calculations/daily.js';
import { billingCalc } from '../src/calculations/billing.js';
import { annualTaxCalc } from '../src/calculations/tax.js';
import { parseExcludedMonths, projectionCalc } from '../src/calculations/projection.js';

assert.equal(dailyAmount({ hours: 8, daily_rate_snapshot: 550, standard_hours_snapshot: 8 }), 550);
assert.equal(dailyAmount({ hours: 4 }, { daily_rate: 600, standard_hours: 8 }), 300);
assert.equal(dailyDays({ hours: 4 }, { standard_hours: 8 }), 0.5);

const invoice = billingCalc(
  { lines: [
    { type: 'daily_rate_8h', amount: 1000 },
    { type: 'manual_entry', amount: 200 },
    { type: 'travel_expenses', amount: 50 }
  ] },
  {},
  { inps_recharge_enabled: true, inps_recharge_rate: 4, stamp_duty_enabled: true, stamp_duty_amount: 2 }
);
assert.equal(invoice.services, 1000);
assert.equal(invoice.manual, 200);
assert.equal(invoice.expenses, 50);
assert.equal(invoice.taxableBase, 1200);
assert.equal(invoice.inpsAmount, 48);
assert.equal(invoice.total, 1300);

const tax = annualTaxCalc({
  fiscalYear: 2026,
  totals: { consuntivato: 20000, fatturato: 15000, incassato: 10000 },
  taxSettings: { profitability_coefficient: 67, substitute_tax_rate: 5 },
  taxPayments: [{ fiscal_year: 2026, payment_type: 'inps_contributi', status: 'paid', amount: 1000 }]
});
assert.equal(tax.daIncassare, 5000);
assert.equal(tax.forfaitIncome, 6700);
assert.equal(tax.taxable, 5700);
assert.equal(tax.substituteTax, 285);

assert.deepEqual(parseExcludedMonths('1, 8, 13, x'), [1, 8]);

const projection = projectionCalc({
  year: 2026,
  monthlyAmounts: [1000, 2000, 3000, 4000, 5000, 6000, 0, 0, 0, 0, 0, 0],
  now: new Date('2026-06-15T12:00:00'),
  taxSettings: {
    activity_start_date: '2026-01-02',
    projection_include_current_month: true,
    projection_prudent_factor: 0.85,
    projection_optimistic_factor: 1.10,
    annual_revenue_limit: 85000,
    risk_low_threshold: 70,
    risk_medium_threshold: 90,
    risk_high_threshold: 100
  },
  monthNames: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno']
});
assert.equal(projection.year, 2026);
assert.ok(projection.base > projection.actualToDate);
assert.ok(['Basso', 'Medio', 'Alto', 'Critico'].includes(projection.risk));

console.log('Pure calculation smoke tests passed.');
