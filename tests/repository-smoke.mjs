import assert from 'node:assert/strict';

import { createRepository } from '../src/dataRepository.js';

function makeQuery(table, calls, errorTables = new Set()) {
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
        resolve({ data: null, error: new Error(`${table} failed`) });
        return;
      }
      resolve({ data: [{ id: `${table}-1` }], error: null });
    }
  };
  return query;
}

function makeSupabaseMock(errorTables = new Set()) {
  const calls = [];
  return {
    calls,
    sb: {
      from(table) {
        calls.push([table, 'from']);
        return makeQuery(table, calls, errorTables);
      }
    }
  };
}

const firstMock = makeSupabaseMock();
const repository = createRepository(firstMock.sb);
assert.equal(repository.tables.length, 14);

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
assert.equal(Object.keys(loadAllResult.data).length, 14);
assert.deepEqual(loadAllResult.data.clients, [{ id: 'clients-1' }]);
assert.deepEqual(loadAllResult.data.entries, [{ id: 'timesheet_entries-1' }]);

const failingMock = makeSupabaseMock(new Set(['tax_payments']));
const failingResult = await createRepository(failingMock.sb).loadAll();
assert.equal(failingResult.errors.length, 1);
assert.equal(failingResult.errors[0].table, 'tax_payments');
assert.deepEqual(failingResult.data.taxPayments, []);
assert.deepEqual(failingResult.data.clients, [{ id: 'clients-1' }]);

console.log('Repository smoke tests passed.');
