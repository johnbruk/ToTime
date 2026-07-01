export const APP_DATA_KEYS = [
  'clients',
  'projects',
  'activities',
  'entries',
  'monthly',
  'billingHeaders',
  'profiles',
  'expenseCategories',
  'travelExpenses',
  'manualEntries',
  'invoiceTemplates',
  'appSettings',
  'taxSettings',
  'taxPayments'
];

export function createEmptyAppData() {
  return APP_DATA_KEYS.reduce((acc, key) => {
    acc[key] = [];
    return acc;
  }, {});
}

export function normalizeAppData(source = {}) {
  const normalized = createEmptyAppData();
  APP_DATA_KEYS.forEach(key => {
    normalized[key] = Array.isArray(source[key]) ? source[key] : [];
  });
  return normalized;
}

export function appDataHasExpectedShape(source = {}) {
  return APP_DATA_KEYS.every(key => Array.isArray(source[key]));
}
