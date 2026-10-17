import test from 'node:test';
import assert from 'node:assert/strict';
import {displayValue, filterRows, pageRows, recordTitle, availableRelations} from './results-view.js';

test('pagination keeps every record reachable and clamps a stale page after filtering', () => {
  const rows = Array.from({length: 47}, (_, id) => ({id}));
  const first = pageRows(rows, 0), second = pageRows(rows, 1), last = pageRows(rows, 2);
  assert.deepEqual([...first.rows, ...second.rows, ...last.rows], rows);
  assert.deepEqual([last.from, last.to, last.pages], [41, 47, 3]);
  assert.equal(pageRows(rows.slice(0, 3), 2).page, 0);
  assert.deepEqual(pageRows([], 9).rows, []);
});

test('relation links require declared, complete, non-null keys and untruncated values', () => {
  const relation={id:'12',fields:['tenant','customer'],targetColumns:['tenant_id','id']};
  const result={relations:[relation]};
  assert.deepEqual(availableRelations(result,{tenant:'a',customer:'9007199254740993123'},'customer'),[relation]);
  assert.deepEqual(availableRelations(result,{tenant:'a',customer:null},'customer'),[]);
  assert.deepEqual(availableRelations(result,{customer:'12'},'customer'),[]);
  assert.deepEqual(availableRelations({...result,truncated:true},{tenant:'a',customer:'12'},'customer'),[]);
  assert.deepEqual(availableRelations({}, {customer_id:'12'},'customer_id'),[]);
  assert.deepEqual(availableRelations(result,{tenant:'',customer:'12'},'customer'),[relation]);
});

test('search covers all loaded records, accents, nulls, objects and exact large numbers', () => {
  const fields = ['nome', 'note', 'metadata', 'numero'];
  const rows = Array.from({length: 25}, (_, index) => ({nome: 'cliente ' + index, note: 'regolare', metadata: {canale: 'sportello'}, numero: String(index)}));
  rows[24] = {nome: 'Città', note: null, metadata: {canale: 'mobile'}, numero: '9007199254740993123'};
  for (const query of ['citta', 'NULL', 'mobile', '9007199254740993123']) {
    assert.deepEqual(filterRows(rows, fields, query), [rows[24]]);
  }
  assert.equal(filterRows(rows, fields, '   ').length, 25);
  assert.equal(filterRows(rows, fields, 'assente').length, 0);
});

test('record headings use a useful field and full values retain content and precision', () => {
  const row = {id: '123', cliente: 'Elena Rossi', details: {note: 'x'.repeat(4000)}};
  assert.deepEqual(recordTitle(row, Object.keys(row)), {field: 'cliente', text: 'Elena Rossi'});
  assert.equal(displayValue('x'.repeat(4000)).length, 4000);
  assert.equal(displayValue('9007199254740993123'), '9007199254740993123');
  assert.match(displayValue(row.details), /x{4000}/);
  assert.equal(displayValue(null), 'NULL');
  assert.equal(displayValue(''), 'Stringa vuota');
});
