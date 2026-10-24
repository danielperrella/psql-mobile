# Sicurezza — Psql Mobile

## Android

- Superfici: WebView con asset locali, bridge JavaScript, connessione JDBC verso host scelto, storage profili, certificati e aggiornamento APK.
- La UI usa asset APK tramite WebViewAssetLoader; richieste/pagine remote sono bloccate dal codice nativo. Il flavor Android imposta CSP restrittiva (`connect-src 'none'`, form/frame remoti disabilitati). Il manifest disabilita cleartext, backup e provider esportato; i permessi includono Internet e richiesta installazione APK.
- Il bridge scambia JSON con ID e timeout; mantiene sessioni native. Non aggiungere interfacce JS remote o endpoint bridge senza mantenere allowlist e validazione.
- Profili con URI, password, preferenze TLS e certificati sono cifrati AES-256-GCM con chiave non esportabile in Android Keystore. I profili non vengono inclusi nel backup; il README dichiara che la lista inviata alla UI non contiene password.
- Default TLS `verify-full` con CA sistema e controllo hostname. `require` cifra senza verificare il certificato; `prefer`/`allow` possono permettere connessioni non cifrate; `disable` solo su rete fidata. Certificati personalizzati sono validati e richiedono modalità verificanti.
- Modalità read-only usa policy SQL e transazione read-only, ma è una precauzione dell’app. Per protezione indipendente configurare un ruolo PostgreSQL read-only e RLS.
- Update APK verifica hash, dimensione, package, versione e firma dell’app installata prima di chiamare l’installer Android. La chiave release è esterna al repository.

## Gateway browser storico

`server/index.js` richiede `GATEWAY_TOKEN` di almeno 24 caratteri, confronto timing-safe, lista origini consentite, solo POST/OPTIONS, JSON limitato a 64 KiB, timeout PostgreSQL e scadenza sessione. Il gateway esegue SQL con i privilegi della credenziale fornita. Non esporlo senza TLS e senza proteggere token, host e database; la policy di origine non sostituisce autenticazione/autorizzazione DB.

Non committare URI, password, token, certificati privati o file di firma. La segnalazione vulnerabilità non ha procedura dedicata nei file consultati. Questi controlli non sono una certificazione di sicurezza.
