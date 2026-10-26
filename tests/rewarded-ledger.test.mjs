import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateGame} from './db-migrations.mjs';
import {generateKeyPairSync,sign} from 'node:crypto';
import {AdMobVerifier} from '../supabase/functions/_shared/admob-ssv.js';
import {admobCallback} from '../supabase/functions/_shared/admob-handler.js';
let db;const id=()=>crypto.randomUUID();
async function value(sql,args=[]){return(await db.query('select public.'+sql+' as value',args)).rows[0].value;}
async function asUser(user,sql,args=[]){await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`);try{return await value(sql,args);}finally{await db.exec('reset role');}}
async function user(){const result=id();await db.query('insert into auth.users values($1)',[result]);return result;}
const state=user=>asUser(user,'game_ad_state()');
const prepare=(user,offer=id(),device=id(),placement='android-v1')=>asUser(user,'game_prepare_ad($1,$2,$3)',[offer,device,placement]);
const commit=(user,offer,device)=>asUser(user,'game_commit_ad($1,$2)',[offer,device]);
const cancel=(user,offer,device,web=false)=>asUser(user,'game_cancel_ad($1,$2,$3)',[offer,device,web]);
const grant=(offer,transaction=id(),{unit='123456789',amount=1,item='autoplay_time',hint=offer,earned=null}={})=>value("game_grant_ad($1,'admob',$2,$3,$4,$5,coalesce($6::timestamptz,now()),$7)",[offer,transaction,unit,amount,item,earned,hint]);
function signedCallback(offer,unit='123456789'){
 const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),query=new URLSearchParams({ad_network:'1953547073528090325',ad_unit:unit,custom_data:offer,reward_amount:'1',reward_item:'autoplay_time',timestamp:String(Date.now()),transaction_id:id().replaceAll('-',''),user_id:offer}).toString();
 const signature=sign('sha256',Buffer.from(query),key.privateKey).toString('base64url'),verifier=new AdMobVerifier({fetch:async()=>Response.json({keys:[{keyId:1,base64:key.publicKey.export({type:'spki',format:'der'}).toString('base64')}]})});
 return{verifier,url:'https://local.example/webhooks/admob?'+query+'&signature='+signature+'&key_id=1'};
}
async function signedReceipt(offer,unit='123456789'){const fixture=signedCallback(offer,unit);return fixture.verifier.verify(fixture.url);}
const receive=receipt=>value('game_receive_admob_reward($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[receipt.offerId,receipt.transaction,receipt.unit,receipt.amount,receipt.item,receipt.earnedAt,receipt.userHint,JSON.stringify(receipt.proof)]);
before(async()=>{db=new PGlite();await db.exec("create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");await migrateGame(db);
 await db.exec("insert into public.game_ad_placements(id,provider,platform,environment,request_unit,verification_unit,reward_amount,reward_item,active) values('android-v1','admob','android','production','ca-app-pub-fixture/123456789','123456789',1,'autoplay_time',true),('ios-v1','admob','ios','production','ca-app-pub-fixture/123456789','123456789',1,'autoplay_time',true),('web-v1','h5','web','production','ca-pub-fixture',null,null,null,true);");
});after(async()=>db?.close());
test('COM-09/25: pending offers reserve a shared daily allowance across all official editions',async()=>{
 const owner=await user();await prepare(owner);await prepare(owner,id(),id(),'ios-v1');await prepare(owner,id(),id(),'web-v1');assert.equal((await state(owner)).remaining,0);assert.equal((await state(owner)).wallet.availableMs,0);
 await assert.rejects(()=>prepare(owner),/No rewarded opportunities/);
});
test('one native reward is credited once; closing after earning never removes its grant',async()=>{
 const owner=await user(),offer=id(),device=id(),transaction=id();await prepare(owner,offer,device);await commit(owner,offer,device);await grant(offer,transaction);await grant(offer,transaction);await cancel(owner,offer,device);
 assert.equal((await state(owner)).wallet.availableMs,30000);assert.equal((await state(owner)).remaining,2);
 const next=id();await prepare(owner,next,device);await commit(owner,next,device);await assert.rejects(()=>grant(next,transaction),/transaction identity conflict/);assert.equal((await state(owner)).wallet.availableMs,30000);
});
test('native dismissal stays pending and a valid delayed server callback retains its original promise',async()=>{
 const owner=await user(),offer=id(),device=id();await prepare(owner,offer,device);await commit(owner,offer,device);await cancel(owner,offer,device);
 assert.equal((await state(owner)).pending[0].state,'awaiting');assert.equal((await state(owner)).remaining,2);assert.equal((await state(owner)).wallet.availableMs,0);
 await grant(offer);assert.equal((await state(owner)).wallet.availableMs,30000);
});
test('a prepared cancellation or expired preparation returns its allowance without permitting stale show',async()=>{
 const owner=await user(),offer=id(),device=id();await prepare(owner,offer,device);await cancel(owner,offer,device);assert.equal((await state(owner)).remaining,3);await assert.rejects(()=>commit(owner,offer,device),/expired/);
 const expired=id();await prepare(owner,expired,device);await db.query("update public.game_ad_offers set prepare_until=now()-interval '1 second' where id=$1",[expired]);assert.equal((await state(owner)).remaining,3);await assert.rejects(()=>commit(owner,expired,device),/expired/);await prepare(owner);assert.equal((await db.query('select state from public.game_ad_offers where id=$1',[expired])).rows[0].state,'cancelled');
});
test('only one display can be committed at a time, without charging failed attempts as earned rewards',async()=>{
 const owner=await user(),a=id(),b=id(),device=id();await prepare(owner,a,device);await prepare(owner,b,device);await commit(owner,a,device);await assert.rejects(()=>commit(owner,b,device),/Another reward/);await cancel(owner,a,device);await commit(owner,b,device);assert.equal((await state(owner)).wallet.availableMs,0);
});
test('wrong unit/reward/user hint or a completion outside the committed window cannot grant',async()=>{
 const owner=await user(),offer=id(),device=id();await prepare(owner,offer,device);await assert.rejects(()=>grant(offer),/timestamp/);await commit(owner,offer,device);
 for(const options of [{unit:'another-unit'},{amount:9},{item:'coins'},{hint:id()}])await assert.rejects(()=>grant(offer,id(),options),/placement verification/);
 await assert.rejects(()=>grant(offer,id(),{earned:'2000-01-01T00:00:00Z'}),/timestamp/);assert.equal((await state(owner)).wallet.availableMs,0);
});
test('late rewards use the original UTC bucket and amount after configuration or placement retirement',async()=>{
 const owner=await user(),offer=id(),device=id();await prepare(owner,offer,device);await commit(owner,offer,device);
 await db.query("update public.game_ad_offers set eligibility_day=eligibility_day-1,show_requested_at=now()-interval '1 day' where id=$1",[offer]);await db.exec("update public.game_economy_config set current=false;insert into public.game_economy_config(version,current,settings) select 'reward-test-v2',true,jsonb_set(settings,'{rewardedMs}','45000') from public.game_economy_config where version='2026-10-v1';update public.game_ad_placements set active=false where id='android-v1';");
 try{const earned=new Date(Date.now()-86400000+1000).toISOString();await grant(offer,id(),{earned});const result=await state(owner);assert.equal(result.wallet.availableMs,30000);assert.equal(result.remaining,3);assert.equal(result.milliseconds,45000);}finally{await db.exec("update public.game_economy_config set current=false;update public.game_economy_config set current=true where version='2026-10-v1';update public.game_ad_placements set active=true where id='android-v1';");}
});
test('browser SDK rewards are explicitly client-trusted, require a committed offer, and never bypass the cap',async()=>{
 const owner=await user(),offer=id(),device=id();await prepare(owner,offer,device,'web-v1');await assert.rejects(()=>asUser(owner,'game_claim_web_ad($1,$2,now())',[offer,device]),/timestamp/);await commit(owner,offer,device);await asUser(owner,'game_claim_web_ad($1,$2,now())',[offer,device]);await asUser(owner,'game_claim_web_ad($1,$2,now())',[offer,device]);assert.equal((await state(owner)).wallet.availableMs,30000);
 const basis=(await db.query('select verification_basis from public.game_ad_transactions where offer_id=$1',[offer])).rows[0].verification_basis;assert.equal(basis,'client_sdk');
});
test('account deletion removes the device link and late native completion cannot mint into a recreated identity',async()=>{
 const owner=await user(),offer=id(),device=id();await prepare(owner,offer,device);await commit(owner,offer,device);await db.query('delete from auth.users where id=$1',[owner]);assert.equal((await grant(offer)).credited,false);
 const row=(await db.query('select owner_user_id,device_id,deleted_at from public.game_ad_offers where id=$1',[offer])).rows[0];assert.equal(row.owner_user_id,null);assert.equal(row.device_id,null);assert(row.deleted_at);
 const other=await user();await assert.rejects(()=>prepare(other,offer,device),/identity conflict/);assert.equal((await state(other)).wallet.availableMs,0);
});
test('native verification is private and account/device or browser-channel substitution cannot mint',async()=>{
 const owner=await user(),other=await user(),offer=id(),device=id();await prepare(owner,offer,device);await assert.rejects(()=>commit(other,offer,device),/Unknown/);await assert.rejects(()=>commit(owner,offer,id()),/Unknown/);await commit(owner,offer,device);
 await assert.rejects(()=>asUser(owner,"game_grant_ad($1,'admob','forged','123456789',1,'autoplay_time',now(),$2)",[offer,offer]),/permission denied/);
 await assert.rejects(()=>asUser(owner,'game_claim_web_ad($1,$2,now())',[offer,device]),/Unknown browser/);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${other}',false);`);try{assert.equal((await db.query('select * from public.game_ad_offers')).rows.length,0);await assert.rejects(()=>db.exec("update public.game_ad_placements set active=true"),/permission denied/);}finally{await db.exec('reset role');}
});
test('ECDSA-verified callback reaches the real ledger once and retains its verification evidence',async()=>{
 const owner=await user(),offer=id(),device=id();await prepare(owner,offer,device);await commit(owner,offer,device);const receipt=await signedReceipt(offer);assert.equal((await receive(receipt)).credited,true);await receive(receipt);
 assert.equal((await state(owner)).wallet.availableMs,30000);const stored=(await db.query('select * from public.game_ad_verifications where transaction_id=$1',[receipt.transaction])).rows[0];assert.equal(stored.state,'applied');assert.equal(stored.deliveries,2);assert.equal(stored.proof.signedQuery,receipt.proof.signedQuery);assert.equal(stored.proof.publicKey,receipt.proof.publicKey);
 await assert.rejects(()=>asUser(owner,'game_receive_admob_reward($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[receipt.offerId,receipt.transaction,receipt.unit,receipt.amount,receipt.item,receipt.earnedAt,receipt.userHint,JSON.stringify(receipt.proof)]),/permission denied/);
});
test('a verified callback with a mapping conflict is retained for review without silently granting or losing its proof',async()=>{
 const owner=await user(),offer=id(),device=id();await prepare(owner,offer,device);await commit(owner,offer,device);const receipt=await signedReceipt(offer,'987654321'),result=await receive(receipt);assert.equal(result.review,true);assert.equal((await state(owner)).wallet.availableMs,0);
 const stored=(await db.query('select * from public.game_ad_verifications where transaction_id=$1',[receipt.transaction])).rows[0];assert.equal(stored.state,'review');assert.equal(stored.review_reason,'Reward placement verification failed');assert(stored.proof.signature);await receive(receipt);assert.equal((await db.query('select deliveries from public.game_ad_verifications where transaction_id=$1',[receipt.transaction])).rows[0].deliveries,2);
});
test('the real public callback verifies OpenSSL ECDSA and acknowledges a committed PostgreSQL grant once',async()=>{
 const owner=await user(),offer=id(),device=id();await prepare(owner,offer,device);await commit(owner,offer,device);const fixture=signedCallback(offer);
 const handler=admobCallback({verifier:fixture.verifier,admin:{rpc:async(name,args)=>{assert.equal(name,'game_receive_admob_reward');return{data:await value('game_receive_admob_reward($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[args.p_offer,args.p_transaction,args.p_unit,args.p_amount,args.p_item,args.p_earned_at,args.p_hint,JSON.stringify(args.p_proof)]),error:null};}}});
 for(let n=0;n<2;n++){const response=await handler(new Request(fixture.url));assert.equal(response.status,200);assert.deepEqual(await response.json(),{received:true});assert.equal((await state(owner)).wallet.availableMs,30000);}
 assert.equal((await handler(new Request(fixture.url.replace('reward_amount=1','reward_amount=2')))).status,400);assert.equal((await state(owner)).wallet.availableMs,30000);
});
test('closing an authorized opportunity before invoking the SDK releases its unused slot',async()=>{
 const owner=await user(),offer=id(),device=id();await prepare(owner,offer,device);await commit(owner,offer,device);await asUser(owner,'game_cancel_ad($1,$2,false,true)',[offer,device]);assert.equal((await state(owner)).remaining,3);assert.equal((await state(owner)).wallet.availableMs,0);
});
test('bounded automatic retry heals a transient grant failure from stored verified proof without inflating provider deliveries',async()=>{
 const owner=await user(),offer=id(),device=id();await prepare(owner,offer,device);await commit(owner,offer,device);const receipt=await signedReceipt(offer);
 await db.exec("create function public.qa_fail_reward() returns trigger language plpgsql as $$begin if new.source='rewarded' then raise exception 'Temporary fixture failure';end if;return new;end $$;create trigger qa_fail_reward before insert on game_credit_lots for each row execute function qa_fail_reward();");
 try{assert.equal((await receive(receipt)).review,true);assert.equal((await state(owner)).wallet.availableMs,0);}finally{await db.exec('drop trigger qa_fail_reward on game_credit_lots;drop function qa_fail_reward();');}
 const result=await value('game_retry_admob_rewards(20)');assert.equal(result.applied,1);assert.equal((await state(owner)).wallet.availableMs,30000);assert.equal((await value('game_retry_admob_rewards(20)')).processed,0);const stored=(await db.query('select deliveries,retry_attempts,state from game_ad_verifications where transaction_id=$1',[receipt.transaction])).rows[0];assert.deepEqual(stored,{deliveries:1,retry_attempts:1,state:'applied'});
});
test('mapping conflicts remain manual and repeated transient failures back off then stop after eight automatic attempts',async()=>{
 const owner=await user(),offer=id(),device=id();await prepare(owner,offer,device);await commit(owner,offer,device);const receipt=await signedReceipt(offer);
 await db.exec("create function public.qa_fail_reward() returns trigger language plpgsql as $$begin if new.source='rewarded' then raise exception 'Temporary fixture failure';end if;return new;end $$;create trigger qa_fail_reward before insert on game_credit_lots for each row execute function qa_fail_reward();");
 try{await receive(receipt);for(let n=1;n<=8;n++){await db.query('update game_ad_verifications set next_retry_at=now() where transaction_id=$1',[receipt.transaction]);const result=await value('game_retry_admob_rewards(1)');assert.equal(result.processed,1);assert.equal((await db.query('select retry_attempts from game_ad_verifications where transaction_id=$1',[receipt.transaction])).rows[0].retry_attempts,n);assert.equal((await value('game_retry_admob_rewards(1)')).processed,0);}}
 finally{await db.exec('drop trigger qa_fail_reward on game_credit_lots;drop function qa_fail_reward();');}
 assert.equal((await value('game_retry_admob_rewards(100)')).processed,0);assert.equal((await state(owner)).wallet.availableMs,0);assert((await value('game_operation_status()')).adRetryExhausted>=1);await receive(receipt);assert.equal((await state(owner)).wallet.availableMs,30000);
});
