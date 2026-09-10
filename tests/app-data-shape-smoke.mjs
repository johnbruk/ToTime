import assert from 'node:assert/strict';

import {
  APP_DATA_KEYS,
  appDataHasExpectedShape,
  createEmptyAppData,
  normalizeAppData
} from '../src/appDataShape.js';

const empty = createEmptyAppData();
// Non un numero a mano, che invecchia a ogni tabella aggiunta: si
// verifica che le chiavi siano uniche e che ci siano quelle attese.
assert.equal(new Set(APP_DATA_KEYS).size, APP_DATA_KEYS.length, 'nessuna chiave ripetuta');
['clients','projects','activities','entries','engagements','wbsItems','billingLines','invoiceAllocations']
  .forEach(k => assert.ok(APP_DATA_KEYS.includes(k), `manca la chiave ${k}`));
assert.equal(appDataHasExpectedShape(empty), true);
assert.deepEqual(empty.clients, []);
assert.deepEqual(empty.taxPayments, []);

const normalized = normalizeAppData({
  clients: [{ id: 'client-1' }],
  entries: 'not-array',
  taxSettings: [{ fiscal_year: 2026 }]
});

assert.deepEqual(normalized.clients, [{ id: 'client-1' }]);
assert.deepEqual(normalized.entries, []);
assert.deepEqual(normalized.taxSettings, [{ fiscal_year: 2026 }]);
assert.deepEqual(normalized.projects, []);
assert.equal(appDataHasExpectedShape(normalized), true);
assert.equal(appDataHasExpectedShape({ clients: [] }), false);

console.log('App data shape smoke tests passed.');
