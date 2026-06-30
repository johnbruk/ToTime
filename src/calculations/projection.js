const toNumber = value => Number(value || 0);

export function parseExcludedMonths(value) {
  if (Array.isArray(value)) return value.map(Number).filter(month => month >= 1 && month <= 12);
  if (typeof value === 'string') return value.split(',').map(item => Number(item.trim())).filter(month => month >= 1 && month <= 12);
  return [];
}

export function projectionCalc(options = {}) {
  const year = Number(options.year || (options.now || new Date()).getFullYear());
  const monthlyAmounts = options.monthlyAmounts || [];
  const taxSettings = options.taxSettings || {};
  const now = options.now || new Date();
  const monthNames = options.monthNames || [];
  const defaultActivityStartDate = options.defaultActivityStartDate || '2026-01-02';
  const months = Array.from({ length: 12 }, (_item, index) => toNumber(monthlyAmounts[index]));
  const selectedIsCurrent = year === now.getFullYear();
  const currentIdx = selectedIsCurrent ? now.getMonth() : 11;
  const activityStart = taxSettings.activity_start_date || defaultActivityStartDate;
  const start = new Date(activityStart + 'T00:00:00');
  const startIdx = year === start.getFullYear() ? start.getMonth() : 0;
  const excluded = parseExcludedMonths(taxSettings.projection_excluded_months).map(month => month - 1);
  const includeCurrent = taxSettings.projection_include_current_month !== false;
  const lastClosedIdx = selectedIsCurrent ? Math.max(startIdx, currentIdx - 1) : 11;
  const closed = [];

  for (let i = startIdx; i <= lastClosedIdx; i += 1) {
    if (!excluded.includes(i)) closed.push(months[i] || 0);
  }

  const avg = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const last3 = closed.slice(-3);
  const avgLast3 = avg(last3);
  const avgYear = avg(closed);
  const daysInCurrent = new Date(year, currentIdx + 1, 0).getDate();
  const currentDay = selectedIsCurrent ? Math.max(1, now.getDate()) : daysInCurrent;
  const currentActual = months[currentIdx] || 0;
  const currentProjected = selectedIsCurrent && includeCurrent && !excluded.includes(currentIdx)
    ? currentActual / currentDay * daysInCurrent
    : currentActual;
  const weightedMonthly = (avgLast3 * 0.50) + (avgYear * 0.30) + (currentProjected * 0.20);
  const actualToDate = months.slice(0, currentIdx + 1).reduce((sum, value) => sum + value, 0);
  const closedTotal = closed.reduce((sum, value) => sum + value, 0);

  let futureMonths = 0;
  if (selectedIsCurrent) {
    for (let i = currentIdx + 1; i < 12; i += 1) {
      if (!excluded.includes(i)) futureMonths += 1;
    }
  }

  const base = selectedIsCurrent
    ? closedTotal + (includeCurrent && !excluded.includes(currentIdx) ? currentProjected : currentActual) + (weightedMonthly * futureMonths)
    : months.reduce((sum, value) => sum + value, 0);
  const remaining = Math.max(0, base - actualToDate);
  const prudentFactor = Number(taxSettings.projection_prudent_factor ?? 0.85);
  const optimisticFactor = Number(taxSettings.projection_optimistic_factor ?? 1.10);
  const prudent = actualToDate + (remaining * prudentFactor);
  const optimistic = actualToDate + (remaining * optimisticFactor);
  const limit = toNumber(taxSettings.annual_revenue_limit || 85000);
  const ratio = limit ? base / limit : 0;
  const low = Number(taxSettings.risk_low_threshold ?? 70) / 100;
  const med = Number(taxSettings.risk_medium_threshold ?? 90) / 100;
  const high = Number(taxSettings.risk_high_threshold ?? 100) / 100;
  const risk = ratio >= high ? 'Critico' : ratio >= med ? 'Alto' : ratio >= low ? 'Medio' : 'Basso';

  return {
    year,
    actualToDate,
    avgLast3,
    avgYear,
    currentProjected,
    weightedMonthly,
    base,
    prudent,
    optimistic,
    limit,
    ratio,
    risk,
    currentMonthLabel: monthNames[currentIdx] || String(currentIdx + 1),
    startDate: activityStart,
    excludedMonths: excluded.map(index => index + 1),
    prudentFactor,
    optimisticFactor
  };
}
