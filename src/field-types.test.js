import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldType,fieldError} from './field-types.js';
test('integers and decimals retain exact strings and enforce PostgreSQL integer bounds',()=>{
  assert.equal(fieldError({type:'bigint'},'9007199254740993123'),'');
  assert.equal(fieldError({type:'numeric(30,6)'},'9007199254740993123.123456'),'');
  assert.equal(fieldError({type:'numeric'},'-1.23e-100'),'');
  for(const [type,value]of [['integer','2147483648'],['smallint','-32769'],['bigint','9223372036854775808'],['integer','1.5'],['numeric','1,50']])assert.ok(fieldError({type},value));
  assert.equal(fieldError({type:'custom_id',baseType:'bigint'},'9223372036854775807'),'');
});
test('JSON, UUID, bit strings and text limits give useful errors without rewriting values',()=>{
  for(const json of ['{"id":9007199254740993123}','null','[1,true,"x"]'])assert.equal(fieldError({type:'jsonb'},json),'');
  assert.ok(fieldError({type:'jsonb'},'{bad}'));
  assert.equal(fieldError({type:'uuid'},'550e8400-e29b-41d4-a716-446655440000'),'');
  assert.ok(fieldError({type:'uuid'},'not-a-uuid'));
  assert.equal(fieldError({type:'bit varying(8)'},'01010'),'');assert.ok(fieldError({type:'bit(3)'},'012'));
  assert.equal(fieldError({type:'character varying(2)'},'😀a'),'');assert.ok(fieldError({type:'varchar(2)'},'abc'));
});
test('PostgreSQL special and compound types keep their native text representation',()=>{
  for(const type of ['text[]','integer[]','bytea','interval','inet','cidr','macaddr','daterange','int4multirange','xml','point','money','tsvector']){
    assert.ok(fieldType({type}).hint);assert.equal(fieldError({type},'database-specific literal'),'');
  }
  assert.match(fieldType({type:'text[]',category:'A'}).hint,/Array PostgreSQL/);
  assert.match(fieldType({type:'custom_enum',choices:['Uno','Due']}).hint,/Scegli/);
  assert.match(fieldType({type:'boolean',category:'B'}).hint,/vero o falso/);
});
