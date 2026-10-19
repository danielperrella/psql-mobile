const node=(tag,text,className)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;if(className)result.className=className;return result;};

export class ConnectionCertificates{
  constructor(root,api,tls){
    this.root=root;this.api=api;this.tls=tls;this.sequence=0;this.material={};
    root.innerHTML='<h3>Certificati TLS</h3><p class="note">Facoltativi. Importa i file per questa connessione; non vengono installati sul telefono. Massimo 512 KiB per file.</p><div class="certificate-ca"></div><div class="certificate-client"></div><label class="certificate-password" hidden>Password del file PKCS#12<input name="clientCertificatePassword" type="password" autocomplete="off" autocapitalize="none"><span class="note">Può essere vuota se il file non è protetto.</span></label><button class="certificate-check secondary" type="button" hidden>Verifica certificato client</button><p class="certificate-status field-validation" role="status" aria-live="polite"></p><p class="note">CA e chiave client vengono salvate cifrate con la connessione. Rimuovere un file qui ha effetto sul profilo quando riconnetti e salvi.</p>';
    this.password=root.querySelector('input');this.status=root.querySelector('.certificate-status');this.check=root.querySelector('.certificate-check');
    this.password.oninput=()=>{if(this.material.client){delete this.material.client.info;this.render();this.status.textContent='Password modificata. Verifica il certificato prima di connetterti.';}};
    this.check.onclick=()=>this.validateClient();this.render();
  }
  reset(){this.sequence++;this.pending=false;this.material={};this.password.value='';this.status.textContent='';this.render();}
  async load(config){
    this.reset();const sequence=this.sequence;
    for(const kind of ['ca','client'])if(config?.[kind]?.data)this.material[kind]={data:config[kind].data,name:config[kind].name||'Certificato importato'};
    this.password.value=config?.password||'';this.render();
    try{for(const kind of ['ca','client'])if(this.material[kind]){const material=this.material[kind],info=await this.api('/certificates/inspect',{kind,data:material.data,password:this.password.value});if(sequence!==this.sequence)return;material.info=info;}this.render();}
    catch(error){if(sequence===this.sequence)this.status.textContent=error.message;}
  }
  config(){
    if(this.pending)throw new Error('Attendi il completamento dell’importazione.');
    const result={};for(const kind of ['ca','client'])if(this.material[kind])result[kind]={data:this.material[kind].data,name:this.material[kind].name};
    if(result.client)result.password=this.password.value;return result;
  }
  async import(kind){
    if(this.pending)return;const sequence=this.sequence;this.pending=true;this.render();this.status.textContent='Scegli il file sul dispositivo…';
    try{const material=await this.api('/certificates/import',{kind});if(sequence!==this.sequence)return;this.material[kind]=material;this.tls.value='verify-full';
      if(kind==='client'){this.password.value='';this.status.textContent='File importato. Inserisci la password PKCS#12, se presente, e verifica il certificato.';}
      else this.status.textContent='Certificato server importato. TLS verifica certificato e nome host.';
    }catch(error){if(sequence===this.sequence)this.status.textContent=error.message;}
    finally{if(sequence===this.sequence){this.pending=false;this.render();}}
  }
  async validateClient(){
    if(this.pending||!this.material.client)return;const sequence=this.sequence,material=this.material.client,password=this.password.value;this.pending=true;this.render();this.status.textContent='Verifica del certificato client…';
    try{const info=await this.api('/certificates/inspect',{kind:'client',data:material.data,password});if(sequence!==this.sequence||password!==this.password.value)return;material.info=info;this.status.textContent='Certificato client valido, con chiave privata.';}
    catch(error){if(sequence===this.sequence){delete material.info;this.status.textContent=error.message;}}
    finally{if(sequence===this.sequence){this.pending=false;this.render();}}
  }
  render(){
    for(const kind of ['ca','client']){
      const root=this.root.querySelector('.certificate-'+kind),material=this.material[kind];root.replaceChildren();
      root.append(node('h4',kind==='ca'?'CA o certificato server':'Certificato client e chiave privata'));
      root.append(node('p',kind==='ca'?'X.509 · .crt, .cer o .pem (anche più CA nello stesso file)':'PKCS#12 · .p12 o .pfx con un solo certificato client e la sua chiave','note'));
      if(material){
        root.append(node('strong',material.name,'certificate-name'));
        if(material.info){const info=material.info;root.append(node('p',info.subject,'certificate-subject'),node('p','Scadenza: '+new Date(info.expires).toLocaleDateString()+(info.count>1?' · '+info.count+' certificati':''),'note'),node('p','SHA-256: '+info.fingerprint,'certificate-fingerprint'));}
        else root.append(node('p','Da verificare','note'));
      }
      const actions=node('div',undefined,'certificate-actions'),pick=node('button',material?'Sostituisci '+(kind==='ca'?'CA':'client'):'Importa '+(kind==='ca'?'CA / server':'client PKCS#12'),'secondary');pick.type='button';pick.disabled=this.pending;pick.onclick=()=>this.import(kind);actions.append(pick);
      if(material){const remove=node('button','Rimuovi '+(kind==='ca'?'CA':'client'),'quiet-button');remove.type='button';remove.disabled=this.pending;remove.onclick=()=>{this.sequence++;delete this.material[kind];if(kind==='client')this.password.value='';this.status.textContent='Certificato rimosso dal modulo.';this.render();};actions.append(remove);}root.append(actions);
    }
    this.root.querySelector('.certificate-password').hidden=!this.material.client;this.password.disabled=this.pending||!this.material.client;this.check.hidden=!this.material.client;this.check.disabled=this.pending;
  }
}
