import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionDialog } from './connection-dialog.js';

test('native connection form exposes a readOnly checkbox and its scope',()=>{
  const html=connectionDialog(true,'1.0');
  assert.match(html,/<input name="readOnly" type="checkbox">/);
  assert.match(html,/transazioni PostgreSQL in sola lettura/);
  assert.match(html,/utente PostgreSQL con privilegi di sola lettura/);
});

test('browser gateway form does not advertise native database read-only mode',()=>{
  const html=connectionDialog(false,'1.0');
  assert.doesNotMatch(html,/name="readOnly"/);
});
