# Design system — Psql Mobile

Non è presente un design system separato o una libreria di componenti UI. L’interfaccia principale vive in `index.html`, `src/style.css` e fogli/componenti CSS in `src/`.

## Pattern osservati

- Layout mobile con tre viste raggiungibili dalla barra inferiore: Tabelle, SQL e Risultati. La UI offre home connessioni, schema, editor CodeMirror, filtri, risultati e dialoghi per dettagli, modifica e aggiornamento.
- Risultati tabellari sono paginati; su mobile il record si apre in dettaglio verticale invece di richiedere scroll orizzontale. Le azioni Nuovo/Modifica/Elimina sono contestuali ai risultati e ai record collegati.
- Form di connessione supporta URI o campi separati, opzione read-only e certificati TLS. Validazioni e feedback sono mostrati vicino ai campi; aggiornamenti e operazioni asincrone espongono stato/errore.
- Android riusa gli asset in WebView locale; il CSS distingue il contesto `.native-android`. La demo browser usa dati simulati e la UI fixture per verifiche.

## Responsive, accessibilità e limiti

Il README documenta layout mobile senza griglia orizzontale per i record, modali di dettaglio, editor con wrapping, stati di connessione e feedback testuale. Gli stati aggiornamento usano `role=status`/`aria-live`; errori di form sono presentati nella UI. Non risulta una specifica formale per palette/tipografia/spaziatura né audit accessibilità con standard o target dichiarati: ricava i valori dal CSS esistente e non inventare token.

Mantieni focus e tastiera nei dialoghi, label degli input, feedback leggibile e touch target mobile. L’interfaccia Android deve continuare a funzionare offline come asset locali; richieste di rete remote non vanno aggiunte al flavor Android senza modifica architetturale consapevole.
