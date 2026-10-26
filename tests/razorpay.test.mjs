import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {RazorpayCheckout,verifyHmac} from '../supabase/functions/_shared/razorpay.js';
import {webCommerce} from '../supabase/functions/_shared/web-commerce.js';
const now=1793000000000,secret='independent-test-secret-not-a-credential',scope='web:com.speedinno.brickbreaker';
const intent={id:'11111111-1111-4111-8111-111111111111',scope,environment:'production',product_id:'time300_v1',amount:7900,currency:'INR',milliseconds:300000,created_at:new Date(now-1000).toISOString(),order_id:'order_example'};
const order={entity:'order',id:'order_example',amount:7900,currency:'INR',receipt:'bb_'+intent.id,notes:{game_intent:intent.id,game_product:intent.product_id,game_scope:scope,game_environment:'production'},status:'created',created_at:Math.floor(now/1000)};
const payment={entity:'payment',id:'pay_example',order_id:'order_example',amount:7900,currency:'INR',amount_refunded:0,status:'captured',captured:true,created_at:Math.floor(now/1000),fee:158,tax:24};
function provider(handler=async()=>Response.json(order)){const calls=[];return {calls,client:new RazorpayCheckout({keyId:'rzp_live_example',keySecret:secret,merchantId:'acc_example',scope,now:()=>now,fetch:async(url,options)=>{calls.push({url,options});return handler(url,options);}})};}
test('web orders use the durable quoted amount and private provider credentials only at the fixed API origin',async()=>{
 const {client,calls}=provider();assert.equal((await client.create(intent)).amount,7900);
 const body=JSON.parse(calls[0].options.body);assert.equal(body.amount,7900);assert.equal(body.partial_payment,false);assert.equal(body.receipt.length,39);assert.equal(body.notes.game_intent,intent.id);assert(!Object.keys(body.notes).some(key=>/user|email/i.test(key)));assert.equal(calls[0].url,'https://api.razorpay.com/v1/orders');assert.equal(calls[0].options.redirect,'error');
});
test('order amount, currency, product, intent and environment are all independently checked',async()=>{
 for(const changes of [{amount:9900},{currency:'USD'},{receipt:'other'},{notes:{...order.notes,game_product:'other'}},{notes:{...order.notes,game_environment:'sandbox'}},{notes:{...order.notes,game_intent:crypto.randomUUID()}},{partial_payment:true}])await assert.rejects(()=>provider(async()=>Response.json({...order,...changes})).client.create(intent),/verification is unavailable/);
});
test('lost order creation is recovered by exact receipt lookup; substring matches cannot bind another order',async()=>{
 const {client,calls}=provider(async()=>Response.json({entity:'collection',items:[{...order,receipt:'prefix-'+order.receipt},order]}));
 assert.equal((await client.lookup(intent)).id,order.id);assert(calls[0].url.includes('receipt=bb_'));assert.equal(calls[0].options.method,'GET');
 assert.equal(await provider(async()=>Response.json({entity:'collection',items:[]})).client.lookup(intent),null);
 await assert.rejects(()=>provider(async()=>Response.json({entity:'collection',items:[order,order]})).client.lookup(intent),/verification is unavailable/);
});
test('authorized, failed and uncaptured payments cannot supply a financial grant',async()=>{
 const {client}=provider();assert.equal(client.verifyPayment({...payment,status:'authorized',captured:false},intent).state,'pending');assert.equal(client.verifyPayment({...payment,status:'failed',captured:false},intent).state,'failed');
 await assert.rejects(async()=>client.verifyPayment({...payment,captured:false},intent),/verification is unavailable/);
 for(const change of [{order_id:'order_other'},{amount:1},{currency:'USD'},{amount_refunded:7901},{created_at:Math.floor(now/1000)+301}])await assert.rejects(async()=>client.verifyPayment({...payment,...change},intent),/verification is unavailable/);
});
test('captured and partial/full refunded payments keep exact integer amounts and provider deductions',()=>{
 const {client}=provider();const partial=client.verifyPayment({...payment,amount_refunded:2000},intent);assert.equal(partial.refunded,2000);assert.equal(partial.amount,7900);assert.equal(partial.fee,158);assert.equal(partial.tax,24);
 assert.equal(client.verifyPayment({...payment,status:'refunded',amount_refunded:7900},intent).refunded,7900);
 assert.throws(()=>client.verifyPayment({...payment,status:'refunded',amount_refunded:0},intent),/verification is unavailable/);
});
test('checkout HMAC uses the server-held order ID, and raw webhook bytes cannot be reserialized',async()=>{
 const {client}=provider(),signature=createHmac('sha256',secret).update(intent.order_id+'|pay_example').digest('hex');assert.equal(await client.callbackSignature(intent,'pay_example',signature),true);assert.equal(await client.callbackSignature({...intent,order_id:'order_other'},'pay_example',signature),false);
 const raw=new TextEncoder().encode('{ "event": "payment.captured", "note": "₹" }\r\n'),hash=createHmac('sha256',secret).update(raw).digest('hex');assert.equal(await verifyHmac(raw,hash,secret),true);assert.equal(await verifyHmac(JSON.stringify(JSON.parse(new TextDecoder().decode(raw))),hash,secret),false);assert.equal(await verifyHmac(raw,'bad',secret),false);
});
test('a collection cannot conceal more than one captured payment, and canonical payment is refetched',async()=>{
 const {client,calls}=provider(async url=>Response.json(url.includes('/orders/')?{entity:'collection',items:[payment]}:payment));assert.equal((await client.payments(intent))[0].state,'captured');assert(calls.some(c=>c.url.endsWith('/payments/pay_example')));
 await assert.rejects(()=>provider(async()=>Response.json({entity:'collection',items:[payment,payment]})).client.payments(intent),/Multiple payments/);
});
test('missing or mixed production/sandbox configuration fails closed and owned origins are explicit',()=>{
 assert.equal(webCommerce(()=>undefined),null);
 const values={RAZORPAY_CONFIG_JSON:JSON.stringify({scope,environment:'production',merchantId:'acc_example',ownedOrigins:['https://game.example']}),RAZORPAY_KEY_ID:'rzp_live_example',RAZORPAY_KEY_SECRET:secret,RAZORPAY_WEBHOOK_SECRETS_JSON:JSON.stringify(['s'.repeat(40)])};
 assert(webCommerce(key=>values[key]));values.RAZORPAY_KEY_ID='rzp_test_example';assert.equal(webCommerce(key=>values[key]),null);
 values.RAZORPAY_KEY_ID='rzp_live_example';values.RAZORPAY_CONFIG_JSON=JSON.stringify({scope,merchantId:'acc_example',ownedOrigins:['http://game.example']});assert.equal(webCommerce(key=>values[key]),null);
});
test('provider failures and excessive bodies do not expose private diagnostic text',async()=>{
 for(const response of [()=>new Response('private-key-diagnostic',{status:401}),()=>new Response('x'.repeat(524289)),()=>new Response('invalid-json')])await assert.rejects(()=>provider(response).client.create(intent),error=>error.message.includes('verification is unavailable')&&!error.message.includes('private'));
});
