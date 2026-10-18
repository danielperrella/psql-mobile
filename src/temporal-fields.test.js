import test from 'node:test';
import assert from 'node:assert/strict';
import {temporalField,temporalValue,validOffset,sameTemporalValue} from './temporal-fields.js';
test('date and timestamp controls retain wall clocks and original microseconds',()=>{
  const date=temporalField('date','2024-02-29');assert.equal(date.kind,'date');assert.equal(temporalValue(date,'2024-03-01'),'2024-03-01');
  const timestamp=temporalField('timestamp(6) without time zone','2026-10-25 02:30:45.123456');
  assert.equal(timestamp.kind,'datetime-local');assert.equal(timestamp.value,'2026-10-25T02:30:45');assert.equal(timestamp.fraction,'123456');
  assert.equal(temporalValue(timestamp,timestamp.value),'2026-10-25 02:30:45.123456');
  assert.equal(temporalValue(timestamp,'2026-10-25T03:30:45'),'2026-10-25T03:30:45.123456');
  assert.equal(temporalField('text','2026-01-01'),null);
});
test('zoned timestamps and times keep explicit offsets rather than device timezone',()=>{
  for(const type of ['timestamp with time zone','timestamptz','timestamp(3) with time zone']){
    const field=temporalField(type,'2026-10-25 02:30:00.123456+05:30');
    assert.equal(field.zoned,true);assert.equal(field.offset,'+05:30');
    assert.equal(temporalValue(field,'2026-10-26T02:30:00','-04:00'),'2026-10-26T02:30:00.123456-04:00');
  }
  assert.equal(temporalField('time(6) without time zone','10:20:30.654321').kind,'time');
  assert.equal(temporalField('timetz','10:20:30+02').offset,'+02');
  for(const offset of ['Z','+00','-05:30','+05:30:15'])assert.ok(validOffset(offset));
  for(const offset of ['', 'Europe/Rome','+25:00','+02:99','+02:00garbage'])assert.equal(validOffset(offset),false);
});
test('special PostgreSQL values remain editable without losing their original text',()=>{
  for(const raw of ['infinity','-infinity','2026-01-01 BC','12026-01-01']){const field=temporalField('date',raw);assert.ok(field.fallback);assert.equal(temporalValue(field,field.value),raw);}
  assert.ok(temporalField('time','24:00:00').fallback);
  assert.equal(sameTemporalValue('2026-01-01T12:30','2026-01-01T12:30:00'),true);
  assert.equal(sameTemporalValue('12:30:45.123','12:30:45.123000'),true);
  assert.equal(sameTemporalValue('12:30:45.123','12:30:45.123456'),false);
});
