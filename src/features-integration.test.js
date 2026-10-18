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

test('typed visual filters and named lookup selections execute the same way in demo',async()=>{
  resetDemo();const schema=demoSchema();
  const definition=await demoRecords('/records/describe',{target:{schema:'public',table:'ordini'}});
  const found=await demoRecords('/records/lookup',{relationId:definition.relations[0].id,search:'Sofia',offset:0});
  const sql=buildTableQuery({schema,definition,table_schema:'public',table_name:'ordini',conditions:[{relationId:definition.relations[0].id,operator:'equals',values:found.items[0].values},{column:'id',operator:'between',value:'1043',end:'1055'}]});
  assert.deepEqual(demoResults(sql)[0].rows.map(row=>row.id),['1043','1049','1055']);
  const dates=buildTableQuery({schema,table_schema:'public',table_name:'aziende',conditions:[{column:'data_fondazione',operator:'between',value:'2018-01-01',end:'2018-12-31'}]});
  assert.equal(demoResults(dates)[0].rows.length,1);
  const prefix=buildTableQuery({schema,table_schema:'public',table_name:'clienti',conditions:[{column:'nome',operator:'startsWith',value:'Sof'},{column:'nome',operator:'endsWith',value:'Conti'},{column:'id',operator:'notEquals',value:'201'}]});
  assert.deepEqual(demoResults(prefix)[0].rows.map(row=>row.id),['203']);
});

test('demo timestamp filters compare instants across UTC offsets without losing microseconds',()=>{
  resetDemo();const schema=demoSchema();
  const run=value=>demoResults(buildTableQuery({schema,table_schema:'public',table_name:'aziende',conditions:[{column:'ultimo_contatto',operator:'equals',value}]}))[0].rows;
  assert.equal(run('2026-10-18T07:30:15.123456Z').length,1);
  assert.equal(run('2026-10-18T07:30:15.123457Z').length,0);
});
