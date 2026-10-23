const toNumber = value => Number(value || 0);

export function billingCalc(group = { lines: [] }, header = {}, settings = {}) {
  const lines = group.lines || [];
  const services = lines
    .filter(line => ['daily_rate_8h', 'monthly_flat'].includes(line.type))
    .reduce((sum, line) => sum + toNumber(line.amount), 0);
  const manual = lines
    .filter(line => line.type === 'manual_entry')
    .reduce((sum, line) => sum + toNumber(line.amount), 0);
  const expenses = lines
    .filter(line => line.type === 'travel_expenses')
    .reduce((sum, line) => sum + toNumber(line.amount), 0);

  // Rimborsi non tassati (analitici ed ex art. 15): in fattura, ma senza rivalsa INPS.
  const expensesNonTaxed = lines
    .filter(line => line.type === 'travel_expenses')
    .reduce((sum, line) => sum + toNumber(line.nonTaxed), 0);

  const taxableBase = services + manual + expenses;
  const inpsBase = taxableBase - expensesNonTaxed;
  const inpsEnabled = header.inps_recharge_enabled ?? settings.inps_recharge_enabled ?? true;
  const inpsRate = Number(header.inps_recharge_rate ?? settings.inps_recharge_rate ?? 4);
  const inpsAmount = inpsEnabled ? inpsBase * inpsRate / 100 : 0;
  const stampEnabled = header.stamp_duty_enabled ?? settings.stamp_duty_enabled ?? false;
  const stampAmount = stampEnabled ? Number(header.stamp_duty_amount ?? settings.stamp_duty_amount ?? 2) : 0;
  const subtotal = services + manual + expenses;
  const total = subtotal + inpsAmount + stampAmount;

  return {
    services,
    manual,
    expenses,
    expensesNonTaxed,
    inpsBase,
    taxableBase,
    inpsEnabled,
    inpsRate,
    inpsAmount,
    stampEnabled,
    stampAmount,
    subtotal,
    total
  };
}
