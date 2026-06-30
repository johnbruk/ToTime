# TOTIME — Refactoring Phase 4

## Obiettivo

Introdurre componenti UI riutilizzabili e regole di rendering sicuro, mantenendo l'aspetto attuale dell'app.

## Perché serve

Oggi molte porzioni HTML sono generate direttamente dentro stringhe in `app.js`. Questo rende più difficile:

- mantenere coerenza grafica;
- evitare duplicazioni;
- controllare escape HTML;
- modificare pulsanti, card e badge in modo uniforme.

## Sequenza proposta

### Fase 4A — Piano e criteri

Documentare componenti target e regole di sicurezza.

### Fase 4B — UI helpers non invasivi

Creare helper senza collegarli subito alle viste operative.

Output indicativo:

```text
src/ui/components.js
```

### Fase 4C — Componenti semplici

Estrarre componenti a basso rischio:

- `badge()`
- `button()`
- `field()`
- `emptyState()`

### Fase 4D — Componenti contenitore

Estrarre componenti più ampi:

- `card()`
- `list()`
- `row()`
- `kpiGrid()`

## Regole

- Nessuna modifica funzionale intenzionale.
- Mantenere stesso design Copilot-like già approvato.
- Non cambiare tema chiaro/scuro.
- Escape HTML obbligatorio sui contenuti utente.
- Evitare innerHTML non protetto per dati inseriti dall'utente.

## Componenti candidati

```js
badge(label, tone)
button(label, options)
field(label, inputHtml)
card(title, body)
row({ icon, title, description, value })
metricLine(hours, amount)
amountLine(label, amount)
```

## Test minimi

```bash
npm test
```

Verifica manuale:

- home;
- menu;
- settings;
- timesheet;
- fatturazione;
- fiscalità;
- tema chiaro/scuro.

## Output finale atteso

Una base UI più coerente, ma senza cambiare il comportamento dell'app.
