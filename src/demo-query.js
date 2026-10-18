// Explicit offline SELECT subset; unsupported SQL must never show unrelated data.
const identifier='(?:"(?:[^"]|"")*"|[a-z_][a-z_0-9]*)';
const unquote=value=>value.startsWith('"')?value.slice(1,-1).replaceAll('""','"'):value.toLowerCase();
const unsupported=()=>new Error('La demo supporta SELECT colonne FROM public.tabella, WHERE colonna = valore, ORDER BY colonna [ASC/DESC] e LIMIT. Per SQL completo usa l’app Android.');
export function selectDemo(text,data,makeResult){
  const pattern=new RegExp('^\\s*SELECT\\s+(.+?)\\s+FROM\\s+(?:('+identifier+')\\s*\\.\\s*)?('+identifier+')(?:\\s+WHERE\\s+('+identifier+')\\s*=\\s*(NULL|[-+]?\\d+(?:\\.\\d+)?|\'(?:[^\']|\'\')*\'))?(?:\\s+ORDER\\s+BY\\s+('+identifier+')(?:\\s+(ASC|DESC))?)?(?:\\s+LIMIT\\s+(\\d+))?\\s*;?\\s*$','is');
  const match=text.match(pattern);if(!match)throw unsupported();
  const [,projection,namespace,tableName,where,value,order,direction,limit]=match;
  const table=unquote(tableName);
  if((namespace&&unquote(namespace)!=='public')||!Object.hasOwn(data,table))throw new Error('Tabella demo non disponibile. Scegli ordini, clienti o aziende nello schema public.');
  const base=makeResult(table,data[table]);
  const column=name=>{const key=unquote(name.trim());if(!base.fields.includes(key))throw new Error('Colonna demo non disponibile: '+key);return key;};
  const selected=projection.trim()==='*'?base.fields.map(field=>({column:field,field})):projection.split(',').map(part=>{
    const item=part.trim().match(new RegExp('^('+identifier+')(?:\\s+AS\\s+('+identifier+'))?$','i'));
    if(!item)throw unsupported();return {column:column(item[1]),field:item[2]?unquote(item[2]):column(item[1])};
  });
  if(new Set(selected.map(item=>item.field)).size!==selected.length)throw new Error('Usa nomi o alias diversi per le colonne della demo.');
  let rows=base.rows;
  if(where){const key=column(where),literal=value.toUpperCase()==='NULL'?null:value.startsWith("'")?value.slice(1,-1).replaceAll("''", "'"):value;
    rows=rows.filter(row=>literal!==null&&row[key]!=null&&String(row[key])===literal);}
  if(order){const key=column(order),numeric=key==='id'||key.endsWith('_id');rows.sort((a,b)=>{
    const compared=a[key]==null?(b[key]==null?0:1):b[key]==null?-1:numeric?Number(a[key])-Number(b[key]):String(a[key]).localeCompare(String(b[key]));return direction?.toUpperCase()==='DESC'?-compared:compared;
  });}
  if(limit!==undefined)rows=rows.slice(0,Number(limit));
  const projected=rows.map(row=>Object.fromEntries(selected.map(item=>[item.field,row[item.column]])));
  const targets=base.recordTargets.map(target=>({...target,fields:selected,keys:target.keys.map(key=>({...key,field:selected.find(item=>item.column===key.column)?.field})),keyComplete:target.keys.every(key=>selected.some(item=>item.column===key.column))}));
  const relations=base.relations.flatMap(relation=>{const mapped=relation.sourceColumns.map(key=>selected.find(item=>item.column===key)?.field);return mapped.every(Boolean)?[{...relation,fields:mapped}]:[];});
  return [{...base,fields:selected.map(item=>item.field),rows:projected,rowCount:rows.length,recordTargets:targets,relations}];
}
