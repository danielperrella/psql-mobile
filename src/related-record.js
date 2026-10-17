/** A drill-down keeps the original results DOM, expanded rows, filters and page untouched. */
export class RelatedRecordView {
  constructor(dialog, load, renderRecord) {
    this.dialog = dialog;
    this.load = load;
    this.renderRecord = renderRecord;
    this.stack = [];
    this.request = 0;
    dialog.innerHTML = `
      <div class="related-toolbar"><button class="related-back secondary">Indietro</button><button class="related-close secondary" aria-label="Chiudi record collegato">Chiudi</button></div>
      <p class="related-eyebrow">Record collegato</p>
      <h2 id="relatedTitle" tabindex="-1"></h2>
      <p class="related-schema"></p>
      <div class="related-content" aria-live="polite"></div>`;
    dialog.querySelector('.related-close').onclick = () => this.close();
    dialog.querySelector('.related-back').onclick = () => this.back();
    dialog.addEventListener('close', () => { this.request++; this.stack = [];dialog.querySelector('.related-content').replaceChildren(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); this.back(); });
  }
  close() { this.request++; this.stack = [];this.dialog.querySelector('.related-content').replaceChildren();this.dialog.close(); }
  back() {
    this.request++;
    if (this.stack.length < 2) { this.close(); return; }
    this.stack.pop(); this.render();
  }
  async open(reference) {
    if (this.stack.length >= 32) return;
    const entry = {reference};
    this.stack.push(entry);
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
    const request = ++this.request;
    try {
      const response = await this.load(reference);
      if (this.request !== request || !this.dialog.open) return;
      entry.result = response.results[0];
    } catch (error) {
      if (this.request !== request || !this.dialog.open) return;
      entry.error = error.message;
    }
    this.render();
  }
  render() {
    const entry = this.stack.at(-1);
    if (!entry) return;
    const {reference, result, error} = entry;
    this.dialog.querySelector('#relatedTitle').textContent = reference.targetTable;
    this.dialog.querySelector('.related-schema').textContent = reference.targetSchema + ' · ' + (this.stack.length === 1 ? 'Dal risultato della query' : 'Livello ' + this.stack.length);
    const back = this.dialog.querySelector('.related-back');
    back.textContent = this.stack.length > 1 ? 'Indietro' : 'Torna ai risultati';
    const content = this.dialog.querySelector('.related-content');
    content.replaceChildren();
    content.setAttribute('aria-busy', String(!result && !error));
    if (result?.rows.length) {
      const record = this.renderRecord(result.rows[0], result.fields, 1, result);
      record.open = true;
      record.querySelector('summary').onclick = event => event.preventDefault();
      content.append(record);
      if (this.stack.length >= 32) {
        content.querySelectorAll('.relation-link').forEach(button => { button.disabled = true; });
        const limit = document.createElement('p');
        limit.textContent = 'Torna indietro per continuare a esplorare le relazioni.';
        content.append(limit);
      }
      if (result.truncated || result.relationWarning) {
        const warning = document.createElement('p');
        warning.textContent = result.truncated ? 'Record parziale: alcuni dati sono stati limitati.' : result.relationWarning;
        content.append(warning);
      }
    } else {
      const message = document.createElement('p');
      message.className = error ? 'error' : '';
      message.textContent = error || (result ? 'Record non trovato o non visibile con i permessi della connessione.' : 'Caricamento del record…');
      content.append(message);
      if (error) {
        const retry = document.createElement('button'); retry.textContent = 'Riprova';
        retry.onclick = () => { this.stack.pop(); this.open(reference); };
        content.append(retry);
      }
    }
    this.dialog.scrollTop = 0;
  }
}
