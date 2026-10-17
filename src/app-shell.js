import {icon} from './icons.js';
import {connectionDialog} from './connection-dialog.js';

export const appShell = (native, version) => `
  <header class="app-header">
    <a class="brand" href="./" aria-label="Psql Mobile">${icon('sql')}<span>psql <b>mobile</b></span></a>
    <div class="header-actions">
      ${native ? '' : `<a class="android-download" href="./psql-mobile.apk?v=${version}" download>APK Android</a>`}
      <button id="install" hidden>Installa</button>
      <button id="connectionButton" class="connect-button">${icon('plus')}<span>Connetti</span></button>
    </div>
    <div class="connection-strip"><span id="status">Non connesso</span><span class="app-version">${native ? 'Android' : 'Web'} ${version}</span></div>
  </header>
  <main id="connectionHome" class="connection-home" aria-labelledby="connectionsTitle">
    <div class="home-heading"><h1 id="connectionsTitle">Le tue connessioni</h1><p>${native ? 'I tuoi database, pronti da riaprire.' : 'Apri un database o esplora la demo.'}</p></div>
    <button id="addConnection" class="primary">${icon('plus')}<span>Aggiungi connessione</span></button>
    <p class="connections-message" role="status">${native ? 'Caricamento delle connessioni…' : 'Le connessioni si salvano nell’app Android.'}</p>
    <div class="saved-connections"></div>
    <p class="storage-note">${native ? 'La stringa e le credenziali vengono salvate cifrate su questo dispositivo. Nessun account aggiuntivo.' : 'Usa l’APK Android per salvare le connessioni sul dispositivo.'}</p>
    <div class="home-footer"><button id="resumeConnection" class="secondary" hidden>Torna al database</button><button id="homeDemo" class="secondary">Prova la demo</button></div>
    ${native ? '<div id="appUpdates" class="app-updates"><div class="update-banner" hidden><p>È disponibile un aggiornamento.</p><button id="downloadUpdate" class="primary">Aggiorna l’app</button></div><p class="update-check-status" role="status"></p><button id="checkUpdates" class="quiet-button">Verifica aggiornamenti</button></div>' : ''}
  </main>
  <main class="workspace" id="workspace">
    <section id="schemaPanel" class="work-panel schema-panel" data-panel="schema" aria-labelledby="schemaTitle">
      <div class="panel-heading"><div><h2 id="schemaTitle">Tabelle</h2><p id="schemaCount">Esplora il database</p></div><button id="refresh" class="icon-button" aria-label="Aggiorna schema">${icon('refresh')}</button></div>
      <label class="search-label" for="filter">Cerca tabelle o colonne</label>
      <input id="filter" class="search-input" type="search" placeholder="Nome di tabella o colonna" autocomplete="off">
      <div id="tree" class="schema-tree"></div>
      <div class="schema-footer"><span>PostgreSQL</span><button id="disconnect" class="quiet-button" disabled>Disconnetti</button></div>
    </section>
    <section id="queryPanel" class="work-panel query-panel" data-panel="query" aria-labelledby="queryTitle">
      <div class="panel-heading"><div><h1 id="queryTitle">SQL</h1><p>Query completa o testo selezionato</p></div><span class="file-label">query.sql</span></div>
      <div id="editor" aria-label="Editor SQL"></div>
      <div class="query-toolbar"><span class="keyboard-hint">Ctrl / ⌘ + Invio</span><button id="run" class="primary" disabled>${icon('play')}<span>Esegui query</span></button></div>
      <div id="feedback" role="status">Connetti un database per eseguire le query.</div>
      <div id="demoWelcome" class="demo-welcome"><div><h2>Vuoi provare l’interfaccia?</h2><p>Esplora ordini di esempio e il nuovo lettore di record.</p></div><button id="demo" class="secondary">Prova la demo</button></div>
    </section>
    <section id="resultsPanel" class="work-panel results-panel" data-panel="results" aria-labelledby="resultsTitle">
      <div class="panel-heading"><div><h2 id="resultsTitle">Risultati <span id="count" class="count-badge">0</span></h2><p>Apri un record per leggere tutti i campi.</p></div><button id="export" class="secondary export-button" disabled aria-label="Esporta i risultati filtrati in CSV">${icon('download')}<span>CSV</span></button></div>
      <div id="results"></div>
    </section>
  </main>
  <nav class="mobile-nav" aria-label="Area di lavoro">
    <button data-view="schema" aria-controls="schemaPanel" aria-pressed="false">${icon('tables')}<span>Tabelle</span></button>
    <button data-view="query" aria-controls="queryPanel" aria-pressed="true">${icon('sql')}<span>SQL</span></button>
    <button data-view="results" aria-controls="resultsPanel" aria-pressed="false">${icon('results')}<span>Risultati <b id="navResultCount" hidden>0</b></span></button>
  </nav>
  <div id="notice" class="app-notice" role="status" aria-live="polite" hidden></div>
  ${native ? '' : '<footer class="web-footer"><span>La demo contiene dati di esempio.</span><a href="./psql-mobile.zip" download>Scarica il progetto</a></footer>'}
  ${connectionDialog(native, version)}
  <dialog id="relatedDialog" class="related-dialog" aria-labelledby="relatedTitle"></dialog>
  ${native ? '<dialog id="updateDialog" aria-labelledby="updateTitle"></dialog>' : ''}
`;
