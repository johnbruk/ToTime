const toNumber = value => Number(value || 0);

export function entryRate(entry = {}, client = {}) {
  return Number(entry.daily_rate_snapshot ?? client.daily_rate ?? 0);
}

export function entryStandardHours(entry = {}, client = {}) {
  return Number(entry.standard_hours_snapshot ?? client.standard_hours ?? 8) || 8;
}

export function dailyAmount(entry = {}, client = {}) {
  return entryRate(entry, client) / entryStandardHours(entry, client) * toNumber(entry.hours);
}

export function dailyDays(entry = {}, client = {}) {
  return toNumber(entry.hours) / entryStandardHours(entry, client);
}
