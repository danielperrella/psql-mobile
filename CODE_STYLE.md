# Convenzioni di sviluppo — Psql Mobile

- **JavaScript:** ES modules (`package.json` ha `type: module`); funzioni e variabili camelCase, classi PascalCase. Vite usa `src/` e test Node built-in `node:test`. Il codice esistente usa spesso sintassi compatta: mantieni lo stile del file vicino senza comprimere ulteriormente logica nuova.
- **Java Android:** package `it.psqlmobile.app`, classi PascalCase, metodi/campi camelCase. Java 17, JUnit 4 per unit test e AndroidX Test per instrumentation.
- **Separazione:** logica UI e rendering in `src/`; accesso PostgreSQL, Keystore, TLS e file picker in Java; gateway legacy isolato in `server/`. Non trasferire segreti o accesso DB al browser.
- **Validazione:** valida URI, certificati, payload bridge, identificatori e tipi; per valori SQL usa parametri. Gli identificatori schema/tabella/colonna devono passare dalle funzioni di quoting/catalogo già presenti.
- **Errori:** messaggi UI chiari e senza credenziali. Il bridge normalizza errori; non esporre URI JDBC, password, contenuti di certificati o token nei log.
- **SQL/read-only:** mantieni controlli server-side e transazioni read-only; i controlli UI da soli non sono confine di sicurezza.
- **Build/deps:** dipendenze npm in package e lockfile; Android in Gradle. Non aggiornare versioni né introdurre librerie senza motivazione e verifica.
- **Test:** `node:test` per `src/*.test.js` e `server/*.test.js`; JUnit per Android locale; Android instrumentation per PostgreSQL reale/flows. I test con DB richiedono fixture usa e getta.
- **Commit:** nessuna regola commit specifica individuata nelle istruzioni correnti; segui la richiesta dell’incarico e non includere cambiamenti preesistenti.

Per modifiche UI verifica sia browser sia flavor Android quando la funzione è condivisa; per bridge/TLS/Keystore usa i test Android corrispondenti.
