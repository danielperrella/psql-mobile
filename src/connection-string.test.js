import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConnectionString, validateConnectionString } from './connection-string.js';

const uri='postgresql://utente:password@db.example.com/database?sslmode=require&channel_binding=require';

test('accepts a complete psql command and preserves URI parameters and credentials',()=>{
  for(const value of [`psql '${uri}'`, `psql "${uri}"`, `psql ${uri}`, `psql.exe '${uri}'`, `'${uri}'`, `psql ‘${uri}’`, ` ${uri} `]) {
    assert.equal(normalizeConnectionString(value).uri,uri);
  }
  const result=validateConnectionString(`psql '${uri}'`);
  assert.equal(result.valid,true);
  assert.match(result.message,/psql riconosciuto/);
});

test('preserves encoded special characters without guessing or changing a password',()=>{
  const encoded='postgres://utente:p%40ss+word%25%23%2F%3F@db.example.com/db';
  assert.equal(normalizeConnectionString(`psql '${encoded}'`).uri,encoded);
});

test('accepts IPv4, localhost and IPv6 without changing the connection URI',()=>{
  for(const host of ['127.0.0.1:55432','localhost:5432','[::1]:5432']) {
    const value=`postgresql://utente:password@${host}/database?sslmode=disable`;
    assert.equal(normalizeConnectionString(`psql '${value}'`).uri,value);
  }
});

test('shows specific inline errors instead of blaming every invalid paste on password encoding',()=>{
  for(const [input,pattern]of [
    ["psql 'postgresql://utente:password@db.example.com/db",/virgolette.*chiuse/],
    ['https://db.example.com',/iniziare con postgresql/],
    ['psql --help',/senza altre opzioni/],
    ['postgres://utente:pass word@db.example.com/db',/spazio.*%20/i],
    ['postgres://utente:pass%word@db.example.com/db',/Sequenza %.*%25/],
    ['postgres://utente:pass#word@db.example.com/db',/#.*%23/],
    ['postgres://utente:pass@word@db.example.com/db',/@.*%40/],
    ['postgres://utente:pass%FF@db.example.com/db',/UTF-8/],
    [`psql '${uri}' --echo-all`,/virgolette|spazio/i],
    [`psql '${uri}'; other-command`,/virgolette|spazio/i],
  ]) {
    const result=validateConnectionString(input);
    assert.equal(result.valid,false,input);
    assert.match(result.message,pattern);
  }
});
