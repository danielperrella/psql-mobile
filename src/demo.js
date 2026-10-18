import {temporalField} from './temporal-fields.js';
import {fieldError} from './field-types.js';
import {selectDemo} from './demo-query.js';
const customerRelation={id:'demo-customer',fields:['cliente_id'],sourceColumns:['cliente_id'],targetColumns:['id'],targetSchema:'public',targetTable:'clienti'};
const companyRelation={id:'demo-company',fields:['azienda_id'],sourceColumns:['azienda_id'],targetColumns:['id'],targetSchema:'public',targetTable:'aziende'};

function initialOrders(){
  const names=['Elena Rossi','Luca Bianchi','Sofia Conti','Marco Moretti','Giulia Romano','Andrea Ferri'];
  const rows=Array.from({length:24},(_,index)=>({
    id:String(1041+index),cliente_id:String(201+index%names.length),cliente:names[index%names.length],stato:['Pagato','In preparazione','Spedito'][index%3],totale:(48+index*7.5).toFixed(2)+' EUR',
    email:['elena.rossi','luca.bianchi','sofia.conti','marco.moretti','giulia.romano','andrea.ferri'][index%names.length]+'@example.com',
    note:index===0?'Consegna al punto di ritiro. Il riferimento completo resta leggibile anche su uno schermo piccolo.':null,
    riferimento_esterno_del_pagamento_utilizzato_dal_provider:index===0?'pg_'+'a18f904bc7'.repeat(12):'ordine-'+(1041+index),
    metadata:{canale:index%2?'app':'web',localita:'Milano',indirizzo:'Via di esempio 12'}
  }));return [{command:'DEMO',rowCount:rows.length,fields:Object.keys(rows[0]),rows,relations:[customerRelation]}];
}

const names=['Elena Rossi','Luca Bianchi','Sofia Conti','Marco Moretti','Giulia Romano','Andrea Ferri'];
const customers=names.map((nome,index)=>({id:String(201+index),nome,email:nome.toLowerCase().replace(' ','.')+'@example.com',azienda_id:'71'}));
const company={id:'71',nome:'Studio Esempio',citta:'Milano',data_fondazione:'2018-04-12',ultimo_contatto:'2026-10-18 09:30:15.123456+02',prossimo_appuntamento:'2026-10-25 14:30:00',orario_apertura:'09:00:00',note:'Dati dimostrativi, nessuna connessione reale.'};
const orders=initialOrders()[0].rows;
const data={ordini:orders,clienti:customers,aziende:[{...company}]};
const versions=new WeakMap();
const relations=table=>table==='ordini'?[customerRelation]:table==='clienti'?[companyRelation]:[];
const fields=Object.fromEntries(Object.entries(data).map(([table,rows])=>[table,Object.keys(rows[0])]));
const sequences={ordini:1064,clienti:206,aziende:71};
function relationTable(id){if(id==='demo-customer')return 'clienti';if(id==='demo-company')return 'aziende';throw new Error('Relazione demo non disponibile.');}
const dataType=name=>({data_fondazione:'date',ultimo_contatto:'timestamp with time zone',prossimo_appuntamento:'timestamp without time zone',orario_apertura:'time without time zone'}[name]||(name==='metadata'?'jsonb':name==='id'||name.endsWith('_id')?'integer':'text'));
function target(table){return {schema:'public',table,keyComplete:true,keys:[{column:'id',field:'id'}],fields:fields[table].map(field=>({column:field,field})),canInsert:true,canUpdate:true,canDelete:true};}
function result(table,rows){return {command:'DEMO',fields:fields[table],rows:structuredClone(rows),relations:relations(table),recordTargets:[target(table)],rowCount:rows.length};}
export function demoResults(sql='SELECT * FROM public.ordini'){return selectDemo(sql,data,result);}
export function resetDemo(){Object.assign(sequences,{ordini:1064,clienti:206,aziende:71});orders.splice(0,orders.length,...initialOrders()[0].rows);customers.splice(0,customers.length,...names.map((nome,index)=>({id:String(201+index),nome,email:nome.toLowerCase().replace(' ','.')+'@example.com',azienda_id:'71'})));data.aziende.splice(0,data.aziende.length,{...company});}
export function demoSchema(){
  return Object.entries(fields).flatMap(([table_name,names])=>names.map(column_name=>({table_schema:'public',table_name,column_name,data_type:dataType(column_name)})));
}
export async function demoRelated({relationId,values}){
  const table=relationTable(relationId);
  return {results:[result(table,data[table].filter(row=>row.id===values[0]))]};
}
function definition(table){
  return {...target(table),primaryKey:['id'],columns:fields[table].map(name=>({name,type:dataType(name),category:temporalField(dataType(name),null)?'D':'S',nullable:!['id','nome','cliente','cliente_id','azienda_id'].includes(name),hasDefault:name==='id',generated:name==='id',canInsert:name!=='id',canUpdate:name!=='id'})),relations:relations(table)};
}
function loaded(table,row){return {definition:definition(table),row:structuredClone(row),keys:{id:row.id},version:String(versions.get(row)||0),result:result(table,[row])};}
export async function demoRecords(path,input){
  if(path==='/records/lookup'){
    const table=relationTable(input.relationId);
    const rows=data[table].filter(row=>Object.values(row).some(value=>String(value).toLowerCase().includes(input.search.toLowerCase())));
    return {items:rows.slice(input.offset,input.offset+25).map(row=>({values:[row.id],label:row.nome,detail:'id: '+row.id})),hasMore:rows.length>input.offset+25};
  }
  const table=input.target.table;if(!Object.hasOwn(data,table)||input.target.schema!=='public')throw new Error('Tabella dimostrativa non disponibile.');
  if(path==='/records/describe')return definition(table);
  const create=input.mode==='create';
  let row=create?Object.fromEntries(fields[table].map(name=>[name,null])):data[table].find(row=>row.id===input.keys.id);
  if(!row)throw new Error('Record non trovato.');
  if(path==='/records/open')return loaded(table,row);
  if(!create&&String(versions.get(row)||0)!==input.version)throw new Error('Il record è cambiato. Ricaricalo.');
  if(path==='/records/delete'){
    const referenced=table==='clienti'?orders.some(order=>order.cliente_id===row.id):table==='aziende'?customers.some(customer=>customer.azienda_id===row.id):false;
    if(referenced)throw new Error('Record ancora collegato ad altri record.');
    data[table].splice(data[table].indexOf(row),1);return {deleted:true};
  }
  if(path!=='/records/save')throw new Error('Operazione demo non disponibile.');
  const candidate=structuredClone(row),columns=definition(table).columns;
  for(const [name,change]of Object.entries(input.values)){
    if(!columns.some(column=>column.name===name&&column.canUpdate))throw new Error('Campo non modificabile: '+name);
    if(change.mode==='value')candidate[name]=change.value;
    else if(change.mode==='null')candidate[name]=null;
    else throw new Error('Valore demo non disponibile per '+name);
    if(candidate[name]!=null){const error=fieldError(columns.find(column=>column.name===name),candidate[name]);if(error)throw new Error(name+': '+error);}
  }
  for(const column of columns)if(column.name!=='id'&&!column.nullable&&(candidate[column.name]==null||candidate[column.name]===''))throw new Error('Compila il campo '+column.name+'.');
  for(const relation of relations(table))if(!data[relation.targetTable].some(record=>record.id===String(candidate[relation.sourceColumns[0]])))throw new Error('Seleziona un record valido per '+relation.sourceColumns[0]+'.');
  if(create)candidate.id=String(++sequences[table]);
  Object.assign(row,candidate);if(create)data[table].push(row);versions.set(row,(versions.get(row)||0)+1);return loaded(table,row);
}
