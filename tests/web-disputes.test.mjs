import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrateGame} from './db-migrations.mjs';import {createWebCommerceFixture} from './web-commerce-fixture.mjs';
let db;const id=()=>crypto.randomUUID();
before(async()=>{db=new PGlite();await db.exec("create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");await migrateGame(db);await db.query("insert into public.game_catalog(version,level,definition,canonical_layout,layout_hash) values(3,1,'{}',$1,$2)",['b'.repeat(2704),'a'.repeat(64)]);});after(async()=>db?.close());
async function setup({confirm=true}={}){
 const user=id();await db.query('insert into auth.users values($1)',[user]);const fixture=await createWebCommerceFixture(db,user),intentId=id(),api=(action,body={})=>fixture.handle({accountId:user,action,...body});
 const quote=await api('purchase-web-order',{intentId,priceId:fixture.priceId}),callback=fixture.capture(quote.orderId),payment=fixture.payments.get(callback.razorpay_payment_id);
 if(confirm)await fixture.webhook(payment.id);
 const dispute={id:'disp_'+id().replaceAll('-',''),entity:'dispute',payment_id:payment.id,amount:6450,currency:'INR',amount_deducted:0,status:'open',phase:'chargeback',created_at:payment.created_at};fixture.disputes.set(dispute.id,dispute);
 return{user,fixture,api,intentId,payment,dispute,check:options=>fixture.dispute(dispute.id,options),wallet:()=>api('purchase-web-status',{intentId}).then(result=>result.wallet)};
}
test('open and duplicate dispute facts neither confiscate credit nor mint a second grant',async()=>{
 const s=await setup();assert.equal((await s.check()).decision,'applied');await s.check();assert.equal((await s.wallet()).availableMs,300000);
 const checks=(await db.query('select deliveries from public.game_web_dispute_checks where dispute_id=$1',[s.dispute.id])).rows;assert.equal(checks.length,1);assert.equal(Number(checks[0].deliveries),2);
});
test('a confirmed partial loss targets only its purchase, and a later phase win restores unused value rather than consumed time',async()=>{
 const s=await setup();await db.query('update public.game_credit_lots set consumed_ms=100000 where user_id=$1',[s.user]);await db.query("select public.game_credit_verified($1,'manual',$2,1000,'server','fixture')",[s.user,id()]);
 Object.assign(s.dispute,{status:'lost',amount_deducted:6450});assert.equal((await s.check()).state,'charged_back');assert.equal((await s.wallet()).availableMs,51000);await s.check();assert.equal((await s.wallet()).availableMs,51000);
 Object.assign(s.dispute,{phase:'pre_arbitration',status:'won',amount_deducted:0});assert.equal((await s.check()).state,'owned');assert.equal((await s.wallet()).availableMs,201000);
 assert.equal(Number((await db.query('select sum(granted_ms) total from public.game_credit_lots where user_id=$1',[s.user])).rows[0].total),301000);assert.equal(Number((await db.query("select count(*) n from public.game_time_ledger where user_id=$1 and kind='grant'",[s.user])).rows[0].n),2);
});
test('refunds and chargebacks combine in exact original-price units while a win cannot undo a real refund',async()=>{
 const s=await setup();await db.query('update public.game_credit_lots set consumed_ms=100000 where user_id=$1',[s.user]);Object.assign(s.dispute,{status:'lost',amount_deducted:6450});await s.check();
 s.payment.amount_refunded=3225;await s.fixture.webhook(s.payment.id);let wallet=await s.wallet();assert.equal(wallet.availableMs,0);assert.equal(wallet.refundedConsumedMs,0);assert.equal(wallet.chargebackConsumedMs,25000);assert.equal(wallet.revokedConsumedMs,25000);
 Object.assign(s.dispute,{phase:'arbitration',status:'won',amount_deducted:0});await s.check();wallet=await s.wallet();assert.equal(wallet.availableMs,125000);assert.equal(wallet.revokedConsumedMs,0);assert.equal((await s.api('purchase-web-status',{intentId:s.intentId})).state,'verified');
});
test('a lost dispute arriving before capture ingestion is applied in the same transaction as the first grant',async()=>{
 const s=await setup({confirm:false});Object.assign(s.dispute,{status:'lost',amount_deducted:6450});await s.check();assert.equal((await s.wallet()).availableMs,150000);await s.fixture.webhook(s.payment.id);assert.equal((await s.wallet()).availableMs,150000);
 assert.equal(Number((await db.query('select count(*) n from public.game_credit_lots where user_id=$1',[s.user])).rows[0].n),1);
});
test('older phases cannot overwrite losses; contradictory final outcomes require explicit independently verified review',async()=>{
 const s=await setup();Object.assign(s.dispute,{status:'lost',amount_deducted:6450});await s.check();Object.assign(s.dispute,{status:'open',amount_deducted:0});assert.equal((await s.check()).decision,'stale');assert.equal((await s.wallet()).availableMs,150000);
 s.dispute.status='won';const review=await s.check();assert.equal(review.decision,'review');assert.equal(review.disputeReview,true);assert.equal((await s.wallet()).availableMs,150000);
 const reviewFacts=await s.fixture.inspectDispute(s.dispute.id);await s.check();assert.equal((await s.check({allowCorrection:true,expectedFingerprint:reviewFacts.fingerprint})).disputeReview,false);assert.equal((await s.wallet()).availableMs,300000);
});
test('a new appeal phase retains the last confirmed loss until a final outcome, and old terminal callbacks stay stale',async()=>{
 const s=await setup();Object.assign(s.dispute,{status:'lost',amount_deducted:6450});await s.check();Object.assign(s.dispute,{phase:'pre_arbitration',status:'open',amount_deducted:0});await s.check();assert.equal((await s.wallet()).availableMs,150000);
 Object.assign(s.dispute,{phase:'arbitration',status:'won'});await s.check();assert.equal((await s.wallet()).availableMs,300000);Object.assign(s.dispute,{phase:'chargeback',status:'lost',amount_deducted:6450});assert.equal((await s.check()).decision,'stale');assert.equal((await s.wallet()).availableMs,300000);
});
test('multiple confirmed deductions are capped at the original purchase and cannot erase unrelated funds',async()=>{
 const s=await setup();await db.query("select public.game_credit_verified($1,'manual',$2,45000,'server','fixture')",[s.user,id()]);Object.assign(s.dispute,{amount:10000,status:'lost',amount_deducted:10000});await s.check();
 const second={...s.dispute,id:'disp_'+id().replaceAll('-','')};s.fixture.disputes.set(second.id,second);await s.fixture.dispute(second.id);assert.equal((await s.wallet()).availableMs,45000);assert.equal(Number((await db.query('select chargeback_amount from public.game_web_orders where id=$1',[s.intentId])).rows[0].chargeback_amount),12900);
});
test('a loss during an issued activation revokes renewal without double releasing the held remainder',async()=>{
 const s=await setup(),run=id(),reservation=id(),device=id();await db.query("insert into public.game_runs(id,user_id,level,layout_hash) values($1,$2,1,$3)",[run,s.user,'a'.repeat(64)]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[s.user]);await db.query('select public.game_reserve_time($1,$2,$3,30000)',[reservation,device,run]);await db.query('select public.game_checkpoint_time($1,$2,20000)',[reservation,device]);
 Object.assign(s.dispute,{amount:12900,status:'lost',amount_deducted:12900});await s.check();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[s.user]);const checkpoint=(await db.query('select public.game_checkpoint_time($1,$2,20000) result',[reservation,device])).rows[0].result;assert.equal(checkpoint.authorizationValid,false);assert.equal(checkpoint.wallet.reservedMs,10000);
 await db.query('select public.game_settle_time($1,$2,25000)',[reservation,device]);let wallet=await s.wallet();assert.equal(wallet.availableMs,0);assert.equal(wallet.reservedMs,0);assert.equal(wallet.chargebackConsumedMs,25000);
 Object.assign(s.dispute,{phase:'arbitration',status:'won',amount_deducted:0});await s.check();wallet=await s.wallet();assert.equal(wallet.availableMs,275000);assert.equal(wallet.chargebackConsumedMs,0);
});
test('deleted-owner dispute evidence is retained without creating credit for a recreated account',async()=>{
 const s=await setup();Object.assign(s.dispute,{status:'lost',amount_deducted:6450});await s.check();await db.query('delete from auth.users where id=$1',[s.user]);Object.assign(s.dispute,{phase:'arbitration',status:'won',amount_deducted:0});assert.equal((await s.check()).state,'account-deleted');
 const replacement=id();await db.query('insert into auth.users values($1)',[replacement]);assert.equal(Number((await db.query('select count(*) n from public.game_credit_lots where user_id=$1',[replacement])).rows[0].n),0);assert.equal(Number((await db.query('select count(*) n from public.game_web_disputes where dispute_id=$1',[s.dispute.id])).rows[0].n),1);
});
test('players cannot read private dispute evidence, force a correction or invoke the unwrapped capture function',async()=>{
 const s=await setup();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[s.user]);await db.exec('set role authenticated');
 try{await assert.rejects(()=>db.query('select * from public.game_web_disputes'),/permission denied/);await assert.rejects(()=>db.query("select public.game_record_web_dispute($1,$2,'{}','{}',true)",[s.intentId,'order_fake']),/permission denied/);await assert.rejects(()=>db.query("select public.game_apply_web_payment_base($1,'order_fake','pay_fake',12900,'INR',0,now(),0,0)",[s.intentId]),/permission denied/);}finally{await db.exec('reset role');}
});

test('inspection cannot grant or attach a new purchase, and outdated reviewed facts cannot authorize a correction',async()=>{
 const s=await setup({confirm:false});const inspected=await s.fixture.inspectDispute(s.dispute.id);assert.match(inspected.fingerprint,/^[a-f\d]{64}$/);assert.equal(inspected.milliseconds,300000);assert.equal(Number((await db.query('select count(*) n from public.game_purchases where owner_user_id=$1',[s.user])).rows[0].n),0);
 Object.assign(s.dispute,{status:'lost',amount_deducted:6450});await s.check();s.dispute.status='won';s.dispute.amount_deducted=0;const review=await s.fixture.inspectDispute(s.dispute.id);s.payment.amount_refunded=1000;
 await assert.rejects(()=>s.check({allowCorrection:true,expectedFingerprint:review.fingerprint}),/facts changed/);await assert.rejects(()=>s.check({allowCorrection:true}),/facts changed/);assert.equal((await s.wallet()).availableMs,300000-150000-Math.floor(300000*1000/12900));
});

test('signed loss hints retry lagging provider deductions but cannot themselves reverse money',async()=>{
 const s=await setup();Object.assign(s.dispute,{status:'lost',amount_deducted:0});await assert.rejects(()=>s.check({hintPhase:'chargeback',hintStatus:'lost',minimumDeducted:6450}),/still pending/);assert.equal((await s.wallet()).availableMs,300000);
 await s.check();s.dispute.amount_deducted=6450;assert.equal((await s.check()).decision,'applied');assert.equal((await s.wallet()).availableMs,150000);
});

test('rounding, reversal and renewed losses match an independent original-purchase model',async()=>{
 let seed=90817;const random=max=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;};
 for(let n=0;n<20;n++){
  const edge=[[0,12900,6450],[300000,0,12900],[0,0,0],[300000,12900,12900]][n],s=await setup(),[consumed,refund,loss]=edge||[random(300001),random(12901),random(12901)];await db.query('update public.game_credit_lots set consumed_ms=$2 where user_id=$1',[s.user,consumed]);s.payment.amount_refunded=refund;if(refund===12900)s.payment.status='refunded';
  Object.assign(s.dispute,{amount:12900,status:'lost',amount_deducted:loss});await s.check();const target=Math.floor(300000*Math.min(12900,refund+loss)/12900);assert.equal((await s.wallet()).availableMs,Math.max(0,300000-consumed-target));
  Object.assign(s.dispute,{phase:'pre_arbitration',status:'won',amount_deducted:0});await s.check();assert.equal((await s.wallet()).availableMs,Math.max(0,300000-consumed-Math.floor(300000*refund/12900)));
  Object.assign(s.dispute,{phase:'arbitration',status:'lost',amount_deducted:loss});await s.check();assert.equal((await s.wallet()).availableMs,Math.max(0,300000-consumed-target));assert.equal(Number((await db.query("select count(*) n from public.game_time_ledger where user_id=$1 and kind='grant'",[s.user])).rows[0].n),1);
 }
});

test('a later appeal may change its contested amount without losing prior confirmed loss or retargeting another purchase',async()=>{
 const s=await setup();Object.assign(s.dispute,{status:'lost',amount_deducted:6450});await s.check();Object.assign(s.dispute,{phase:'pre_arbitration',status:'open',amount:1000,amount_deducted:0});await s.check();assert.equal((await s.wallet()).availableMs,150000);
 Object.assign(s.dispute,{phase:'arbitration',status:'lost',amount_deducted:1000});await s.check();assert.equal((await s.wallet()).availableMs,300000-Math.floor(300000*1000/12900));const original=s.dispute.payment_id;s.dispute.payment_id='pay_not_this_purchase';await assert.rejects(()=>s.check());s.dispute.payment_id=original;
});

test('a later-phase final outcome clears an older review even after an intermediate open appeal',async()=>{
 const s=await setup();Object.assign(s.dispute,{status:'lost',amount_deducted:6450});await s.check();Object.assign(s.dispute,{status:'won',amount_deducted:0});assert.equal((await s.check()).disputeReview,true);Object.assign(s.dispute,{phase:'pre_arbitration',status:'open'});assert.equal((await s.check()).disputeReview,true);s.dispute.status='won';assert.equal((await s.check()).disputeReview,false);assert.equal((await s.wallet()).availableMs,300000);
});

test('a terminal correction cannot overwrite a newer financial observation committed after its last read',async()=>{
 const s=await setup();Object.assign(s.dispute,{status:'lost',amount_deducted:6450});await s.check();Object.assign(s.dispute,{status:'won',amount_deducted:0});await s.check();const inspected=await s.fixture.inspectDispute(s.dispute.id),original=s.fixture.admin.rpc;let racing=true;
 s.fixture.admin.rpc=async(name,args)=>{
  if(name==='game_record_web_dispute'&&args.p_allow_correction&&racing){racing=false;Object.assign(s.dispute,{phase:'arbitration',status:'lost',amount_deducted:6450});await s.check();}
  return original(name,args);
 };
 await assert.rejects(()=>s.check({allowCorrection:true,expectedFingerprint:inspected.fingerprint}),/Could not reconcile/);assert.equal((await s.wallet()).availableMs,150000);const stored=(await db.query('select phase,status from public.game_web_disputes where dispute_id=$1',[s.dispute.id])).rows[0];assert.deepEqual(stored,{phase:'arbitration',status:'lost'});
});
