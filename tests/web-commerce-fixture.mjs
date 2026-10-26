// Local-only provider/authentication fixture. Uses the production orchestration
// and real PostgreSQL ledger, but never contacts or proves a real payment SDK.
import {createHmac} from 'node:crypto';
import {webCommerce,webCatalog,prepareWebCheckout,findWebIntent,recoverWebCheckout,webhookWebPayment} from '../supabase/functions/_shared/web-commerce.js';
const secret='LOCAL-FIXTURE-NOT-A-PROVIDER-CREDENTIAL',scope='web:com.speedinno.brickbreaker';
const prices='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export function postgresCommerceAdmin(db){
 class Query{
  constructor(table){if(!['game_web_prices','game_purchase_products','game_web_orders'].includes(table))throw Error('Unexpected fixture table');this.table=table;this.fields='*';this.filters=[];this.values=[];this.sort='';this.count=100;}
  column(name){if(!/^[a-z_]+$/.test(name))throw Error('Invalid fixture column');return name;}
  select(fields){if(!/^(\*|[a-z_,]+)$/.test(fields))throw Error('Invalid fixture fields');this.fields=fields;return this;}
  eq(name,value){this.values.push(value);this.filters.push(this.column(name)+'=$'+this.values.length);return this;}
  gt(name,value){this.values.push(value);this.filters.push(this.column(name)+'>$'+this.values.length);return this;}
  order(name,{ascending=true}={}){this.sort=' order by '+this.column(name)+(ascending?' asc':' desc');return this;}
  limit(count){if(!Number.isInteger(count)||count<1||count>100)throw Error('Invalid fixture limit');this.count=count;return this;}
  async execute(single=false){try{const rows=(await db.query('select '+this.fields+' from public.'+this.table+(this.filters.length?' where '+this.filters.join(' and '):'')+this.sort+' limit '+this.count,this.values)).rows;return {data:single?rows[0]||null:rows,error:null};}catch(error){return{data:null,error:{message:error.message}};}}
  maybeSingle(){return this.execute(true);}
  then(resolve,reject){return this.execute().then(resolve,reject);}
 }
 const signatures={game_prepare_web_order:['p_user','p_id','p_scope','p_environment','p_price'],game_attach_web_order:['p_id','p_order','p_amount','p_currency'],game_apply_web_payment:['p_id','p_order','p_payment','p_amount','p_currency','p_refunded','p_purchased_at','p_fee','p_tax']};
 return {from:table=>new Query(table),rpc:async(name,args)=>{
  const keys=signatures[name];if(!keys)throw Error('Unexpected fixture RPC');
  try{return{data:(await db.query('select public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') as value',keys.map(key=>args[key]??null))).rows[0].value,error:null};}catch(error){return {data:null,error:{message:error.message}};}
 }};
}
export async function createWebCommerceFixture(db,user){
 const orders=new Map(),payments=new Map(),calls=[],prefix=crypto.randomUUID().replaceAll('-','').slice(0,12);let number=0,loseCreate=false;
 const fetch=async(url,options)=>{
  const path=new URL(url);if(path.origin!=='https://api.razorpay.com')throw Error('Unexpected provider origin');calls.push({path:path.pathname,method:options.method});
  if(path.pathname==='/v1/orders'&&options.method==='POST'){
   const body=JSON.parse(options.body),order={...body,id:'order_local'+prefix+(++number),entity:'order',status:'created',created_at:Math.floor(Date.now()/1000),amount_paid:0,amount_due:body.amount};orders.set(order.id,order);
   if(loseCreate){loseCreate=false;throw Error('Simulated response loss after durable provider create');}return Response.json(order);
  }
  if(path.pathname==='/v1/orders')return Response.json({entity:'collection',items:[...orders.values()].filter(order=>order.receipt.includes(path.searchParams.get('receipt')))});
  const match=path.pathname.match(/^\/v1\/orders\/(order_[A-Za-z0-9]+)(\/payments)?$/);
  if(match){const order=orders.get(match[1]);if(!order)return new Response('',{status:404});return Response.json(match[2]?{entity:'collection',items:[...payments.values()].filter(p=>p.order_id===order.id)}:order);}
  const payment=payments.get(path.pathname.replace('/v1/payments/',''));return payment?Response.json(payment):new Response('',{status:404});
 };
 const settings={RAZORPAY_CONFIG_JSON:JSON.stringify({scope,environment:'sandbox',merchantId:'acc_local',ownedOrigins:['http://127.0.0.1:4186']}),RAZORPAY_KEY_ID:'rzp_test_LOCALFIXTURE',RAZORPAY_KEY_SECRET:secret,RAZORPAY_WEBHOOK_SECRETS_JSON:JSON.stringify([secret])};
 const commerce=webCommerce(key=>settings[key],fetch),admin=postgresCommerceAdmin(db);
 await db.query("insert into public.game_purchase_products(provider,scope,environment,product_id,platform,benefit_key,milliseconds,config_version,available) values('razorpay',$1,'sandbox','fixture300','web','time300',300000,'fixture-v1',true) on conflict do nothing",[scope]);
 await db.query("insert into public.game_web_prices(id,scope,environment,product_id,amount,currency,current) values($1,$2,'sandbox','fixture300',12900,'INR',true) on conflict do nothing",[prices,scope]);
 const wallet=async()=>{await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`);try{return(await db.query('select public.game_time_state() as value')).rows[0].value;}finally{await db.exec('reset role');}};
 const fixture={admin,commerce,calls,orders,payments,priceId:prices,
  loseNextCreate(){loseCreate=true;},
  capture(orderId,refunded=0){const order=orders.get(orderId);if(!order)throw Error('Unknown fixture order');let payment=[...payments.values()].find(p=>p.order_id===orderId);if(!payment){payment={id:'pay_local'+prefix+(payments.size+1),entity:'payment',order_id:orderId,amount:order.amount,currency:order.currency,captured:true,status:'captured',amount_refunded:0,created_at:Math.floor(Date.now()/1000),fee:258,tax:46};payments.set(payment.id,payment);}payment.amount_refunded=refunded;payment.status=refunded===payment.amount?'refunded':'captured';order.status='paid';order.amount_paid=order.amount;order.amount_due=0;
   return{razorpay_order_id:orderId,razorpay_payment_id:payment.id,razorpay_signature:createHmac('sha256',secret).update(orderId+'|'+payment.id).digest('hex')};
  },
  webhook:payment=>webhookWebPayment(commerce,admin,payment),
  async handle(body){
   if(body.action==='qa-commerce-capture')return fixture.capture(body.orderId);
   if(body.accountId!==user)throw Error('Fixture identity mismatch');
   if(body.action==='purchase-catalog')return webCatalog(commerce,admin);
   if(body.action==='purchase-web-order')return prepareWebCheckout(commerce,admin,user,body.intentId,body.priceId);
   if(body.action==='purchase-web-sync'){
    let query=admin.from('game_web_orders').select('*').eq('owner_user_id',user).eq('scope',scope).eq('environment','sandbox').order('id',{ascending:true}).limit(5);if(body.after)query=query.gt('id',body.after);
    const rows=await query;if(rows.error)throw Error(rows.error.message);await Promise.all(rows.data.map(intent=>recoverWebCheckout(commerce,admin,intent)));return{next:rows.data.length===5?rows.data.at(-1).id:null,wallet:await wallet()};
   }
   if(['purchase-web-status','purchase-web-confirm'].includes(body.action)){
    const intent=await findWebIntent(commerce,admin,body.intentId,user),result=await recoverWebCheckout(commerce,admin,intent,body.action==='purchase-web-confirm'?{paymentId:body.paymentId,signature:body.signature,requireSignature:true}:{});return{...result,wallet:await wallet()};
   }
   throw Error('Unsupported commerce fixture action');
  }
 };return fixture;
}
