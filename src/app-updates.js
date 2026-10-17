export class AppUpdates {
  constructor(root, dialog, api) {
    this.root=root;this.dialog=dialog;this.api=api;this.available=false;this.busy=false;
    dialog.innerHTML='<h2 id="updateTitle">Aggiornamento disponibile</h2><p class="update-description"></p><p class="update-status" role="status"></p><div class="update-actions"><button class="update-later secondary">Più tardi</button><button class="update-now primary">Aggiorna</button></div>';
    root.querySelector('#checkUpdates').onclick=()=>this.check(true);
    root.querySelector('#downloadUpdate').onclick=()=>this.install();
    dialog.querySelector('.update-later').onclick=()=>dialog.close();
    dialog.querySelector('.update-now').onclick=()=>this.install();
    dialog.addEventListener('cancel',event=>{if(this.busy)event.preventDefault();});
    window.addEventListener('psql-update-install-error',()=>this.error('Impossibile aprire l’installazione. Premi Aggiorna per riprovare.'));
  }
  async check(explicit=false) {
    if(this.busy)return;
    const status=this.root.querySelector('.update-check-status');
    status.textContent='Controllo aggiornamenti…';
    this.root.querySelector('#checkUpdates').disabled=true;
    try{
      const update=await this.api('/updates/check');this.available=update.available;
      this.root.querySelector('.update-banner').hidden=!update.available;
      status.textContent=update.available?'Nuova versione '+update.versionName+' disponibile.':'L’app è aggiornata.';
      this.dialog.querySelector('.update-description').textContent='Versione '+update.versionName+' · '+(update.size/1_000_000).toFixed(1)+' MB. '+(update.notes||'');
      this.dialog.querySelector('.update-status').textContent='Le connessioni salvate restano sul dispositivo.';
      if(update.available&&!document.querySelector('dialog[open]'))this.dialog.showModal();
    }catch{
      status.textContent=explicit?'Controllo non disponibile. Verifica la rete e riprova.':'Controllo aggiornamenti non disponibile.';
    }finally{this.root.querySelector('#checkUpdates').disabled=false;}
  }
  error(text) {
    this.dialog.querySelector('.update-status').textContent=text;
    this.dialog.querySelector('.update-status').classList.add('error');
  }
  async install() {
    if(this.busy||!this.available)return;
    if(!this.dialog.open)this.dialog.showModal();this.busy=true;
    const status=this.dialog.querySelector('.update-status');status.classList.remove('error');
    status.textContent='Download e verifica dell’aggiornamento…';
    this.dialog.querySelectorAll('button').forEach(button=>{button.disabled=true;});
    try{
      const response=await this.api('/updates/install');
      status.textContent=response.status==='permission'?'Autorizza Psql Mobile a installare aggiornamenti, poi torna all’app: si aprirà la conferma Android.':'Conferma l’aggiornamento nella schermata Android. Se annulli, puoi riprovare da qui.';
    }catch(error){this.error(error.message);}
    finally{this.busy=false;this.dialog.querySelectorAll('button').forEach(button=>{button.disabled=false;});}
  }
}
