import test from 'node:test';import assert from 'node:assert/strict';
import {CloudAccount} from '../dist/cloud.js';
const settings={supabaseUrl:'https://example.supabase.co/',publishableKey:'sb_publishable_example_test_key'};
function make(invoke){return new CloudAccount(()=>{},{settings,clientFactory:()=>({functions:{invoke}})});}
test('cloud response from an old identity cannot populate the new account state',async()=>{
 let finish;const cloud=make(()=>new Promise(resolve=>finish=resolve));cloud.session={user:{id:'a'}};const pending=cloud.progress();cloud.session={user:{id:'b'}};finish({data:{privateHistory:'a'}});
 await assert.rejects(()=>pending,/account changed/);assert.equal(cloud.state,null);
});
test('cloud binds outgoing requests to the current identity and handles server/network failures',async()=>{
 let outgoing;const cloud=make(async(_,{body})=>{outgoing=body;return{data:{ok:true}};});cloud.session={user:{id:'a'}};
 assert.deepEqual(await cloud.api('state',{accountId:'other',action:'delete'}),{ok:true});assert.equal(outgoing.accountId,'a');assert.equal(outgoing.action,'state');
 for(const [status,network]of [[409,false],[503,true],[undefined,true]]){const c=make(async()=>({error:{context:{status,json:async()=>({error:'Try again'})}}}));c.session={user:{id:'a'}};await assert.rejects(()=>c.progress(),e=>e.message==='Try again'&&e.network===network);}
});
