import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateRecordInitialValues, duplicateRecordValues } from './duplicate-record.js';

test('duplicate excludes every part of a composite primary key and generated identity fields', () => {
  const definition = {
    primaryKey: ['tenant_id', 'record_id'],
    columns: [
      { name: 'tenant_id', nullable: false, hasDefault: false, canInsert: true },
      { name: 'record_id', nullable: false, hasDefault: true, canInsert: true },
      { name: 'serial_no', nullable: false, hasDefault: true, generated: true, canInsert: false },
      { name: 'identity_no', nullable: false, hasDefault: true, identity: true, canInsert: false },
      { name: 'required_manual', nullable: false, hasDefault: false, canInsert: true },
    ],
  };

  assert.deepEqual(duplicateRecordValues(definition, {
    tenant_id: 'north', record_id: '9007199254740993123', serial_no: '81',
    identity_no: '82', required_manual: 'old value',
  }), {
    tenant_id: { mode: 'value', value: '' },
    record_id: { mode: 'default' },
    serial_no: { mode: 'default' },
    identity_no: { mode: 'default' },
    required_manual: { mode: 'value', value: 'old value' },
  });
});

test('duplicate preserves large numeric strings, JSON and composed lookup values without sharing objects', () => {
  const definition = {
    primaryKey: ['id'],
    columns: [
      { name: 'id', nullable: false, hasDefault: true, generated: true, canInsert: false },
      { name: 'amount', nullable: false, hasDefault: false, canInsert: true },
      { name: 'payload', nullable: true, hasDefault: false, canInsert: true },
      { name: 'company_tenant', nullable: false, hasDefault: false, canInsert: true },
      { name: 'company_id', nullable: false, hasDefault: false, canInsert: true },
    ],
  };
  const row = {
    id: '44',
    amount: '9007199254740993.12345678901234567890',
    payload: { nested: [{ keep: 'all' }] },
    company_tenant: 'tenant-01',
    company_id: '00000000000000000991',
  };

  const values = duplicateRecordInitialValues({ definition, row });
  assert.equal(values.amount.value, row.amount);
  assert.deepEqual(values.company_tenant, { mode: 'value', value: 'tenant-01' });
  assert.deepEqual(values.company_id, { mode: 'value', value: '00000000000000000991' });
  assert.deepEqual(values.payload, { mode: 'value', value: { nested: [{ keep: 'all' }] } });
  assert.notStrictEqual(values.payload.value, row.payload);
  assert.notStrictEqual(values.payload.value.nested, row.payload.nested);
  assert.notStrictEqual(values.payload.value.nested[0], row.payload.nested[0]);
  values.payload.value.nested[0].keep = 'changed';
  assert.equal(row.payload.nested[0].keep, 'all');
  assert.deepEqual(values.id, { mode: 'default' });
});

test('duplicate preserves nulls and initializes nullable or defaulted missing fields appropriately', () => {
  const definition = {
    primaryKey: [],
    columns: [
      { name: 'source_null', nullable: true, hasDefault: false, canInsert: true },
      { name: 'optional_missing', nullable: true, hasDefault: false, canInsert: true },
      { name: 'defaulted_missing', nullable: false, hasDefault: true, canInsert: true },
      { name: 'required_missing', nullable: false, hasDefault: false, canInsert: true },
      { name: 'read_only_defaulted', nullable: false, hasDefault: true, canInsert: false },
    ],
  };

  assert.deepEqual(duplicateRecordValues(definition, { source_null: null }), {
    source_null: { mode: 'null' },
    optional_missing: { mode: 'null' },
    defaulted_missing: { mode: 'default' },
    required_missing: { mode: 'value', value: '' },
    read_only_defaulted: { mode: 'default' },
  });
});
