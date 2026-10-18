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
