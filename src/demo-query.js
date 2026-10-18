// An explicit SELECT subset for the offline demo, including the visual filter builder.
const unsupported=()=>new Error('La demo supporta SELECT, filtri AND, confronti, LIKE/ILIKE, NULL, ORDER BY, LIMIT e OFFSET. Per SQL completo usa l’app Android.');
function tokens(source){
  const result=[];let i=0;
  while(i<source.length){
    if(/\s/.test(source[i])){i++;continue;}
    const escaped=/^E'/i.test(source.slice(i));
    if(source[i]==="'"||escaped){if(escaped)i++;i++;let value='',closed=false;
      while(i<source.length){const char=source[i++];if(char==="'"){if(source[i]==="'"){value+="'";i++;}else{closed=true;break;}}
        else if(escaped&&char==='\\'){if(i>=source.length)throw unsupported();const next=source[i++];value+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'}[next]??next);}else value+=char;}
      if(!closed)throw unsupported();result.push({kind:'value',value});continue;
    }
    if(source[i]==='"'){i++;let value='',closed=false;while(i<source.length){const char=source[i++];if(char==='"'){if(source[i]==='"'){value+='"';i++;}else{closed=true;break;}}else value+=char;}if(!closed)throw unsupported();result.push({kind:'identifier',value});continue;}
    const number=source.slice(i).match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if(number){result.push({kind:'value',value:number[0]});i+=number[0].length;continue;}
    const word=source.slice(i).match(/^[a-z_][a-z_0-9]*/i);if(word){result.push({kind:'word',value:word[0].toLowerCase()});i+=word[0].length;continue;}
    const symbol=source.slice(i).match(/^(?:<=|>=|<>|!=|::|[.*(),;=<>])/);if(!symbol)throw unsupported();result.push({kind:'symbol',value:symbol[0]});i+=symbol[0].length;
  }return result;
}
function decimal(value){
  const match=String(value).match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);if(!match||!(match[2]||match[3]))return null;
  const digits=(match[2]+(match[3]||'')).replace(/^0+/,'')||'0',exponent=Number(match[4]||0)-(match[3]||'').length;
  if(!Number.isSafeInteger(exponent)||Math.abs(exponent)>100000)throw unsupported();return {digits,power:digits.length+exponent,sign:digits==='0'?0:match[1]==='-'?-1:1};
}
function compare(left,right,numeric){
  if(numeric){const a=decimal(left),b=decimal(right);if(a&&b){if(a.sign!==b.sign)return a.sign-b.sign;if(!a.sign)return 0;const length=Math.max(a.digits.length,b.digits.length);return a.sign*(a.power-b.power||a.digits.padEnd(length,'0').localeCompare(b.digits.padEnd(length,'0')));}}
  return String(left).replace(' ','T').localeCompare(String(right).replace(' ','T'));
}
function like(value,pattern,escape,insensitive){
  const literal=char=>char.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');let regex='^';
  for(let i=0;i<pattern.length;i++){const char=pattern[i];if(char===escape){if(++i>=pattern.length)throw unsupported();regex+=literal(pattern[i]);}else regex+=char==='%'?'[\\s\\S]*':char==='_'?'[\\s\\S]':literal(char);}
  return new RegExp(regex+'$',insensitive?'i':'').test(typeof value==='object'?JSON.stringify(value):String(value));
}
export function selectDemo(text,data,makeResult){
  const list=tokens(text);let i=0;
  const peek=value=>list[i]?.value.toUpperCase()===value;
  const take=value=>{if(peek(value)){i++;return true;}return false;};
  const expect=value=>{if(!take(value))throw unsupported();};
  const identifier=()=>{const token=list[i++];if(!token||!['identifier','word'].includes(token.kind))throw unsupported();return token.value;};
  const literal=()=>{const token=list[i++];if(token?.kind==='value')return token.value;if(token?.kind==='word'&&['null','true','false'].includes(token.value))return token.value==='null'?null:token.value;throw unsupported();};
  expect('SELECT');const selected=[];const all=take('*');
  if(!all){do{const column=identifier(),field=take('AS')?identifier():column;selected.push({column,field});}while(take(','));}
  expect('FROM');let table=identifier(),namespace='public';if(take('.')){namespace=table;table=identifier();}
  if(namespace!=='public'||!Object.hasOwn(data,table))throw new Error('Tabella demo non disponibile. Scegli ordini, clienti o aziende nello schema public.');
  const base=makeResult(table,data[table]);
  const column=name=>{if(!base.fields.includes(name))throw new Error('Colonna demo non disponibile: '+name);return name;};
  if(all)selected.push(...base.fields.map(field=>({column:field,field})));else selected.forEach(item=>column(item.column));
  if(new Set(selected.map(item=>item.field)).size!==selected.length)throw new Error('Usa nomi o alias diversi per le colonne della demo.');
  const predicates=[];
  if(take('WHERE')){do{
    let name;if(take('CAST')){expect('(');name=column(identifier());expect('AS');expect('TEXT');expect(')');}else{name=column(identifier());if(take('::'))expect('TEXT');}
    if(take('IS')){const not=take('NOT');expect('NULL');predicates.push(row=>not?row[name]!=null:row[name]==null);continue;}
    const op=list[i++]?.value.toUpperCase();if(!['=','!=','<>','<','>','<=','>=','ILIKE','LIKE'].includes(op))throw unsupported();const value=literal();
    if(op==='ILIKE'||op==='LIKE'){let escape='\\';if(take('ESCAPE'))escape=literal();if(typeof escape!=='string'||escape.length>1)throw unsupported();predicates.push(row=>row[name]!=null&&value!=null&&like(row[name],value,escape,op==='ILIKE'));}
    else{const numeric=/integer|bigint|smallint|numeric|decimal|real|double/.test(base.columnTypes?.[name]||'')||name==='id'||name.endsWith('_id');predicates.push(row=>{if(row[name]==null||value==null)return false;const compared=compare(row[name],value,numeric);return op==='='?compared===0:op==='!='||op==='<>'?compared!==0:op==='<'?compared<0:op==='>'?compared>0:op==='<='?compared<=0:compared>=0;});}
  }while(take('AND'));}
  let order,direction='ASC';if(take('ORDER')){expect('BY');order=column(identifier());if(take('DESC'))direction='DESC';else take('ASC');}
  const integer=()=>{const value=literal();if(typeof value!=='string'||!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))throw unsupported();return Number(value);};
  let limit,offset=0;if(take('LIMIT'))limit=integer();if(take('OFFSET'))offset=integer();take(';');if(i!==list.length)throw unsupported();
  let rows=base.rows.filter(row=>predicates.every(predicate=>predicate(row)));
  if(order){const numeric=/integer|bigint|smallint|numeric|decimal|real|double/.test(base.columnTypes?.[order]||'')||order==='id'||order.endsWith('_id');rows.sort((a,b)=>{const compared=a[order]==null?(b[order]==null?0:1):b[order]==null?-1:compare(a[order],b[order],numeric);return direction==='DESC'?-compared:compared;});}
  rows=rows.slice(offset,limit===undefined?undefined:offset+limit);
  const targets=base.recordTargets.map(target=>({...target,fields:selected,keys:target.keys.map(key=>({...key,field:selected.find(item=>item.column===key.column)?.field})),keyComplete:target.keys.every(key=>selected.filter(item=>item.column===key.column).length===1)}));
  const relations=base.relations.flatMap(relation=>{const mapped=relation.sourceColumns.map(key=>selected.find(item=>item.column===key)?.field);return mapped.every(Boolean)?[{...relation,fields:mapped}]:[];});
  return [{...base,fields:selected.map(item=>item.field),rows:rows.map(row=>Object.fromEntries(selected.map(item=>[item.field,row[item.column]]))),rowCount:rows.length,recordTargets:targets,relations}];
}
