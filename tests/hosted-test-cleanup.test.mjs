import test from 'node:test';import assert from 'node:assert/strict';import {resolveHostedTestMailReviews} from '../scripts/hosted-test-cleanup.mjs';
const email='brick-launch-a-11111111-1111-1111-1111-111111111111@example.test',processor={provider:'mail_delivery',scope:'configured-auth-smtp',environment:'database'};
function fake(rows){const calls=[],filters=[];const chain={select(){return chain;},in(key,value){filters.push([key,value]);return chain;},eq(key,value){filters.push([key,value]);return filters.length===3?Promise.resolve({data:rows,error:null}):chain;}};return{calls,filters,from:()=>chain,rpc:async(name,args)=>{calls.push({name,args});return{data:true,error:null};}};}
test('hosted cleanup resolves only owned synthetic mail reviews and records retention without asserting erasure',async()=>{
 const admin=fake([{id:crypto.randomUUID(),subject:email,processor}]);assert.equal(await resolveHostedTestMailReviews(admin,[email]),1);assert.deepEqual(admin.filters,[['subject',[email]],['state','manual_review'],['last_code','delivery_retention_review']]);assert.equal(admin.calls[0].args.p_outcome,'manual_retained');assert(!JSON.stringify(admin.calls).includes(email));
});
test('real inboxes, foreign subjects and provider cleanup jobs cannot be resolved by hosted test cleanup',async()=>{
 const admin=fake([]);for(const emails of [['owner@example.com'],[email,email]])await assert.rejects(()=>resolveHostedTestMailReviews(admin,emails),/Invalid hosted/);assert.equal(admin.filters.length,0);
 for(const row of [{subject:email,processor:{...processor,provider:'revenuecat'}},{subject:email,processor:{...processor,scope:'other'}},{subject:email.replace('-a-','-b-'),processor}]){const boundary=fake([{id:crypto.randomUUID(),...row}]);await assert.rejects(()=>resolveHostedTestMailReviews(boundary,[email]),/Unexpected/);assert.equal(boundary.calls.length,0);}
});
