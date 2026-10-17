import './style.css';
import {nativeTransport} from './native.js';
import {validateConnectionString} from './connection-string.js';
import {appShell} from './app-shell.js';
import {ResultsView} from './results-view.js';
import {icon} from './icons.js';
const version='1.2.0';
const nativeAndroid=import.meta.env.MODE==='android';
const androidApi=nativeAndroid?nativeTransport(window.PsqlNative):null;
import {EditorView,basicSetup} from 'codemirror';
import {sql,PostgreSQL} from '@codemirror/lang-sql';
import {oneDark} from '@codemirror/theme-one-dark';
import {Compartment} from '@codemirror/state';
import {csv} from '../server/core.js';
const $=s=>document.querySelector(s);let session,conn,schema=[],installPrompt;const dialect=new Compartment();
$('#app').innerHTML=appShell(nativeAndroid,version);
const editor=new EditorView({doc:'SELECT 1 AS risultato;',extensions:[basicSetup,oneDark,dialect.of(sql({dialect:PostgreSQL})),EditorView.lineWrapping,EditorView.domEventHandlers({keydown(e){if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();run();return true}}})],parent:$('#editor')});
let activeView='query';
const narrow=window.matchMedia('(max-width: 820px)');
function setView(view,scroll=true){
  activeView=view;
  for(const panel of document.querySelectorAll('[data-panel]'))panel.hidden=narrow.matches&&panel.dataset.panel!==view;
  for(const button of document.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===view));
  if(view==='query')editor.requestMeasure();
  if(narrow.matches&&scroll)window.scrollTo({top:0,behavior:'auto'});
}
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>setView(button.dataset.view);
narrow.addEventListener('change',()=>setView(activeView,false));
const resultsView=new ResultsView($('#results'),({count,canExport,results})=>{
  $('#count').textContent=count;$('#export').disabled=!canExport;
  const loaded=results.reduce((sum,result)=>sum+result.rows.length,0);
  $('#navResultCount').textContent=loaded;$('#navResultCount').hidden=loaded===0;
});
function controls(){
  $('#run').disabled=busy||(!session&&!demo);$('#disconnect').disabled=busy||(!session&&!demo);
  $('#connectionButton').disabled=busy;$('#refresh').disabled=busy||!session;
}
function connectionState(){
  $('#connectionButton span').textContent=session||demo?'Cambia':'Connetti';
  $('#demoWelcome').hidden=!!session||demo;controls();
}
let noticeTimer;
function feedback(text,error=false){
  $('#feedback').textContent=text;$('#feedback').classList.toggle('error',error);
  const notice=$('#notice');clearTimeout(noticeTimer);notice.textContent=text;notice.classList.toggle('error',error);
  notice.hidden=activeView==='query';if(!notice.hidden)noticeTimer=setTimeout(()=>{notice.hidden=true},7000);
}
function element(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el}
async function api(path,data={}){if(nativeAndroid)return androidApi(path,{session,...data});const response=await fetch(conn.gateway+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+conn.token},body:JSON.stringify({session,...data})});const body=await response.json().catch(()=>({error:'Risposta gateway non valida'}));if(!response.ok)throw new Error(body.error||'Gateway non disponibile');return body}
function updateSchema(){const namespaces={};for(const c of schema){namespaces[c.table_schema]??={};namespaces[c.table_schema][c.table_name]??=[];namespaces[c.table_schema][c.table_name].push(c.column_name)}editor.dispatch({effects:dialect.reconfigure(sql({dialect:PostgreSQL,schema:namespaces,defaultSchema:'public'}))});renderTree()}
function renderTree(){
  const tree=$('#tree');tree.replaceChildren();
  const filter=$('#filter').value.toLocaleLowerCase();const groups=new Map();
  for(const c of schema){const key=c.table_schema+'.'+c.table_name;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c)}
  $('#schemaCount').textContent=groups.size?groups.size+' tabelle accessibili':'Esplora il database';
  for(const [name,columns]of groups){
    if(!name.toLocaleLowerCase().includes(filter)&&!columns.some(c=>c.column_name.toLocaleLowerCase().includes(filter)))continue;
    const details=element('details',undefined,'schema-table');details.open=!!filter;
    const summary=document.createElement('summary'),label=element('span',undefined,'table-label'),chevron=element('span',undefined,'table-chevron');
    label.append(element('strong',columns[0].table_name),element('small',columns[0].table_schema+' · '+columns.length+' colonne'));
    chevron.innerHTML=icon('chevron');summary.append(label,chevron);details.append(summary);
    const prepare=element('button','Prepara SELECT','prepare-query secondary');
    prepare.onclick=()=>{const quote=v=>'"'+v.replaceAll('"','""')+'"';editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:'SELECT *\nFROM '+quote(columns[0].table_schema)+'.'+quote(columns[0].table_name)+'\nLIMIT 100;'}});setView('query');feedback('SELECT pronta. Premi Esegui query per leggere i dati.')};details.append(prepare);
    for(const c of columns){const row=element('button',undefined,'column');row.append(element('span',c.column_name),element('small',c.data_type));row.title='Inserisci '+c.column_name+' nella query';row.onclick=()=>{editor.dispatch(editor.state.replaceSelection('"'+c.column_name.replaceAll('"','""')+'"'));setView('query')};details.append(row)}
    tree.append(details);
  }
  if(!tree.children.length){const empty=element('div',undefined,'empty-state');empty.append(element('h3',filter?'Nessuna tabella trovata':'Il tuo schema, qui.'),element('p',filter?'Prova un altro nome di tabella o colonna.':session||demo?'Non ci sono tabelle accessibili in questo schema.':'Connetti un database per esplorare tabelle e colonne.'));tree.append(empty)}
}
let demo=false,busy=false;
function renderResults(results){resultsView.setResults(results)}
async function run(){
  if(busy||(!session&&!demo))return;busy=true;controls();editor.contentDOM.blur();feedback('Query in esecuzione…');
  try{
    if(demo){renderResults(demoResults());feedback('Demo: i dati sono di esempio e il testo SQL non viene eseguito.')}
    else{const selected=editor.state.sliceDoc(editor.state.selection.main.from,editor.state.selection.main.to);const result=await api('/query',{sql:selected||editor.state.doc.toString()});renderResults(result.results);feedback('Query completata in '+result.ms+' ms.')}
    setView('results');
  }catch(error){feedback(error.message,true);setView('query')}
  finally{busy=false;controls()}
}
const uriInput=$('[name="connectionString"]');
function validateUriField(force=false){
  if(!uriInput.value.trim()&&!force){uriInput.setCustomValidity('');uriInput.removeAttribute('aria-invalid');$('#connectionStringValidation').textContent='';return null}
  const result=validateConnectionString(uriInput.value);
  uriInput.setCustomValidity(result.valid?'':result.message);
  uriInput.setAttribute('aria-invalid',String(!result.valid));
  $('#connectionStringValidation').textContent=result.message;
  $('#connectionStringValidation').classList.toggle('error',!result.valid);
  return result;
}
uriInput.addEventListener('input',()=>{validateUriField();$('#connectError').textContent=''});
uriInput.addEventListener('blur',()=>validateUriField(true));
uriInput.addEventListener('invalid',e=>{e.preventDefault();validateUriField(true);uriInput.focus()});
$('#run').onclick=run;$('#filter').oninput=renderTree;$('#connectionButton').onclick=()=>$('#dialog').showModal();$('#close').onclick=()=>$('#dialog').close();let mode='uri';function setMode(next){mode=next;uriInput.disabled=next!=='uri';$('#uriFields').hidden=next!=='uri';$('#separateFields').hidden=next!=='fields';$('#uriTab').classList.toggle('selected',next==='uri');$('#fieldsTab').classList.toggle('selected',next==='fields')}$('#uriTab').onclick=()=>setMode('uri');$('#fieldsTab').onclick=()=>setMode('fields');
$('#connectForm').onsubmit=async e=>{e.preventDefault();$('#connectError').textContent='';const validated=mode==='uri'?validateUriField(true):null;if(validated&&!validated.valid){uriInput.focus();return}$('#connectSubmit').disabled=true;let newSession;const previous={conn,session};try{const data=Object.fromEntries(new FormData(e.target));if(nativeAndroid){conn={native:true}}else{const url=new URL(data.gateway);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Usa HTTPS per il gateway remoto');conn={gateway:data.gateway.replace(/\/$/,''),token:data.token}}const config=mode==='uri'?{connectionString:validated.uri,ssl:data.ssl}:Object.fromEntries(['host','port','database','user','password','ssl'].map(k=>[k,data[k]]));const response=await api('/connect',config);session=response.session;newSession=session;schema=await api('/schema');if(previous.session){const current={conn,session};conn=previous.conn;session=previous.session;await api('/disconnect').catch(()=>{});({conn,session}=current)}demo=false;updateSchema();$('#status').textContent='Connesso';$('#status').classList.add('connected');$('#disconnect').disabled=false;$('#run').disabled=false;$('#dialog').close();e.target.reset();validateUriField();renderResults([]);feedback('Connessione attiva. Scegli una tabella o scrivi una query.');connectionState();setView('schema')}catch(err){if(newSession)await api('/disconnect').catch(()=>{});conn=previous.conn;session=previous.session;$('#connectError').textContent=err.message}finally{$('#connectSubmit').disabled=false}};
$('#refresh').onclick=async()=>{if(!session)return;try{schema=await api('/schema');updateSchema();feedback('Schema aggiornato')}catch(e){feedback(e.message,true)}};
$('#disconnect').onclick=async()=>{try{await api('/disconnect')}catch{}session=null;conn=null;schema=[];demo=false;updateSchema();renderResults([]);$('#run').disabled=true;$('#disconnect').disabled=true;$('#status').textContent='Non connesso';$('#status').classList.remove('connected');feedback('Disconnesso. Credenziali rimosse dalla memoria.');connectionState()};
function demoResults(){
  const names=['Elena Rossi','Luca Bianchi','Sofia Conti','Marco Moretti','Giulia Romano','Andrea Ferri'];
  const rows=Array.from({length:24},(_,index)=>({
    id:String(1041+index),cliente:names[index%names.length],stato:['Pagato','In preparazione','Spedito'][index%3],totale:(48+index*7.5).toFixed(2)+' EUR',
    email:['elena.rossi','luca.bianchi','sofia.conti','marco.moretti','giulia.romano','andrea.ferri'][index%names.length]+'@example.com',
    note:index===0?'Consegna al punto di ritiro. Il riferimento completo resta leggibile anche su uno schermo piccolo.':null,
    riferimento_esterno_del_pagamento_utilizzato_dal_provider:index===0?'pg_'+'a18f904bc7'.repeat(12):'ordine-'+(1041+index),
    metadata:{canale:index%2?'app':'web',localita:'Milano',indirizzo:'Via di esempio 12'}
  }));return [{command:'DEMO',rowCount:rows.length,fields:Object.keys(rows[0]),rows}];
}
$('#demo').onclick=async()=>{
  if(session)await api('/disconnect').catch(()=>{});session=null;conn=null;demo=true;
  schema=demoResults()[0].fields.map(column_name=>({table_schema:'public',table_name:'ordini',column_name,data_type:column_name==='id'?'integer':column_name==='metadata'?'jsonb':'text'}));
  updateSchema();editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:'SELECT *\nFROM public.ordini\nLIMIT 100;'}});
  $('#status').textContent='Demo · dati di esempio';$('#status').classList.add('connected');connectionState();await run();
};
$('#export').onclick=async()=>{const r=resultsView.getExport();if(!r.fields.length)return;const safe=r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='string'&&/^[=+\-@\t\r]/.test(v)?"'"+v:v])));const text='\ufeff'+csv(safe,r.fields);if(nativeAndroid){try{await androidApi('/export',{text});feedback('CSV salvato.')}catch(e){feedback(e.message,true)}return}const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='psql-risultati.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install').hidden=false});$('#install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('#install').hidden=true}};
if(!nativeAndroid&&'serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>feedback('Installazione offline non disponibile',true));

document.querySelector('.brand').onclick=e=>{e.preventDefault();setView('query')};document.documentElement.classList.toggle('native-android',nativeAndroid);
renderTree();controls();setView(activeView,false);
