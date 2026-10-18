// Keep PostgreSQL wall-clock values and microseconds; never pass them through Date.
export function temporalField(type,raw){
  const name=type.toLowerCase().replace(/\(\d+\)/g,'').replace(/\s+/g,' ').trim();
  const kind=name==='date'?'date':/^(timestamp|timestamptz)( |$)/.test(name)?'datetime-local':/^(time|timetz)( |$)/.test(name)?'time':null;
  if(!kind)return null;
  const zoned=/with time zone|^(timestamptz|timetz)$/.test(name),original=raw==null?'':String(raw);
  let value=original,offset=zoned?'+00:00':'';
  if(zoned&&original){const match=original.match(/(Z|[+-]\d{2}(?::?\d{2})?(?::?\d{2})?)$/i);if(match){value=original.slice(0,-match[0].length);offset=match[0];}}
  if(kind==='datetime-local')value=value.replace(' ','T');
  const fractionMatch=kind!=='date'?value.match(/\.(\d{1,6})$/):null;
  const fraction=fractionMatch?fractionMatch[1]:'';if(fractionMatch)value=value.slice(0,-fractionMatch[0].length);
  const date='\\d{4}-\\d{2}-\\d{2}',time='\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,6})?)?';
  const pattern=new RegExp('^'+(kind==='date'?date:kind==='time'?time:date+'T'+time)+'$');
  const fallback=!!original&&(!pattern.test(value)||value.startsWith('0000-')||/(?:T|^)24:/.test(value)||(zoned&&!validOffset(offset)));
  return {kind,zoned,original,value:fallback?original:value,offset,fraction:fallback?'':fraction,fallback};
}
export function validOffset(value){
  if(/^Z$/i.test(value))return true;
  const match=value.match(/^[+-](\d{2})(?::?(\d{2}))?(?::?(\d{2}))?$/);
  return !!match&&Number(match[1])<=15&&Number(match[2]||0)<=59&&Number(match[3]||0)<=59;
}
export function temporalValue(field,value,offset=field.offset,fraction=field.fraction){
  if(value===field.value&&offset===field.offset&&fraction===field.fraction)return field.original;
  if(field.fallback)return value;
  if(fraction){if(/(?:T|^)\d{2}:\d{2}$/.test(value))value+=':00';value+='.'+fraction;}
  return value+(field.zoned?offset:'');
}
export function sameTemporalValue(left,right){
  const normalize=value=>value.replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,'').replace(/(\d{2}:\d{2}):00$/,'$1');
  return normalize(left)===normalize(right);
}
