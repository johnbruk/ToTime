import assert from 'node:assert/strict';

import { createRepository } from '../src/dataRepository.js';
import { APP_DATA_KEYS } from '../src/appDataShape.js';

// Il finto Supabase ha il tetto del vero: al massimo «tetto» righe per
// richiesta, 1000 se non si dice altro. Le pagine si chiedono con range,
// e con count:'exact' il database dice quante righe ci sono in tutto.
function makeQuery(table, calls, errorTables = new Set(), errorObj = null, righe = {}, tetto = 1000) {
  let rng = null, conteggio = false;
  const query = {
    select(value, options) {
      calls.push([table, 'select', value, options]);
      conteggio = !!(options && options.count);
      return this;
    },
    order(column, options) {
      calls.push([table, 'order', column, options]);
      return this;
    },
    range(from, to) {
      calls.push([table, 'range', from, to]);
      rng = [from, to];
      return this;
    },
    async then(resolve) {
      if (errorTables.has(table)) {
        resolve({ data: null, error: errorObj || new Error(`${table} failed`) });
        return;
      }
      const tutte = righe[table] || [{ id: `${table}-1` }];
      const pagina = (rng ? tutte.slice(rng[0], rng[1] + 1) : tutte).slice(0, tetto);
      resolve({ data: pagina, error: null, count: conteggio ? tutte.length : null });
    }
  };
  return query;
}

function makeSupabaseMock(errorTables = new Set(), errorObj = null, righe = {}, tetto = 1000) {
  const calls = [];
  return {
    calls,
    sb: {
      from(table) {
        calls.push([table, 'from']);
        return makeQuery(table, calls, errorTables, errorObj, righe, tetto);
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

// Oltre le 1000 righe arrivano tutte: a pagine, in ordine stabile.
const tante = Array.from({ length: 2345 }, (_, i) => ({ id: `t-${String(i).padStart(4, '0')}` }));
const pagMock = makeSupabaseMock(new Set(), null, { timesheet_entries: tante });
const tutte = await createRepository(pagMock.sb).timesheet.list();
assert.equal(tutte.length, 2345, 'oltre le 1000 righe arrivano tutte');
assert.equal(new Set(tutte.map(r => r.id)).size, 2345, 'senza doppioni');
assert.deepEqual(pagMock.calls.filter(c => c[1] === 'range').map(c => [c[2], c[3]]),
  [[0, 999], [1000, 1999], [2000, 2999]], 'in tre pagine da 1000');
assert.ok(pagMock.calls.some(c => c[1] === 'order' && c[2] === 'entry_date'), 'nell\'ordine di sempre');
assert.ok(pagMock.calls.some(c => c[1] === 'order' && c[2] === 'id'), 'con l\'id come spareggio');
// con «Max rows» piu' basso della pagina non si scambia il tetto per la fine
const basso = makeSupabaseMock(new Set(), null, { timesheet_entries: tante }, 400);
assert.equal((await createRepository(basso.sb).timesheet.list()).length, 2345, 'anche col tetto a 400');
// una pagina che cade sempre a meta': niente mezza tabella come se fosse
// intera — l'errore arriva a chi carica, che lo dice
const cade = makeSupabaseMock(new Set(), null, { timesheet_entries: tante });
const fromOrig = cade.sb.from;
cade.sb.from = table => {
  const q = fromOrig(table);
  const thenOrig = q.then.bind(q);
  let da = 0;
  const rangeOrig = q.range.bind(q);
  q.range = (a, z) => { da = a; return rangeOrig(a, z); };
  q.then = resolve => da >= 1000 ? resolve({ data: null, error: new Error('Failed to fetch') }) : thenOrig(resolve);
  return q;
};
await assert.rejects(createRepository(cade.sb).timesheet.list(), /ricarica la pagina/,
  'una pagina che cade sempre fa errore, non restituisce le prime 1000 righe');
// e una tabella piccola resta una richiesta sola
const piccola = makeSupabaseMock();
await createRepository(piccola.sb).clients.list();
assert.equal(piccola.calls.filter(c => c[0] === 'clients' && c[1] === 'from').length, 1, 'una tabella piccola, una richiesta');

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

// Le fatture conservate: facoltative come le altre tabelle nuove, e
// l'elenco non si porta dietro gli XML, che si scaricano uno per volta.
const docMissing = Object.assign(new Error("Could not find the table 'public.invoice_documents' in the schema cache"), { code: 'PGRST205' });
const docResult = await createRepository(makeSupabaseMock(new Set(['invoice_documents']), docMissing).sb).loadAll();
assert.equal(docResult.errors.find(e => e.table === 'invoice_documents').optional, true,
  'senza la migrazione delle fatture conservate non e\' un errore da mostrare');
assert.deepEqual(docResult.data.invoiceDocuments, []);
const colMock = makeSupabaseMock();
await createRepository(colMock.sb).loadAll();
const docSelect = colMock.calls.find(c => c[0] === 'invoice_documents' && c[1] === 'select');
assert.ok(docSelect && docSelect[2] !== '*' && !/(^|,)xml(,|$)/.test(docSelect[2]),
  'l\'elenco delle fatture conservate non carica gli XML');

// mentre una tabella storica che sparisce resta un errore vero
const realFail = makeSupabaseMock(new Set(['clients']), Object.assign(new Error('boom'), { code: 'XX000' }));
const realResult = await createRepository(realFail.sb).loadAll();
assert.equal(realResult.errors.find(e => e.table === 'clients').optional, false);
