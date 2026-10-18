const OPERATORS = {
  equals: '=',
  contains: 'ILIKE',
  less: '<',
  lessOrEqual: '<=',
  greater: '>',
  greaterOrEqual: '>='
};

export function quoteIdentifier(identifier) {
  if (typeof identifier !== 'string' || !identifier.length || identifier.includes('\0')) {
    throw new Error('Identificatore PostgreSQL non valido.');
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

// An explicit E string safely handles both quotes and backslashes, including when
// standard_conforming_strings has been disabled on the PostgreSQL connection.
export function quoteLiteral(value) {
  if (value === null) return 'NULL';
  return `E'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

function normalizeSchema(schema) {
  if (!Array.isArray(schema)) throw new Error('Schema non disponibile.');
  const tables = new Map();
  for (const entry of schema) {
    const schemaName = entry?.table_schema ?? entry?.schema;
    const tableName = entry?.table_name ?? entry?.table;
    const columnName = entry?.column_name ?? entry?.column;
    if (![schemaName, tableName, columnName].every(value => typeof value === 'string' && value.length)) continue;
    const key = `${schemaName}\0${tableName}`;
    if (!tables.has(key)) tables.set(key, {schema: schemaName, table: tableName, columns: []});
    const table = tables.get(key);
    if (!table.columns.some(column => column.name === columnName)) {
      table.columns.push({name: columnName, type: entry.data_type ?? entry.udt_name ?? entry.type ?? 'text'});
    }
  }
  return [...tables.values()].sort((a, b) => a.schema.localeCompare(b.schema) || a.table.localeCompare(b.table));
}

function resolveTable(schema, schemaName, tableName) {
  const tables = normalizeSchema(schema);
  const table = tables.find(item => item.schema === schemaName && item.table === tableName);
  if (!table) throw new Error('La tabella selezionata non appartiene allo schema disponibile.');
  return table;
}

function integerOption(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  const text = String(value ?? '');
  if (!/^\d+$/.test(text)) throw new Error(`${label}: inserisci un numero intero valido.`);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label}: valore fuori dall’intervallo consentito.`);
  }
  return number;
}

function buildCondition(table, condition) {
  if (!condition || typeof condition !== 'object') throw new Error('Condizione non valida.');
  const column = table.columns.find(item => item.name === condition.column);
  if (!column) throw new Error('La colonna selezionata non appartiene alla tabella.');
  const identifier = quoteIdentifier(column.name);
  if (condition.operator === 'isNull' || condition.operator === 'isNotNull') {
    return `${identifier} IS ${condition.operator === 'isNotNull' ? 'NOT ' : ''}NULL`;
  }
  const operator = OPERATORS[condition.operator];
  if (!operator) throw new Error('Operatore di filtro non valido.');
  if (condition.value === null || condition.value === undefined) {
    throw new Error('Inserisci un valore oppure scegli una condizione NULL.');
  }
  let value = String(condition.value);
  if (condition.operator === 'contains') {
    // Escape ILIKE wildcards so “contiene” searches for the exact entered text.
    value = `%${value.replace(/[\\%_]/g, '\\$&')}%`;
    return `CAST(${identifier} AS text) ILIKE ${quoteLiteral(value)} ESCAPE E'\\\\'`;
  }
  return `${identifier} ${operator} ${quoteLiteral(value)}`;
}

/**
 * Pure SQL builder. `schema` is the column array returned by GET /schema.
 * Conditions use {column, operator, value}, where operator is equals, contains,
 * less, lessOrEqual, greater, greaterOrEqual, isNull, or isNotNull.
 */
export function buildTableQuery({schema, table_schema, table_name, conditions = [], order_by = '', direction = 'ASC', limit = 100, offset = 0}) {
  const table = resolveTable(schema, table_schema, table_name);
  if (!table.columns.length) throw new Error('La tabella non contiene colonne accessibili.');
  if (!Array.isArray(conditions)) throw new Error('Filtri non validi.');
  const predicates = conditions.filter(condition => condition && condition.operator).map(condition => buildCondition(table, condition));
  let sql = `SELECT * FROM ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.table)}`;
  if (predicates.length) sql += ` WHERE ${predicates.join(' AND ')}`;
  if (order_by) {
    if (!table.columns.some(column => column.name === order_by)) throw new Error('La colonna di ordinamento non appartiene alla tabella.');
    if (!['ASC', 'DESC'].includes(String(direction).toUpperCase())) throw new Error('Direzione di ordinamento non valida.');
    sql += ` ORDER BY ${quoteIdentifier(order_by)} ${String(direction).toUpperCase()}`;
  }
  const safeLimit = integerOption(limit, 'Limite', 1, 1000);
  const safeOffset = integerOption(offset, 'Offset', 0);
  sql += ` LIMIT ${safeLimit} OFFSET ${safeOffset};`;
  return sql;
}

function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function option(select, value, label) {
  const item = element('option', '', label);
  item.value = value;
  select.append(item);
}

export class TableBrowser {
  constructor(root, {getSchema, onExecute} = {}) {
    if (!root || typeof getSchema !== 'function' || typeof onExecute !== 'function') {
      throw new TypeError('TableBrowser richiede root, getSchema() e onExecute(sql).');
    }
    this.root = root;
    this.getSchema = getSchema;
    this.onExecute = onExecute;
    this.tables = [];
    this.conditions = [];
    this.busy = false;
    this.root.classList.add('table-browser');
    this.render();
  }

  render() {
    this.root.replaceChildren();
    const panel = element('section', 'tb-panel');
    panel.setAttribute('aria-label', 'Filtri e ordinamento tabella');
    const heading = element('div', 'tb-heading');
    heading.append(element('div', 'tb-title', 'Esplora una tabella'), element('p', 'tb-description', 'Imposta filtri e ordinamento, poi applica la query.'));
    const tableRow = element('div', 'tb-table-row');
    const schemaSelect = element('select', 'tb-schema');
    schemaSelect.setAttribute('aria-label', 'Schema');
    const tableSelect = element('select', 'tb-table');
    tableSelect.setAttribute('aria-label', 'Tabella');
    tableRow.append(this.label('Schema', schemaSelect), this.label('Tabella', tableSelect));
    const conditions = element('div', 'tb-conditions');
    const add = element('button', 'tb-secondary', 'Aggiungi filtro');
    add.type = 'button';
    add.onclick = () => { this.conditions.push({column: '', operator: 'equals', value: ''}); this.renderConditions(); };
    this.addButton = add;
    const orderRow = element('div', 'tb-order-row');
    const orderSelect = element('select', 'tb-order');
    orderSelect.setAttribute('aria-label', 'Ordina per');
    const direction = element('select', 'tb-direction');
    direction.setAttribute('aria-label', 'Direzione');
    option(direction, 'ASC', 'Crescente');
    option(direction, 'DESC', 'Decrescente');
    orderRow.append(this.label('Ordina per', orderSelect), this.label('Direzione', direction));
    const pageRow = element('div', 'tb-page-row');
    const limit = element('input', 'tb-limit');
    limit.type = 'number'; limit.min = '1'; limit.max = '1000'; limit.value = '100'; limit.inputMode = 'numeric';
    const offset = element('input', 'tb-offset');
    offset.type = 'number'; offset.min = '0'; offset.value = '0'; offset.inputMode = 'numeric';
    pageRow.append(this.label('Record per pagina', limit), this.label('Offset', offset));
    const buttons = element('div', 'tb-actions');
    const previous = element('button', 'tb-secondary', 'Precedente');
    previous.type = 'button';
    previous.onclick = () => { const size = Number(limit.value); offset.value = String(Math.max(0, Number(offset.value) - size)); this.apply(schemaSelect.value, tableSelect.value, orderSelect.value, direction.value, limit.value, offset.value); };
    this.previousButton = previous;
    const next = element('button', 'tb-secondary', 'Successiva');
    next.type = 'button';
    next.onclick = () => { const size = Number(limit.value); offset.value = String(Math.max(0, Number(offset.value)) + (Number.isFinite(size) && size > 0 ? size : 100)); this.apply(schemaSelect.value, tableSelect.value, orderSelect.value, direction.value, limit.value, offset.value); };
    this.nextButton = next;
    const apply = element('button', 'tb-apply', 'Applica filtri');
    apply.type = 'button';
    apply.onclick = () => this.apply(schemaSelect.value, tableSelect.value, orderSelect.value, direction.value, limit.value, offset.value);
    this.applyButton = apply;
    buttons.append(previous, next, apply);
    const status = element('p', 'tb-status');
    status.setAttribute('role', 'status');
    panel.append(heading, tableRow, conditions, add, orderRow, pageRow, buttons, status);
    this.root.append(panel);
    this.controls = {schemaSelect, tableSelect, conditions, orderSelect, direction, limit, offset, status};
    this.loadSchema();
  }

  label(text, control) {
    const label = element('label', 'tb-label');
    label.append(element('span', '', text), control);
    return label;
  }

  loadSchema() {
    try {
      this.tables = normalizeSchema(this.getSchema());
      const schemas = [...new Set(this.tables.map(table => table.schema))];
      const {schemaSelect, tableSelect, orderSelect} = this.controls;
      for (const schema of schemas) option(schemaSelect, schema, schema);
      schemaSelect.onchange = () => this.populateTables();
      tableSelect.onchange = () => this.resetTableState();
      this.populateTables();
      if (!this.tables.length) this.setStatus('Nessuna tabella accessibile nello schema.');
    } catch (error) {
      this.setStatus(error.message);
    }
  }

  populateTables(preferredTable = '') {
    const {schemaSelect, tableSelect} = this.controls;
    tableSelect.replaceChildren();
    const tables = this.tables.filter(table => table.schema === schemaSelect.value);
    for (const table of tables) option(tableSelect, table.table, table.table);
    if (tables.some(table => table.table === preferredTable)) tableSelect.value = preferredTable;
    this.resetTableState();
  }

  resetTableState() {
    this.conditions = [];
    this.controls.offset.value = '0';
    this.populateColumns();
    this.renderConditions();
  }

  /** Select a known table without executing a query. Returns false if unavailable. */
  openTable(schemaName, tableName) {
    const latest=normalizeSchema(this.getSchema());
    if(JSON.stringify(latest)!==JSON.stringify(this.tables)){
      this.tables=latest;this.controls.schemaSelect.replaceChildren();
      for(const name of [...new Set(latest.map(table=>table.schema))])option(this.controls.schemaSelect,name,name);
      this.controls.tableSelect.replaceChildren();this.conditions=[];
    }
    if (!this.tables.some(table => table.schema === schemaName && table.table === tableName)) {
      this.setStatus('La tabella selezionata non appartiene allo schema disponibile.');
      return false;
    }
    if(this.controls.schemaSelect.value===schemaName&&this.controls.tableSelect.value===tableName)return true;
    this.controls.schemaSelect.value = schemaName;
    this.populateTables(tableName);
    this.setStatus('Tabella selezionata. Premi Applica filtri per eseguire la query.');
    return true;
  }

  selectTable(schemaName, tableName) { return this.openTable(schemaName, tableName); }

  populateColumns() {
    const table = this.tables.find(item => item.schema === this.controls.schemaSelect.value && item.table === this.controls.tableSelect.value);
    const {orderSelect} = this.controls;
    orderSelect.replaceChildren();
    option(orderSelect, '', 'Nessun ordinamento');
    for (const column of table?.columns || []) option(orderSelect, column.name, column.name);
  }

  renderConditions() {
    const container = this.controls.conditions;
    container.replaceChildren();
    const table = this.tables.find(item => item.schema === this.controls.schemaSelect.value && item.table === this.controls.tableSelect.value);
    this.conditions.forEach((condition, index) => {
      const row = element('div', 'tb-condition');
      const column = element('select', 'tb-condition-column');
      column.setAttribute('aria-label', 'Colonna filtro');
      option(column, '', 'Colonna');
      for (const item of table?.columns || []) option(column, item.name, item.name);
      column.value = condition.column;
      column.onchange = () => { condition.column = column.value; };
      const operator = element('select', 'tb-condition-operator');
      operator.setAttribute('aria-label', 'Condizione');
      for (const [value, label] of [['equals', 'è uguale a'], ['contains', 'contiene testo'], ['greater', 'è maggiore di'], ['greaterOrEqual', 'è maggiore o uguale'], ['less', 'è minore di'], ['lessOrEqual', 'è minore o uguale'], ['isNull', 'è NULL'], ['isNotNull', 'non è NULL']]) option(operator, value, label);
      operator.value = condition.operator;
      const value = element('input', 'tb-condition-value');
      value.type = 'text'; value.autocomplete = 'off'; value.placeholder = 'Valore'; value.value = condition.value ?? '';
      value.setAttribute('aria-label', 'Valore filtro');
      const remove = element('button', 'tb-remove', 'Rimuovi');
      remove.type = 'button'; remove.setAttribute('aria-label', 'Rimuovi filtro');
      const syncValue = () => { condition.value = value.value; value.hidden = ['isNull', 'isNotNull'].includes(condition.operator); };
      operator.onchange = () => { condition.operator = operator.value; syncValue(); };
      value.oninput = () => { condition.value = value.value; };
      remove.onclick = () => { this.conditions.splice(index, 1); this.renderConditions(); };
      syncValue();
      row.append(column, operator, value, remove);
      container.append(row);
    });
  }

  async apply(schemaName, tableName, orderBy, direction, limit, offset) {
    if (this.busy) return undefined;
    try {
      const sql = buildTableQuery({schema: this.getSchema(), table_schema: schemaName, table_name: tableName,
        conditions: this.conditions, order_by: orderBy, direction, limit, offset});
      this.busy = true;
      this.updateBusyState();
      this.setStatus('Esecuzione query…');
      const result = await this.onExecute(sql);
      this.setStatus('Query completata.');
      return result;
    } catch (error) {
      this.setStatus(error?.message || 'Errore durante l’esecuzione della query.');
      return undefined;
    } finally {
      this.busy = false;
      this.updateBusyState();
    }
  }

  updateBusyState() {
    for (const button of [this.addButton, this.previousButton, this.nextButton, this.applyButton]) {
      if (button) button.disabled = this.busy;
    }
  }

  setStatus(message) { this.controls.status.textContent = message; }
}

export default TableBrowser;
