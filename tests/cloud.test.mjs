import test from 'node:test';import assert from 'node:assert/strict';
import {CloudAccount} from '../dist/cloud.js';
const settings={supabaseUrl:'https://example.supabase.co/',publishableKey:'sb_publishable_example_test_key'};
function make(invoke){return new CloudAccount(()=>{},{settings,clientFactory:()=>({functions:{invoke}})});}
test('cloud response from an old identity cannot populate the new account state',async()=>{
 let finish;const cloud=make(()=>new Promise(resolve=>finish=resolve));cloud.session={user:{id:'a'}};const pending=cloud.progress();cloud.session={user:{id:'b'}};finish({data:{privateHistory:'a'}});
 await assert.rejects(()=>pending,/account changed/);assert.equal(cloud.state,null);
});

test('failed cloud reads invalidate the synced indicator, and a real retry clears the failure',async()=>{
 let fail=false,updates=0;const cloud=make(async()=>fail?{error:{}}:{data:{starter_completed:[1]}});cloud.onStatus=()=>updates++;cloud.session={user:{id:'a'}};
 await cloud.progress();assert.equal(cloud.syncError,null);fail=true;await assert.rejects(()=>cloud.progress());assert(cloud.syncError);assert.deepEqual(cloud.state.starter_completed,[1]);
 fail=false;await cloud.progress();assert.equal(cloud.syncError,null);assert.equal(updates,3);
});

test('SDK sign-in event and verify completion await a single account load',async()=>{
 let callback,finish,loads=0;const session={user:{id:'a'}};
 const cloud=new CloudAccount(async()=>{loads++;await new Promise(resolve=>finish=resolve);},{settings,clientFactory:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(fn){callback=fn;return{data:{subscription:{}}};},verifyOtp:async()=>{callback('SIGNED_IN',session);return{data:{session}};}}})});
 await cloud.init();let done=false;const verifying=cloud.verifyCode('qa@example.test','12345678').then(()=>done=true);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(loads,1);assert.equal(done,false);finish();await verifying;assert.equal(done,true);assert.equal(loads,1);
});
test('cloud binds outgoing requests to the current identity and handles server/network failures',async()=>{
 let outgoing;const cloud=make(async(_,{body})=>{outgoing=body;return{data:{ok:true}};});cloud.session={user:{id:'a'}};
 assert.deepEqual(await cloud.api('state',{accountId:'other',action:'delete'}),{ok:true});assert.equal(outgoing.accountId,'a');assert.equal(outgoing.action,'state');
 for(const [status,network]of [[409,false],[503,true],[undefined,true]]){const c=make(async()=>({error:{context:{status,json:async()=>({error:'Try again'})}}}));c.session={user:{id:'a'}};await assert.rejects(()=>c.progress(),e=>e.message==='Try again'&&e.network===network);}
});

function externalCloud(getSession=async()=>({data:{session:{user:{id:'a'},access_token:'refreshed-test-token'}}})){
 const cloud=new CloudAccount(()=>{},{settings:{...settings,apiUrl:'https://api.example.test/game-api'},clientFactory:()=>({auth:{getSession},functions:{invoke:()=>{throw Error('Must not call Supabase Edge Functions');}}})});
 cloud.session={user:{id:'a'},access_token:'old-test-token'};return cloud;
}
test('external API uses the refreshed Supabase bearer and binds the action/account',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let outgoing;
 globalThis.fetch=async(url,init)=>{outgoing={url,...init};return Response.json({highest_unlocked:12});};
 const cloud=externalCloud();assert.deepEqual(await cloud.api('state',{action:'delete',accountId:'other'}),{highest_unlocked:12});
 assert.equal(outgoing.url,'https://api.example.test/game-api');assert.equal(outgoing.method,'POST');assert.equal(outgoing.headers.Authorization,'Bearer refreshed-test-token');assert(outgoing.signal instanceof AbortSignal);
 assert.deepEqual(JSON.parse(outgoing.body),{action:'state',accountId:'a'});
});
test('external API preserves HTTP errors and treats transport/invalid responses as retryable',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const cloud=externalCloud();
 for(const [status,network]of [[400,false],[401,false],[409,false],[503,true]]){
  globalThis.fetch=async()=>Response.json({error:'Controlled failure'},{status});
  await assert.rejects(()=>cloud.progress(),e=>e.status===status&&e.network===network&&e.message==='Controlled failure');
 }
 for(const fetcher of [async()=>{throw Error('offline');},async()=>new Response('invalid JSON')]){
  globalThis.fetch=fetcher;await assert.rejects(()=>cloud.progress(),e=>e.network===true);
 }
});
test('external API sends no request when refresh changes accounts or the session is absent',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let requests=0;
 globalThis.fetch=async()=>{requests++;return Response.json({});};
 for(const session of [null,{user:{id:'b'},access_token:'another-account'}]){
  const cloud=externalCloud(async()=>({data:{session}}));await assert.rejects(()=>cloud.progress(),e=>e.status===(session?409:401)&&!e.network);
 }
 let resolve;const cloud=externalCloud(()=>new Promise(done=>resolve=done)),pending=cloud.progress();cloud.session={user:{id:'b'}};
 resolve({data:{session:{user:{id:'a'},access_token:'old-account'}}});await assert.rejects(()=>pending,/account changed/);assert.equal(requests,0);
});
test('external API rejects a response received after switching accounts',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let resolve;
 globalThis.fetch=()=>new Promise(done=>resolve=done);const cloud=externalCloud(),pending=cloud.progress();
 await new Promise(done=>setImmediate(done));cloud.session={user:{id:'b'}};resolve(Response.json({privateHistory:'a'}));
 await assert.rejects(()=>pending,/account changed/);assert.equal(cloud.state,null);
});
