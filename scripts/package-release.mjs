import fs from 'node:fs';
import crypto from 'node:crypto';
const gradle=fs.readFileSync('android/app/build.gradle','utf8');
const versionCode=Number(gradle.match(/def publishedVersionCode = (\d+)/)[1]);
const versionName=gradle.match(/versionName '([^']+)'/)[1];
const apk=fs.readFileSync('android/app/build/outputs/apk/release/app-release.apk');
fs.mkdirSync('release',{recursive:true});
fs.writeFileSync('release/psql-mobile.apk',apk);
fs.writeFileSync('release/update.json',JSON.stringify({versionCode,versionName,
  apkUrl:'https://danielperrella.github.io/psql-mobile/psql-mobile.apk',size:apk.length,
  sha256:crypto.createHash('sha256').update(apk).digest('hex'),
  notes:'Filtri per tipo di campo, ricerca delle relazioni per nome, intervalli e riepilogo dei filtri applicati.'},null,2)+'\n');
await import('./verify-release.mjs');
