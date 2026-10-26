import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,stat} from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
test('the offline cache covers the actual app and legal module dependency graph',async()=>{
 const sw=await readFile(new URL('../dist/sw.js',import.meta.url),'utf8'),paths=sw.match(/const ASSETS=\[(.*?)\]/)[1].match(/'([^']+)'/g).map(x=>x.slice(1,-1));
 const {metafile}=await build({absWorkingDir:fileURLToPath(new URL('..',import.meta.url)),entryPoints:['dist/app.js','dist/legal.js'],outdir:'offline-check',format:'esm',bundle:true,write:false,metafile:true,platform:'browser',logLevel:'silent'});
 for(const path of Object.keys(metafile.inputs).filter(path=>path.startsWith('dist/')))assert(paths.includes('./'+path.slice(5)),'Offline module is missing: '+path);
});
test('all offline assets exist and every font is local',async()=>{
 const sw=await readFile(new URL('../dist/sw.js',import.meta.url),'utf8');const paths=sw.match(/const ASSETS=\[(.*?)\]/)[1].match(/'([^']+)'/g).map(x=>x.slice(1,-1));
 for(const path of paths){const file=path==='./'?'index.html':path.slice(2);assert((await stat(new URL('../dist/'+file,import.meta.url))).size>0);}
 const css=await readFile(new URL('../dist/fonts.css',import.meta.url),'utf8');assert(!css.includes('https://'));
 const manifest=JSON.parse(await readFile(new URL('../dist/manifest.webmanifest',import.meta.url),'utf8'));assert.equal(manifest.scope,'./');for(const icon of manifest.icons)assert((await stat(new URL('../dist/'+icon.src.slice(2),import.meta.url))).size>0);
});
test('offline service worker serves cached game assets and ignores unrelated paths',async()=>{
 const handlers={},cached=new Map([['https://example.com/brick-breaker/app.js','cached-app'],['./index.html','cached-shell']]);
 const sandbox={self:{location:{origin:'https://example.com'},registration:{scope:'https://example.com/brick-breaker/'},addEventListener:(name,handler)=>handlers[name]=handler,clients:{claim:async()=>{}}},URL,Set,Promise,Response,fetch:async()=>{throw Error('offline');},caches:{match:async req=>cached.get(typeof req==='string'?req:req.url),keys:async()=>[],open:async()=>({addAll:async()=>{},put:async()=>{}}),delete:async()=>true}};
 vm.runInNewContext(await readFile(new URL('../dist/sw.js',import.meta.url),'utf8'),sandbox);
 let response;handlers.fetch({request:{url:'https://example.com/brick-breaker/app.js',method:'GET'},respondWith:p=>response=p});assert.equal(await response,'cached-app');
 response=null;handlers.fetch({request:{url:'https://example.com/private',method:'GET'},respondWith:p=>response=p});assert.equal(response,null);
 handlers.fetch({request:{url:'https://example.com/brick-breaker/app.js?flood=1',method:'GET'},respondWith:p=>response=p});assert.equal(response,null);
});
