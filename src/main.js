import './style.css';
import {nativeTransport} from './native.js';
import {validateConnectionString} from './connection-string.js';
import {appShell} from './app-shell.js';
import {ResultsView} from './results-view.js';
import {icon} from './icons.js';
import {ConnectionHome} from './connection-home.js';
import {AppUpdates} from './app-updates.js';
import {RecordEditor} from './record-editor.js';
import {RelatedRecordView} from './related-record.js';
import {recordReferences} from './record-changes.js';
import {TableBrowser} from './table-browser.js';
import './table-browser.css';
import {createFavoritesStore,createLocalFavoritesApi,FavoritesPanel,favoriteId} from './favorites.js';
import './favorites.css';
import {InverseRelationsView} from './inverse-relations.js';
import './inverse-relations.css';
import {demoResults,demoSchema,demoRelated,demoRecords,resetDemo,demoInverse} from './demo.js';
const version='1.5.0';
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
let activeView='query',homeVisible=true,currentProfileId=null,editingProfileId=null,currentReadOnly=false,demo=false,busy=false;
const connectionHome=new ConnectionHome($('#connectionHome'),{connect:profile=>connect({profileId:profile.id}),edit:editConnection,remove:removeConnection});
async function refreshConnections(){
  if(!nativeAndroid)return;
  try{connectionHome.render(await androidApi('/connections/list'),currentProfileId);controls()}catch(error){connectionHome.error(error.message)}
}
function showHome(show=true){
  homeVisible=show;$('#connectionHome').hidden=!show;$('#workspace').hidden=show;document.querySelector('.mobile-nav').hidden=show;
  $('#resumeConnection').hidden=!session&&!demo;$('#connectionButton span').textContent=show?'Nuova':'Connessioni';
  if(show){relatedView.close();refreshConnections()}else{setView(activeView,false);editor.requestMeasure()}window.scrollTo({top:0,behavior:'auto'});
}
function newConnection(){
  if(busy)return;editingProfileId=null;$('#connectForm').reset();setMode('uri');validateUriField();$('#connectError').textContent='';$('#dialog .dialog-title h2').textContent='Nuova connessione';$('#dialog').showModal();
}
async function editConnection(profile){
  if(busy)return;
  try{const saved=await androidApi('/connections/read',{profileId:profile.id});newConnection();editingProfileId=profile.id;const form=$('#connectForm');form.elements.name.value=saved.name;setMode(saved.config.connectionString?'uri':'fields');for(const [key,value]of Object.entries(saved.config))if(form.elements[key]){if(form.elements[key].type==='checkbox')form.elements[key].checked=!!value;else form.elements[key].value=value;}validateUriField();$('#dialog .dialog-title h2').textContent='Modifica connessione'}catch(error){connectionHome.error(error.message)}
}
async function removeConnection(profile){
  try{await androidApi('/connections/remove',{profileId:profile.id});if(currentProfileId===profile.id)currentProfileId=null;await refreshConnections()}catch(error){connectionHome.error(error.message)}
}
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
},reference=>relatedView.open(reference),recordAction,record=>relatedView.openRecord(record));
const relatedView=new RelatedRecordView($('#relatedDialog'),reference=>demo?demoRelated(reference):api('/related',{relationId:reference.relationId,values:reference.values}),(row,fields,number,result)=>resultsView.record(row,fields,number,result,true),decorateRecord);
const recordEditor=new RecordEditor($('#recordEditor'),$('#lookupDialog'),recordApi,change=>{resultsView.applyMutation(change);relatedView.applyMutation(change);feedback(change.mode==='delete'?'Record eliminato.':change.mode==='create'?'Record creato.':'Modifiche salvate.');refreshFavorites();});

let webFavoritesApi;
const favoritesStore=createFavoritesStore((path,data)=>{if(nativeAndroid)return androidApi(path,data);try{webFavoritesApi??=createLocalFavoritesApi();return webFavoritesApi(path,data);}catch{throw new Error('Preferiti non disponibili: il browser non consente il salvataggio locale.');}});
let favoriteEntries=[],favoritesSequence=0;
const favoritesPanel=new FavoritesPanel($('#favoritesPanel'),{store:favoritesStore,getContext:favoriteContext,onOpen:openFavorite,onChange:items=>{favoriteEntries=items;renderTree();}});
const tableBrowser=new TableBrowser($('#tableBrowser'),{getSchema:()=>schema,onExecute:async sql=>{
  if(busy)throw new Error('Attendi la query in corso.');
  editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:sql}});$('#tableBrowserDialog').close();await run();
}});
$('#closeTableBrowser').onclick=()=>$('#tableBrowserDialog').close();
$('#demoReadOnly').onchange=()=>{if(demo){setReadOnly($('#demoReadOnly').checked);feedback(currentReadOnly?'Demo in sola lettura.':'Modifiche abilitate nella demo.');}};
function favoriteContext(){return demo?'demo':currentProfileId;}
function setReadOnly(value){currentReadOnly=!!value;resultsView.setReadOnly(currentReadOnly);$('#readOnlyStatus').hidden=!currentReadOnly;renderTree();if($('#relatedDialog').open)relatedView.render();}
function recordAction(mode,target,keys={}){if(currentReadOnly){feedback('Questa connessione è in sola lettura.',true);return;}recordEditor.open(mode,target,keys);}
async function recordApi(path,data){if(currentReadOnly&&['/records/save','/records/delete'].includes(path))throw new Error('Questa connessione è in sola lettura.');return demo?demoRecords(path,data):api(path,data);}
function prepareFavoriteTable(target){const quote=value=>'"'+value.replaceAll('"','""')+'"';editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:'SELECT * FROM '+quote(target.schema)+'.'+quote(target.table)+' LIMIT 100;'}});setView('query');feedback('SELECT pronta. Premi Esegui query per leggere i dati.');}
function openTableFilters(schemaName,tableName){tableBrowser.openTable(schemaName,tableName);$('#tableBrowserDialog').showModal();}
async function refreshFavorites(){const sequence=++favoritesSequence,context=favoriteContext();try{const items=context?await favoritesStore.list(context):[];if(sequence!==favoritesSequence)return;favoriteEntries=items;await favoritesPanel.refresh();renderTree();}catch(error){if(sequence===favoritesSequence)feedback(error.message,true);}}
async function toggleFavorite(favorite,button){const context=favoriteContext();if(!context)return;button.disabled=true;try{const id=favoriteId(favorite),items=await favoritesStore.list(context);if(items.some(item=>item.id===id))await favoritesStore.remove(context,id);else await favoritesStore.save(context,favorite);if(context!==favoriteContext())return;await refreshFavorites();if($('#relatedDialog').open)relatedView.render();}catch(error){feedback(error.message,true);}finally{button.disabled=false;}}
async function openFavorite(favorite){if(favorite.kind==='table'){prepareFavoriteTable(favorite);return;}const loaded=await recordApi('/records/open',{target:{schema:favorite.schema,table:favorite.table},keys:Object.fromEntries(favorite.keys.map(key=>[key.column,key.value]))});relatedView.openRecord({row:loaded.result.rows[0],fields:loaded.result.fields,number:1,result:loaded.result});}
function decorateRecord(content,entry){
  const row=entry.result.rows[0],references=recordReferences(entry.result,row);if(!references.length)return;
  const tools=element('div',undefined,'detail-tools');content.append(tools);
  for(const reference of references){const suffix=references.length>1?' '+reference.target.table:'';
    if(reference.target.canInsert&&!currentReadOnly){const duplicate=element('button','Duplica record'+suffix,'secondary duplicate-record');duplicate.onclick=()=>recordAction('duplicate',reference.target,reference.keys);tools.append(duplicate);}
    if(favoriteContext()){const favorite={kind:'record',schema:reference.target.schema,table:reference.target.table,keys:Object.entries(reference.keys).map(([column,value])=>({column,value:String(value)}))};const button=element('button',(favoriteEntries.some(item=>item.id===favoriteId(favorite))?'Rimuovi dai preferiti':'Salva nei preferiti')+suffix,'secondary favorite-record');button.onclick=()=>toggleFavorite(favorite,button);tools.append(button);}
    entry.inverseViews??=new Map();const identity=JSON.stringify([reference.target.schema,reference.target.table,reference.keys]);let inverse=entry.inverseViews.get(identity);if(inverse){content.append(inverse);continue;}inverse=element('div');entry.inverseViews.set(identity,inverse);content.append(inverse);new InverseRelationsView(inverse,{target:reference.target,keys:reference.keys,loadRelations:data=>demo?demoInverse('/inverse/list',data):api('/inverse/list',data),loadPage:({relation,keys,offset})=>demo?demoInverse('/inverse/read',{relationId:relation.id,keys,offset}):api('/inverse/read',{relationId:relation.id,keys,offset}),onOpen:record=>relatedView.openRecord(record,true)});
  }
}

function controls(){
  $('#run').disabled=busy||(!session&&!demo);$('#disconnect').disabled=busy||(!session&&!demo);
  $('#connectionButton').disabled=busy;$('#refresh').disabled=busy||!session;$('#resetDemo').disabled=busy;$('#demoReadOnly').disabled=busy;$('#connectSubmit').disabled=busy;$('#addConnection').disabled=busy;connectionHome.setBusy(busy);
}
function connectionState(){
  $('#connectionButton span').textContent=homeVisible?'Nuova':'Connessioni';$('#resumeConnection').hidden=!session&&!demo;
  $('#demoWelcome').hidden=!!session||demo;$('#demoTools').hidden=!demo;controls();
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
  const tree=$('#tree'),expanded=new Set([...tree.querySelectorAll('.schema-table[open]')].map(item=>item.dataset.table));tree.replaceChildren();
  const filter=$('#filter').value.toLocaleLowerCase();const groups=new Map();
  for(const c of schema){const key=c.table_schema+'.'+c.table_name;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c)}
  $('#schemaCount').textContent=groups.size?groups.size+' tabelle accessibili':'Esplora il database';
  for(const [name,columns]of groups){
    if(!name.toLocaleLowerCase().includes(filter)&&!columns.some(c=>c.column_name.toLocaleLowerCase().includes(filter)))continue;
    const details=element('details',undefined,'schema-table');details.dataset.table=name;details.open=!!filter||expanded.has(name);
    const summary=document.createElement('summary'),label=element('span',undefined,'table-label'),chevron=element('span',undefined,'table-chevron');
    label.append(element('strong',columns[0].table_name),element('small',columns[0].table_schema+' · '+columns.length+' colonne'));
    chevron.innerHTML=icon('chevron');summary.append(label,chevron);details.append(summary);
    const prepare=element('button','Prepara SELECT','prepare-query secondary');
    prepare.onclick=()=>{const quote=v=>'"'+v.replaceAll('"','""')+'"';editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:'SELECT *\nFROM '+quote(columns[0].table_schema)+'.'+quote(columns[0].table_name)+'\nLIMIT 100;'}});setView('query');feedback('SELECT pronta. Premi Esegui query per leggere i dati.')};details.append(prepare);
    const filters=element('button','Filtri e ordinamento','prepare-query secondary');filters.onclick=()=>openTableFilters(columns[0].table_schema,columns[0].table_name);details.append(filters);
    if(favoriteContext()){const favorite={kind:'table',schema:columns[0].table_schema,table:columns[0].table_name};const button=element('button',favoriteEntries.some(item=>item.id===favoriteId(favorite))?'Rimuovi dai preferiti':'Salva tabella nei preferiti','prepare-query secondary');button.onclick=()=>toggleFavorite(favorite,button);details.append(button);}
    if((nativeAndroid||demo)&&!currentReadOnly){const create=element('button','Nuovo record','prepare-query secondary');create.onclick=()=>recordEditor.open('create',{schema:columns[0].table_schema,table:columns[0].table_name});details.append(create)}
    for(const c of columns){const row=element('button',undefined,'column');row.append(element('span',c.column_name),element('small',c.data_type));row.title='Inserisci '+c.column_name+' nella query';row.onclick=()=>{editor.dispatch(editor.state.replaceSelection('"'+c.column_name.replaceAll('"','""')+'"'));setView('query')};details.append(row)}
    tree.append(details);
  }
  if(!tree.children.length){const empty=element('div',undefined,'empty-state');empty.append(element('h3',filter?'Nessuna tabella trovata':'Il tuo schema, qui.'),element('p',filter?'Prova un altro nome di tabella o colonna.':session||demo?'Non ci sono tabelle accessibili in questo schema.':'Connetti un database per esplorare tabelle e colonne.'));tree.append(empty)}
}

function renderResults(results){relatedView.close();resultsView.setResults(results)}
async function run(){
  if(busy||(!session&&!demo))return;busy=true;controls();editor.contentDOM.blur();feedback('Query in esecuzione…');
  try{
    if(demo){const selected=editor.state.sliceDoc(editor.state.selection.main.from,editor.state.selection.main.to);renderResults(demoResults(selected||editor.state.doc.toString()));feedback('Demo: query sui dati di esempio. Le modifiche restano in questa sessione.')}
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
$('#run').onclick=run;$('#filter').oninput=renderTree;$('#connectionButton').onclick=()=>homeVisible?newConnection():showHome();$('#addConnection').onclick=newConnection;$('#resumeConnection').onclick=()=>showHome(false);$('#homeDemo').onclick=()=>$('#demo').click();$('#close').onclick=()=>$('#dialog').close();let mode='uri';function setMode(next){mode=next;uriInput.disabled=next!=='uri';$('#uriFields').hidden=next!=='uri';$('#separateFields').hidden=next!=='fields';$('#uriTab').classList.toggle('selected',next==='uri');$('#fieldsTab').classList.toggle('selected',next==='fields')}$('#uriTab').onclick=()=>setMode('uri');$('#fieldsTab').onclick=()=>setMode('fields');
async function connect(config,gateway){
  if(busy)return;busy=true;controls();$('#connectError').textContent='';
  let newSession;const previous={conn,session};
  try{
    conn=nativeAndroid?{native:true}:gateway;
    const response=await api('/connect',config);session=response.session;newSession=session;
    const nextSchema=await api('/schema');
    if(previous.session){const current={conn,session};conn=previous.conn;session=previous.session;await api('/disconnect').catch(()=>{});({conn,session}=current)}
    schema=nextSchema;demo=false;currentProfileId=response.profileId||null;favoriteEntries=[];currentReadOnly=!!response.readOnly;resultsView.setReadOnly(currentReadOnly);$('#readOnlyStatus').hidden=!currentReadOnly;updateSchema();refreshFavorites();
    $('#status').textContent='Connesso'+(response.name?' · '+response.name:'');$('#status').classList.add('connected');
    $('#dialog').close();$('#connectForm').reset();editingProfileId=null;validateUriField();renderResults([]);
    setView('schema');showHome(false);connectionState();
    feedback(response.saveError||'Connessione attiva. Scegli una tabella o scrivi una query.',!!response.saveError);
    refreshConnections();
  }catch(error){
    if(newSession)await api('/disconnect').catch(()=>{});conn=previous.conn;session=previous.session;
    if($('#dialog').open)$('#connectError').textContent=error.message;else connectionHome.error(error.message);
  }finally{busy=false;controls()}
}
$('#connectForm').onsubmit=async event=>{
  event.preventDefault();const validated=mode==='uri'?validateUriField(true):null;
  if(validated&&!validated.valid){uriInput.focus();return}
  const data=Object.fromEntries(new FormData(event.target));
  const config=mode==='uri'?{connectionString:validated.uri,ssl:data.ssl}:Object.fromEntries(['host','port','database','user','password','ssl'].map(key=>[key,data[key]]));
  if(nativeAndroid)Object.assign(config,{readOnly:event.target.elements.readOnly.checked,name:data.name,saveConnection:event.target.elements.saveConnection.checked,replaceProfileId:editingProfileId||''});
  let gateway;
  if(!nativeAndroid){try{const url=new URL(data.gateway);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Usa HTTPS per il gateway remoto');gateway={gateway:data.gateway.replace(/\/$/,''),token:data.token}}catch(error){$('#connectError').textContent=error.message;return}}
  await connect(config,gateway);
};
$('#refresh').onclick=async()=>{if(!session)return;try{schema=await api('/schema');updateSchema();feedback('Schema aggiornato')}catch(e){feedback(e.message,true)}};
$('#disconnect').onclick=async()=>{try{await api('/disconnect')}catch{}session=null;conn=null;schema=[];demo=false;updateSchema();renderResults([]);$('#run').disabled=true;$('#disconnect').disabled=true;$('#status').textContent='Non connesso';$('#status').classList.remove('connected');currentProfileId=null;favoriteEntries=[];setReadOnly(false);refreshFavorites();feedback('Sessione chiusa.');connectionState();showHome()};
$('#resetDemo').onclick=async()=>{resetDemo();await $('#demo').onclick()};
$('#demo').onclick=async()=>{
  if(session)await api('/disconnect').catch(()=>{});session=null;conn=null;demo=true;
  schema=demoSchema();
  updateSchema();editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:'SELECT *\nFROM public.ordini\nLIMIT 100;'}});
  currentProfileId=null;setReadOnly($('#demoReadOnly').checked);refreshFavorites();showHome(false);$('#status').textContent='Demo · dati di esempio';$('#status').classList.add('connected');connectionState();await run();
};
$('#export').onclick=async()=>{const r=resultsView.getExport();if(!r.fields.length)return;const safe=r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='string'&&/^[=+\-@\t\r]/.test(v)?"'"+v:v])));const text='\ufeff'+csv(safe,r.fields);if(nativeAndroid){try{await androidApi('/export',{text});feedback('CSV salvato.')}catch(e){feedback(e.message,true)}return}const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='psql-risultati.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install').hidden=false});$('#install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('#install').hidden=true}};
if(!nativeAndroid&&'serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>feedback('Installazione offline non disponibile',true));

document.querySelector('.brand').onclick=e=>{e.preventDefault();showHome()};document.documentElement.classList.toggle('native-android',nativeAndroid);
renderTree();controls();setView(activeView,false);showHome();
if(nativeAndroid&&window.PsqlNative)new AppUpdates($('#appUpdates'),$('#updateDialog'),androidApi).check();

if(!nativeAndroid&&new URLSearchParams(location.search).has('demo'))$('#demo').click();
