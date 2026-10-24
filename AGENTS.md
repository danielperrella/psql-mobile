# Istruzioni per agenti — Psql Mobile

## Contesto e fonti

Psql Mobile è una UI web riutilizzata dentro un APK Android. L’APK apre connessioni PostgreSQL dirette via pgJDBC; il browser statico è demo e può usare il gateway Express storico. Il README è la fonte prodotto più completa; distingui sempre Android e browser.

## Esplorazione prima delle modifiche

- Controlla branch, stato e diff locale. Mappa il flusso modificato tra `src/`, `android/app/src/main/java/`, `server/` e test corrispondenti.
- Per Android leggi anche `AndroidManifest.xml`, Gradle, `ConnectionStore`, `ConnectionOptions`, `PgDatabase`, `PostgresBridge` e la policy di sola lettura.
- Per gateway browser verifica `.env.example`, `server/index.js` e `server/core.js`; non presumere che il gateway sia usato dall’APK.
- Consulta i workflow CI e `scripts/` per i comandi reali. Non usare database di produzione nei test.

## Struttura e convenzioni

- `src/`: ES modules JavaScript, UI, editor CodeMirror, query, filtri, record e stili.
- `android/`: app Java 17, WebView locale tramite AndroidX WebKit, pgJDBC, storage sicuro e bridge nativo.
- `server/`: gateway Express/pg per browser legacy; `tests/` e test adiacenti contengono fixture UI e unit/integration test.
- Mantieni il bridge limitato agli asset inclusi, le richieste WebView remote bloccate, la parametrizzazione per lookup/CRUD e i limiti dei risultati.
- Profili credenziali e certificati vanno cifrati nell’Android Keystore; mai loggare URI o segreti.

## Comandi presenti

```sh
npm ci
npm test
npm run build
npm run build:android
```

Per test/build Android: dalla cartella `android`, `gradlew.bat testDebugUnitTest lintDebug assembleDebug`. L’integrazione strumentata richiede emulatore e PostgreSQL usa e getta; il README e `.github/workflows/android-test.yml` riportano il comando completo. Requisiti correnti: Node 22+, JDK 17, Android SDK 35.

## Vincoli e Definition of Done

- Modifica solo il lato richiesto (app Android, demo web o gateway); una funzione browser non prova una funzione Android e viceversa.
- La modalità read-only è difesa da policy SQL e transazione PostgreSQL read-only; non presentarla come sostituto dei privilegi DB.
- Modifiche schema/CRUD devono rispettare PK complete, query parametrizzate, permessi/RLS e controllo delle modifiche concorrenti.
- Non aggiungere segreti, certificati privati, APK di prova o chiavi release. Non alterare manifest/release senza requisito.
- Mantieni test, tipi PostgreSQL, comportamento TLS e aggiornamenti compatibili. Esegui verifiche pertinenti e `git diff --check`; documenta test non eseguiti e limiti.
