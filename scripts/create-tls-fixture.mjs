// Disposable certificates for the isolated PostgreSQL test server, never production.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const output=path.resolve('.tooling/tls-fixture');fs.mkdirSync(output,{recursive:true});
const openssl=process.env.PSQL_OPENSSL||'openssl';
const run=(...args)=>execFileSync(openssl,args,{cwd:output,stdio:'pipe'});
run('req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.crt','-days','3650','-subj','/CN=Psql Mobile disposable test CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign');
run('req','-x509','-newkey','rsa:2048','-nodes','-keyout','wrong-ca.key','-out','wrong-ca.crt','-days','3650','-subj','/CN=Unrelated disposable CA','-addext','basicConstraints=critical,CA:TRUE');
for(const kind of ['server','client']){
  run('req','-newkey','rsa:2048','-nodes','-keyout',kind+'.key','-out',kind+'.csr','-subj',kind==='server'?'/CN=127.0.0.1':'/CN=tls_probe');
  fs.writeFileSync(path.join(output,kind+'.ext'),'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage='+(kind==='server'?'serverAuth\nsubjectAltName=IP:127.0.0.1':'clientAuth')+'\n');
  run('x509','-req','-in',kind+'.csr','-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-out',kind+'.crt','-days','3650','-extfile',kind+'.ext');
}
run('pkcs12','-export','-inkey','client.key','-in','client.crt','-certfile','ca.crt','-name','tls_probe','-out','client.p12','-passout','pass:fixture-only');
const assets='android/app/src/androidTest/assets/tls';fs.mkdirSync(assets,{recursive:true});
for(const file of ['ca.crt','wrong-ca.crt','client.p12','client.crt'])fs.copyFileSync(path.join(output,file),path.join(assets,file));
console.log('Created disposable TLS fixture and Android test assets.');
