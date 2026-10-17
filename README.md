# Psql Mobile

PWA PostgreSQL in italiano: connessione URI o campi separati, schema live, completamento SQL tramite CodeMirror, query e selezione SQL, risultati e CSV. Layout mobile, installazione e shell offline. La demo è esplicitamente simulata e non esegue SQL.

## Avvio

Node.js 22 o superiore.

```sh
npm ci
cp .env.example .env
# Imposta un token casuale in .env, ad esempio generato con openssl rand -hex 32
node --env-file=.env server/index.js
# In un secondo terminale:
npm run dev
```

Apri http://localhost:5173. Inserisci http://localhost:8787 e il token del gateway, poi i dati PostgreSQL. Da telefono localhost indica il telefono: usa un gateway raggiungibile tramite HTTPS. Installa da Chrome Android con “Installa app” o da Safari iOS → Condividi → Aggiungi alla schermata Home. Il browser può decidere quando mostrare il pulsante d'installazione.

## Architettura e sicurezza

GitHub Pages serve esclusivamente la PWA statica. Il protocollo PostgreSQL richiede il gateway Node su una macchina che raggiunge il DB. Distribuiscilo con HTTPS dietro reverse proxy, imposta `GATEWAY_TOKEN` (almeno 24 caratteri), `ALLOWED_ORIGINS` con l'origine esatta della PWA, `HOST` e `PORT`. In produzione usa un gateway personale: chi possiede il token può connettersi agli host raggiungibili dal gateway. Non esporre il gateway senza controllo di rete e autenticazione. Gli errori di connessione non riportano le credenziali.

TLS richiede certificati validi; per una CA privata usa NODE_EXTRA_CA_CERTS. La modalità TLS è scelta esplicitamente nel modulo; i parametri TLS dell'URI vengono ignorati. La connection string supporta host, porta, database, utente e password; non supporta socket Unix o opzioni libpq aggiuntive. Password e token rimangono in memoria e non vengono memorizzati in localStorage, cache o repository. Le query usano i permessi dell'utente PostgreSQL: per sola lettura usa un ruolo PostgreSQL dedicato. Non esiste un filtro SQL che garantisca la sola lettura.

Timeout query 15 secondi, connessione 10 secondi, sessioni inattive eliminate dopo 30 minuti. Una query per sessione. I risultati visualizzati sono limitati alle prime 1.000 righe **dopo** la ricezione: usa LIMIT per evitare risultati troppo grandi in memoria. Lo schema usa information_schema e quindi rispetta la visibilità del ruolo. L'offline serve solo l'interfaccia già caricata: query e schema richiedono rete. La cache non include richieste POST al gateway.

## Docker gateway

```sh
docker build -t psql-mobile-gateway .
docker run --rm --env-file .env -e HOST=0.0.0.0 -p 127.0.0.1:8787:8787 psql-mobile-gateway
```

Metti un reverse proxy HTTPS davanti al gateway. Non pubblicare PostgreSQL per rendere accessibile l'app.

## Repository privato e pagina pubblica

```sh
gh repo create psql-mobile --private --source=. --remote=origin --push
gh api repos/OWNER/psql-mobile/pages -X POST -f build_type=workflow
```

Prima del push inizializza il repository e crea un commit se necessario. Imposta in Settings → Pages la sorgente GitHub Actions. GitHub Pages da repository privati richiede un piano che lo supporti (Pro/Team/Enterprise, secondo il tipo di account). Il repository resta privato, ma HTML/JS e ZIP pubblicati sono scaricabili da chiunque. Lo ZIP include il progetto e il gateway senza segreti: è necessario per il download richiesto. Se il piano non supporta Pages per repo privati, usa un hosting statico pubblico separato conservando privato il repo.

Il workflow esegue test e build, crea lo ZIP e pubblica `dist/`. Il link “Scarica pacchetto” funziona nel deploy del workflow e nel pacchetto locale `dist`, non nel server Vite di sviluppo.

## Verifica

```sh
npm test
npm run build
```

Serve un PostgreSQL raggiungibile per una prova end-to-end reale. Nessun database o gateway ospitato è incluso nella pagina statica.
