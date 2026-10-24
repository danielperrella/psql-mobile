# Esempi di sviluppo e verifica

## Comandi

```sh
npm ci
npm test
npm run build
npm run build:android
```

Per Android, da `android/` esegui `gradlew.bat testDebugUnitTest lintDebug assembleDebug`. Requisiti e test strumentati PostgreSQL sono in [`README.md`](../README.md).

## URI di esempio

```text
postgresql://utente:password@db.example.com:5432/database?sslmode=verify-full
```

È un esempio fittizio: sostituisci i campi localmente e non committare URI o credenziali reali. L’app accetta anche `psql 'postgresql://…'` come testo, ma estrae la URI e non esegue il comando.

## Gateway browser opzionale

Il gateway di sviluppo è configurato da `.env.example` (`GATEWAY_TOKEN`, `ALLOWED_ORIGINS`, `HOST`, `PORT`) e avviato con:

```sh
npm run gateway
```

Usa solo un database di prova raggiungibile. Per la versione Android il gateway non serve: l’app si collega direttamente al database.
