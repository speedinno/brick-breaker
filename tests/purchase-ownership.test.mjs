import {migrateGame} from './db-migrations.mjs';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createDefinition,definitionHash} from '../dist/catalog.js';
import {canonicalLayout} from '../dist/generated.js';
let db;
async function identity(){const id=crypto.randomUUID();await db.query('insert into auth.users values($1)',[id]);return id;}
async function rpc(user,sql,args=[]){await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`);try{return(await db.query('select public.'+sql+' as value',args)).rows[0].value;}finally{await db.exec('reset role');}}
async function record(user,transaction=crypto.randomUUID(),{state='owned',product='pack300',quantity=1,environment='production'}={}){return(await db.query('select public.game_record_purchase($1,\'revenuecat\',\'play_store:app123\',$2,$3,$4,$5,$6,now()-interval \'1 minute\') as value',[user,environment,transaction,product,quantity,state])).rows[0].value;}
async function balance(user){return(await rpc(user,'game_time_state()')).availableMs;}
before(async()=>{
 db=new PGlite();await db.exec("create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 await migrateGame(db);
 await db.exec("insert into public.game_purchase_products(provider,scope,environment,product_id,platform,benefit_key,milliseconds,config_version,available) values('revenuecat','play_store:app123','production','pack300','android','time_300',300000,'purchase-v1',true),('revenuecat','play_store:app123','sandbox','pack300','android','time_300',300000,'purchase-v1',true),('revenuecat','play_store:app123','production','pack900','android','time_900',900000,'purchase-v2',true);");
 const d=createDefinition(1);await db.query('select public.game_publish_level(1,$1::jsonb,$2,$3)',[JSON.stringify(d),canonicalLayout(d.layout),await definitionHash(d)]);
});
after(async()=>db?.close());

test('COM-11/22: receipt replay, restore and response loss cannot duplicate a purchase',async()=>{
 const user=await identity(),txn=crypto.randomUUID();const first=await record(user,txn,{quantity:2});
 assert.equal(first.milliseconds,600000);for(let n=0;n<4;n++)assert.equal((await record(user,txn,{quantity:2})).id,first.id);
 assert.equal(await balance(user),600000);
 assert.equal((await db.query('select count(*)::integer n from public.game_credit_lots where user_id=$1',[user])).rows[0].n,1);
});
test('cross-account receipt claims and altered product/quantity cannot mint time',async()=>{
 const a=await identity(),b=await identity(),txn=crypto.randomUUID();await record(a,txn);
 await assert.rejects(()=>record(b,txn),/another game account/);
 await assert.rejects(()=>record(a,txn,{product:'pack900'}),/identity conflict/);
 await assert.rejects(()=>record(a,txn,{quantity:3}),/identity conflict/);
 assert.equal(await balance(a),300000);assert.equal(await balance(b),0);
});
test('published quantities cannot be edited or deleted and retired products still restore',async()=>{
 await assert.rejects(()=>db.exec("update public.game_purchase_products set milliseconds=600000 where product_id='pack300'"),/immutable/);
 await assert.rejects(()=>db.exec("delete from public.game_purchase_products where product_id='pack900'"),/cannot be deleted/);
 await db.exec("update public.game_purchase_products set available=false where product_id='pack900'");
 const user=await identity();await record(user,undefined,{product:'pack900'});assert.equal(await balance(user),900000);
});
test('COM-23: refund removes only its own unspent lot; stale owned cannot reverse refund',async()=>{
 const user=await identity(),txn=crypto.randomUUID();await record(user,txn);await record(user,undefined,{product:'pack900'});
 await record(user,txn,{state:'refunded'});assert.equal(await balance(user),900000);
 assert.equal((await record(user,txn)).state,'refunded');assert.equal(await balance(user),900000);
});
test('refund arriving before owned creates a terminal zero-credit transaction',async()=>{
 const user=await identity(),txn=crypto.randomUUID();await record(user,txn,{state:'refunded'});await record(user,txn);
 assert.equal(await balance(user),0);
});
test('deleted accounts leave a tombstone; restoring old receipts cannot regrant consumed or unspent time',async()=>{
 const a=await identity(),b=await identity(),txn=crypto.randomUUID(),receipt=await record(a,txn);
 await db.query('delete from auth.users where id=$1',[a]);
 const row=(await db.query('select * from public.game_purchases where id=$1',[receipt.id])).rows[0];
 assert.equal(row.owner_user_id,null);assert.equal(row.lot_id,null);assert(row.deleted_at);
 assert.equal((await record(b,txn)).state,'account-deleted');assert.equal(await balance(b),0);
 await record(null,txn,{state:'refunded'});assert.equal((await record(b,txn)).state,'account-deleted');
});
test('late first delivery after account deletion creates a non-granting tombstone',async()=>{
 const a=await identity(),b=await identity(),txn=crypto.randomUUID();await db.query('delete from auth.users where id=$1',[a]);
 assert.equal((await record(a,txn)).state,'account-deleted');assert.equal((await record(b,txn)).state,'account-deleted');assert.equal(await balance(b),0);
});
test('held refunded seconds are not released into spendable balance or charged twice',async()=>{
 const user=await identity(),txn=crypto.randomUUID();await record(user,txn);
 const run=crypto.randomUUID(),reservation=crypto.randomUUID(),device=crypto.randomUUID();
 await rpc(user,'game_start(1,$1)',[run]);await rpc(user,'game_reserve_time($1,$2,$3,15000)',[reservation,device,run]);
 await rpc(user,'game_checkpoint_time($1,$2,2000)',[reservation,device]);await record(user,txn,{state:'refunded'});
 assert.equal(await balance(user),0);await rpc(user,'game_settle_time($1,$2,2500)',[reservation,device]);
 const wallet=await rpc(user,'game_time_state()');assert.equal(wallet.availableMs,0);assert.equal(wallet.reservedMs,0);assert.equal(wallet.refundedConsumedMs,2500);
 const lot=(await db.query('select consumed_ms,reversed_ms,held_ms from public.game_credit_lots where user_id=$1',[user])).rows[0];
 assert.equal(Number(lot.consumed_ms)+Number(lot.reversed_ms)+Number(lot.held_ms),300000);
});
test('players cannot call trusted purchase primitives or view another account provenance',async()=>{
 const a=await identity(),b=await identity(),txn=crypto.randomUUID();await record(a,txn);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${b}',false);`);
 try{
  assert.equal((await db.query('select * from public.game_purchases')).rows.length,0);
  await assert.rejects(()=>record(b),/permission denied/);
  await assert.rejects(()=>db.exec("insert into public.game_purchase_products values('razorpay','scope','production','id','web','x',1,'v1',true)"),/permission denied/);
 }finally{await db.exec('reset role');}
});
