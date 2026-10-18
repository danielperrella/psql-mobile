import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTableQuery} from './table-browser.js';
import {demoSchema,demoResults,demoRecords,demoInverse,resetDemo} from './demo.js';
import {duplicateRecordInitialValues} from './duplicate-record.js';

test('visual builder SQL runs in demo with exact filters, AND, escaped text, NULL and paging',async()=>{
  resetDemo();const schema=demoSchema();
  const query=buildTableQuery({schema,table_schema:'public',table_name:'clienti',conditions:[{column:'id',operator:'greaterOrEqual',value:'203'},{column:'id',operator:'less',value:'207'}],order_by:'id',direction:'DESC',limit:1,offset:1});
  assert.deepEqual(demoResults(query)[0].rows.map(row=>row.id),['205']);
  const target={schema:'public',table:'clienti'},loaded=await demoRecords('/records/open',{target,keys:{id:'201'}});
  await demoRecords('/records/save',{target,mode:'update',keys:loaded.keys,version:loaded.version,values:{nome:{mode:'value',value:"O'Reilly_100%\\test"}}});
  const contains=buildTableQuery({schema,table_schema:'public',table_name:'clienti',conditions:[{column:'nome',operator:'contains',value:"O'Reilly_100%\\test"}]});
  assert.deepEqual(demoResults(contains)[0].rows.map(row=>row.id),['201']);
  const nulls=buildTableQuery({schema,table_schema:'public',table_name:'ordini',conditions:[{column:'note',operator:'isNull'}]});
  assert.equal(demoResults(nulls)[0].rows.length,23);
  assert.throws(()=>demoResults('SELECT * FROM clienti; DELETE FROM ordini;'));
});

test('duplicate creates a fresh record and inverse navigation keeps the original parent',async()=>{
  resetDemo();const target={schema:'public',table:'ordini'},original=await demoRecords('/records/open',{target,keys:{id:'1041'}});
  const initial=duplicateRecordInitialValues(original),values={};
  for(const column of original.definition.columns)if(column.canInsert){const state=initial[column.name];values[column.name]=state.mode==='value'?{...state,value:typeof state.value==='object'?JSON.stringify(state.value):String(state.value)}:state;}
  const created=await demoRecords('/records/save',{target,mode:'create',values});
  assert.notEqual(created.keys.id,original.keys.id);assert.equal(created.row.cliente_id,'201');assert.equal(demoResults()[0].rows.length,25);
  assert.equal((await demoRecords('/records/open',{target,keys:original.keys})).version,original.version);
  const relations=await demoInverse('/inverse/list',{target:{schema:'public',table:'clienti'},keys:{id:'201'}});
  const children=await demoInverse('/inverse/read',{relationId:relations[0].id,keys:{id:'201'},offset:0});
  assert.equal(children.rows.length,5);assert.ok(children.rows.some(row=>row.id===created.keys.id));
  await assert.rejects(demoInverse('/inverse/read',{relationId:relations[0].id,keys:{id:'missing'},offset:0}));
  resetDemo();
});
