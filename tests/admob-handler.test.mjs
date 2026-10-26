import test from 'node:test';import assert from 'node:assert/strict';
import {admobCallback} from '../supabase/functions/_shared/admob-handler.js';import {AdVerificationError} from '../supabase/functions/_shared/admob-ssv.js';
const offer='11111111-1111-4111-8111-111111111111',receipt={offerId:offer,transaction:'tx-1',unit:'unit',amount:1,item:'time',earnedAt:'2026-10-26T12:00:00Z',userHint:offer,proof:{signedQuery:'raw-encoded-query',signature:'verified',keyId:'1',publicKey:'public',verifiedAt:'2026-10-26T12:00:01Z'}};
test('the public callback waits for durable SQL acknowledgement and returns no balance or proof',async()=>{
 let finish,invoked=false;const handler=admobCallback({verifier:{verify:async url=>{assert(url.endsWith('?original=%20'));return receipt;}},admin:{rpc:(name,args)=>{invoked=true;assert.equal(name,'game_receive_admob_reward');assert.deepEqual(args.p_proof,receipt.proof);assert.equal(args.p_offer,offer);return new Promise(resolve=>finish=resolve);}}});
 let replied=false;const request=handler(new Request('https://project.example/functions/v1/reward-callback?original=%20')).then(response=>{replied=true;return response;});await new Promise(resolve=>setImmediate(resolve));assert.equal(invoked,true);assert.equal(replied,false);finish({data:{review:true},error:null});const response=await request;assert.equal(response.status,200);assert.deepEqual(await response.json(),{received:true});assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('forged or unavailable verification never reaches SQL and private exceptions do not leak',async()=>{
 for(const failure of [new AdVerificationError(),new AdVerificationError('Reward verification keys are temporarily unavailable',503),Error('private-token-provider-response')]){
  let writes=0;const handler=admobCallback({verifier:{verify:async()=>{throw failure;}},admin:{rpc:async()=>writes++}}),response=await handler(new Request('https://project.example/reward-callback'));assert.equal(writes,0);assert.equal(response.status,failure instanceof AdVerificationError?failure.status:503);assert(!(await response.text()).includes('private-token'));
 }
});
test('SQL rejection or transport failure returns retryable failure without a false receipt acknowledgement',async()=>{
 for(const rpc of [async()=>({error:{message:'private SQL details'}}),async()=>{throw Error('private service key');}]){const handler=admobCallback({verifier:{verify:async()=>receipt},admin:{rpc}}),response=await handler(new Request('https://project.example/reward-callback'));assert.equal(response.status,503);assert(!(await response.text()).includes('private'));}
});
test('wrong method and signed non-game identifiers do not touch SQL',async()=>{
 let reads=0,writes=0;const handler=admobCallback({verifier:{verify:async()=>{reads++;return{...receipt,offerId:'another-game'};}},admin:{rpc:async()=>writes++}});
 assert.equal((await handler(new Request('https://project.example/reward-callback',{method:'POST'}))).status,405);assert.equal(reads,0);assert.deepEqual(await(await handler(new Request('https://project.example/reward-callback'))).json(),{ignored:true});assert.equal(writes,0);
});
