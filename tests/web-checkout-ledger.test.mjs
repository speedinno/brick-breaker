import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateGame} from './db-migrations.mjs';
let db,price;const scope='web:com.speedinno.brickbreaker',id=()=>crypto.randomUUID();
async function user(){const value=id();await db.query('insert into auth.users values($1)',[value]);return value;}
async function value(sql,args=[]){return(await db.query('select public.'+sql+' as value',args)).rows[0].value;}
const prepare=(owner,intent=id(),priceId=price)=>value('game_prepare_web_order($1,$2,$3,\'production\',$4)',[owner,intent,scope,priceId]);
const attach=(intent,order='order_'+id().replaceAll('-',''))=>value('game_attach_web_order($1,$2,7900,\'INR\')',[intent,order]);
const pay=(intent,order,payment='pay_'+id().replaceAll('-',''),refunded=0)=>value('game_apply_web_payment($1,$2,$3,7900,\'INR\',$4,now(),100,18)',[intent,order,payment,refunded]);
async function balance(owner){await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);try{return(await value('game_time_state()')).availableMs;}finally{await db.exec('reset role');}}
before(async()=>{
 db=new PGlite();await db.exec("create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");await migrateGame(db);
 await db.query("insert into public.game_purchase_products(provider,scope,environment,product_id,platform,benefit_key,milliseconds,config_version,available) values('razorpay',$1,'production','web300_v1','web','time300',300000,'web-v1',true)",[scope]);
 price=(await db.query("insert into public.game_web_prices(scope,environment,product_id,amount,currency,current) values($1,'production','web300_v1',7900,'INR',true) returning id",[scope])).rows[0].id;
});
after(async()=>db?.close());
test('a checkout intent authorizes one provider create, binds owner and never changes the quoted price',async()=>{
 const owner=await user(),other=await user(),intent=id(),first=await prepare(owner,intent);assert.equal(first.create,true);assert.equal(first.order.amount,7900);assert.equal((await prepare(owner,intent)).create,false);
 await assert.rejects(()=>prepare(other,intent),/identity conflict/);assert.equal(await balance(owner),0);
 const order=await attach(intent);assert.equal((await prepare(owner,intent)).order.order_id,order.order_id);assert.equal(await balance(owner),0);
});
test('captured web payment replay grants once and stores reported provider deductions separately',async()=>{
 const owner=await user(),intent=id();await prepare(owner,intent);const order=await attach(intent),payment='pay_'+id().replaceAll('-','');
 const first=await pay(intent,order.order_id,payment);assert.equal(first.state,'owned');await pay(intent,order.order_id,payment);assert.equal(await balance(owner),300000);
 const row=(await db.query('select provider_fee,provider_tax from public.game_web_orders where id=$1',[intent])).rows[0];assert.equal(Number(row.provider_fee),100);assert.equal(Number(row.provider_tax),18);
});
test('partial refunds and stale captured responses preserve the unrefunded source balance',async()=>{
 const owner=await user(),intent=id();await prepare(owner,intent);const order=await attach(intent),payment='pay_'+id().replaceAll('-','');await pay(intent,order.order_id,payment);
 const partial=await pay(intent,order.order_id,payment,2000);assert.equal(partial.state,'partially_refunded');assert.equal(partial.refundedMs,Math.floor(300000*2000/7900));
 assert.equal(await balance(owner),300000-partial.refundedMs);await pay(intent,order.order_id,payment,0);assert.equal(await balance(owner),300000-partial.refundedMs);
 await pay(intent,order.order_id,payment,7900);await pay(intent,order.order_id,payment,0);assert.equal(await balance(owner),0);
});
test('refund before first confirmation is atomic and never exposes a spendable full pack',async()=>{
 const owner=await user(),intent=id();await prepare(owner,intent);const order=await attach(intent);assert.equal((await pay(intent,order.order_id,undefined,7900)).state,'refunded');assert.equal(await balance(owner),0);
});
test('mismatched amount, currency, order, second payment and over-refund cannot mint or erase time',async()=>{
 const owner=await user(),intent=id();await prepare(owner,intent);const order=await attach(intent),payment='pay_'+id().replaceAll('-','');
 await assert.rejects(()=>value('game_attach_web_order($1,\'order_bad\',1,\'INR\')',[intent]),/verification failed/);
 await assert.rejects(()=>value('game_apply_web_payment($1,$2,$3,7900,\'USD\',0,now())',[intent,order.order_id,payment]),/verification failed/);
 await assert.rejects(()=>pay(intent,'order_wrong',payment),/verification failed/);await assert.rejects(()=>pay(intent,order.order_id,payment,7901),/verification failed/);assert.equal(await balance(owner),0);
 await pay(intent,order.order_id,payment);await assert.rejects(()=>pay(intent,order.order_id),/Multiple payments/);assert.equal(await balance(owner),300000);
});
test('a paid old quote retains its original benefit across price retirement and later capture',async()=>{
 const owner=await user(),intent=id();await prepare(owner,intent);const order=await attach(intent);
 await db.query('update public.game_web_prices set current=false where id=$1',[price]);const next=(await db.query("insert into public.game_web_prices(scope,environment,product_id,amount,currency,current) values($1,'production','web300_v1',9900,'INR',true) returning id",[scope])).rows[0].id;
 await assert.rejects(()=>prepare(owner,id()),/Refresh/);assert.equal((await prepare(owner,intent)).order.amount,7900);
 await db.query("update public.game_web_orders set quote_until=now()-interval '1 day' where id=$1",[intent]);await pay(intent,order.order_id);assert.equal(await balance(owner),300000);
 await db.query('update public.game_web_prices set current=false where id=$1',[next]);await db.query('update public.game_web_prices set current=true where id=$1',[price]);
});
test('late capture after owner deletion leaves non-granting receipt and order tombstones',async()=>{
 const owner=await user(),intent=id();await prepare(owner,intent);const order=await attach(intent),payment='pay_'+id().replaceAll('-','');await db.query('delete from auth.users where id=$1',[owner]);
 const result=await pay(intent,order.order_id,payment);assert.equal(result.state,'account-deleted');const receipt=(await db.query('select owner_user_id,lot_id,deleted_at from public.game_purchases where id=$1',[result.purchaseId])).rows[0];assert.equal(receipt.owner_user_id,null);assert.equal(receipt.lot_id,null);assert(receipt.deleted_at);
 const other=await user();await assert.rejects(()=>prepare(other,intent),/identity conflict/);assert.equal(await balance(other),0);await pay(intent,order.order_id,payment,7900);
});
test('checkout price provenance is immutable and excessive abandoned order creation is bounded',async()=>{
 await assert.rejects(()=>db.query('update public.game_web_prices set amount=100 where id=$1',[price]),/immutable/);await assert.rejects(()=>db.query('delete from public.game_web_prices where id=$1',[price]),/cannot be deleted/);
 const owner=await user();for(let n=0;n<20;n++)await prepare(owner);await assert.rejects(()=>prepare(owner),/Too many checkout/);
});
test('checkout mutation is private and one account cannot read another account orders',async()=>{
 const a=await user(),b=await user(),intent=id();await prepare(a,intent);await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${b}',false);`);
 try{assert.equal((await db.query('select * from public.game_web_orders')).rows.length,0);await assert.rejects(()=>prepare(b),/permission denied/);await assert.rejects(()=>attach(intent),/permission denied/);await assert.rejects(()=>pay(intent,'order_fake'),/permission denied/);}finally{await db.exec('reset role');}
});
