import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateGame} from './db-migrations.mjs';
import {createWebCommerceFixture} from './web-commerce-fixture.mjs';
let db;
before(async()=>{db=new PGlite();await db.exec("create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");await migrateGame(db);});
after(async()=>db?.close());
async function setup(){const user=crypto.randomUUID();await db.query('insert into auth.users values($1)',[user]);const fixture=await createWebCommerceFixture(db,user);const api=(action,body={})=>fixture.handle({accountId:user,action,...body});return{fixture,api,user};}
test('production web orchestration and PostgreSQL recover a lost create response, verify capture and never replenish a restored pack',async()=>{
 const {fixture,api,user}=await setup(),intentId=crypto.randomUUID();fixture.loseNextCreate();
 await assert.rejects(()=>api('purchase-web-order',{intentId,priceId:fixture.priceId}),/verification is unavailable/);
 const quote=await api('purchase-web-order',{intentId,priceId:fixture.priceId});assert.equal(quote.amount,12900);assert.equal(quote.productId,'fixture300');assert.equal(quote.configVersion,'fixture-v1');assert.equal(fixture.calls.filter(c=>c.method==='POST').length,1);assert.equal(fixture.orders.size,1);
 const callback=fixture.capture(quote.orderId),confirmed=await api('purchase-web-confirm',{intentId,paymentId:callback.razorpay_payment_id,signature:callback.razorpay_signature});assert.equal(confirmed.wallet.availableMs,300000);assert.equal(confirmed.state,'verified');
 await api('purchase-web-confirm',{intentId,paymentId:callback.razorpay_payment_id,signature:callback.razorpay_signature});
 assert.equal((await api('purchase-web-sync')).wallet.availableMs,300000);assert.equal((await db.query("select count(*)::integer n from public.game_credit_lots where user_id=$1",[user])).rows[0].n,1);
 await db.query("update public.game_credit_lots set consumed_ms=100000 where user_id=$1",[user]);assert.equal((await api('purchase-web-sync')).wallet.availableMs,200000);
 fixture.capture(quote.orderId,6450);await fixture.webhook(callback.razorpay_payment_id);assert.equal((await api('purchase-web-status',{intentId})).wallet.availableMs,50000);
});
test('an authentic-looking client callback cannot grant before canonical capture or with the wrong HMAC',async()=>{
 const {fixture,api}=await setup(),intentId=crypto.randomUUID(),quote=await api('purchase-web-order',{intentId,priceId:fixture.priceId});
 await assert.rejects(()=>api('purchase-web-confirm',{intentId,paymentId:'pay_fake',signature:'a'.repeat(64)}),/could not be authenticated/);assert.equal((await api('purchase-web-sync')).wallet.availableMs,0);
 const callback=fixture.capture(quote.orderId);await assert.rejects(()=>api('purchase-web-confirm',{intentId,paymentId:callback.razorpay_payment_id,signature:'0'.repeat(64)}),/could not be authenticated/);
 assert.equal((await api('purchase-web-status',{intentId})).wallet.availableMs,300000); // independent provider recovery, not the forged callback
});
