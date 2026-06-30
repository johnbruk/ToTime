const toNumber = value => Number(value || 0);

export function annualTaxCalc({ totals = {}, taxSettings = {}, taxPayments = [], fiscalYear } = {}) {
  const fatturato = toNumber(totals.fatturato);
  const incassato = toNumber(totals.incassato);
  const daIncassare = Math.max(0, fatturato - incassato);
  const revenue = incassato;
  const coeff = toNumber(taxSettings.profitability_coefficient) / 100;
  const taxRate = toNumber(taxSettings.substitute_tax_rate) / 100;
  const paidContrib = taxPayments
    .filter(payment => Number(payment.fiscal_year) === Number(fiscalYear))
    .filter(payment => String(payment.payment_type || '').includes('inps'))
    .filter(payment => payment.status === 'paid')
    .reduce((sum, payment) => sum + toNumber(payment.amount), 0);

  const forfaitIncome = revenue * coeff;
  const taxable = Math.max(0, forfaitIncome - paidContrib);
  const substituteTax = taxable * taxRate;
  const net = revenue - paidContrib - substituteTax;

  return {
    settings: taxSettings,
    revenue,
    forfaitIncome,
    paidContrib,
    taxable,
    substituteTax,
    net,
    ...totals,
    daIncassare
  };
}
