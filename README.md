# Psql Mobile — Android

App Android installabile con connessione **diretta a PostgreSQL**: inserisci una URI `postgresql://utente:password@host:5432/database` e premi Connetti. Non servono gateway, token, account aggiuntivi o server applicativi.

## Installazione

[Scarica APK Android](https://danielperrella.github.io/psql-mobile/psql-mobile.apk) · [Pagina e demo web](https://danielperrella.github.io/psql-mobile/)

Dalla versione 1.3.0 l'APK usa una **firma release stabile**, per Android 8.0/API 26 o successivo. Per il passaggio dalle vecchie build debug occorre disinstallare la versione precedente una sola volta. Gli aggiornamenti successivi mantengono i dati dell’app. Non è una pubblicazione sul Play Store.

All’avvio trovi **Le tue connessioni**: scegli un database salvato oppure aggiungine uno. Nome, stringa, credenziali e TLS vengono conservati cifrati con AES-256-GCM e una chiave non esportabile nell’Android Keystore. Puoi modificare o rimuovere le connessioni e scegliere di non salvare una nuova connessione. Chiudere una sessione non cancella il profilo. Disinstallazione o cancellazione dati rimuovono i profili.

La schermata iniziale controlla `update.json` su GitHub Pages e propone **Aggiorna / Più tardi** quando trova una versione superiore. Il download avviene nell’app; vengono verificati dimensione, SHA-256, package, versione e corrispondenza della firma con l’app installata. Android gestisce l’autorizzazione per installare aggiornamenti e la conferma finale. Il controllo online non blocca le connessioni ai database.

Il database deve essere raggiungibile dal telefono: Internet, LAN oppure VPN. `localhost` sul telefono indica il telefono. Questa app non crea un database e non modifica firewall o configurazione PostgreSQL.

## Connessione e funzioni

- URI `postgres://` e `postgresql://` oppure comando completo `psql 'postgresql://…'`: prefisso e virgolette esterne vengono riconosciuti automaticamente. Il comando non viene eseguito. Il campo è visibile e multilinea, con esempi generici e validazione durante l’inserimento per virgolette, prefisso, spazi e percent-encoding. Sono supportati percent-encoding di utente/password/database e IPv6; in alternativa campi separati.
- Parametri URI supportati: `user`, `password`, `sslmode`, `channel_binding`, `application_name`. Parametri sconosciuti sono rifiutati esplicitamente; socket Unix, host multipli, certificati client e CA private importate non sono ancora supportati.
- Senza `sslmode` viene usato **verify-full**, con CA di sistema Android e verifica del nome host. La scelta TLS esplicita nel modulo prevale sulla URI. `require` cifra ma non verifica il certificato; `prefer`/`allow` seguono il comportamento pgJDBC e possono usare connessioni non cifrate. `disable` va scelto per un database senza TLS su una rete fidata.
- Autenticazione PostgreSQL con password, MD5 e SCRAM-SHA-256 tramite pgJDBC. Kerberos/GSS/SSPI non sono supportati su Android.
- Interfaccia mobile con tre viste: **Tabelle, SQL e Risultati**, raggiungibili dalla barra inferiore. Nessuna griglia da scorrere in orizzontale: la scritta sotto ogni record apre un dettaglio in modale con tutti i campi in verticale, anche per testi, JSON e nomi di colonna lunghi.
- Schema live con ricerca e preparazione di SELECT, completamento CodeMirror e query o selezione SQL. L’editor va a capo automaticamente. La demo usa dati simulati.
- Risultati a pagine di 20 record e ricerca su tutti i record caricati. Gli script con più risultati hanno un selettore dedicato. Il CSV esporta il risultato selezionato e filtrato, comprese tutte le sue pagine, tramite selettore Android.
- Nell’app Android le chiavi esterne dichiarate da PostgreSQL mostrano **Apri [tabella]** nei campi del record. Il collegamento funziona anche con alias e chiavi composte complete; puoi seguire più relazioni e tornare al risultato originale conservando pagina e filtro. NULL, valori troncati, espressioni e chiavi composte incomplete o ambigue non generano collegamenti. Non vengono dedotte relazioni dal nome `*_id`. Il record viene letto con query parametrizzata e con gli stessi permessi/RLS della connessione; non ci sono modifiche automatiche ai dati.
- **Modifica ed Elimina** come icone sui record dei risultati e nei dettagli collegati. **Nuovo** resta sopra l’elenco dei risultati e nello schema delle tabelle. Il modulo in modale rilegge tutti i campi dal database; distingue valori, NULL e DEFAULT, presenta booleani ed enum come scelte e mantiene in sola lettura i campi generati. Le lookup cercano nel database con risultati paginati e impostano insieme le parti delle chiavi esterne composte. La cancellazione richiede conferma esplicita.
- Date e orari hanno calendario e selettore dell’ora; i timestamp con fuso mostrano uno scostamento UTC esplicito. Le frazioni di secondo conservano fino a sei cifre e non vengono fatte conversioni attraverso il fuso del telefono. Valori speciali PostgreSQL come `infinity` restano modificabili come testo. Interi e decimali vengono inviati come stringhe per conservare la precisione; UUID, JSON, limiti degli interi e lunghezze testuali hanno validazione nel modulo. Array, bytea, intervalli, range, reti, XML e tipi personalizzati usano il formato testuale PostgreSQL con indicazioni dedicate, e il database applica i propri vincoli. I domini vengono risolti ricorsivamente per riconoscere tipo di base, enum, obbligatorietà e default.
- La modifica e la cancellazione richiedono una tabella con chiave primaria interamente presente nella query, senza provenienze ambigue. Viste, espressioni e record troncati restano in lettura. **Nuovo record** è disponibile anche dalle tabelle dello schema. SQL parametrizzato, permessi e RLS del ruolo si applicano a tutte le operazioni. Un controllo della versione del record impedisce di sovrascrivere modifiche avvenute dopo l’apertura del modulo; errori e vincoli causano rollback.
- Dopo il salvataggio vengono aggiornati i campi dei record caricati che corrispondono alla chiave primaria; un nuovo record viene mostrato in un risultato separato. Le query originali non vengono rieseguite automaticamente: per ricalcolare join, filtri, ordinamento o espressioni usa una SELECT. Le transazioni SQL già aperte devono essere chiuse prima di utilizzare il modulo.
- Timeout connessione 10 s, query 15 s, socket 20 s. Sessione inattiva chiusa dopo 30 minuti e alla distruzione dell'Activity. La rotazione ricrea la sessione: è necessario riconnettersi.
- Ogni risultato visualizza al massimo 1.000 righe; le celle oltre 64 Ki caratteri e i risultati oltre 2 milioni di caratteri sono troncati e segnalati. Lo schema è limitato a 10.000 colonne. Usa `LIMIT` per query molto grandi. I valori sono restituiti come testo per conservare precisione numerica e date.

## Filtri nella 1.6.0

I filtri leggono i tipi reali delle colonne, inclusi domini ed enum. Date e orari hanno controlli dedicati; i timestamp con fuso mantengono uno scostamento UTC esplicito e le frazioni di secondo. Per valori PostgreSQL speciali è disponibile l’inserimento testuale. Booleani ed enum usano una scelta tra valori ammessi; numeri e UUID vengono validati senza conversioni che ne riducano la precisione.

Le FK si possono filtrare cercando un record collegato per nome, ID o altro valore. Le chiavi composte vengono applicate insieme. I controlli NULL sulle relazioni richiedono rispettivamente tutti i campi NULL o tutti valorizzati. Sono disponibili anche diverso da, inizia/finisce con e intervalli inclusivi per numeri e date. I criteri si combinano con AND; dopo l’esecuzione un riepilogo sopra i risultati permette di riaprire i filtri. Non sono ancora presenti gruppi OR o viste salvate.

## Funzioni introdotte nella 1.5.0

- **Filtri e ordinamento** nello schema: scegli colonne, confronti o NULL e applica la query senza scrivere SQL. La selezione della tabella non esegue query; limite e offset permettono di leggere pagine successive.
- **Sola lettura** nelle impostazioni delle connessioni Android, salvata nel profilo cifrato. Nasconde le azioni di modifica e protegge le query con transazioni PostgreSQL read-only e un controllo dei comandi SQL. I comandi transazionali o di impostazione e gli script con scritture sono rifiutati in questa modalità. È una precauzione dell’app: per limitare i permessi del ruolo anche da altri programmi occorre configurarli in PostgreSQL.
- **Duplica record** nel dettaglio: apre una creazione precompilata, senza copiare chiavi primarie, identity o campi generati. Nessun inserimento avviene prima di premere Crea record; eventuali chiavi obbligatorie senza default vanno compilate.
- **Record collegati** nel dettaglio: elenca le FK che puntano al record e apre pagine da 25 figli, incluse relazioni composite e FK verso UNIQUE. Il padre viene riletto tramite PK e le letture rispettano permessi e RLS. Indietro conserva il risultato originale e il filtro.
- **Preferiti** per tabelle e record, separati per connessione salvata. L’APK cifra soltanto metadati e PK nell’Android Keystore, senza memorizzare interi record. Le tabelle preferite preparano una SELECT; i record vengono riletti con i permessi attuali. La demo web usa localStorage soltanto per i propri preferiti di esempio.

## Architettura Android

L'APK incorpora l'interfaccia ed esegue la parte database in **Java Android**, su un worker separato, con il driver ufficiale [pgJDBC](https://jdbc.postgresql.org/). L'interfaccia viene riutilizzata in una WebView locale tramite [WebViewAssetLoader](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content); non viene caricata da GitHub Pages e non comunica con un servizio HTTP. Il bridge nativo è accessibile solo al contenuto incluso nell'APK; richieste e pagine remote nella WebView sono bloccate.

Le sessioni e le connessioni attive restano in memoria. I profili scelti dall’utente vengono cifrati nell’archivio privato Android; la lista inviata all’interfaccia non contiene password. Niente localStorage, cookie, log applicativi con credenziali o backup/trasferimento dei profili Android. Il CSV viene salvato solo nel documento scelto dall'utente. SQL usa tutti i permessi del ruolo PostgreSQL: scegli un ruolo di sola lettura se necessario.

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

GitHub Actions compila e verifica il sorgente e pubblica l’APK release già firmato in `release/psql-mobile.apk`, dopo averne controllato integrità, firma e versione. L’artifact `psql-mobile-android` contiene questa stessa release. Il codice del gateway storico è solo per la versione browser e non entra nell'APK.

Per una nuova distribuzione, incrementa `publishedVersionCode` e `versionName` in Gradle e la versione dell’interfaccia, poi compila `assembleRelease` e usa `node scripts/package-release.mjs`. Versiona insieme sorgenti, APK pubblico e `release/update.json`. La chiave privata non entra nel repository né negli artifact: su questo PC è in `%LOCALAPPDATA%/PsqlMobile/signing/`, da conservare con un backup privato. Altrove imposta `PSQL_SIGNING_PROPERTIES` a un file privato con `storeFile`, `storePassword`, `keyAlias`, `keyPassword`. Senza chiave le build release restano non firmate e non devono essere distribuite.

## Test Android con PostgreSQL reale

I test Android verificano anche riapertura dei profili, cifratura a riposo, chiavi esterne/alias/chiavi composte e navigazione con ritorno ai risultati. `AppUpdaterTest` verifica integrità e firma con due APK di prova locali (versione successiva con firma corretta e con firma diversa) in `android/app/src/androidTest/assets/`, esclusi dal repository; senza fixture il test è saltato. Il test opzionale `savedConnectionSurvivesPackageUpdate` viene eseguito dopo un’installazione `adb install -r` per verificare la conservazione reale dei profili. `tests/ui-fixture.html`, servito da Vite in modalità Android, consente di provare home e avviso aggiornamento con dati simulati e non entra nei bundle. Usa un database di prova isolato, mai un database di produzione. Con un emulatore Android e PostgreSQL su porta locale 55432:

```sh
adb reverse tcp:55432 tcp:55432
cd android
./gradlew connectedDebugAndroidTest '-Pandroid.testInstrumentationRunnerArguments.postgresUri=postgresql://androidtest:psql-test-only@127.0.0.1:55432/postgres?sslmode=disable'
```

Per la suite CI riproducibile vedi `.github/workflows/android-test.yml`.

## Versione browser precedente

La pagina GitHub Pages resta una demo e un punto di download dell'APK. Il browser non può aprire socket PostgreSQL e continua a richiedere il gateway opzionale in `server/` per query reali. Nell'app Android quel requisito non esiste.
