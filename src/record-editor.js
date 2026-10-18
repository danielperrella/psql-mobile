import {displayValue} from './results-view.js';

const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
const option=(value,text)=>{const result=node('option',text);result.value=value;return result;};

export class RecordEditor {
  constructor(dialog,lookup,api,onChanged){
    this.dialog=dialog;this.lookup=lookup;this.api=api;this.onChanged=onChanged;this.sequence=0;this.loading=false;
    dialog.innerHTML=`<form class="record-form"><div class="record-modal-header"><div><p class="editor-kind"></p><h2 id="recordEditorTitle"></h2></div><button type="button" class="editor-close secondary" aria-label="Chiudi modulo record">Chiudi</button></div><p class="editor-context"></p><div class="editor-fields"></div><p class="editor-error error" role="alert"></p><div class="discard-changes" hidden><p>Ci sono modifiche non salvate. Vuoi scartarle?</p><button type="button" class="keep-editing secondary">Continua a modificare</button><button type="button" class="discard-now secondary">Scarta modifiche</button></div><div class="record-modal-footer"><button type="button" class="editor-cancel secondary">Annulla</button><button type="submit" class="editor-save primary">Salva record</button></div></form>`;
    this.form=dialog.querySelector('form');
    dialog.querySelector('.editor-close').onclick=()=>this.tryClose();dialog.querySelector('.editor-cancel').onclick=()=>this.tryClose();
    dialog.querySelector('.keep-editing').onclick=()=>{dialog.querySelector('.discard-changes').hidden=true;};
    dialog.querySelector('.discard-now').onclick=()=>this.close();
    dialog.addEventListener('cancel',event=>{event.preventDefault();this.tryClose();});
    this.form.onsubmit=event=>{event.preventDefault();this.save();};
    lookup.innerHTML=`<div class="record-modal-header"><h2 id="lookupTitle">Cerca record</h2><button type="button" class="lookup-close secondary">Chiudi ricerca</button></div><label class="lookup-label">Cerca nel database<input type="search" autocomplete="off" placeholder="Nome, ID o altro valore"></label><p class="lookup-status" role="status"></p><div class="lookup-items"></div><div class="lookup-pagination"><button type="button" class="lookup-prev secondary">Precedenti</button><span></span><button type="button" class="lookup-next secondary">Successivi</button></div>`;
    lookup.querySelector('.lookup-close').onclick=()=>this.closeLookup();
    lookup.addEventListener('cancel',event=>{event.preventDefault();this.closeLookup();});
    lookup.querySelector('input').oninput=()=>{clearTimeout(this.searchTimer);this.lookupSequence++;lookup.querySelector('.lookup-items').replaceChildren();lookup.querySelector('.lookup-status').textContent='Ricerca nel database…';lookup.querySelectorAll('.lookup-pagination button').forEach(button=>{button.disabled=true;});this.searchTimer=setTimeout(()=>this.search(0),250);};
    lookup.querySelector('.lookup-prev').onclick=()=>this.search(Math.max(0,this.offset-25));
    lookup.querySelector('.lookup-next').onclick=()=>this.search(this.offset+25);
  }
  changes(){
    const changes={};for(const [name,control]of this.inputs||[]){
      if(!control.writable)continue;const value={mode:control.mode.value};if(value.mode==='value')value.value=control.value.value;
      if(this.mode==='create'||JSON.stringify(value)!==control.initial)changes[name]=value;
    }return changes;
  }
  tryClose(){if(this.loading)return;if(this.mode!=='delete'&&Object.keys(this.changes()).some(name=>this.mode!=='create'||this.inputs.get(name).initial!==JSON.stringify(this.changes()[name]))){this.dialog.querySelector('.discard-changes').hidden=false;return;}this.close();}
  close(){this.sequence++;this.closeLookup();this.dialog.close();this.dialog.querySelector('.editor-fields').replaceChildren();this.inputs=new Map();this.loaded=null;}
  closeLookup(){clearTimeout(this.searchTimer);this.lookupSequence=(this.lookupSequence||0)+1;this.lookup.close();this.lookup.querySelector('.lookup-items').replaceChildren();}
  async open(mode,target,keys={}){
    this.close();this.mode=mode;this.target={schema:target.schema,table:target.table};this.keys=keys;this.inputs=new Map();this.groups=[];this.loading=true;
    this.dialog.querySelector('.editor-kind').textContent=mode==='create'?'Nuovo record':mode==='delete'?'Elimina record':'Modifica record';
    this.dialog.querySelector('#recordEditorTitle').textContent=target.table;
    this.dialog.querySelector('.editor-context').textContent=target.schema+' · Caricamento dei campi…';
    this.dialog.querySelector('.editor-error').textContent='';this.dialog.querySelector('.discard-changes').hidden=true;
    this.setBusy(true);this.dialog.showModal();const sequence=++this.sequence;
    try{
      const response=await this.api(mode==='create'?'/records/describe':'/records/open',{target:this.target,keys});
      if(sequence!==this.sequence)return;
      this.loaded=mode==='create'?{definition:response,row:{}}:response;
      this.render();
    }catch(error){if(sequence===this.sequence)this.dialog.querySelector('.editor-error').textContent=error.message;}
    finally{if(sequence===this.sequence){this.loading=false;this.setBusy(false);}}
  }
  setBusy(busy){
    this.loading=busy;this.dialog.querySelector('.editor-save').disabled=busy||!this.loaded;
    this.dialog.querySelector('.editor-fields').inert=busy;
    this.dialog.querySelector('.editor-cancel').disabled=busy;
    this.dialog.querySelector('.editor-close').disabled=busy;
  }
  render(){
    const {definition:d,row}=this.loaded,create=this.mode==='create',deleting=this.mode==='delete';
    const root=this.dialog.querySelector('.editor-fields');root.replaceChildren();this.inputs=new Map();this.groups=[];
    this.dialog.querySelector('.editor-context').textContent=deleting?'Eliminare definitivamente questo record? Verranno applicate anche le regole del database sui record collegati.':d.schema+' · '+(create?'Scegli i valori del nuovo record.':'I campi sono stati riletti dal database.');
    const save=this.dialog.querySelector('.editor-save');save.textContent=deleting?'Elimina definitivamente':create?'Crea record':'Salva modifiche';save.classList.toggle('danger',deleting);
    for(const column of d.columns){
      const wrapper=node('div',undefined,'edit-field'),label=node('label',column.name),hint=node('small',column.type+(column.generated?' · Generato dal database':column.nullable?' · Facoltativo':' · Obbligatorio'));
      if(deleting){const value=node('pre',displayValue(row[column.name]));wrapper.append(label,hint,value);root.append(wrapper);continue;}
      const writable=column[create?'canInsert':'canUpdate'];
      const mode=node('select');mode.setAttribute('aria-label','Modalità '+column.name);mode.append(option('value','Valore'));
      if(column.nullable)mode.append(option('null','NULL · nessun valore'));
      if(column.hasDefault)mode.append(option('default','Valore predefinito'));
      mode.value=create?(column.hasDefault||column.generated?'default':column.nullable?'null':'value'):(row[column.name]==null?'null':'value');
      if(![...mode.options].some(choice=>choice.value===mode.value))mode.value='value';
      let value;
      if(column.category==='B'||column.choices?.length){value=node('select');for(const choice of column.choices||['true','false'])value.append(option(choice,choice));}
      else{value=node('textarea');value.rows=column.type.includes('json')?4:2;value.spellcheck=false;value.autocapitalize='none';}
      value.id='edit-field-'+this.inputs.size;label.htmlFor=value.id;value.setAttribute('aria-label',column.name);
      value.value=row[column.name]==null?'':typeof row[column.name]==='object'?JSON.stringify(row[column.name],null,2):String(row[column.name]);
      if(column.category==='B'&&row[column.name]!=null)value.value=['t','true'].includes(String(row[column.name]))?'true':'false';
      if(value.tagName==='SELECT'&&!value.value&&value.options.length)value.selectedIndex=0;
      const initial={mode:mode.value};if(initial.mode==='value')initial.value=value.value;
      const control={column,wrapper,mode,value,writable,initial:JSON.stringify(initial)};this.inputs.set(column.name,control);
      const sync=()=>{value.disabled=!writable||mode.value!=='value';mode.disabled=!writable;this.updateGroups();};
      mode.onchange=sync;value.oninput=()=>this.updateGroups();sync();
      wrapper.append(label,hint);
      if(writable)wrapper.append(mode,value);else wrapper.append(node('pre',create?'Automatico':displayValue(row[column.name])),node('small','Campo in sola lettura'));
    }
    if(!deleting){
      const covered=new Set();
      for(const relation of d.relations||[]){
        if(!relation.sourceColumns?.every(name=>this.inputs.get(name)?.writable&&!covered.has(name)))continue;
        relation.sourceColumns.forEach(name=>covered.add(name));
        const group=node('section',undefined,'lookup-field');group.append(node('h3',relation.sourceColumns.join(' + ')),node('p','Relazione con '+relation.targetTable));
        const selected=node('div',undefined,'lookup-selected');group.append(selected);
        const search=node('button','Cerca in '+relation.targetTable,'secondary lookup-open');search.type='button';search.onclick=()=>this.openLookup(relation);group.append(search);
        if(relation.sourceColumns.every(name=>this.inputs.get(name).column.nullable)){const clear=node('button','Rimuovi selezione','quiet-button');clear.type='button';clear.onclick=()=>{for(const name of relation.sourceColumns)this.inputs.get(name).mode.value='null';this.updateGroups();};group.append(clear);}
        if(relation.sourceColumns.every(name=>this.inputs.get(name).column.hasDefault)){const defaults=node('button','Usa valore predefinito','quiet-button');defaults.type='button';defaults.onclick=()=>{for(const name of relation.sourceColumns)this.inputs.get(name).mode.value='default';this.updateGroups();};group.append(defaults);}
        this.groups.push({relation,group,selected});
      }
      const added=new Set();for(const column of d.columns){
        const group=this.groups.find(group=>group.relation.sourceColumns.includes(column.name));
        if(group){if(!added.has(group)){root.append(group.group);added.add(group);}}else root.append(this.inputs.get(column.name).wrapper);
      }this.updateGroups();
    }
    if((deleting&&!d.canDelete)||(create&&!d.columns.some(column=>column.canInsert)&&!d.canInsert)){
      this.dialog.querySelector('.editor-error').textContent='La connessione non ha i permessi per questa operazione.';this.loaded=null;
    }
  }
  updateGroups(){for(const group of this.groups||[]){if(!group.relation.sourceColumns.every(name=>this.inputs.get(name).mode.value==='value'))group.label=null;const values=group.relation.sourceColumns.map(name=>{const input=this.inputs.get(name);return name+': '+(input.mode.value==='value'?(input.value.value||'Stringa vuota'):input.mode.value==='null'?'NULL':'Predefinito');});group.selected.textContent=this.mode==='create'&&!group.label&&group.relation.sourceColumns.every(name=>!this.inputs.get(name).value.value)?'Nessun record selezionato':values.join(' · ');if(group.label)group.selected.textContent=group.label+' · '+values.join(' · ');}}
  openLookup(relation){if(this.loading)return;this.relation=relation;this.offset=0;this.lookup.querySelector('#lookupTitle').textContent='Scegli '+relation.targetTable;this.lookup.querySelector('input').value='';this.lookup.showModal();this.search(0);}
  async search(offset){
    clearTimeout(this.searchTimer);this.offset=offset;const sequence=this.lookupSequence=(this.lookupSequence||0)+1;
    const list=this.lookup.querySelector('.lookup-items'),status=this.lookup.querySelector('.lookup-status');list.replaceChildren();status.textContent='Ricerca nel database…';
    this.lookup.querySelectorAll('.lookup-pagination button').forEach(button=>{button.disabled=true;});
    try{
      const response=await this.api('/records/lookup',{relationId:this.relation.id,search:this.lookup.querySelector('input').value,offset});
      if(sequence!==this.lookupSequence||!this.lookup.open)return;
      status.textContent=response.items.length?'Tocca il record da collegare.':'Nessun record trovato. Prova un altro valore.';
      for(const item of response.items){const select=node('button',undefined,'lookup-item');select.type='button';select.append(node('strong',item.label),node('small',item.detail));select.onclick=()=>{
        this.relation.sourceColumns.forEach((name,index)=>{const control=this.inputs.get(name);control.mode.value='value';control.value.value=item.values[index];});
        const group=this.groups.find(group=>group.relation===this.relation);if(group)group.label=item.label;
        this.updateGroups();this.closeLookup();
      };list.append(select);}
      this.lookup.querySelector('.lookup-prev').disabled=offset===0;this.lookup.querySelector('.lookup-next').disabled=!response.hasMore;
      this.lookup.querySelector('.lookup-pagination span').textContent='Pagina '+(offset/25+1);
    }catch(error){if(sequence===this.lookupSequence)status.textContent=error.message;}
  }
  async save(){
    if(this.loading||!this.loaded)return;this.setBusy(true);const error=this.dialog.querySelector('.editor-error');error.textContent='';
    const change={mode:this.mode,target:this.target,keys:this.loaded.keys||{},version:this.loaded.version,values:this.changes()};
    try{
      const saved=await this.api(this.mode==='delete'?'/records/delete':'/records/save',change);
      this.close();this.onChanged({...change,saved});
    }catch(failure){error.textContent=failure.message;}
    finally{this.setBusy(false);}
  }
}
