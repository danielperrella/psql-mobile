# PRD — Psql Mobile

## Scopo e destinatari

Client mobile per amministratori/sviluppatori che devono ispezionare e gestire PostgreSQL da telefono. APK Android stabilmente distribuito fuori dal Play Store; sito GitHub Pages è demo e download. Il README descrive comportamento e limitazioni per release correnti.

## Implementato

- Connessione Android diretta via pgJDBC a PostgreSQL, URI/campi separati, password/MD5/SCRAM, TLS con verifica host, certificati CA e client opzionali.
- Profili cifrati, preferiti per connessione e modalità read-only.
- Navigazione schema, editor SQL, filtri e risultati paginati, CSV, dettagli record, relazioni FK, inserimento/aggiornamento/eliminazione con controlli su provenienza/PK e conflitti concorrenti.
- Tipi PostgreSQL: valori restituiti come testo, form per date, orari, enum, domini, FK e tipi particolari; limiti risultati e timeout.
- Aggiornamento APK con controlli hash, package, versione e firma; demo browser con dati fittizi. Il gateway Express opzionale supporta query browser reali.

## Flussi principali

1. L’utente seleziona/crea un profilo, valida connessione/TLS e si connette.
2. Esplora schema e apre tabella o inserisce una query; visualizza, filtra e pagina i risultati.
3. Apre record o relazioni; modifica/crea/elimina solo quando tabella e PK sono identificabili, con conferma e gestione conflitti.
4. Esporta CSV tramite destinazione scelta dall’utente; preferiti salvano metadati e chiavi, non interi record.

## Requisiti verificabili e limitazioni

- APK non invia query tramite server applicativo; il database deve essere raggiungibile dal telefono via Internet/LAN/VPN.
- Credenziali e certificati salvati Android cifrati con Keystore; le sessioni vive sono in memoria.
- Read-only blocca scritture nell’app e usa transazioni PostgreSQL read-only, ma non limita il ruolo da altri client.
- Risultati limitati a 1.000 righe (oltre alla paginazione UI dei risultati caricati), celle/schema/tempo hanno limiti documentati nel README. Rotazione Activity richiede riconnessione.
- Browser non può aprire socket PostgreSQL: usa demo o gateway. Gateway non è necessario nell’APK.
- Socket Unix, host multipli, Kerberos/GSS e vari tipi con form dedicati non sono supportati; i valori testuali possono richiedere input manuale.

Metriche quantitative, SLA e roadmap oltre alle note versionate del README non sono determinabili. Non dedurre disponibilità di Play Store: il README specifica distribuzione fuori dal Play Store.
