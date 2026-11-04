# Testo su misura: regole comuni per Debt Escape e ToTime

Versione 3 del 4/11/2026, valida per tutte e due le app. Se cambia qui, va portata anche nell'altra app.

## Cosa deve succedere
1. **Segue il testo scelto nel dispositivo, in giù e in su**: iPhone e iPad (anche con l'app aggiunta alla schermata Home), Android, browser del computer.
2. **Cresce con lo schermo**: telefoni come oggi, tablet +4%, tablet in orizzontale e portatili +8,5%, computer +12,5%.
3. **In Impostazioni, «Dimensione del testo»**: Piccolo · Normale · Grande · Molto grande (×0,9 · ×1 · ×1,125 · ×1,25), solo su quel dispositivo. Si moltiplica per i punti 1 e 2.
4. **Con le impostazioni normali, sul telefono la grafica resta identica a prima.**
5. **Niente si rompe** con il testo al massimo: cifre, righe, grafici.

## Come si fa
- Tutte le dimensioni del testo in `rem` (o `em`), mai in `px`. Anche gli spazi principali (token `--sp-*`) in `rem`. Bordi e linee sottili restano in px. Se un elemento si allinea a un altro che usa un token in `rem` (per esempio l'intestazione di colonne sopra le righe), deve usare lo stesso token: con un `px` fisso sul computer slitta.
- Sul `<html>` la misura è il prodotto di tre fattori, tutti moltiplicazioni sul 100% del browser:
  ```css
  html{ font-size: calc(100% * var(--testo-schermo,1) * var(--testo-sistema,1) * var(--testo-scelto,1)); }
  @media (min-width:768px){ :root{ --testo-schermo:1.04 } }
  @media (min-width:1024px){ :root{ --testo-schermo:1.085 } }
  @media (min-width:1280px){ :root{ --testo-schermo:1.125 } }
  :root[data-testo="piccolo"]{ --testo-scelto:.9 }
  :root[data-testo="grande"]{ --testo-scelto:1.125 }
  :root[data-testo="molto"]{ --testo-scelto:1.25 }
  ```
- **A gradini, non con `vw`**: una formula con `vw` somma pixel fissi e chi ha il carattere del browser più grande perde la proporzione.
- **iPhone e iPad**: nel file che parte in `<head>` (ToTime: `testo.js`) si legge la misura di `font: -apple-system-body` (17px = normale) e si mette `--testo-sistema` = misura/17, **fermato tra 0,8 e 1,5** (le misure «per l'accessibilità» di iOS arrivano a 53px). Solo dove esistono sia quel carattere sia `-webkit-touch-callout`. Si rilegge a `visibilitychange`.
- La scelta dell'app si salva sul dispositivo e si applica nello stesso script in `<head>`, prima del CSS.
- **I campi dove si scrive restano almeno a 16px sui dispositivi touch** (`max(16px,1rem)`): sotto, Safari ingrandisce la pagina da solo.
- **Le media query dei layout in `em`**, non in `px` (seguono il carattere del browser); i gradini dello schermo qui sopra restano in px. Colonne della griglia con `minmax(0,1fr)` dove una colonna può schiacciare l'altra.
- Quando lo spazio finisce, le cose vanno a capo invece di uscire: in ToTime con container query sulla pagina (`.app{container:app/inline-size}`; sotto 20,5rem riquadri dei numeri uno sotto l'altro, sotto 18rem righe, moduli e conto economico a capo); titoli con `overflow-wrap:break-word; hyphens:auto` e `lang="it"`.
- Le cifre non si tagliano mai con «…»: i puntini vanno bene solo su nomi e note.
- `-webkit-text-size-adjust:100%`. Mai bloccare lo zoom.

## Prove
In ToTime: `tests/ui/dimensione-testo.mjs`.
- Radice: 16px a 320–767 px; 16,64px a 768; 17,36px a 1024; 18px a 1280 e 1920.
- iPhone al minimo (0,824) e al massimo (1,353); misure enormi (53px) ferme a 1,5; campi a 16px.
- Carattere del browser a 12px e a 20px (`Page.setFontSizes` di Chromium): la radice resta in proporzione.
- Ogni schermata a 320, 360, 430, 768 e 1280 px, testo del dispositivo a 100% e 135%, scelta su Piccolo e Molto grande, e anche con un carattere più largo (DejaVu Sans): la pagina non scorre di lato, nessun testo o cifra tagliato, campi touch ≥16px.
- A testo normale, sul telefono, ogni schermata identica pixel per pixel alla versione precedente.
