import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WebPurchaseService} from '../dist/web-purchases.js';
const priceId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function setup(){
 const saved=new Map(),calls=[],widgets=[],config={available:true,provider:'razorpay',environment:'production',products:[{id:priceId,milliseconds:300000}]},wallet={availableMs:7};let opens=0;
 const cloud={userId:'a',api:async(action,body)=>{calls.push({action,body});if(action==='purchase-catalog')return config;if(action==='purchase-web-order')return{state:'quoted',intentId:body.intentId,orderId:'order_example',keyId:'rzp_live_example',environment:'production',amount:9900,currency:'INR',milliseconds:300000};if(action==='purchase-web-sync')return{wallet,next:null};return{state:'verified',wallet};}};
 class Checkout{constructor(options){this.options=options;widgets.push(this);}open(){opens++;}}
 const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},service=new WebPurchaseService({cloud,storage,loadCheckout:async()=>Checkout});
 return{saved,calls,widgets,cloud,service,config,wallet,get opens(){return opens;}};
}
const callback={razorpay_order_id:'order_example',razorpay_payment_id:'pay_example',razorpay_signature:'a'.repeat(64)};
test('checking actual provider-confirmed price never opens checkout; a separate fresh confirmation is required',async()=>{
 const t=setup();await t.service.load();assert.equal(t.service.items[0].price,null);
 const quote=await t.service.buy(priceId);assert.equal(quote.state,'quoted');assert.equal(quote.quote.amount,9900);assert.match(quote.quote.price,/99/);assert.equal(t.opens,0);
 const result=t.service.confirm();assert.equal(t.opens,1);assert.equal(t.widgets[0].options.amount,9900);assert.equal(t.widgets[0].options.order_id,'order_example');assert(!t.widgets[0].options.prefill);
 t.widgets[0].options.handler(callback);assert.equal((await result).state,'verified');assert.equal(t.service.pending('a'),null);
});
test('an uncertain order response retains the same intent on retry and cannot silently create a fresh checkout',async()=>{
 const t=setup();await t.service.load();const original=t.cloud.api;let fail=true;
 t.cloud.api=async(action,body)=>{if(action==='purchase-web-order'&&fail){fail=false;t.calls.push({action,body});throw Error('Response lost');}return original(action,body);};
 await assert.rejects(()=>t.service.buy(priceId),/Response lost/);const intent=t.service.pending('a').intentId;await t.service.buy(priceId);
 assert.equal(t.calls.filter(c=>c.action==='purchase-web-order').length,2);assert(t.calls.filter(c=>c.action==='purchase-web-order').every(c=>c.body.intentId===intent));assert.equal(t.opens,0);
});
test('store close before callback remains pending, and a late callback stays recoverable without a client grant',async()=>{
 const t=setup();await t.service.load();await t.service.buy(priceId);const original=t.cloud.api;t.cloud.api=async(action,body)=>action==='purchase-web-status'?{state:'pending',wallet:{availableMs:0}}:original(action,body);
 const result=t.service.confirm();t.widgets[0].options.modal.ondismiss();assert.equal((await result).state,'pending');t.widgets[0].options.handler(callback);
 assert.equal(t.service.pending('a').stage,'verify');assert(!t.calls.some(c=>c.action==='purchase-web-confirm'));
 t.cloud.api=original;const recovered=await t.service.recover();assert.equal(recovered.state,'verified');assert.equal(recovered.wallet.availableMs,7);assert.equal(t.service.pending('a'),null);
});
test('a late old callback cannot replace the journal of a newer checkout',async()=>{
 const t=setup();await t.service.load();await t.service.buy(priceId);const result=t.service.confirm();t.widgets[0].options.modal.ondismiss();await result;
 await t.service.buy(priceId);const current=t.service.pending('a').intentId;t.widgets[0].options.handler(callback);assert.equal(t.service.pending('a').intentId,current);assert.notEqual(t.service.pending('a').stage,'verify');
});
test('account switching during an open payment window cannot verify into the next game account',async()=>{
 const t=setup();await t.service.load();await t.service.buy(priceId);const result=t.service.confirm(),rejected=assert.rejects(()=>result,/account changed/);
 t.cloud.userId='b';t.service.reset();t.widgets[0].options.handler(callback);await rejected;
 assert.equal(t.service.pending('a').paymentId,'pay_example');assert.equal(t.service.pending('b'),null);assert(!t.calls.some(c=>c.action==='purchase-web-confirm'));
});
test('only an unopened quote can be discarded; pending payment recovery cannot turn it into an unopened quote',async()=>{
 const t=setup();await t.service.load();await t.service.buy(priceId);assert.equal(t.service.discardQuote().state,'quote-discarded');await t.service.buy(priceId);
 const original=t.cloud.api;t.cloud.api=async(action,body)=>action==='purchase-web-status'?{state:'pending',wallet:t.wallet}:original(action,body);
 const result=t.service.confirm();t.widgets[0].options.modal.ondismiss();await result;assert.throws(()=>t.service.discardQuote(),/payment window/);
 t.service.journal('a',{...t.service.pending('a'),stage:'verify'});assert.equal((await t.service.recover()).state,'quoted');assert.throws(()=>t.service.discardQuote(),/payment window/);assert.equal(t.opens,1);
});
test('provider callback alone cannot manufacture success while backend verification is unavailable',async()=>{
 const t=setup();await t.service.load();await t.service.buy(priceId);t.cloud.api=async()=>{throw Error('Backend unavailable');};
 const result=t.service.confirm(),rejected=assert.rejects(()=>result,/Backend unavailable/);t.widgets[0].options.handler(callback);await rejected;assert.equal(t.service.pending('a').stage,'verify');
});
test('missing configuration or failed durable storage cannot open a payment window',async()=>{
 const t=setup();t.config.available=false;await t.service.load();await assert.rejects(()=>t.service.buy(priceId),/Refresh/);assert.equal(t.opens,0);
 t.config.available=true;await t.service.load();t.service.storage.setItem=()=>{throw Error();};await assert.rejects(()=>t.service.buy(priceId),/storage is unavailable/);assert(!t.calls.some(c=>c.action==='purchase-web-order'));
});
test('a quote belonging to an already paid order reconciles without opening another checkout',async()=>{
 const t=setup();await t.service.load();const original=t.cloud.api;t.cloud.api=async(action,body)=>action==='purchase-web-order'?{state:'paid'}:original(action,body);
 const result=await t.service.buy(priceId);assert.equal(result.state,'verified');assert.equal(t.opens,0);assert.equal(t.service.pending('a'),null);
});
test('account changes while quote preparation is waiting cannot populate another account price review',async()=>{
 const t=setup();await t.service.load();const wait=deferred(),entered=deferred();t.cloud.api=async()=>{entered.resolve();return wait.promise;};
 const task=t.service.buy(priceId),rejected=assert.rejects(()=>task,/account changed/);await entered.promise;t.cloud.userId='b';t.service.reset();wait.resolve({state:'preparing'});await rejected;assert.equal(t.service.quote,null);assert.equal(t.opens,0);
});
test('damaged checkout cache cannot start or discard a payment before authoritative recovery',async()=>{
 const t=setup();await t.service.load();t.saved.set(t.service.key('a'),'{broken');
 await assert.rejects(()=>t.service.buy(priceId),/damaged/);assert.throws(()=>t.service.discardQuote(),/damaged/);assert(t.saved.has(t.service.key('a')));
 assert.equal((await t.service.recover()).state,'synced');assert.equal(t.service.pending('a'),null);assert.equal((await t.service.buy(priceId)).state,'quoted');assert.equal(t.opens,0);
});
