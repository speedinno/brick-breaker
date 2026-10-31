import {makePattern} from './engine.js';
import {generateDefinition,patternFromLayout,validateDefinition,canonicalLayout,GENERATOR_VERSION} from './generated.js';
export {GENERATOR_VERSION};
export const catalogVersion=level=>level<=12?9:GENERATOR_VERSION;
export function createDefinition(level,nonce=0) {
  if(!Number.isSafeInteger(level)||level<1)throw Error('Invalid stage number');
  if(level>12)return generateDefinition(level,nonce);
  const p=makePattern(level,1);
  return {version:9,level,layout:p.signature,entry:p.entry.x/8,name:p.name,color:p.color,family:p.family,recipe:{reference:level},metrics:{reference:true}};
}
export function hydrateDefinition(definition) {return patternFromLayout(definition);}
function validateShape(definition) {
  if(typeof definition.name!=='string'||definition.name.length>80||!/^#[a-f\d]{6}$/i.test(definition.color))throw Error('Invalid stage metadata');
  if(definition.palette&&(!Array.isArray(definition.palette)||definition.palette.length>5||definition.palette.some(color=>!/^#[a-f\d]{6}$/i.test(color))))throw Error('Invalid palette');
  if(definition.tones&&(definition.tones.length!==2704||!/^[0-4]+$/.test(definition.tones)))throw Error('Invalid stage tones');
  return validateDefinition(definition);
}
export function validateCatalogDefinition(definition) {
  if(!Number.isSafeInteger(definition?.level)||definition.level<1||definition.version!==catalogVersion(definition.level))throw Error('Unsupported catalog version');
  return validateShape(definition);
}
export function validatePublishedDefinition(definition) {
  const version=definition?.version,level=definition?.level;
  if(!definition?.published||!Number.isSafeInteger(level)||level<1||!(level<=12?Number.isSafeInteger(version)&&version>=3&&version<=catalogVersion(level):version===GENERATOR_VERSION))throw Error('Unsupported published catalog version');
  return validateShape(definition);
}
export async function definitionHash(definition) {
  const bytes=new TextEncoder().encode(canonicalLayout(definition.layout));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
export function structuralDistance(a,b) {
  if(a.length!==2704||b.length!==2704)throw Error('Invalid comparison');
  let different=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])different++;
  return different/a.length;
}
// IndexedDB holds downloaded definitions, not account tokens. Versions are part
// of every key so a future generator cannot silently change a published level.
export class LevelCache {
  constructor({timeoutMs=2500}={}){this.memory=new Map();this.database=null;this.timeoutMs=timeoutMs;this.storageUnavailable=false;}
  remember(key,value){this.memory.delete(key);this.memory.set(key,value);if(this.memory.size>24)this.memory.delete(this.memory.keys().next().value);}
  async db(){
    if(!globalThis.indexedDB){this.storageUnavailable=true;return null;}
    if(!this.database)this.database=new Promise(resolve=>{
      let settled=false;const finish=value=>{if(settled){value?.close();return;}settled=true;clearTimeout(timer);if(!value)this.storageUnavailable=true;resolve(value);},timer=setTimeout(()=>finish(null),this.timeoutMs);
      try{const r=indexedDB.open('brick-breaker-catalog',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('levels'))r.result.createObjectStore('levels');};r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();this.database=null;};finish(db);};r.onerror=()=>finish(null);}catch{finish(null);}
    });return this.database;
  }
  valid(value,level,version){try{if(value?.published)validatePublishedDefinition(value);else validateCatalogDefinition(value);return value.level===level&&value.version===version;}catch{return false;}}
  async get(level,version=catalogVersion(level)){
    const key=`${version}:${level}`,memory=this.memory.get(key);if(memory&&this.valid(memory,level,version))return memory;
    const db=await this.db();if(!db)return null;
    return new Promise(resolve=>{let settled=false;const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);if(value&&this.valid(value,level,version)){this.remember(key,value);resolve(value);}else resolve(null);},timer=setTimeout(()=>{this.storageUnavailable=true;finish(null);},this.timeoutMs);
      try{const r=db.transaction('levels').objectStore('levels').get(key);r.onsuccess=()=>finish(r.result);r.onerror=()=>{this.storageUnavailable=true;finish(null);};}catch{this.storageUnavailable=true;finish(null);}
    });
  }
  async put(definition){
    if(definition?.published)validatePublishedDefinition(definition);else validateCatalogDefinition(definition);const key=`${definition.version}:${definition.level}`;this.remember(key,definition);const db=await this.db();if(!db)return;
    await new Promise(resolve=>{let settled=false;const finish=failed=>{if(settled)return;settled=true;clearTimeout(timer);if(failed)this.storageUnavailable=true;resolve();},timer=setTimeout(()=>finish(true),this.timeoutMs);
      try{const tx=db.transaction('levels','readwrite');tx.objectStore('levels').put(definition,key);tx.oncomplete=()=>finish(false);tx.onerror=tx.onabort=()=>finish(true);}catch{finish(true);}
    });
  }
  async load(level,cloud=null){
    const cached=await this.get(level);
    const publishedCache=async()=>{if(cached?.published)return cached;if(level<=12)for(let version=catalogVersion(level)-1;version>=3;version--){const old=await this.get(level,version);if(old?.published)return old;}return null;};
    // A live shared catalog is authoritative; offline users can reuse only an
    // already downloaded cloud definition, or the deterministic guest catalog.
    if(cloud?.signedIn&&globalThis.navigator?.onLine!==false){try{const definition=await cloud.level(level);await this.put(definition);return definition;}catch(error){if(!error.network)throw error;const fallback=await publishedCache();if(fallback)return fallback;throw error;}}
    if(cloud?.signedIn){const fallback=await publishedCache();if(fallback)return fallback;}
    if(cached&&!cloud?.signedIn)return cached;
    if(cloud?.signedIn)throw Error('Connect once to download this stage, then play it offline.');
    const definition=createDefinition(level);await this.put(definition);return definition;
  }
}
