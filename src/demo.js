const customerRelation={id:'demo-customer',fields:['cliente_id'],targetColumns:['id'],targetSchema:'public',targetTable:'clienti'};
const companyRelation={id:'demo-company',fields:['azienda_id'],targetColumns:['id'],targetSchema:'public',targetTable:'aziende'};

export function demoResults(){
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
export function demoSchema(){
  return [['ordini',demoResults()[0].rows[0]],['clienti',customers[0]],['aziende',company]].flatMap(([table_name,row])=>Object.keys(row).map(column_name=>({table_schema:'public',table_name,column_name,data_type:column_name==='metadata'?'jsonb':column_name==='id'||column_name.endsWith('_id')?'integer':'text'})));
}
export async function demoRelated({relationId,values}){
  const row=relationId==='demo-customer'?customers.find(row=>row.id===values[0]):relationId==='demo-company'&&values[0]==='71'?company:null;
  if(!row)throw new Error('Record dimostrativo non trovato.');
  return {results:[{fields:Object.keys(row),rows:[row],relations:relationId==='demo-customer'?[companyRelation]:[]}]};
}
