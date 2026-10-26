import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RevenueCatVerifier,equalSecret} from '../supabase/functions/_shared/revenuecat.js';
const user='11111111-1111-4111-8111-111111111111',now=1793000000000;
const product={object:'product',id:'prodA',app_id:'appA',store_identifier:'time300_v1',type:'consumable',app:{object:'app',id:'appA',project_id:'projA',type:'play_store',play_store:{package_name:'com.speedinno.brickbreaker'}}};
const purchase={object:'purchase',id:'purchA',customer_id:user,original_customer_id:user,product_id:'prodA',purchased_at:now-1000,quantity:1,status:'owned',environment:'production',store:'play_store',store_purchase_identifier:'GPA.1234',ownership:'purchased'};
function setup({change=p=>p,productChange=p=>p,next=null,response,fetchError=false}={}){
 const calls=[];const client=new RevenueCatVerifier({apiKey:'secret-not-a-real-key',projectId:'projA',products:[{id:'prodA',appId:'appA',bundleId:'com.speedinno.brickbreaker',storeId:'time300_v1',platform:'android'}],now:()=>now,fetch:async(url,options)=>{
  calls.push({url,options});if(fetchError)throw Error('private provider error');
  if(response)return response();
  return Response.json(url.includes('/products/')?productChange({...product}):{object:'list',items:[change({...purchase})],next_page:next});
 }});return {client,calls};
}
test('authoritative native purchase lookup binds account, app, product, store and environment',async()=>{
 const {client,calls}=setup(),page=await client.page(user);assert.equal(page.next,null);assert.deepEqual(page.records,[{user,provider:'revenuecat',scope:'play_store:com.speedinno.brickbreaker',environment:'production',transaction:'GPA.1234',product:'time300_v1',quantity:1,state:'owned',purchasedAt:new Date(now-1000).toISOString(),financials:{quality:'missing',country:null,grossMicros:null,commissionMicros:null,taxMicros:null,proceedsMicros:null}}]);
 await client.page(user);assert.equal(calls.filter(c=>c.url.includes('/products/')).length,1);assert(calls.every(c=>c.options.redirect==='error'&&c.url.startsWith('https://api.revenuecat.com/v2/projects/projA/')));
});
test('forged family, transferred, wrong-store, sandbox, quantity and future purchases fail closed',async()=>{
 for(const changes of [{ownership:'family_shared'},{customer_id:crypto.randomUUID()},{original_customer_id:crypto.randomUUID()},{store:'app_store'},{environment:'sandbox'},{quantity:0},{quantity:1.5},{status:'pending'},{purchased_at:now+300001}])await assert.rejects(()=>setup({change:p=>({...p,...changes})}).client.page(user),/verification is unavailable/);
});
test('provider product metadata must confirm native app and consumable type',async()=>{
 for(const changes of [{app_id:'otherApp'},{app:{...product.app,play_store:{package_name:'com.other.app'}}},{app:{...product.app,project_id:'differentProject'}},{store_identifier:'otherSku'},{type:'subscription'},{object:'entitlement'}])await assert.rejects(()=>setup({productChange:p=>({...p,...changes})}).client.page(user),/verification is unavailable/);
 const {client}=setup({productChange:p=>({...p,type:'one_time',one_time:{is_consumable:true}})});assert.equal((await client.page(user)).records.length,1);
});
test('unknown products never mint and refunded authoritative states are retained',async()=>{
 assert.deepEqual((await setup({change:p=>({...p,product_id:'unrelated'})}).client.page(user)).records,[]);
 assert.equal((await setup({change:p=>({...p,status:'refunded'})}).client.page(user)).records[0].state,'refunded');
});
test('pagination cannot exfiltrate provider authorization or loop forever',async()=>{
 const valid='/v2/projects/projA/customers/'+user+'/purchases?starting_after=purchB';assert.equal((await setup({next:valid}).client.page(user)).next,'purchB');
 for(const next of ['https://attacker.example'+valid,'https://user:pass@api.revenuecat.com'+valid,valid.replace('/customers/','/products/'),valid+'#fragment',valid.replace('purchB','../escape')])await assert.rejects(()=>setup({next}).client.page(user),/verification is unavailable/);
 await assert.rejects(()=>setup({next:valid}).client.page(user,'purchB'),/verification is unavailable/);
});
test('webhook transaction is only a hint; authoritative returned transaction must match',async()=>{
 assert.equal((await setup().client.transaction('GPA.1234')).length,1);
 await assert.rejects(()=>setup({change:p=>({...p,store_purchase_identifier:'other'})}).client.transaction('GPA.1234'),/verification is unavailable/);
});
test('provider failures and oversized responses expose no private diagnostics',async()=>{
 for(const options of [{fetchError:true},{response:()=>new Response('private-secret',{status:403})},{response:()=>new Response('x'.repeat(524289))},{response:()=>new Response('bad-json') }])await assert.rejects(()=>setup(options).client.page(user),error=>!error.message.includes('private')&&error.message.includes('verification is unavailable'));
});
test('webhook authentication requires a configured high-entropy secret',async()=>{
 const secret='Bearer '+'x'.repeat(48);assert.equal(await equalSecret(secret,secret),true);assert.equal(await equalSecret(secret+'x',secret),false);assert.equal(await equalSecret('',null),false);assert.equal(await equalSecret('short','short'),false);
});
test('moving RevenueCat projects preserves the store transaction and immutable benefit identity',async()=>{
 const original=(await setup().client.page(user)).records[0];
 const migrated=new RevenueCatVerifier({apiKey:'different-secret',projectId:'projB',products:[{id:'prodB',appId:'appB',bundleId:'com.speedinno.brickbreaker',storeId:'time300_v1',platform:'android'}],now:()=>now,fetch:async url=>Response.json(url.includes('/products/')?{...product,id:'prodB',app_id:'appB',app:{...product.app,id:'appB',project_id:'projB'}}:{object:'list',items:[{...purchase,product_id:'prodB'}],next_page:null})});
 assert.deepEqual((await migrated.page(user)).records[0],original);
});
