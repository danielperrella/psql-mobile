export class ConnectionHome {
  constructor(root,{connect,edit,remove}) {
    this.root=root;
    this.connect=connect; this.edit=edit; this.remove=remove;
    this.list=root.querySelector('.saved-connections');
    this.message=root.querySelector('.connections-message');
  }
  setBusy(busy) { this.root.querySelectorAll('.saved-connections button,#addConnection,#homeDemo,#resumeConnection').forEach(button=>{button.disabled=busy||button.dataset.unavailable==='true';}); }
  error(text) { this.message.textContent=text; this.message.classList.add('error'); }
  render(profiles,currentId) {
    this.list.replaceChildren(); this.message.classList.remove('error');
    this.message.textContent=profiles.length?'Scegli una connessione per aprire il database.':'Nessuna connessione salvata. Aggiungi il tuo primo database.';
    for(const profile of [...profiles].sort((a,b)=>a.name.localeCompare(b.name))) {
      const card=document.createElement('article');card.className='saved-connection';
      const open=document.createElement('button');open.className='saved-open';
      const name=document.createElement('strong');name.textContent=profile.name;
      const detail=document.createElement('span');detail.textContent=profile.unreadable?'Aggiungi nuovamente i dati di connessione.':profile.database+' · '+profile.host;
      const user=document.createElement('small');user.textContent=profile.unreadable?'':profile.user+(profile.id===currentId?' · In uso':'');
      open.append(name,detail,user);open.onclick=()=>this.connect(profile);
      open.dataset.unavailable=String(!!profile.unreadable);if(profile.unreadable)open.disabled=true;
      const actions=document.createElement('div');actions.className='saved-actions';
      const edit=document.createElement('button');edit.textContent='Modifica';edit.className='secondary';edit.onclick=()=>this.edit(profile);
      edit.disabled=!!profile.unreadable;
      edit.dataset.unavailable=String(!!profile.unreadable);
      const remove=document.createElement('button');remove.textContent='Rimuovi';remove.className='quiet-button';
      remove.onclick=()=>{
        const confirmation=document.createElement('div');confirmation.className='remove-connection';
        const text=document.createElement('p');text.textContent='Rimuovere “'+profile.name+'” dal dispositivo?';
        const cancel=document.createElement('button');cancel.textContent='Annulla';cancel.onclick=()=>confirmation.remove();
        const confirm=document.createElement('button');confirm.textContent='Rimuovi connessione';confirm.onclick=()=>this.remove(profile);
        confirmation.append(text,cancel,confirm);card.querySelector('.remove-connection')?.remove();card.append(confirmation);
      };
      actions.append(edit,remove);card.append(open,actions);this.list.append(card);
    }
  }
}
