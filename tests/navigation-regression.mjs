import assert from 'node:assert/strict';

const appNode = { innerHTML: '' };
const listeners = { input: [], change: [] };
const tableRows = {
  clients: [],
  projects: [],
  activities: [],
  user_profiles: [{ id: 'profile-1', user_id: 'user-1', email: 'test@example.com' }],
  timesheet_entries: [],
  monthly_compensations: [],
  billing_headers: [],
  expense_categories: [],
  travel_expenses: [],
  manual_entries: [],
  invoice_templates: [],
  app_settings: [],
  tax_settings: [],
  tax_payments: []
};

function queryFor(table) {
  const query = {
    select() { return this; },
    order() { return this; },
    eq() { return this; },
    async maybeSingle() {
      return { data: tableRows[table]?.[0] || null, error: null };
    },
    then(resolve) {
      return Promise.resolve({ data: tableRows[table] || [], error: null }).then(resolve);
    }
  };
  return query;
}

globalThis.localStorage = {
  store: new Map(),
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  },
  setItem(key, value) {
    this.store.set(key, String(value));
  }
};

globalThis.document = {
  documentElement: {
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  },
  getElementById(id) {
    assert.equal(id, 'app');
    return appNode;
  },
  addEventListener(type, handler) {
    if (listeners[type]) listeners[type].push(handler);
  },
  createElement(tag) {
    return {
      tagName: String(tag).toUpperCase(),
      style: {},
      click() {},
      set href(value) { this._href = value; },
      get href() { return this._href; }
    };
  }
};

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    serviceWorker: { register: () => Promise.resolve() },
    clipboard: { writeText: () => Promise.resolve() }
  }
});

globalThis.window = globalThis;
globalThis.location = { hash: '', search: '', pathname: '/', origin: 'http://localhost' };
globalThis.history = { replaceState() {} };
window.supabase = {
  createClient() {
    return {
      auth: {
        async getSession() {
          return { data: { session: { user: { id: 'user-1', email: 'test@example.com', user_metadata: {} } } } };
        },
        onAuthStateChange() {}
      },
      from(table) {
        return queryFor(table);
      }
    };
  }
};

globalThis.confirm = () => true;
globalThis.prompt = () => '';
globalThis.URL = { createObjectURL: () => 'blob:mock' };
globalThis.Blob = class BlobMock {
  constructor(parts, options) {
    this.parts = parts;
    this.options = options;
  }
};
globalThis.FormData = class FormDataMock {};
globalThis.FileReader = class FileReaderMock {};

await import('../app.js');
await new Promise(resolve => setTimeout(resolve, 0));
await new Promise(resolve => setTimeout(resolve, 0));

assert.match(appNode.innerHTML, /Nuovo consuntivo/);
assert.match(appNode.innerHTML, /Timesheet/);

window.toggleMainMenu();
assert.match(appNode.innerHTML, /topMenu/);
assert.match(appNode.innerHTML, /Fatture/);

window.go('summary');
assert.match(appNode.innerHTML, /Riepilogo/);
assert.match(appNode.innerHTML, /Torna a Home/);

window.back();
assert.match(appNode.innerHTML, /Nuovo consuntivo/);

window.go('settings');
assert.match(appNode.innerHTML, /Configurazione/);
assert.match(appNode.innerHTML, /Torna a Home/);

listeners.input[0]({ target: { closest: selector => selector === '.form' } });
window.go('billing');
assert.match(appNode.innerHTML, /Modifiche non salvate/);
assert.match(appNode.innerHTML, /Configurazione/);
assert.doesNotMatch(appNode.innerHTML, /Totale fatturazione mese/);

console.log('navigation regression test passed');
