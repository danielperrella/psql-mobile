import {test} from 'node:test';import assert from 'node:assert/strict';import {connectionConfig,csv} from './core.js';
test('URI encoded credentials and TLS cannot be downgraded',()=>{const c=connectionConfig({connectionString:'postgresql://alice:p%40ss@db.example/test?sslmode=no-verify',ssl:'require'});assert.equal(c.password,'p@ss');assert.deepEqual(c.ssl,{rejectUnauthorized:true});assert.equal(c.database,'test')});
test('reject invalid URI and port',()=>{assert.throws(()=>connectionConfig({connectionString:'https://example.com'}));assert.throws(()=>connectionConfig({host:'db',database:'a',user:'b',port:'oops'}))});
test('CSV escapes values',()=>assert.equal(csv([{a:'a"b',b:null}],['a','b']),'"a","b"\r\n"a""b",""'));
