import test from 'node:test';import assert from 'node:assert/strict';
import {LevelCache,createDefinition} from '../dist/catalog.js';
async function fakeDB(value,fn){const descriptor=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');Object.defineProperty(globalThis,'indexedDB',{configurable:true,value});try{await fn();}finally{if(descriptor)Object.defineProperty(globalThis,'indexedDB',descriptor);else delete globalThis.indexedDB;}}
test('blocked or denied IndexedDB cannot leave the guest stage loading forever',async()=>{
 for(const open of [()=>({}),()=>{throw Error('Denied');}])await fakeDB({open},async()=>{const cache=new LevelCache({timeoutMs:10}),d=await cache.load(13);assert.equal(d.level,13);assert(cache.storageUnavailable);assert.equal((await cache.load(13)).layout,d.layout);});
});
test('failed transactions fall back to memory and corrupted cached definitions are rejected',async()=>{
 const cache=new LevelCache({timeoutMs:10});cache.database=Promise.resolve({transaction(){throw Error('Closed');}});const d=await cache.load(13);assert.equal(d.level,13);assert(cache.storageUnavailable);
 const bad=new LevelCache({timeoutMs:10});bad.database=Promise.resolve({transaction(){return{objectStore(){return{get(){const r={};queueMicrotask(()=>{r.result={...createDefinition(13),layout:'corrupt'};r.onsuccess();});return r;},put(){throw Error('Quota');}};}};}});
 assert.equal(await bad.get(13),null);assert.equal((await bad.load(13)).level,13);assert(bad.storageUnavailable);
});
