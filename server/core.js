export function connectionConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('Connessione mancante');
  const ssl=input.ssl==='require'?{rejectUnauthorized:true}:false;
  if(input.connectionString){
    const url=new URL(input.connectionString);
    if(!['postgres:','postgresql:'].includes(url.protocol)) throw new Error('Usa una URI PostgreSQL');
    // TLS is controlled explicitly; URI options cannot downgrade certificate verification.
    return {host:url.hostname,port:Number(url.port||5432),database:decodeURIComponent(url.pathname.slice(1)),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),ssl};
  }
  if(!input.host||!input.database||!input.user)throw new Error('Host, database e utente obbligatori');
  const port=Number(input.port||5432);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Porta non valida');
  return {host:input.host,port,database:input.database,user:input.user,password:input.password||'',ssl};
}
export function csv(rows,fields){const cell=v=>'"'+String(v==null?'':typeof v==='object'?JSON.stringify(v):v).replaceAll('"','""')+'"';return [fields.map(cell).join(','),...rows.map(r=>fields.map(f=>cell(r[f])).join(','))].join('\r\n')}
