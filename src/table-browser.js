import {fieldType,fieldError} from './field-types.js';
import {temporalField,temporalValue,sameTemporalValue,validOffset} from './temporal-fields.js';

const OPERATORS = {
  equals: '=',
  notEquals: '<>',
  contains: 'ILIKE',
  startsWith: 'ILIKE',
  endsWith: 'ILIKE',
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

function buildCondition(table, condition, definition) {
  if (!condition || typeof condition !== 'object') throw new Error('Condizione non valida.');
  if(condition.relationId){
    const relation=definition?.relations?.find(item=>item.id===condition.relationId);
    if(!relation)throw new Error('Seleziona nuovamente il record collegato.');
    const nullCheck=['isNull','isNotNull'].includes(condition.operator);
    if(!nullCheck&&(!Array.isArray(condition.values)||condition.values.length!==relation.sourceColumns.length||condition.values.some(value=>typeof value!=='string')))throw new Error('Seleziona nuovamente il record collegato.');
    return '('+relation.sourceColumns.map((column,index)=>buildCondition(table,{column,operator:nullCheck?condition.operator:'equals',value:condition.values?.[index]})).join(' AND ')+')';
  }
  const column = table.columns.find(item => item.name === condition.column);
  if (!column) throw new Error('La colonna selezionata non appartiene alla tabella.');
  const identifier = quoteIdentifier(column.name);
  if(condition.operator==='between'){
    if(condition.value==null||condition.value===''||condition.end==null||condition.end==='')throw new Error('Completa entrambi gli estremi dell’intervallo.');
    return `${identifier} >= ${quoteLiteral(condition.value)} AND ${identifier} <= ${quoteLiteral(condition.end)}`;
  }
  if (condition.operator === 'isNull' || condition.operator === 'isNotNull') {
    return `${identifier} IS ${condition.operator === 'isNotNull' ? 'NOT ' : ''}NULL`;
  }
  const operator = OPERATORS[condition.operator];
  if (!operator) throw new Error('Operatore di filtro non valido.');
  if (condition.value === null || condition.value === undefined) {
    throw new Error('Inserisci un valore oppure scegli una condizione NULL.');
  }
  let value = String(condition.value);
  if (['contains','startsWith','endsWith'].includes(condition.operator)) {
    // Escape ILIKE wildcards so “contiene” searches for the exact entered text.
    value = `${condition.operator==='startsWith'?'':'%'}${String(condition.value).replace(/[\\%_]/g, '\\$&')}${condition.operator==='endsWith'?'':'%'}`;
    return `CAST(${identifier} AS text) ILIKE ${quoteLiteral(value)} ESCAPE E'\\\\'`;
  }
  return `${identifier} ${operator} ${quoteLiteral(value)}`;
}

/**
 * Pure SQL builder. `schema` is the column array returned by GET /schema.
 * Conditions use {column, operator, value}, where operator is equals, contains,
 * less, lessOrEqual, greater, greaterOrEqual, isNull, or isNotNull.
 */
export function buildTableQuery({schema, table_schema, table_name, conditions = [], definition, order_by = '', direction = 'ASC', limit = 100, offset = 0}) {
  const table = resolveTable(schema, table_schema, table_name);
  if (!table.columns.length) throw new Error('La tabella non contiene colonne accessibili.');
  if (!Array.isArray(conditions)) throw new Error('Filtri non validi.');
  const predicates = conditions.filter(condition => condition && (condition.operator||condition.relationId)).map(condition => buildCondition(table, condition, definition));
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

export function filterKind(column){
  const type=(column.baseType||column.type||'text').toLowerCase();
  if(column.choices?.length)return 'enum';
  if(column.category==='B'||/^(boolean|bool)$/.test(type))return 'boolean';
  if(type==='date')return 'date';
  if(/^timestamp/.test(type))return /with time zone|timestamptz/.test(type)?'datetime-zone':'datetime-local';
  if(/^time/.test(type))return /with time zone|timetz/.test(type)?'time-zone':'time';
  return fieldType({...column,type}).kind||'text';
}
const operatorLabels={equals:'è uguale a',notEquals:'è diverso da',contains:'contiene',startsWith:'inizia con',endsWith:'finisce con',greater:'è maggiore di',greaterOrEqual:'è maggiore o uguale',less:'è minore di',lessOrEqual:'è minore o uguale',between:'è compreso tra',isNull:'è vuoto (NULL)',isNotNull:'non è vuoto (NULL)'};
export function filterOperators(column){
  const kind=filterKind(column),result=['equals','notEquals'];
  if(kind==='text'&&!column.category?.match(/A|R/))result.push('contains','startsWith','endsWith');
  if(['integer','number','date','datetime-zone','datetime-local','time-zone','time'].includes(kind))result.push('greater','greaterOrEqual','less','lessOrEqual','between');
  return [...result,'isNull','isNotNull'];
}

export class TableBrowser {
  constructor(root, {getSchema, onExecute, api, getContext=()=>null} = {}) {
    if (!root || typeof getSchema !== 'function' || typeof onExecute !== 'function') {
      throw new TypeError('TableBrowser richiede root, getSchema() e onExecute(sql).');
    }
    this.root = root;
    this.getSchema = getSchema;
    this.onExecute = onExecute;
    this.api=api;this.getContext=getContext;
    this.metadataSequence=0;
    this.lookupSequence=0;
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
    heading.append(element('div', 'tb-title', 'Quali record cerchi?'), element('p', 'tb-description', 'I record devono rispettare tutti i filtri. Scegli un campo o cerca un record collegato.'));
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
    const reset=element('button','tb-text-action','Rimuovi tutti i filtri');reset.type='button';reset.onclick=()=>{this.conditions=[];this.controls.offset.value='0';this.closeLookup();this.renderConditions();};
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
    this.lookupRoot=element('section','tb-lookup');this.lookupRoot.hidden=true;
    panel.append(heading, tableRow, conditions, add, reset, this.lookupRoot, orderRow, pageRow, buttons, status);
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
    this.loadDefinition();
  }

  async loadDefinition(){
    const sequence=++this.metadataSequence;this.definition=null;this.closeLookup();
    if(!this.api)return;
    const target={schema:this.controls.schemaSelect.value,table:this.controls.tableSelect.value};
    if(!target.table)return;
    this.metadataLoading=true;this.updateBusyState();this.setStatus('Caricamento dei tipi di campo e delle relazioni…');
    try{
      const definition=await this.api('/records/describe',{target});
      if(sequence!==this.metadataSequence)return;
      this.definition=definition;this.setStatus('');this.renderConditions();
    }catch(error){if(sequence===this.metadataSequence)this.setStatus('Metadati non disponibili: '+error.message+'. Sono disponibili i filtri di base.');}
    finally{if(sequence===this.metadataSequence){this.metadataLoading=false;this.updateBusyState();}}
  }

  closeLookup(){this.lookupSequence++;clearTimeout(this.lookupTimer);if(this.lookupRoot){this.lookupRoot.hidden=true;this.lookupRoot.replaceChildren();}}

  openLookup(condition,relation){
    this.closeLookup();const context=this.metadataSequence;
    const root=this.lookupRoot;root.hidden=false;
    const heading=element('strong','','Cerca in '+relation.targetTable),input=element('input');input.type='search';input.placeholder='Nome, ID o altro valore';input.setAttribute('aria-label','Cerca record collegato');
    const status=element('p','tb-status');status.setAttribute('role','status');const list=element('div','tb-lookup-items'),actions=element('div','tb-actions');
    const previous=element('button','tb-secondary','Precedenti'),next=element('button','tb-secondary','Successivi'),close=element('button','tb-secondary','Chiudi ricerca');
    for(const button of [previous,next,close])button.type='button';
    close.onclick=()=>this.closeLookup();actions.append(previous,next,close);root.append(heading,input,status,list,actions);
    let offset=0;
    const search=async page=>{
      const sequence=++this.lookupSequence;offset=page;list.replaceChildren();status.textContent='Ricerca nel database…';previous.disabled=next.disabled=true;
      try{
        const response=await this.api('/records/lookup',{relationId:relation.id,search:input.value,offset:page});
        if(sequence!==this.lookupSequence||context!==this.metadataSequence||root.hidden)return;
        status.textContent=response.items.length?'Scegli il record da usare nel filtro.':'Nessun record trovato.';
        for(const item of response.items){if(!Array.isArray(item.values)||item.values.length!==relation.sourceColumns.length||item.values.some(value=>value==null))continue;const button=element('button','tb-lookup-item');button.type='button';button.append(element('strong','',item.label),element('small','',item.detail));button.onclick=()=>{
          if(!this.conditions.includes(condition))return;
          condition.values=item.values.map(String);condition.label=item.label;this.closeLookup();this.renderConditions();
        };list.append(button);}
        previous.disabled=page===0;next.disabled=!response.hasMore;
      }catch(error){if(sequence===this.lookupSequence)status.textContent=error.message;}
    };
    input.oninput=()=>{clearTimeout(this.lookupTimer);this.lookupSequence++;list.replaceChildren();previous.disabled=next.disabled=true;this.lookupTimer=setTimeout(()=>search(0),250);};
    previous.onclick=()=>search(Math.max(0,offset-25));next.onclick=()=>search(offset+25);search(0);input.focus();
  }

  /** Select a known table without executing a query. Returns false if unavailable. */
  openTable(schemaName, tableName) {
    const context=this.getContext();
    if(context!==this.context){this.context=context;this.conditions=[];this.controls.tableSelect.value="";}
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
    if(this.controls.schemaSelect.value===schemaName&&this.controls.tableSelect.value===tableName){this.loadDefinition();return true;}
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
    const container=this.controls.conditions;container.replaceChildren();
    const table=this.tables.find(item=>item.schema===this.controls.schemaSelect.value&&item.table===this.controls.tableSelect.value);
    this.valueControls=[];
    if(!this.conditions.length)container.append(element('p','tb-description','Nessun filtro: verranno letti tutti i record, entro il limite scelto.'));
    this.conditions.forEach((condition,index)=>{
      const row=element('section','tb-condition');
      const column=element('select','tb-condition-column');column.setAttribute('aria-label','Colonna filtro');option(column,'','Scegli campo o relazione');
      for(const item of table?.columns||[])option(column,'column:'+item.name,item.name);
      for(const relation of this.definition?.relations||[])option(column,'relation:'+relation.id,relation.sourceColumns.join(' + ')+' → '+relation.targetTable);
      column.value=condition.relationId?'relation:'+condition.relationId:condition.column?'column:'+condition.column:'';
      column.onchange=()=>{
        this.closeLookup();const selected=column.value;
        for(const key of Object.keys(condition))delete condition[key];
        if(selected.startsWith('relation:')){condition.relationId=selected.slice(9);condition.operator='equals';}
        else{const name=selected.slice(7),relation=this.definition?.relations?.find(item=>item.sourceColumns.includes(name));if(relation)Object.assign(condition,{relationId:relation.id,operator:'equals'});else Object.assign(condition,{column:name,operator:'equals',value:''});}
        this.controls.offset.value='0';this.renderConditions();
      };
      const remove=element('button','tb-remove','Rimuovi');remove.type='button';remove.setAttribute('aria-label','Rimuovi filtro');remove.onclick=()=>{this.closeLookup();this.conditions.splice(index,1);this.renderConditions();};
      row.append(this.label('Campo o relazione',column),remove);
      if(condition.relationId){
        const relation=this.definition?.relations?.find(item=>item.id===condition.relationId);
        const operator=element('select','tb-condition-operator');operator.setAttribute('aria-label','Condizione');
        for(const key of ['equals','isNull','isNotNull'])option(operator,key,key==='equals'?'è il record':key==='isNull'?'tutti i campi sono NULL':'tutti i campi sono valorizzati');
        operator.value=condition.operator;operator.onchange=()=>{condition.operator=operator.value;this.closeLookup();this.renderConditions();};row.append(this.label('Condizione',operator));
        const selected=element('div','tb-filter-values');
        selected.append(element('p','tb-selection',condition.label?condition.label+' · '+(relation?.sourceColumns||[]).map((name,i)=>name+': '+condition.values[i]).join(' · '):'Nessun record selezionato'));
        const search=element('button','tb-secondary',relation?'Cerca in '+relation.targetTable:'Relazione non disponibile');search.type='button';search.disabled=!relation;search.onclick=()=>this.openLookup(condition,relation);selected.append(search);if(condition.operator==='equals')row.append(selected);
      }else if(condition.column){
        const metadata=this.definition?.columns?.find(item=>item.name===condition.column)||{name:condition.column,type:table.columns.find(item=>item.name===condition.column)?.type||'text'};
        const operator=element('select','tb-condition-operator');operator.setAttribute('aria-label','Condizione');
        const operators=filterOperators(metadata);if(!operators.includes(condition.operator))condition.operator='equals';
        for(const key of operators)option(operator,key,operatorLabels[key]);operator.value=condition.operator;
        operator.onchange=()=>{condition.operator=operator.value;this.renderConditions();};row.append(this.label('Condizione',operator));
        if(!['isNull','isNotNull'].includes(condition.operator)){
          const values=element('div','tb-filter-values');
          values.append(this.valueControl(condition,'value',metadata,condition.operator==='between'?'Da (incluso)':'Valore filtro'));
          if(condition.operator==='between')values.append(this.valueControl(condition,'end',metadata,'A (incluso)'));
          row.append(values);
        }
      }
      container.append(row);
    });
  }

  valueControl(condition,key,column,label){
    const kind=filterKind(column),type=column.baseType||column.type,wrapper=element('div','tb-value');
    const spec=fieldType(column);let input;
    if(kind==='enum'||kind==='boolean'){
      input=element('select');option(input,'','Scegli un valore');
      for(const choice of kind==='enum'?column.choices:['true','false'])option(input,choice,kind==='boolean'?(choice==='true'?'Vero':'Falso'):choice);
    }else{input=element('input');input.type='text';input.autocomplete='off';input.spellcheck=false;if(spec.inputMode)input.inputMode=spec.inputMode;input.placeholder=spec.placeholder||'Valore';}
    const temporal=temporalField(type,condition[key]||'');
    let fraction,offset;
    if(temporal&&!condition[key+'Raw']){
      input.type=temporal.fallback?'text':temporal.kind;input.step='1';input.value=temporal.value;
      if(!sameTemporalValue(input.value,temporal.value)){input.type='text';temporal.fallback=true;input.value=temporal.original;}
      if(!temporal.fallback&&temporal.kind!=='date'){
        fraction=element('input');fraction.type='text';fraction.inputMode='numeric';fraction.pattern='[0-9]{0,6}';fraction.maxLength=6;fraction.value=temporal.fraction;fraction.placeholder='000000';fraction.setAttribute('aria-label','Frazione di secondo '+label);
      }
      if(temporal.zoned&&!temporal.fallback){offset=element('input');offset.value=temporal.offset;offset.placeholder='+02:00';offset.setAttribute('aria-label','Scostamento UTC '+label);}
    }else input.value=condition[key]??'';
    input.classList.add('tb-condition-value');input.setAttribute('aria-label',label);
    const sync=()=>{
      condition[key]=temporal&&!condition[key+'Raw']?temporalValue(temporal,input.value,offset?.value??temporal.offset,fraction?.value??temporal.fraction):input.value;
      input.setCustomValidity('');if(offset)offset.setCustomValidity(validOffset(offset.value)?'':'Usa Z oppure +02:00.');
    };
    input.oninput=sync;input.onchange=sync;
    wrapper.append(this.label(label,input));
    if(fraction){fraction.oninput=sync;wrapper.append(this.label('Frazione di secondo',fraction));this.valueControls.push({input:fraction});}
    if(offset){offset.oninput=sync;wrapper.append(this.label('Scostamento UTC',offset));this.valueControls.push({input:offset});}
    if(temporal){
      const raw=element('button','tb-text-action',condition[key+'Raw']?'Usa calendario':'Usa valore PostgreSQL');raw.type='button';raw.onclick=()=>{condition[key+'Raw']=!condition[key+'Raw'];this.renderConditions();};wrapper.append(raw);
      wrapper.append(element('small','tb-description',temporal.zoned?'Il fuso è esplicito. Nessuna conversione automatica.':'Valore senza conversione di fuso.'));
    }else if(spec.hint)wrapper.append(element('small','tb-description',spec.hint));
    this.valueControls.push({input,column,condition,key,temporal});return wrapper;
  }

  async apply(schemaName, tableName, orderBy, direction, limit, offset) {
    if (this.busy||this.metadataLoading) return undefined;
    for(const control of this.valueControls||[]){
      const {input,column,condition,key,temporal}=control;
      if(column){input.required=!['text','json'].includes(filterKind(column));
        if(!temporal)input.setCustomValidity(fieldError(column,input.value));
        if(column.choices?.length&&!column.choices.includes(condition[key]))input.setCustomValidity('Scegli un valore.');
      }
      if(!input.reportValidity())return undefined;
    }
    try {
      const sql = buildTableQuery({schema: this.getSchema(), table_schema: schemaName, table_name: tableName,
        conditions: this.conditions, definition:this.definition, order_by: orderBy, direction, limit, offset});
      this.busy = true;
      this.updateBusyState();
      this.setStatus('Esecuzione query…');
      const summaries=this.conditions.map(condition=>{
        if(condition.relationId){const relation=this.definition.relations.find(item=>item.id===condition.relationId);return relation.targetTable+': '+(condition.operator==='equals'?condition.label:operatorLabels[condition.operator]);}
        return condition.column+' '+operatorLabels[condition.operator]+(['isNull','isNotNull'].includes(condition.operator)?'':' '+condition.value+(condition.operator==='between'?' e '+condition.end:''));
      });
      const result = await this.onExecute(sql,{schema:schemaName,table:tableName,summaries});
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
    this.controls.conditions.inert=!!(this.busy||this.metadataLoading);
    for (const button of [this.addButton, this.previousButton, this.nextButton, this.applyButton]) {
      if (button) button.disabled = this.busy||this.metadataLoading;
    }
  }

  setStatus(message) { this.controls.status.textContent = message; }
}

export default TableBrowser;
