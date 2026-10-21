import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProgress,normalizeProgress,markCompleted,isUnlocked,isCompleted,nextRequired,lockReason,mergeProgress,ProgressStore} from '../dist/progress.js';
const result={score:12000,seconds:30,peak:100,mode:'play'};
test('starter completion order is free; all twelve are required for stage thirteen',()=>{
 let p=emptyProgress();for(let n=1;n<=12;n++)assert(isUnlocked(p,n));
 assert(!isUnlocked(p,13));p=markCompleted(p,12,result);assert(isCompleted(p,12));assert(!isUnlocked(p,13));assert.match(lockReason(p,13),/11 stages remain/);
 for(let n=1;n<=10;n++)p=markCompleted(p,n,result);
 assert(!isUnlocked(p,13));assert.equal(nextRequired(p),11);p=markCompleted(p,11,result);assert(isUnlocked(p,13));assert(!isUnlocked(p,14));
});
test('journey unlocks exactly one level at a time and replay does not advance it',()=>{
 let p=emptyProgress();for(let n=1;n<=12;n++)p=markCompleted(p,n,result);
 assert.throws(()=>markCompleted(p,14,result),/Finish stage 13/);p=markCompleted(p,13,result);assert(isUnlocked(p,14));assert(isCompleted(p,13));
 p=markCompleted(p,13,result);assert.equal(p.journeyNext,14);assert.equal(p.records[13].clears,2);assert(!isUnlocked(p,15));
});
test('malformed saves cannot claim a journey without the starter requirement',()=>{
 const p=normalizeProgress({starters:[1,1,-1,20,'2'],journeyNext:999,selected:999,pending:[{}],records:{'999':result}});
 assert.deepEqual(p.starters,[1]);assert.equal(p.journeyNext,13);assert.equal(p.selected,2);assert.deepEqual(p.pending,[]);assert.deepEqual(p.records,{});
});
test('account saves are isolated and signing out returns to the separate guest',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const store=new ProgressStore(storage);store.complete(1,result);store.switchAccount('alice');assert(!isCompleted(store.value,1));store.complete(2,result);
 store.switchAccount('bob');assert.equal(store.value.starters.length,0);store.switchAccount('alice');assert(isCompleted(store.value,2));store.clear();store.switchAccount(null);assert(isCompleted(store.value,1));
});
test('merging device and cloud completion preserves starter checks and valid frontier',()=>{
 let a=emptyProgress(),b=emptyProgress();for(let n=1;n<=6;n++)a=markCompleted(a,n,result);for(let n=7;n<=12;n++)b=markCompleted(b,n,result);
 const p=mergeProgress(a,b);assert(isUnlocked(p,13));assert.equal(p.starters.length,12);assert(!isUnlocked(p,14));
 const older=markCompleted(emptyProgress(),1,{...result,score:100,seconds:90,peak:4});const newer=markCompleted(emptyProgress(),1,result);const merged=mergeProgress(newer,older);assert.equal(merged.records[1].score,12000);assert.equal(merged.records[1].seconds,30);assert.equal(merged.records[1].peak,100);
});
