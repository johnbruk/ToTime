import assert from 'node:assert/strict';

import {
  APP_DATA_KEYS,
  appDataHasExpectedShape,
  createEmptyAppData,
  normalizeAppData
} from '../src/appDataShape.js';

const empty = createEmptyAppData();
assert.equal(APP_DATA_KEYS.length, 14);
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
