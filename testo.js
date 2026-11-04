// Dimensione del testo: sta in <head>, prima del CSS, così la pagina
// compare già con la misura giusta. Stesse regole di Debt Escape
// («Testo su misura», versione 3 del 4/11/2026).
//
// Tutte le scritte sono in rem e partono dalla radice, che è il prodotto
// di due fattori (styles.css, regola html):
//  --testo-sistema  la dimensione scelta nel dispositivo. Sul computer e su
//                   Android il 100% del browser la segue già; su iPhone e
//                   iPad la dimensione di Impostazioni › Schermo e
//                   luminosità › Dimensioni testo il browser la dà solo come
//                   font «-apple-system-body», che al valore standard vale
//                   17px: si legge e si divide per 17, così con le
//                   impostazioni normali l'app resta identica.
//  data-testo       la scelta fatta in Aspetto, solo per questo dispositivo:
//                   «piccolo» ×0,9, niente = Normale, «grande» ×1,125,
//                   «molto» ×1,25.
(function () {
  var radice = document.documentElement;
  // Le misure «per l'accessibilità» di iOS arrivano a 53px (3 volte il
  // normale): oltre 1,5 le cifre grandi non stanno più nello schermo di un
  // telefono. Chi ha bisogno di più ha lo zoom e «Molto grande»
  // (1,5 × 1,25 = quasi il doppio). Sotto 0,8 il testo diventa illeggibile.
  function limita(f) { return Math.round(Math.min(1.5, Math.max(0.8, f)) * 1000) / 1000; }
  function fattoreSistema() {
    try {
      if (!(window.CSS && CSS.supports && CSS.supports("font", "-apple-system-body") && CSS.supports("-webkit-touch-callout", "none"))) return 1;
      var s = document.createElement("span");
      s.style.font = "-apple-system-body"; s.style.position = "absolute"; s.style.visibility = "hidden";
      radice.appendChild(s);
      var px = parseFloat(getComputedStyle(s).fontSize);
      radice.removeChild(s);
      return px > 0 ? limita(px / 17) : 1;
    } catch (e) { return 1; }
  }
  function applica() {
    var scelta = "";
    try { scelta = localStorage.getItem("totime-testo") || ""; } catch (e) { /* senza memoria locale: Normale */ }
    if (scelta === "piccolo" || scelta === "grande" || scelta === "molto") radice.setAttribute("data-testo", scelta);
    else radice.removeAttribute("data-testo");
    radice.style.setProperty("--testo-sistema", String(fattoreSistema()));
  }
  applica();
  // Se si cambia la dimensione nel telefono con l'app aperta, al ritorno si adegua.
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") applica(); });
  window.applicaDimensioneTesto = applica;
  window.limitaFattoreTesto = limita; // per i test
})();
