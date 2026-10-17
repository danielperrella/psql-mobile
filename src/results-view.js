import {icon} from './icons.js';

export const PAGE_SIZE = 20;
export function displayValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value === '') return 'Stringa vuota';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}
const searchText = value => displayValue(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
export function filterRows(rows, fields, query) {
  const needle = searchText(query).trim();
  return !query.trim() ? rows : rows.filter(row => fields.some(field => searchText(row[field]).includes(needle)));
}
export function pageRows(rows, requestedPage, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages - 1, Math.max(0, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0));
  return {rows: rows.slice(page * size, (page + 1) * size), page, pages,
    from: rows.length ? page * size + 1 : 0, to: Math.min(rows.length, (page + 1) * size)};
}
export function recordTitle(row, fields) {
  const priorities = ['nome', 'cliente', 'name', 'title', 'titolo', 'email', 'id'];
  const meaningful = field => row[field] !== null && row[field] !== undefined && row[field] !== '' && typeof row[field] !== 'object';
  const field = priorities.map(name => fields.find(field => field.toLowerCase() === name && meaningful(field))).find(Boolean)
    || fields.find(meaningful) || fields[0];
  return {field, text: field ? displayValue(row[field]) : 'Record'};
}
export function availableRelations(result, row, field) {
  if (result?.truncated) return [];
  return (result?.relations || []).filter(relation => relation.fields?.includes(field)
    && relation.fields.length === relation.targetColumns?.length
    && relation.fields.every(key => Object.hasOwn(row, key) && row[key] !== null && row[key] !== undefined));
}
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function shortened(text, limit) {
  const chars = Array.from(text.replace(/\s+/g, ' '));
  return chars.length > limit ? chars.slice(0, limit).join('') + '…' : chars.join('');
}

export class ResultsView {
  constructor(root, onChange = () => {}, onNavigate = () => {}) {
    this.root = root;
    this.onChange = onChange;
    this.onNavigate = onNavigate;
    this.results = [];
    this.selected = 0;
    this.page = 0;
    root.innerHTML = `
      <div class="result-controls" hidden>
        <label class="result-picker-label" hidden>Risultato dello script<select id="resultPicker" aria-label="Risultato dello script"></select></label>
        <label class="result-search-label">Cerca nei record caricati<input id="resultSearch" type="search" placeholder="Valore in qualsiasi campo" autocomplete="off"></label>
      </div>
      <p class="result-limit" hidden>Risultato parziale: alcuni dati sono stati limitati.</p>
      <p class="relation-warning" hidden></p>
      <div class="result-pagination" hidden><button id="previousPage" class="secondary" aria-label="Pagina precedente">Precedenti</button><span id="pageRange" aria-live="polite"></span><button id="nextPage" class="secondary" aria-label="Pagina successiva">Successivi</button></div>
      <div class="record-list"></div>`;
    this.search = root.querySelector('#resultSearch');
    this.picker = root.querySelector('#resultPicker');
    this.list = root.querySelector('.record-list');
    this.search.oninput = () => { this.page = 0; this.render(); };
    this.picker.onchange = () => { this.selected = Number(this.picker.value); this.page = 0; this.search.value = ''; this.render(); };
    root.querySelector('#previousPage').onclick = () => { this.page--; this.render(); };
    root.querySelector('#nextPage').onclick = () => { this.page++; this.render(); };
    this.render();
  }
  setResults(results) {
    this.results = results;
    this.selected = 0;
    this.page = 0;
    this.search.value = '';
    this.picker.replaceChildren();
    results.forEach((result, index) => {
      const option = node('option', `Risultato ${index + 1} · ${result.fields.length ? result.rows.length + ' record' : result.command}`);
      option.value = String(index);
      this.picker.append(option);
    });
    this.render();
  }
  getExport() {
    const result = this.results[this.selected];
    return result ? {fields: result.fields, rows: filterRows(result.rows, result.fields, this.search.value)} : {fields: [], rows: []};
  }
  render() {
    const result = this.results[this.selected];
    const data = this.getExport();
    const paged = pageRows(data.rows, this.page);
    this.page = paged.page;
    this.root.querySelector('.result-controls').hidden = !result;
    this.root.querySelector('.result-picker-label').hidden = this.results.length < 2;
    this.root.querySelector('.result-search-label').hidden = !data.fields.length;
    this.root.querySelector('.result-limit').hidden = !result?.truncated;
    const warning = this.root.querySelector('.relation-warning');
    warning.hidden = !result?.relationWarning;
    warning.textContent = result?.relationWarning || '';
    this.root.querySelector('.result-pagination').hidden = !data.rows.length;
    this.root.querySelector('#previousPage').disabled = paged.page === 0;
    this.root.querySelector('#nextPage').disabled = paged.page === paged.pages - 1;
    this.root.querySelector('#pageRange').textContent = `${paged.from}–${paged.to} di ${data.rows.length}`;
    this.list.replaceChildren();
    if (!result) this.empty('I tuoi record, leggibili.', 'Esegui una query: ogni riga si aprirà con tutti i campi in verticale.');
    else if (!data.fields.length) this.empty('Comando eseguito', `${result.command} · ${result.rowCount ?? 0} righe interessate.`);
    else if (!data.rows.length) this.empty(this.search.value ? 'Nessuna corrispondenza' : 'Nessun record restituito', this.search.value ? 'Cambia la ricerca per ritrovare i record caricati.' : 'La query è stata eseguita e non ha restituito righe.');
    else paged.rows.forEach((row, index) => this.list.append(this.record(row, data.fields, paged.from + index, result)));
    this.onChange({count: data.rows.length, canExport: !!data.fields.length, results: this.results});
  }
  empty(title, text) {
    const empty = node('div', undefined, 'empty-state');
    const mark = node('span', undefined, 'empty-mark');
    mark.innerHTML = icon('results');
    empty.append(mark, node('h3', title), node('p', text));
    this.list.append(empty);
  }
  record(row, fields, number, result = {}) {
    const details = node('details', undefined, 'record');
    const summary = node('summary', undefined, 'record-summary');
    const title = recordTitle(row, fields);
    const heading = node('span', undefined, 'record-heading');
    const identity = node('span', undefined, 'record-identity');
    identity.append(node('small', title.field || 'Record'), node('strong', shortened(title.text, 72)));
    const chevron = node('span', undefined, 'record-chevron');
    chevron.innerHTML = icon('chevron');
    heading.append(node('span', String(number).padStart(2, '0'), 'row-number'), identity, chevron);
    const preview = node('span', undefined, 'record-preview');
    for (const field of fields.filter(field => field !== title.field).slice(0, 2)) {
      const line = node('span', undefined, 'preview-field');
      line.append(node('span', field, 'preview-label'), node('span', shortened(displayValue(row[field]), 100)));
      preview.append(line);
    }
    summary.append(heading, preview, node('span', `${fields.length} campi · apri record`, 'record-open-hint'));
    const values = node('dl', undefined, 'record-fields');
    for (const field of fields) {
      const pair = node('div', undefined, 'record-field');
      const value = node('dd');
      const content = node('pre', displayValue(row[field]), row[field] == null ? 'null-value' : '');
      value.append(content);
      for (const relation of availableRelations(result, row, field)) {
        const link = node('button', undefined, 'relation-link');
        const arrow = node('span'); arrow.innerHTML = icon('related');
        link.append(arrow, node('span', 'Apri ' + relation.targetTable));
        link.title = relation.targetSchema + '.' + relation.targetTable;
        link.onclick = () => this.onNavigate({relationId: relation.id,
          values: relation.fields.map(key => String(row[key])),
          targetSchema: relation.targetSchema, targetTable: relation.targetTable});
        value.append(link);
      }
      pair.append(node('dt', field), value);
      values.append(pair);
    }
    details.append(summary, values);
    details.addEventListener('toggle', () => {
      summary.querySelector('.record-open-hint').textContent = details.open ? 'Chiudi record' : `${fields.length} campi · apri record`;
    });
    return details;
  }
}
