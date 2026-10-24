# Testing — Psql Mobile

## Suite presenti

- JavaScript: Node built-in `node:test`, test in `server/*.test.js` e `src/*.test.js` per gateway, parsing URI, filtri, risultati, preferiti, demo e UI logic.
- Android JVM: JUnit 4 in `android/app/src/test`; test di opzioni, policy read-only, certificati e manifest/update.
- Android strumentati: `android/app/src/androidTest`, con flussi UI, PostgreSQL diretto, TLS/certificati, profili cifrati, relazioni e CRUD. Richiedono emulatore e database isolato.
- `tests/ui-fixture.html` fornisce fixture browser simulata; non è un servizio di produzione.

## Comandi

```sh
npm ci
npm test
npm run build
npm run build:android
```

Build e unit test Android (dalla root di `android/`):

```sh
gradlew.bat testDebugUnitTest lintDebug assembleDebug
```

La suite strumentata con DB è documentata nel README; usa `adb reverse` e PostgreSQL di test su porta 55432, mai dati di produzione. CI in `.github/workflows/android-test.yml` avvia PostgreSQL disposable e test TLS; `.github/workflows/pages.yml` esegue test, build Android/browser, lint, verifica APK e pubblicazione.

## Limiti e criteri

I test Android di aggiornamento richiedono APK fixture locali esclusi dal repository; il README specifica che il test viene saltato se mancano. Il test di conservazione profili dopo update richiede installazione adb specifica. Browser gateway e APK diretto hanno trasporti differenti: verifica entrambi se la modifica è condivisa. Prima di accettare cambiamenti a SQL, verifica parametrizzazione, PK composite, permessi DB, read-only, TLS e precisione valori; per bridge, asset e credenziali usa i test Android. Non è definita percentuale target di copertura. I test non sono stati eseguiti per creare questa documentazione.
