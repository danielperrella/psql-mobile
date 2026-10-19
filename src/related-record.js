import {applyRecordChange} from './record-changes.js';
/** A record detail keeps the original results, filters and page untouched. */
export class RelatedRecordView {
  constructor(dialog, load, renderRecord, decorate = () => {}) {
    this.dialog = dialog;
    this.load = load;
    this.renderRecord = renderRecord;
    this.decorate = decorate;
    this.stack = [];
    this.request = 0;
    dialog.innerHTML = `
      <div class="related-toolbar"><button class="related-back secondary">Indietro</button><button class="related-close secondary" aria-label="Chiudi dettaglio record">Chiudi</button></div>
      <p class="related-eyebrow">Record collegato</p>
      <h2 id="relatedTitle" tabindex="-1"></h2>
      <p class="related-schema"></p>
      <div class="related-content" aria-live="polite"></div>`;
    dialog.querySelector('.related-close').onclick = () => this.close();
    dialog.querySelector('.related-back').onclick = () => this.back();
    dialog.addEventListener('close', () => { if(dialog.open)return;this.request++; this.stack = [];dialog.querySelector('.related-content').replaceChildren(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); this.back(); });
  }
  close() { this.request++; this.stack = [];this.dialog.querySelector('.related-content').replaceChildren();this.dialog.close(); }
  applyMutation(change){
    for(const entry of this.stack)entry.inverseViews?.clear();
    for(const entry of this.stack)if(entry.result&&applyRecordChange(entry.result,change)){if(change.mode==='delete')entry.deleted=true;else entry.result=change.saved.result;}
    if(change.mode==='create'&&this.dialog.open)this.stack.push({reference:{targetSchema:change.target.schema,targetTable:change.target.table},result:change.saved.result});
    if(this.dialog.open)this.render();
  }
  back() {
    this.request++;
    if (this.stack.length < 2) { this.close(); return; }
    this.stack.pop(); this.render();
  }
  openRecord({row,fields,number,result}, append = false) {
    this.request++;if(!append)this.stack=[];if(this.stack.length>=32)return;this.stack.push({local:true,number,reference:{targetSchema:result.recordTargets?.[0]?.schema||'',targetTable:result.recordTargets?.length===1?result.recordTargets[0].table:'Record'},result:{...result,fields,rows:[row]}});
    this.render();if(!this.dialog.open)this.dialog.showModal();
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
    this.dialog.querySelector('.related-eyebrow').textContent=entry.local?'Dettaglio record':'Record collegato';
    this.dialog.querySelector('.related-schema').textContent = (reference.targetSchema?reference.targetSchema+' · ':'') + (this.stack.length === 1 ? 'Dal risultato della query' : 'Livello ' + this.stack.length);
    const back = this.dialog.querySelector('.related-back');
    back.textContent = this.stack.length > 1 ? 'Indietro' : 'Torna ai risultati';
    const content = this.dialog.querySelector('.related-content');
    content.replaceChildren();
    content.setAttribute('aria-busy', String(!result && !error));
    if (result?.rows.length) {
      const record = this.renderRecord(result.rows[0], result.fields, entry.number||1, result);
      content.append(record);
      this.decorate(content,entry);
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
      message.textContent = error || (entry.deleted?'Record eliminato.':result ? 'Record non trovato o non visibile con i permessi della connessione.' : 'Caricamento del record…');
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
