import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeTransport} from './native.js';

test('Android connection uses the native bridge with only the URI, and correlates replies', async()=>{
  const calls=[],target={};
  const request=nativeTransport({request:(...args)=>calls.push(args)},target);
  const one=request('/connect',{connectionString:'postgresql://demo:secret@db.example/test'});
  const two=request('/schema',{session:'abc'});
  assert.equal(calls[0][1],'/connect');
  assert.deepEqual(Object.keys(JSON.parse(calls[0][2])),['connectionString']);
  target.__psqlNativeReply(JSON.stringify({id:calls[1][0],data:[]}));
  target.__psqlNativeReply(JSON.stringify({id:calls[0][0],data:{session:'abc'}}));
  assert.deepEqual(await one,{session:'abc'});
  assert.deepEqual(await two,[]);
});

test('Android database errors reject their request',async()=>{
  const target={};let id;
  const request=nativeTransport({request:key=>{id=key}},target);
  const result=request('/query',{sql:'select broken'});
  target.__psqlNativeReply(JSON.stringify({id,error:'syntax error [42601]'}));
  await assert.rejects(result,/42601/);
});

test('missing native bridge fails instead of falling back to HTTP',async()=>{
  const request=nativeTransport(undefined,{});
  await assert.rejects(request('/connect',{}));
});
