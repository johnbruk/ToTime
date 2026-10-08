// Il ponte fra l'HTML inline e il codice, nei DUE versi.
//
// app.js disegna le schermate con stringhe, e i gesti sono onclick=""
// dentro quelle stringhe: il browser li cerca su window. Un nome che
// non arriva in Object.assign(window,{...}) e' un bottone morto.
//
// Quel verso era gia' sorvegliato a mano. Mancava l'altro, e mi ha
// morso: togliendo due schede dalla pagina di fatturazione ho lasciato
// i loro nomi nell'elenco degli esportati. Object.assign valuta ogni
// nome, quindi app.js moriva alla riga 5897 con «billingMonthlyView is
// not defined» — l'intera app bianca, non solo quella pagina. Nessuno
// dei 1516 controlli di allora lo vedeva, perche' tutti partono da una
// pagina che si e' caricata.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

const inizio = src.indexOf('Object.assign(window,{');
assert.notEqual(inizio, -1, 'app.js deve esporre i gesti su window');
const fine = src.indexOf('\n});', inizio);
assert.notEqual(fine, -1, 'il blocco Object.assign deve chiudersi');

// I commenti dentro il blocco sono in italiano: senza toglierli, parole
// come «schermo» o «database» passerebbero per nomi esportati.
const blocco = src.slice(inizio, fine)
  .split('\n').map(r => r.replace(/\/\/.*$/, '')).join('\n');

const esposti = new Set(
  [...blocco.matchAll(/(?<=[\s{,])([A-Za-z_$][\w$]*)(?=\s*[,:}])/g)].map(m => m[1]));

const dichiarati = new Set();
for (const m of src.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) dichiarati.add(m[1]);
for (const m of src.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) dichiarati.add(m[1]);

const inline = new Set();
for (const m of src.matchAll(/on(?:click|change|submit|input|blur|focus|keyup)="([A-Za-z_$][\w$]*)\(/g)) inline.add(m[1]);

const fantasmi = [...esposti].filter(n => !dichiarati.has(n));
const orfani = [...inline].filter(n => !esposti.has(n));

assert.deepEqual(fantasmi, [],
  "nomi esportati su window che non esistono pi\u00f9: Object.assign li valuta e app.js muore al caricamento");
assert.deepEqual(orfani, [],
  'gesti onclick="" senza il loro nome su window: bottoni che non fanno niente');

assert.ok(inline.size > 100, "i gesti inline devono essere ancora li, non e cambiato il modo di disegnare");
assert.ok(esposti.size > 100, "e l'elenco degli esportati pure");

console.log(`Window bridge smoke tests passed. (${inline.size} gesti inline, ${esposti.size} nomi esposti)`);
