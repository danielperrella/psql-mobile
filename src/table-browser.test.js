import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTableQuery, quoteIdentifier, quoteLiteral} from './table-browser.js';

const schema = [
  {table_schema: 'public', table_name: 'ordini', column_name: 'id', data_type: 'bigint'},
  {table_schema: 'public', table_name: 'ordini', column_name: 'cliente"nome', data_type: 'text'},
  {table_schema: 'public', table_name: 'ordini', column_name: 'nota', data_type: 'text'},
  {table_schema: 'archivio', table_name: 'ordini', column_name: 'id', data_type: 'bigint'}
];

test('quotes PostgreSQL identifiers and string values without interpreting user input', () => {
  assert.equal(quoteIdentifier('clienti"; DROP TABLE ordini;--'), '"clienti""; DROP TABLE ordini;--"');
  assert.equal(quoteLiteral("x'); DROP TABLE ordini; --\\path"), "E'x''); DROP TABLE ordini; --\\\\path'");
  const sql = buildTableQuery({schema, table_schema: 'public', table_name: 'ordini', conditions: [
    {column: 'cliente"nome', operator: 'equals', value: "x'); DROP TABLE ordini;--"}
  ]});
  assert.equal(sql, `SELECT * FROM "public"."ordini" WHERE "cliente""nome" = E'x''); DROP TABLE ordini;--' LIMIT 100 OFFSET 0;`);
  assert.doesNotMatch(sql, /DROP TABLE ordini;--\s+LIMIT/);
});

test('keeps large numeric values exact and emits explicit NULL conditions', () => {
  const sql = buildTableQuery({schema, table_schema: 'public', table_name: 'ordini', conditions: [
    {column: 'id', operator: 'greaterOrEqual', value: '9007199254740993123456789'},
    {column: 'nota', operator: 'isNull'}
  ]});
  assert.match(sql, /"id" >= E'9007199254740993123456789'/);
  assert.match(sql, /AND "nota" IS NULL/);
  assert.doesNotMatch(sql, /9\.007/);
});

test('contains escapes LIKE metacharacters and quotes the search value', () => {
  const sql = buildTableQuery({schema, table_schema: 'public', table_name: 'ordini', conditions: [
    {column: 'nota', operator: 'contains', value: "50%_\\' OR TRUE --"}
  ]});
  assert.match(sql, /CAST\("nota" AS text\) ILIKE/);
  assert.ok(sql.includes(String.raw`50\\%\\_\\\\'' OR TRUE --`));
  assert.ok(sql.includes(String.raw`ESCAPE E'\\'`));
});

test('quotes sort columns and validates table, filter, sort, and paging against the schema', () => {
  const sql = buildTableQuery({schema, table_schema: 'public', table_name: 'ordini', order_by: 'cliente"nome', direction: 'desc', limit: '25', offset: '50'});
  assert.equal(sql, 'SELECT * FROM "public"."ordini" ORDER BY "cliente""nome" DESC LIMIT 25 OFFSET 50;');
  assert.throws(() => buildTableQuery({schema, table_schema: 'other', table_name: 'ordini'}), /non appartiene/);
  assert.throws(() => buildTableQuery({schema, table_schema: 'public', table_name: 'ordini', conditions: [{column: 'id) OR TRUE --', operator: 'equals', value: '1'}]}), /non appartiene/);
  assert.throws(() => buildTableQuery({schema, table_schema: 'public', table_name: 'ordini', order_by: 'id; DROP TABLE x'}), /non appartiene/);
  assert.throws(() => buildTableQuery({schema, table_schema: 'public', table_name: 'ordini', limit: '1; DROP TABLE x'}), /numero intero/);
  assert.throws(() => buildTableQuery({schema, table_schema: 'public', table_name: 'ordini', offset: '-1'}), /numero intero/);
  assert.throws(() => buildTableQuery({schema, table_schema: 'public', table_name: 'ordini', limit: '1001'}), /intervallo/);
});

test('requires values for value comparisons and rejects unsupported operators', () => {
  assert.throws(() => buildTableQuery({schema, table_schema: 'public', table_name: 'ordini', conditions: [{column: 'id', operator: 'equals', value: null}]}), /Inserisci un valore/);
  assert.throws(() => buildTableQuery({schema, table_schema: 'public', table_name: 'ordini', conditions: [{column: 'id', operator: 'regex', value: '.*'}]}), /Operatore/);
});

test('typed operators match actual PostgreSQL base types including domains',async()=>{
  const {filterKind,filterOperators}=await import('./table-browser.js');
  assert.equal(filterKind({type:'my_bool',baseType:'boolean'}),'boolean');
  assert.equal(filterKind({type:'status',choices:['ready','done']}),'enum');
  assert.equal(filterKind({type:'timestamptz'}),'datetime-zone');
  assert.equal(filterKind({type:'timestamp without time zone'}),'datetime-local');
  assert.equal(filterKind({type:'time with time zone'}),'time-zone');
  assert.ok(!filterOperators({type:'boolean'}).includes('contains'));
  assert.ok(filterOperators({type:'numeric'}).includes('between'));
  assert.ok(filterOperators({type:'text'}).includes('startsWith'));
});

test('ranges preserve both endpoints and text operators escape literal wildcards',()=>{
  const sql=buildTableQuery({schema,table_schema:'public',table_name:'ordini',conditions:[{column:'id',operator:'between',value:'9007199254740993',end:'9007199254740999'},{column:'nota',operator:'startsWith',value:'50%_'},{column:'nota',operator:'notEquals',value:"O'Reilly"}]});
  assert.ok(sql.includes(`"id" >= E'9007199254740993' AND "id" <= E'9007199254740999'`));
  assert.ok(sql.includes(String.raw`ILIKE E'50\\%\\_%'`));
  assert.ok(sql.includes(`"nota" <> E'O''Reilly'`));
  assert.throws(()=>buildTableQuery({schema,table_schema:'public',table_name:'ordini',conditions:[{column:'id',operator:'between',value:'1'}]}),/entrambi/);
});

test('lookup filters whitelist every composite key column and preserve exact selected values',()=>{
  const definition={relations:[{id:'fk',sourceColumns:['id','nota']}]};
  const build=condition=>buildTableQuery({schema,definition,table_schema:'public',table_name:'ordini',conditions:[condition]});
  assert.ok(build({relationId:'fk',operator:'equals',values:['9007199254740993',"O'Reilly"]}).includes(`("id" = E'9007199254740993' AND "nota" = E'O''Reilly')`));
  assert.ok(build({relationId:'fk',operator:'isNull'}).includes('("id" IS NULL AND "nota" IS NULL)'));
  assert.throws(()=>build({relationId:'fk',operator:'equals',values:['1']}),/nuovamente/);
  assert.throws(()=>build({relationId:'fake',operator:'equals',values:['1','2']}),/nuovamente/);
  definition.relations[0].sourceColumns=['injected'];assert.throws(()=>build({relationId:'fk',values:['1']}),/non appartiene/);
});
