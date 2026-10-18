/** Read-only inverse foreign-key section for a record detail view.
 * keys always contains the parent's complete primary key. loadRelations({target, keys}) returns
 * relation metadata (including each FK's derived targetKeys); loadPage({relation, keys, offset}) returns
 * {fields, rows, hasMore, recordTargets, relations}. onOpen receives the normal record-open payload.
 */
export class InverseRelationsView {
  constructor(root, {target, keys, loadRelations, loadPage, onOpen = () => {}}) {
    this.root = root;
    this.target = target;
    this.keys = keys;
    this.loadRelations = loadRelations;
    this.loadPage = loadPage;
    this.onOpen = onOpen;
    this.relations = [];
    this.active = null;
    this.offset = 0;
    this.request = 0;
    this.root.classList.add('inverse-relations');
    this.root.innerHTML = '<section aria-label="Record collegati"><h3 class="inverse-title">Record collegati</h3><div class="inverse-body" aria-live="polite"></div></section>';
    this.body = this.root.querySelector('.inverse-body');
    this.renderMessage('Caricamento relazioni…');
    this.refresh();
  }

  async refresh() {
    const request = ++this.request;
    try {
      const relations = await this.loadRelations({target: this.target, keys: this.keys});
      if (request !== this.request) return;
      this.relations = relations || [];
      this.render();
    } catch (error) {
      if (request === this.request) this.renderMessage(error?.message || 'Impossibile caricare le relazioni.');
    }
  }

  async select(relation) {
    this.active = relation;
    this.offset = 0;
    await this.page();
  }

  async page() {
    if (!this.active) return;
    const request = ++this.request;
    this.renderMessage('Caricamento record collegati…');
    try {
      const result = await this.loadPage({relation: this.active, keys: this.keys, offset: this.offset});
      if (request !== this.request) return;
      this.render(result);
    } catch (error) {
      if (request === this.request) this.renderMessage(error?.message || 'Impossibile caricare i record collegati.');
    }
  }

  render(result = null) {
    this.body.replaceChildren();
    if (!this.relations.length) {
      this.renderMessage('Questo record non ha relazioni dichiarate con altre tabelle.');
      return;
    }
    const picker = document.createElement('div');
    picker.className = 'inverse-relation-list';
    for (const relation of this.relations) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inverse-relation-choice';
      button.setAttribute('aria-pressed', String(this.active?.id === relation.id));
      const label = document.createElement('span');
      label.textContent = relation.sourceTable;
      const detail = document.createElement('small');
      detail.textContent = relation.sourceSchema + ' · ' + relation.sourceColumns.join(', ');
      button.append(label, detail);
      button.onclick = () => this.select(relation);
      picker.append(button);
    }
    this.body.append(picker);
    if (!result) return;
    const list = document.createElement('div');
    list.className = 'inverse-record-list';
    result.rows.forEach((row, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inverse-record-row';
      const titleField = result.fields.find(field => ['nome', 'name', 'title', 'titolo', 'email', 'id'].includes(field.toLowerCase())) || result.fields[0];
      const title = document.createElement('strong');
      title.textContent = titleField ? String(row[titleField] ?? 'NULL') : 'Record';
      const preview = document.createElement('small');
      preview.textContent = result.fields.filter(field => field !== titleField).slice(0, 2)
        .map(field => `${field}: ${row[field] == null ? 'NULL' : String(row[field])}`).join(' · ');
      button.append(title, preview);
      button.onclick = () => this.onOpen({row, fields: result.fields, number: this.offset + index + 1, result});
      list.append(button);
    });
    this.body.append(list);
    if (!result.rows.length) {
      const empty = document.createElement('p');
      empty.className = 'inverse-empty';
      empty.textContent = 'Nessun record collegato visibile con i permessi della connessione.';
      list.append(empty);
    }
    const pagination = document.createElement('nav');
    pagination.className = 'inverse-pagination';
    pagination.setAttribute('aria-label', 'Pagine dei record collegati');
    const previous = document.createElement('button');
    previous.type = 'button'; previous.textContent = 'Precedenti'; previous.disabled = this.offset === 0;
    previous.onclick = () => { this.offset = Math.max(0, this.offset - 25); this.page(); };
    const range = document.createElement('span');
    range.textContent = result.rows.length ? `${this.offset + 1}–${this.offset + result.rows.length}` : '0 record';
    const next = document.createElement('button');
    next.type = 'button'; next.textContent = 'Successivi'; next.disabled = !result.hasMore;
    next.onclick = () => { this.offset += 25; this.page(); };
    pagination.append(previous, range, next);
    this.body.append(pagination);
  }

  renderMessage(message) {
    this.body.replaceChildren();
    const p = document.createElement('p');
    p.className = 'inverse-message';
    p.textContent = message;
    this.body.append(p);
  }
}
