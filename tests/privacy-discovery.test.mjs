import test from 'node:test';import assert from 'node:assert/strict';import {discoverPrivacyBatch} from '../scripts/privacy-discovery.mjs';
const identity={provider:'revenuecat',projectId:'proj_fixture',environment:'sandbox',database:'https://db.example.invalid'},ids=Array.from({length:45},()=>crypto.randomUUID());
function fixture(){let stored=null,writes=0,failAt=null;const observed=[],pages=[];return{observed,pages,get stored(){return structuredClone(stored);},set failAt(value){failAt=value;},options:{identity,read:async()=>structuredClone(stored),write:async state=>{if(++writes===failAt)throw Error('storage');stored=structuredClone(state);},page:async after=>{pages.push(after);const start=after===null?0:ids.indexOf(after)+1,customers=ids.slice(start,start+20);return{customers,next:start+20<ids.length?customers.at(-1):null,count:customers.length};},observe:async(id,customers)=>{observed.push({id,customers});return customers.length;}}};}
test('discovery resumes later pages and redacts current subjects/cursor on completion',async()=>{
 const f=fixture();assert.deepEqual(await discoverPrivacyBatch({...f.options,batch:1}),{pages:1,examined:20,matched:20,complete:false,pending:false});assert.equal(f.stored.cursor,ids[19]);assert.equal(f.stored.pending,null);assert(!JSON.stringify(f.stored.seen).includes(ids[19]));
 assert.equal((await discoverPrivacyBatch(f.options)).complete,true);assert.deepEqual(f.pages,[null,ids[19],ids[39]]);assert.equal(f.stored.cursor,null);assert.equal(f.stored.pending,null);assert.deepEqual(f.stored.seen,[]);assert.equal((await discoverPrivacyBatch(f.options)).pages,0);assert.equal(new Set(f.observed.flatMap(row=>row.customers)).size,45);
});
test('a lost SQL response or journal write replays the same saved observation identity',async()=>{
 const f=fixture();f.failAt=3;await assert.rejects(()=>discoverPrivacyBatch({...f.options,batch:1}),/storage/);assert.equal(f.observed.length,1);const id=f.observed[0].id;assert.equal(f.stored.pending.id,id);f.failAt=null;await discoverPrivacyBatch({...f.options,batch:1});assert.equal(f.observed[1].id,id);assert.deepEqual(f.observed[1].customers,f.observed[0].customers);assert.equal(f.pages.length,1);
 const failed=fixture();await assert.rejects(()=>discoverPrivacyBatch({...failed.options,observe:async()=>{throw Error('network');}}),/network/);const pending=failed.stored.pending.id;await discoverPrivacyBatch({...failed.options,batch:1});assert.equal(failed.observed[0].id,pending);
});
test('unacknowledged pages cannot be discarded by restart, but a stale acknowledged cursor can restart explicitly',async()=>{
 const f=fixture();await assert.rejects(()=>discoverPrivacyBatch({...f.options,observe:async()=>{throw Error('offline');}}),/offline/);await assert.rejects(()=>discoverPrivacyBatch({...f.options,restart:true}),/unacknowledged/);await discoverPrivacyBatch({...f.options,batch:1});assert.equal((await discoverPrivacyBatch({...f.options,restart:true,batch:1})).pages,1);assert.equal(f.pages.at(-1),null);
});
test('provider loops, malformed pages and impossible acknowledgments retain the last durable state',async()=>{
 const f=fixture();await discoverPrivacyBatch({...f.options,batch:2});assert.equal(f.stored.cursor,ids[39]);
 await assert.rejects(()=>discoverPrivacyBatch({...f.options,page:async()=>({customers:[ids[0]],next:ids[19],count:1})}),/repeated/);assert.equal(f.stored.cursor,ids[39]);
 for(const result of [{customers:['not-a-game-id'],next:null,count:1},{customers:[ids[0]],next:null,count:0},{customers:[ids[0],ids[0]],next:null,count:2}])await assert.rejects(()=>discoverPrivacyBatch({...f.options,page:async()=>result}),/invalid/);
 await assert.rejects(()=>discoverPrivacyBatch({...f.options,observe:async()=>99}),/acknowledgment/);assert(f.stored.pending);assert.equal(f.stored.cursor,ids[39]);
});
test('mismatched deployment identities cannot resume another provider database journal',async()=>{
 const f=fixture();await discoverPrivacyBatch({...f.options,batch:1});for(const change of [{projectId:'proj_other'},{environment:'production'},{database:'https://other.example.invalid'}])await assert.rejects(()=>discoverPrivacyBatch({...f.options,identity:{...identity,...change}}),/another provider/);assert.equal(f.stored.cursor,ids[19]);
});
test('an orderly stop applies/checkpoints its current page and leaves the next for another run',async()=>{
 const f=fixture();let stopped=false;const result=await discoverPrivacyBatch({...f.options,halt:()=>stopped,observe:async(id,customers)=>{stopped=true;return f.options.observe(id,customers);}});assert.equal(result.pages,1);assert.equal(result.complete,false);assert.equal(f.stored.cursor,ids[19]);
 const empty=fixture();assert.equal((await discoverPrivacyBatch({...empty.options,halt:()=>true})).pages,0);assert.equal(empty.pages.length,0);
});
