import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefinition,hydrateDefinition,validateCatalogDefinition,validatePublishedDefinition,definitionHash,structuralDistance,LevelCache} from '../dist/catalog.js';
import {canonicalLayout} from '../dist/generated.js';
import {Game} from '../dist/engine.js';
test('new synthesis makes 1,000 distinct layouts including rotation and reflection checks',()=>{
 const seen=new Set(),nodeCounts=new Set(),edgeCounts=new Set();
 for(let level=13;level<=1012;level++){
  const d=createDefinition(level);validateCatalogDefinition(d);const canonical=canonicalLayout(d.layout);assert(!seen.has(canonical),`repeated topology at ${level}`);seen.add(canonical);nodeCounts.add(d.recipe.nodes);edgeCounts.add(d.recipe.edges);
  if(level<30)assert.deepEqual(d,createDefinition(level));
 }
 assert(nodeCounts.size>15);assert(edgeCounts.size>15);
});
test('catalog version, integrity, metadata and server hash survive JSON round trip',async()=>{
 for(const level of [1,9,12,13,25,100,12345]){const d=createDefinition(level),copy=JSON.parse(JSON.stringify(d));validateCatalogDefinition(copy);assert.equal(hydrateDefinition(copy).signature,d.layout);assert.equal(await definitionHash(copy),await definitionHash(d));}
 assert.throws(()=>validateCatalogDefinition({...createDefinition(13),layout:'bad'}));assert.throws(()=>validateCatalogDefinition({...createDefinition(13),color:'url(javascript:bad)'}));
});
test('game damage cannot mutate a shared published stage',()=>{
 const d=createDefinition(13),p=hydrateDefinition(d),game=new Game({level:13,patternFactory:()=>p});game.damage(game.bricks[0]);
 assert.equal(p.bricks[0].hp,1);assert.equal(hydrateDefinition(d).bricks[0].hp,1);
});
test('guest cache reuses definitions and a signed-in offline user needs a downloaded cloud stage',async()=>{
 const cache=new LevelCache(),a=await cache.load(13),b=await cache.load(13);assert.equal(a,b);
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false}});
 try{await assert.rejects(()=>cache.load(14,{signedIn:true}),/Connect once/);await cache.put({...a,published:true});assert.equal((await cache.load(13,{signedIn:true})).layout,a.layout);}finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});
test('signed-in players can use an older published starter until the shared catalog moves to v9',async()=>{
 const cache=new LevelCache({timeoutMs:10}),current=createDefinition(1),older={...current,version:8,published:true,hash:await definitionHash(current)};
 assert.throws(()=>validateCatalogDefinition(older),/Unsupported catalog version/);
 validatePublishedDefinition(older);
 assert.equal((await cache.load(1,{signedIn:true,level:async()=>older})).version,8);
 assert.equal((await cache.get(1,8)).layout,older.layout);
 assert.equal(await cache.get(1),null,'The old server board must not overwrite the new catalog key');
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false}});
 try{assert.equal((await cache.load(1,{signedIn:true})).version,8);}finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
 assert.equal((await cache.load(1,{signedIn:true,level:async()=>({...current,published:true,hash:await definitionHash(current)})})).version,9);
 await assert.rejects(()=>cache.load(1,{signedIn:true,level:async()=>({...older,version:10})}),/Unsupported published catalog version/);
});
test('shared-catalog near-duplicate filtering can keep publishing a creative sequence',()=>{
 const published=[],all=new Set();let retries=0;
 for(let level=13;level<=268;level++){
  let accepted=null;
  for(let nonce=0;nonce<32;nonce++){
   const d=createDefinition(level,nonce),canonical=canonicalLayout(d.layout);
   if(all.has(canonical)||published.slice(-48).some(p=>structuralDistance(p,canonical)<.085)){retries++;continue;}
   accepted=canonical;break;
  }
  assert(accepted,`No acceptable shared layout at stage ${level}`);all.add(accepted);published.push(accepted);
 }
 assert.equal(all.size,256);
});
