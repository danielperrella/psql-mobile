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
const company={id:'71',nome:'Studio Esempio',citta:'Milano',note:'Dati dimostrativi, nessuna connessione reale.'};
const orders=initialOrders()[0].rows;
const data={ordini:orders,clienti:customers,aziende:[company]};
const versions=new WeakMap();
const relations=table=>table==='ordini'?[customerRelation]:table==='clienti'?[companyRelation]:[];
const fields=Object.fromEntries(Object.entries(data).map(([table,rows])=>[table,Object.keys(rows[0])]));
function target(table){return {schema:'public',table,keyComplete:true,keys:[{column:'id',field:'id'}],fields:fields[table].map(field=>({column:field,field})),canInsert:true,canUpdate:true,canDelete:true};}
function result(table,rows){return {command:'DEMO',fields:fields[table],rows:structuredClone(rows),relations:relations(table),recordTargets:[target(table)],rowCount:rows.length};}
export function demoResults(){return [result('ordini',orders)];}
export function demoSchema(){
  return Object.entries(fields).flatMap(([table_name,names])=>names.map(column_name=>({table_schema:'public',table_name,column_name,data_type:column_name==='metadata'?'jsonb':column_name==='id'||column_name.endsWith('_id')?'integer':'text'})));
}
export async function demoRelated({relationId,values}){
  const table=relationId==='demo-customer'?'clienti':'aziende';
  return {results:[result(table,data[table].filter(row=>row.id===values[0]))]};
}
function definition(table){
  return {...target(table),primaryKey:['id'],columns:fields[table].map(name=>({name,type:name==='metadata'?'jsonb':name==='id'||name.endsWith('_id')?'integer':'text',category:'S',nullable:!['id','nome','cliente','cliente_id','azienda_id'].includes(name),hasDefault:name==='id',generated:name==='id',canInsert:name!=='id',canUpdate:name!=='id'})),relations:relations(table)};
}
function loaded(table,row){return {definition:definition(table),row:structuredClone(row),keys:{id:row.id},version:String(versions.get(row)||0),result:result(table,[row])};}
export async function demoRecords(path,input){
  if(path==='/records/lookup'){
    const table=input.relationId==='demo-customer'?'clienti':'aziende';
    const rows=data[table].filter(row=>Object.values(row).some(value=>String(value).toLowerCase().includes(input.search.toLowerCase())));
    return {items:rows.slice(input.offset,input.offset+25).map(row=>({values:[row.id],label:row.nome,detail:'id: '+row.id})),hasMore:rows.length>input.offset+25};
  }
  const table=input.target.table;if(!data[table])throw new Error('Tabella dimostrativa non disponibile.');
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
  if(create)row.id=String(Math.max(0,...data[table].map(row=>Number(row.id)))+1);
  for(const [name,change]of Object.entries(input.values))if(change.mode==='value')row[name]=change.value;else if(change.mode==='null')row[name]=null;
  if(create)data[table].push(row);versions.set(row,(versions.get(row)||0)+1);return loaded(table,row);
}
