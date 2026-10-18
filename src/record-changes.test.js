import test from 'node:test';
import assert from 'node:assert/strict';
import {recordReferences,applyRecordChange} from './record-changes.js';

const target={schema:'public',table:'clienti',keyComplete:true,keys:[{column:'id',field:'cliente'}],fields:[{column:'id',field:'cliente'},{column:'nome',field:'nome_cliente'}]};
const result=()=>({fields:['cliente','nome_cliente','calcolo'],rows:[{cliente:'9007199254740993123',nome_cliente:'Prima',calcolo:'risultato query'},{cliente:'2',nome_cliente:'Altro',calcolo:'altro'}],recordTargets:[target]});
test('single-record changes match exact primary keys and preserve aliases and computed values',()=>{
  const current=result();const change={mode:'update',target:{schema:'public',table:'clienti'},keys:{id:'9007199254740993123'},saved:{row:{id:'9007199254740993123',nome:'Dopo'}}};
  assert.equal(applyRecordChange(current,change),true);assert.equal(current.rows[0].nome_cliente,'Dopo');assert.equal(current.rows[1].nome_cliente,'Altro');assert.equal(current.rows[0].calcolo,'risultato query');assert.equal(current.snapshotNotice,true);
  applyRecordChange(current,{...change,mode:'delete'});assert.equal(current.rows.length,1);assert.equal(current.rows[0].cliente,'2');
});
test('creation never replaces the rows of an existing query and ambiguous or truncated keys cannot edit',()=>{
  const current=result(),before=structuredClone(current.rows);
  assert.equal(applyRecordChange(current,{mode:'create',target,keys:{},saved:{row:{id:'3',nome:'Nuovo'}}}),false);assert.deepEqual(current.rows,before);
  assert.deepEqual(recordReferences({...current,truncated:true},current.rows[0]),[]);
  assert.deepEqual(recordReferences({...current,recordTargets:[{...target,keyComplete:false}]},current.rows[0]),[]);
});
