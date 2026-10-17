# Psql Mobile — Android

App Android installabile con connessione **diretta a PostgreSQL**: inserisci una URI `postgresql://utente:password@host:5432/database` e premi Connetti. Non servono gateway, token, account aggiuntivi o server applicativi.

## Installazione

[Scarica APK Android](https://danielperrella.github.io/psql-mobile/psql-mobile.apk) · [Pagina e demo web](https://danielperrella.github.io/psql-mobile/)

L'APK è una build **debug per prova**, firmata automaticamente, per Android 8.0/API 26 o successivo. Si installa manualmente autorizzando il browser a installare quel file. Non è una pubblicazione sul Play Store. Le build CI usano chiavi debug effimere: per passare a una build con firma diversa potrebbe essere necessario disinstallare la precedente. Per una distribuzione stabile/Play Store occorre una chiave release privata conservata fuori dal repository.

Il database deve essere raggiungibile dal telefono: Internet, LAN oppure VPN. `localhost` sul telefono indica il telefono. Questa app non crea un database e non modifica firewall o configurazione PostgreSQL.

## Connessione e funzioni

- URI `postgres://` e `postgresql://` oppure comando completo `psql 'postgresql://…'`: prefisso e virgolette esterne vengono riconosciuti automaticamente. Il comando non viene eseguito. Il campo è visibile e multilinea, con esempi generici e validazione durante l’inserimento per virgolette, prefisso, spazi e percent-encoding. Sono supportati percent-encoding di utente/password/database e IPv6; in alternativa campi separati.
- Parametri URI supportati: `user`, `password`, `sslmode`, `channel_binding`, `application_name`. Parametri sconosciuti sono rifiutati esplicitamente; socket Unix, host multipli, certificati client e CA private importate non sono ancora supportati.
- Senza `sslmode` viene usato **verify-full**, con CA di sistema Android e verifica del nome host. La scelta TLS esplicita nel modulo prevale sulla URI. `require` cifra ma non verifica il certificato; `prefer`/`allow` seguono il comportamento pgJDBC e possono usare connessioni non cifrate. `disable` va scelto per un database senza TLS su una rete fidata.
- Autenticazione PostgreSQL con password, MD5 e SCRAM-SHA-256 tramite pgJDBC. Kerberos/GSS/SSPI non sono supportati su Android.
- Schema live, completamento CodeMirror, query o selezione SQL, script con più risultati, tabelle e salvataggio CSV tramite selettore Android. La demo usa dati simulati.
- Timeout connessione 10 s, query 15 s, socket 20 s. Sessione inattiva chiusa dopo 30 minuti e alla distruzione dell'Activity. La rotazione ricrea la sessione: è necessario riconnettersi.
- Ogni risultato visualizza al massimo 1.000 righe; le celle oltre 64 Ki caratteri e i risultati oltre 2 milioni di caratteri sono troncati e segnalati. Lo schema è limitato a 10.000 colonne. Usa `LIMIT` per query molto grandi. I valori sono restituiti come testo per conservare precisione numerica e date.

## Architettura Android

L'APK incorpora l'interfaccia ed esegue la parte database in **Java Android**, su un worker separato, con il driver ufficiale [pgJDBC](https://jdbc.postgresql.org/). L'interfaccia viene riutilizzata in una WebView locale tramite [WebViewAssetLoader](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content); non viene caricata da GitHub Pages e non comunica con un servizio HTTP. Il bridge nativo è accessibile solo al contenuto incluso nell'APK; richieste e pagine remote nella WebView sono bloccate.

Credenziali, token di sessione e connessioni restano in memoria: niente localStorage, cookie, log applicativi con credenziali o backup Android. Il CSV viene salvato solo nel documento scelto dall'utente. SQL usa tutti i permessi del ruolo PostgreSQL: scegli un ruolo di sola lettura se necessario.

## Compilazione Android

Richiede Node.js 22+, JDK 17 e Android SDK 35. Imposta `ANDROID_HOME` oppure `android/local.properties` (escluso da Git) con `sdk.dir=...`.

```sh
npm ci
npm test
npm run build:android
cd android
./gradlew testDebugUnitTest lintDebug assembleDebug
```

Su Windows usa `gradlew.bat`. APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

Il workflow GitHub Actions compila e verifica l'APK, lo rende scaricabile dalla pagina e lo conserva anche come artifact `psql-mobile-android`. Il codice del gateway storico è solo per la versione browser e non entra nell'APK.

## Test Android con PostgreSQL reale

I test `AppFlowTest` e `DirectConnectionTest` verificano il modulo di connessione senza gateway, autenticazione, query, NULL, Unicode, risultati multipli, limite righe, nomi colonna duplicati, errori e disconnessione. Usa un database di prova isolato, mai un database di produzione. Con un emulatore Android e PostgreSQL su porta locale 55432:

```sh
adb reverse tcp:55432 tcp:55432
cd android
./gradlew connectedDebugAndroidTest '-Pandroid.testInstrumentationRunnerArguments.postgresUri=postgresql://androidtest:psql-test-only@127.0.0.1:55432/postgres?sslmode=disable'
```

Per la suite CI riproducibile vedi `.github/workflows/android-test.yml`.

## Versione browser precedente

La pagina GitHub Pages resta una demo e un punto di download dell'APK. Il browser non può aprire socket PostgreSQL e continua a richiedere il gateway opzionale in `server/` per query reali. Nell'app Android quel requisito non esiste.
