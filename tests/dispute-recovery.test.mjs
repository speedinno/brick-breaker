import test from 'node:test';import assert from 'node:assert/strict';import {recoverDisputeBatch} from '../scripts/dispute-recovery.mjs';
import {spawnSync} from 'node:child_process';import {mkdtemp,readdir,rmdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
const identity={scope:'web:game',environment:'sandbox',database:'https://fixture.example'},ids=Array.from({length:105},(_,index)=>'disp_'+index);
function fixture(){let stored=null,failAfter=null,writes=0;const applied=[],pages=[];return{applied,pages,get stored(){return structuredClone(stored);},set failAfter(value){failAfter=value;},options:{identity,read:async()=>structuredClone(stored),write:async value=>{if(failAfter!==null&&++writes>=failAfter)throw Error('storage');stored=structuredClone(value);},page:async skip=>{pages.push(skip);return{ids:ids.slice(skip,skip+100),next:skip+100<ids.length?skip+100:null};},reconcile:async id=>{applied.push(id);return{id};}}};}
test('recovery checkpoints a full page, resumes across processes and reaches later pages',async()=>{
 const f=fixture();assert.equal((await recoverDisputeBatch({...f.options,batch:20})).pending,80);assert.equal(f.stored.skip,0);assert.equal((await recoverDisputeBatch({...f.options,batch:85})).complete,true);assert.deepEqual(f.pages,[0,100]);assert.equal(new Set(f.applied).size,105);assert.equal((await recoverDisputeBatch(f.options)).processed,0);
});
test('failed verification retains the exact opportunity at the durable head for retry',async()=>{
 const f=fixture();await assert.rejects(()=>recoverDisputeBatch({...f.options,reconcile:async()=>{throw Error('offline');}}),/offline/);assert.equal(f.stored.pending[0],'disp_0');assert.equal((await recoverDisputeBatch({...f.options,batch:1})).processed,1);assert.equal(f.applied[0],'disp_0');assert.equal(f.stored.pending[0],'disp_1');
});
test('a write failure after a verified application replays it instead of skipping financial evidence',async()=>{
 const f=fixture();f.failAfter=3;await assert.rejects(()=>recoverDisputeBatch({...f.options,batch:1}),/storage/);assert.equal(f.applied.length,1);assert.equal(f.stored.pending[0],'disp_0');f.failAfter=null;await recoverDisputeBatch({...f.options,batch:1});assert.deepEqual(f.applied,['disp_0','disp_0']);
});
test('corrupt or different-environment journals cannot silently skip to another provider account',async()=>{
 const f=fixture();await recoverDisputeBatch({...f.options,batch:1});await assert.rejects(()=>recoverDisputeBatch({...f.options,identity:{...identity,environment:'production'}}),/different provider/);await assert.rejects(()=>recoverDisputeBatch({...f.options,restart:true}),/Finish/);
});
test('JSONB object-key reordering preserves identity while a changed identity still cannot resume a journal',async()=>{
 const f=fixture();await recoverDisputeBatch({...f.options,batch:1});const read=f.options.read;f.options.read=async()=>{const state=await read();state.identity=Object.fromEntries(Object.entries(state.identity).reverse());return state;};assert.equal((await recoverDisputeBatch({...f.options,batch:1})).processed,1);await assert.rejects(()=>recoverDisputeBatch({...f.options,identity:{...identity,database:'https://another.example'}}),/different provider/);
});
test('provider loops and malformed pages stop without dropping the last durable cursor',async()=>{
 const f=fixture();await recoverDisputeBatch({...f.options,batch:100});assert.equal(f.stored.skip,100);await assert.rejects(()=>recoverDisputeBatch({...f.options,page:async skip=>({ids:ids.slice(0,100),next:skip+100})}),/repeated/);assert.equal(f.stored.skip,100);
 await assert.rejects(()=>recoverDisputeBatch({...f.options,page:async()=>({ids:['not-a-dispute'],next:null})}),/invalid/);assert.equal(f.stored.skip,100);
});
test('only a completed scan can restart, and review/ignored counts are observations rather than credits',async()=>{
 const f=fixture();const result=await recoverDisputeBatch({...f.options,batch:200,reconcile:async id=>({ignored:id==='disp_0',disputeReview:id==='disp_1'})});assert.equal(result.complete,true);assert.equal(result.reviews,1);assert.equal(result.ignored,1);assert.equal((await recoverDisputeBatch({...f.options,restart:true,batch:1})).complete,false);
});

test('an orderly interruption finishes the current observation and retains the next exact cursor',async()=>{
 const f=fixture();let stopped=false;const result=await recoverDisputeBatch({...f.options,halt:()=>stopped,reconcile:async id=>{f.applied.push(id);stopped=true;return{};}});assert.equal(result.processed,1);assert.equal(result.complete,false);assert.equal(f.stored.pending[0],'disp_1');
});

test('the actual CLI refuses missing provider setup before making a journal or claiming success',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'bb-dispute-cli-'));
 try{const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/reconcile-web-disputes.mjs',import.meta.url)),'--batch','1'],{cwd:directory,encoding:'utf8',env:{...process.env,SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',RAZORPAY_CONFIG_JSON:'',RAZORPAY_KEY_ID:'',RAZORPAY_KEY_SECRET:'',RAZORPAY_WEBHOOK_SECRETS_JSON:''}});assert.equal(result.status,1);assert.match(result.stderr,/not configured/);assert.equal(result.stdout,'');assert.deepEqual(await readdir(directory),[]);}finally{await rmdir(directory);}
});
