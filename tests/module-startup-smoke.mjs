import assert from 'node:assert/strict';

const appNode = { innerHTML: '' };

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
  addEventListener() {},
  createElement(tag) {
    return {
      tagName: String(tag).toUpperCase(),
      style: {},
      click() {},
      set href(value) {
        this._href = value;
      },
      get href() {
        return this._href;
      }
    };
  }
};

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    serviceWorker: {
      register() {
        return Promise.resolve();
      }
    },
    clipboard: {
      writeText() {
        return Promise.resolve();
      }
    }
  }
});

globalThis.window = globalThis;
window.supabase = {
  createClient() {
    return {
      auth: {
        async getSession() {
          return { data: { session: null } };
        },
        onAuthStateChange() {}
      },
      from() {
        throw new Error('Supabase table access should not run for logged-out startup smoke test.');
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

assert.match(appNode.innerHTML, /Accedi al tuo profilo/);
assert.equal(document.documentElement.attributes['data-theme'], 'light');
assert.equal(localStorage.getItem('totime-theme'), 'light');
assert.equal(typeof window.signIn, 'function');
assert.equal(typeof window.go, 'function');
assert.equal(typeof window.back, 'function');
assert.equal(typeof window.toggleMainMenu, 'function');
assert.equal(typeof window.menuDropdown, 'function');
assert.equal(typeof window.guardUnsavedChanges, 'function');
assert.equal(typeof window.importCsv, 'function');
assert.equal(typeof window.billingCalc, 'function');
assert.equal(typeof window.projectionCalc, 'function');
assert.equal(typeof window.saveTaxSettings, 'function');

console.log('module startup smoke test passed');
