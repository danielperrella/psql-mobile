// Numeric values stay strings all the way to PostgreSQL: Number loses bigint/decimal precision.
export function fieldType(column){
  const type=(column.baseType||column.type).toLowerCase();
  if(column.choices?.length||column.category==='B')return {hint:column.choices?.length?'Scegli uno dei valori definiti nel database.':'Scegli vero o falso.'};
  if(/^(smallint|integer|bigint|int2|int4|int8)$/.test(type))return {kind:'integer',inputMode:'numeric',placeholder:'123',hint:'Numero intero. Anche i valori grandi vengono conservati esattamente.'};
  if(/^(numeric|decimal|real|double precision|float4|float8)(\(|$)/.test(type))return {kind:'number',inputMode:'decimal',placeholder:'1234.56',hint:'Usa il punto per i decimali, senza separatori delle migliaia. La precisione resta invariata.'};
  if(/^jsonb?$/.test(type))return {kind:'json',placeholder:'{"chiave": "valore"}',hint:'JSON valido: oggetto, array, stringa, numero, booleano o null.'};
  if(type==='uuid')return {kind:'uuid',placeholder:'550e8400-e29b-41d4-a716-446655440000',hint:'Identificativo UUID. Non viene generato o sostituito automaticamente.'};
  if(column.category==='A'||/\[\]$/.test(type))return {placeholder:'{"primo","secondo"}',hint:'Array PostgreSQL, ad esempio {"primo","secondo"}. {} è un array vuoto; NULL indica l’assenza del valore.'};
  if(type==='bytea')return {placeholder:'\\x48656c6c6f',hint:'Valore binario PostgreSQL. In formato esadecimale usa il prefisso \\x seguito da coppie di cifre.'};
  if(type==='interval')return {placeholder:'2 days 03:30:00',hint:'Intervallo PostgreSQL, ad esempio 2 days 03:30:00. Non è un’ora del giorno.'};
  if(/^(inet|cidr|macaddr|macaddr8)$/.test(type))return {placeholder:type==='inet'?'192.168.1.10/24':undefined,hint:'Indirizzo di rete in formato PostgreSQL. Il database verifica indirizzo e prefisso.'};
  if(/multirange$/.test(type))return {placeholder:'{[1,10),[20,30)}',hint:'Multirange PostgreSQL: racchiudi gli intervalli tra parentesi graffe, ad esempio {[1,10),[20,30)}.'};
  if(column.category==='R'||/range$/.test(type))return {placeholder:'[1,10)',hint:'Intervallo PostgreSQL: [ include l’estremo, ( lo esclude. Il database verifica il tipo degli estremi.'};
  if(/^(bit|bit varying)(\(|$)/.test(type))return {kind:'bits',placeholder:'0101',hint:'Sequenza di cifre binarie 0 e 1.'};
  if(type==='xml')return {placeholder:'<record>valore</record>',hint:'XML PostgreSQL. Il database verifica la validità del contenuto.'};
  return {hint:column.type===column.baseType||!column.baseType?'Il valore viene inviato come testo al tipo PostgreSQL indicato. Vincoli e formati sono verificati dal database.':'Tipo personalizzato basato su '+column.baseType+'. Il database verifica anche i vincoli del dominio.'};
}
export function fieldError(column,value){
  const type=(column.baseType||column.type).toLowerCase(),spec=fieldType(column),text=String(value).trim();
  if(spec.kind==='integer'){
    if(!/^[+-]?\d+$/.test(text))return 'Inserisci un numero intero, senza decimali.';
    const bounds=/^(smallint|int2)$/.test(type)?[-32768n,32767n]:/^(integer|int4)$/.test(type)?[-2147483648n,2147483647n]:[-9223372036854775808n,9223372036854775807n];
    const number=BigInt(text);if(number<bounds[0]||number>bounds[1])return 'Valore fuori dall’intervallo del tipo '+column.type+'.';
  }
  if(spec.kind==='number'&&!/^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|nan|[+-]?infinity)$/i.test(text))return 'Inserisci un numero, usando il punto per i decimali (esempio: 1234.56).';
  if(spec.kind==='json'){try{JSON.parse(value);}catch{return 'Inserisci JSON valido, ad esempio {"chiave":"valore"}.';}}
  if(spec.kind==='uuid'&&!/^[0-9a-f]{32}$/i.test(text.replace(/^\{(.*)\}$/,'$1').replaceAll('-','')))return 'Inserisci un UUID valido, ad esempio 550e8400-e29b-41d4-a716-446655440000.';
  if(spec.kind==='bits'&&!/^[01]*$/.test(value))return 'Usa soltanto le cifre 0 e 1.';
  const length=column.type.match(/^(?:character varying|varchar|character|char)\((\d+)\)$/i);
  if(length&&Array.from(value).length>Number(length[1]))return 'Il campo consente al massimo '+length[1]+' caratteri.';
  return '';
}
