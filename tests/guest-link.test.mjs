import test from 'node:test';import assert from 'node:assert/strict';
import {emptyProgress,markCompleted,mergeProgress,unlinkedGuestCount,ProgressStore} from '../dist/progress.js';
test('guest stages remain separate on sign-in and count only stages missing from the account',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 const store=new ProgressStore(storage);for(let level=1;level<=7;level++)store.complete(level,{score:100,seconds:40});
 const guest=JSON.stringify(store.value);store.switchAccount('a');assert.equal(store.value.starters.length,0);assert.equal(unlinkedGuestCount(store.value,JSON.parse(guest)),7);
 store.save(mergeProgress(markCompleted(emptyProgress(),1),JSON.parse(guest)));assert.equal(store.value.starters.length,7);assert.equal(unlinkedGuestCount(store.value,JSON.parse(guest)),0);
 assert.equal(JSON.stringify(new ProgressStore(storage).value),guest);store.switchAccount('b');assert.equal(store.value.starters.length,0);store.switchAccount(null);assert.equal(JSON.stringify(store.value),guest);
});
test('guest count includes only the missing journey frontier and starters',()=>{
 const guest={...emptyProgress(),starters:Array.from({length:12},(_,i)=>i+1),journeyNext:24};
 assert.equal(unlinkedGuestCount(emptyProgress(),guest),23);assert.equal(unlinkedGuestCount({...guest,journeyNext:20},guest),4);assert.equal(unlinkedGuestCount({...guest,journeyNext:30},guest),0);
});
