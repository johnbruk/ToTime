const DEFAULT_TABLES = [
  ['clients', 'clients'],
  ['projects', 'projects'],
  ['activities', 'activities'],
  ['user_profiles', 'profiles'],
  ['timesheet_entries', 'entries'],
  ['monthly_compensations', 'monthly'],
  ['billing_headers', 'billingHeaders'],
  ['expense_categories', 'expenseCategories'],
  ['travel_expenses', 'travelExpenses'],
  ['manual_entries', 'manualEntries'],
  ['invoice_templates', 'invoiceTemplates'],
  ['app_settings', 'appSettings'],
  ['tax_settings', 'taxSettings'],
  ['tax_payments', 'taxPayments']
];

function orderedQuery(sb, table) {
  let query = sb.from(table).select('*');

  if (table === 'timesheet_entries') return query.order('entry_date', { ascending: false });
  if (table === 'travel_expenses') return query.order('expense_date', { ascending: false });
  if (table === 'manual_entries') return query.order('entry_date', { ascending: false });
  if (table === 'monthly_compensations') return query.order('year', { ascending: false }).order('month', { ascending: false });
  if (table === 'invoice_templates') return query.order('sort_order', { ascending: true });
  if (table === 'tax_settings') return query.order('fiscal_year', { ascending: false });
  if (table === 'tax_payments') return query.order('fiscal_year', { ascending: false });

  return query.order('created_at', { ascending: true });
}

function tableApi(sb, table) {
  return {
    async list() {
      const { data, error } = await orderedQuery(sb, table);
      if (error) throw error;
      return data || [];
    },

    async create(payload) {
      const { data, error } = await sb.from(table).insert(payload).select().maybeSingle();
      if (error) throw error;
      return data;
    },

    async update(id, payload) {
      const { data, error } = await sb.from(table).update(payload).eq('id', id).select().maybeSingle();
      if (error) throw error;
      return data;
    },

    async remove(id) {
      const { error } = await sb.from(table).delete().eq('id', id);
      if (error) throw error;
      return true;
    }
  };
}

export function createRepository(sb) {
  return {
    tables: DEFAULT_TABLES,

    clients: tableApi(sb, 'clients'),
    projects: tableApi(sb, 'projects'),
    activities: tableApi(sb, 'activities'),
    profiles: tableApi(sb, 'user_profiles'),
    timesheet: tableApi(sb, 'timesheet_entries'),
    monthly: tableApi(sb, 'monthly_compensations'),
    billing: tableApi(sb, 'billing_headers'),
    expenseCategories: tableApi(sb, 'expense_categories'),
    travelExpenses: tableApi(sb, 'travel_expenses'),
    manualEntries: tableApi(sb, 'manual_entries'),
    invoiceTemplates: tableApi(sb, 'invoice_templates'),
    appSettings: tableApi(sb, 'app_settings'),
    taxSettings: tableApi(sb, 'tax_settings'),
    taxPayments: tableApi(sb, 'tax_payments'),

    async loadAll() {
      const result = {};
      const errors = [];

      for (const [table, key] of DEFAULT_TABLES) {
        try {
          result[key] = await tableApi(sb, table).list();
        } catch (error) {
          errors.push({ table, key, error });
          result[key] = [];
        }
      }

      return { data: result, errors };
    }
  };
}
