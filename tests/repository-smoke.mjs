import assert from 'node:assert/strict';

import { createRepository } from '../src/dataRepository.js';
import { APP_DATA_KEYS } from '../src/appDataShape.js';

function makeQuery(table, calls, errorTables = new Set(), errorObj = null) {
  const query = {
    select(value) {
      calls.push([table, 'select', value]);
      return this;
    },
    order(column, options) {
      calls.push([table, 'order', column, options]);
      return this;
    },
    async then(resolve) {
      if (errorTables.has(table)) {
        resolve({ data: null, error: errorObj || new Error(`${table} failed`) });
        return;
      }
      resolve({ data: [{ id: `${table}-1` }], error: null });
    }
  };
  return query;
}

function makeSupabaseMock(errorTables = new Set(), errorObj = null) {
  const calls = [];
  return {
    calls,
    sb: {
      from(table) {
        calls.push([table, 'from']);
        return makeQuery(table, calls, errorTables, errorObj);
      }
    }
  };
}

const firstMock = makeSupabaseMock();
const repository = createRepository(firstMock.sb);
// Il numero non si scrive a mano: si confronta con le chiavi dello
// shape, cosi' aggiungere una tabella non fa fallire il test per un
// conteggio stantio.
assert.equal(repository.tables.length, APP_DATA_KEYS.length);
assert.deepEqual(
  repository.tables.map(([, key]) => key).slice().sort(),
  APP_DATA_KEYS.slice().sort()
);

const clients = await repository.clients.list();
assert.deepEqual(clients, [{ id: 'clients-1' }]);
assert.ok(firstMock.calls.some(call => call[0] === 'clients' && call[1] === 'order' && call[2] === 'created_at'));

firstMock.calls.length = 0;
const timesheet = await repository.timesheet.list();
assert.deepEqual(timesheet, [{ id: 'timesheet_entries-1' }]);
assert.ok(firstMock.calls.some(call => call[0] === 'timesheet_entries' && call[1] === 'order' && call[2] === 'entry_date'));

const loadAllMock = makeSupabaseMock();
const loadAllResult = await createRepository(loadAllMock.sb).loadAll();
assert.equal(loadAllResult.errors.length, 0);
assert.equal(Object.keys(loadAllResult.data).length, APP_DATA_KEYS.length);
assert.deepEqual(loadAllResult.data.clients, [{ id: 'clients-1' }]);
assert.deepEqual(loadAllResult.data.entries, [{ id: 'timesheet_entries-1' }]);

const failingMock = makeSupabaseMock(new Set(['tax_payments']));
const failingResult = await createRepository(failingMock.sb).loadAll();
assert.equal(failingResult.errors.length, 1);
assert.equal(failingResult.errors[0].table, 'tax_payments');
assert.deepEqual(failingResult.data.taxPayments, []);
assert.deepEqual(failingResult.data.clients, [{ id: 'clients-1' }]);

console.log('Repository smoke tests passed.');

// Una tabella della migrazione commesse/WBS che non esiste ancora non
// deve diventare un avviso per chi usa l'app: viene marcata come
// facoltativa e l'interfaccia la ignora.
const missing = new Error('relation "public.wbs_items" does not exist');
missing.code = '42P01';
const optionalMock = makeSupabaseMock(new Set(['wbs_items']), missing);
const optionalResult = await createRepository(optionalMock.sb).loadAll();
const wbsError = optionalResult.errors.find(e => e.table === 'wbs_items');
assert.ok(wbsError, 'l\'errore viene comunque registrato');
assert.equal(wbsError.optional, true, 'ma marcato come facoltativo');
assert.deepEqual(optionalResult.data.wbsItems, []);

// mentre una tabella storica che sparisce resta un errore vero
const realFail = makeSupabaseMock(new Set(['clients']), Object.assign(new Error('boom'), { code: 'XX000' }));
const realResult = await createRepository(realFail.sb).loadAll();
assert.equal(realResult.errors.find(e => e.table === 'clients').optional, false);
