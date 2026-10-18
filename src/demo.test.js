import test from 'node:test';
import assert from 'node:assert/strict';
import {demoResults,demoRecords,demoRelated,resetDemo} from './demo.js';
import {recordReferences} from './record-changes.js';

test('demo SELECT reads the requested table, projection, aliases, filter, order and limit',()=>{
  resetDemo();
  const [customers]=demoResults('SELECT "id" AS "chiave", nome, azienda_id AS azienda FROM "public"."clienti" ORDER BY id DESC LIMIT 2;');
  assert.equal(customers.rows.length,2);assert.equal(customers.rows[0].chiave,'206');
  assert.equal(recordReferences(customers,customers.rows[0])[0].keys.id,'206');
  assert.deepEqual(customers.relations[0].fields,['azienda']);
  assert.equal(demoResults("SELECT * FROM ordini WHERE stato = 'Pagato' LIMIT 3")[0].rows.length,3);
  assert.equal(demoResults('SELECT * FROM aziende LIMIT 0')[0].rows.length,0);
  assert.equal(demoResults('SELECT * FROM clienti WHERE id = 203')[0].rows[0].nome,'Sofia Conti');
  const [projection]=demoResults('SELECT nome FROM clienti');
  assert.deepEqual(recordReferences(projection,projection.rows[0]),[]);
});

test('demo rejects unsupported SQL and unknown names instead of returning all orders',()=>{
  for(const sql of ['DELETE FROM ordini','SELECT * FROM clienti; SELECT * FROM ordini','SELECT * FROM clienti JOIN aziende ON true','SELECT count(*) FROM ordini','SELECT * FROM missing','SELECT * FROM pg_catalog.clienti','SELECT password FROM clienti','SELECT id AS x, nome AS x FROM clienti'])assert.throws(()=>demoResults(sql));
});

test('demo CRUD validates atomically, handles JSON, searches lookups, and restores seed data',async()=>{
  resetDemo();const target={schema:'public',table:'ordini'};
  const opened=await demoRecords('/records/open',{target,keys:{id:'1041'}});
  const update={target,keys:opened.keys,version:opened.version,mode:'update'};
  await assert.rejects(demoRecords('/records/save',{...update,values:{note:{mode:'value',value:'must not save'},cliente_id:{mode:'value',value:'9999'}}}));
  assert.equal((await demoRecords('/records/open',{target,keys:opened.keys})).row.note,opened.row.note);
  const saved=await demoRecords('/records/save',{...update,values:{cliente_id:{mode:'value',value:'203'},metadata:{mode:'value',value:'{"canale":"test"}'}}});
  assert.deepEqual(saved.row.metadata,{canale:'test'});
  await assert.rejects(demoRecords('/records/save',{...update,values:{note:{mode:'null'}}}),/cambiato/);
  assert.equal((await demoRelated({relationId:'demo-customer',values:[saved.row.cliente_id]})).results[0].rows[0].nome,'Sofia Conti');
  assert.equal((await demoRecords('/records/lookup',{relationId:'demo-customer',search:'sofia',offset:0})).items[0].values[0],'203');
  const company={schema:'public',table:'aziende'};
  const created=await demoRecords('/records/save',{target:company,mode:'create',values:{nome:{mode:'value',value:'Test demo'}}});
  assert.equal(demoResults('SELECT * FROM aziende')[0].rows.length,2);
  await demoRecords('/records/delete',{target:company,keys:created.keys,version:created.version});
  assert.equal(demoResults('SELECT * FROM aziende')[0].rows.length,1);
  const initial=await demoRecords('/records/open',{target:company,keys:{id:'71'}});
  await demoRecords('/records/save',{target:company,keys:initial.keys,version:initial.version,values:{nome:{mode:'value',value:'Changed'}}});
  resetDemo();assert.equal(demoResults('SELECT * FROM aziende')[0].rows[0].nome,'Studio Esempio');
  assert.equal(demoResults()[0].rows[0].cliente_id,'201');
});
