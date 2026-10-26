import {recoverPurchasePages} from './purchase-recovery.js';
let checkoutLoad;
export function loadWebCheckout(){
 if(typeof window.Razorpay==='function')return Promise.resolve(window.Razorpay);
 if(checkoutLoad)return checkoutLoad;
 checkoutLoad=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;
  const timeout=setTimeout(()=>fail(),15000);
  const fail=()=>{clearTimeout(timeout);script.remove();checkoutLoad=null;reject(Error('The payment service could not load. Manual play remains available.'));};
  script.onerror=fail;script.onload=()=>{clearTimeout(timeout);if(typeof window.Razorpay!=='function')return fail();resolve(window.Razorpay);};document.head.append(script);
 });return checkoutLoad;
}
const changed=()=>Error('Your account changed. Purchases stay with the account used at checkout.');
export function webPrice(quote){if(!Number.isSafeInteger(quote.amount)||quote.currency!=='INR')throw Error('Invalid checkout price');return new Intl.NumberFormat(undefined,{style:'currency',currency:quote.currency}).format(quote.amount/100);}
export class WebPurchaseService {
 constructor({cloud,storage,loadCheckout=loadWebCheckout}){Object.assign(this,{cloud,storage,loadCheckout});this.busy=false;this.reset();}
 reset(){this.items=[];this.configuration=null;this.catalogOwner=null;this.quote=null;this.Checkout=null;this.journalCorrupt=false;}
 check(owner){if(!owner||this.cloud.userId!==owner)throw changed();}
 key(owner){return 'brick-breaker-web-checkout-v1:'+owner;}
 pending(owner){try{const value=JSON.parse(this.storage.getItem(this.key(owner))||'null');if(value===null){this.journalCorrupt=false;return null;}if(!value||typeof value!=='object'||!['preparing','review','checkout','verify'].includes(value.stage)||![value.intentId,value.priceId].every(s=>typeof s==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(s)))throw Error();this.journalCorrupt=false;return value;}catch{this.journalCorrupt=true;return null;}}
 journal(owner,value){try{if(!this.storage?.setItem)throw Error();this.storage.setItem(this.key(owner),JSON.stringify(value));}catch{throw Error('Device storage is unavailable. Reopen the app before purchasing.');}}
 clear(owner,intentId){try{const value=this.pending(owner);if(!intentId||value?.intentId===intentId)this.storage.removeItem(this.key(owner));}catch{}}
 async exclusive(work){if(this.busy)throw Error('A checkout or recovery is already in progress.');this.busy=true;try{return await work();}finally{this.busy=false;}}
 async load(){return this.exclusive(async()=>{
  const owner=this.cloud.userId;this.check(owner);this.reset();const config=await this.cloud.api('purchase-catalog',{platform:'web'});this.check(owner);this.configuration=config;this.catalogOwner=owner;
  if(!config.available)return config;
  if(config.provider!=='razorpay'||!Array.isArray(config.products)||config.products.length>64||config.products.some(p=>typeof p.id!=='string'||!Number.isSafeInteger(p.milliseconds)||p.milliseconds<=0))throw Error('The purchase catalog is invalid.');
  this.items=config.products.map(item=>({...item,price:null}));return {...config,products:this.items};
 });}
 async prepare(owner,pending,item){
  this.check(owner);const result=await this.cloud.api('purchase-web-order',{intentId:pending.intentId,priceId:pending.priceId});this.check(owner);
  if(result.state==='paid')return this.status(owner,pending.intentId);
  if(result.state==='preparing')return {state:'preparing'};
  if(result.state!=='quoted'||result.intentId!==pending.intentId||typeof result.orderId!=='string'||!/^order_[A-Za-z0-9]{1,80}$/.test(result.orderId)||!/^rzp_(live|test)_[A-Za-z0-9]+$/.test(result.keyId)||result.environment!==this.configuration.environment||!Number.isSafeInteger(result.milliseconds)||result.milliseconds<=0||item&&result.milliseconds!==item.milliseconds||!Number.isSafeInteger(result.amount)||result.amount<100||result.amount>100000000||result.currency!=='INR')throw Error('The checkout quote could not be verified. Refresh time packs.');
  const price=webPrice(result);this.Checkout=await this.loadCheckout();this.check(owner);
  this.quote={...result,price,owner};this.journal(owner,{...pending,stage:['checkout','verify'].includes(pending.stage)?'checkout':'review'});return {state:'quoted',quote:this.quote};
 }
 async buy(id){return this.exclusive(async()=>{
  const owner=this.cloud.userId;this.check(owner);const item=this.items.find(item=>item.id===id);
  if(!item||!this.configuration?.available||this.catalogOwner!==owner)throw Error('Refresh time packs before checking out.');
  let pending=this.pending(owner);
  if(this.journalCorrupt)throw Error('The local checkout record is damaged. Recover purchases before starting another checkout.');
  if(pending&&pending.priceId!==id)throw Error('Recover the previous checkout or discard its unopened quote before choosing another pack.');
  if(!pending){pending={intentId:crypto.randomUUID(),priceId:id,stage:'preparing',createdAt:Date.now()};this.journal(owner,pending);}
  return this.prepare(owner,pending,item);
 });}
 discardQuote(){
  const owner=this.cloud.userId;this.check(owner);const pending=this.pending(owner);
  if(this.journalCorrupt)throw Error('Recover purchases before clearing the damaged checkout record.');
  if(pending&&!['preparing','review'].includes(pending.stage))throw Error('A payment window was opened. Recover that checkout before trying another.');
  this.clear(owner,pending?.intentId);this.quote=null;return {state:'quote-discarded'};
 }
 async status(owner,intentId){
  this.check(owner);const result=await this.cloud.api('purchase-web-status',{intentId});this.check(owner);
  if(['verified','refunded'].includes(result.state)){this.clear(owner,intentId);this.quote=null;}
  if(result.state==='account-deleted')throw Error('This receipt belongs to a deleted account. Contact support for assistance.');
  return result;
 }
 async confirm(){return this.exclusive(async()=>{
  const owner=this.cloud.userId,quote=this.quote;this.check(owner);
  if(!quote||quote.owner!==owner||!this.Checkout)throw Error('Check the price again before opening checkout.');
  const pending=this.pending(owner);if(pending?.intentId!==quote.intentId)throw Error('This checkout needs recovery.');
  this.journal(owner,{...pending,stage:'checkout'});
  let completed=false;
  const result=await new Promise((resolve,reject)=>{
   let settled=false;
   const handler=payload=>{
    if(completed)return;
    if(payload?.razorpay_order_id!==quote.orderId||typeof payload?.razorpay_payment_id!=='string'||!/^pay_[A-Za-z0-9]{1,80}$/.test(payload.razorpay_payment_id)||typeof payload.razorpay_signature!=='string'||!/^[a-f\d]{64}$/i.test(payload.razorpay_signature)){if(!settled){settled=true;reject(Error('The checkout response needs purchase recovery.'));}return;}
    completed=true;
    // Keep a late callback durable even if the modal already closed. Never
    // replace a newer checkout's journal or grant directly from this callback.
    const current=this.pending(owner);
    if(current?.intentId===quote.intentId)try{this.journal(owner,{...current,stage:'verify',paymentId:payload.razorpay_payment_id,signature:payload.razorpay_signature});}catch{}
    if(settled)return;
    settled=true;
    Promise.resolve().then(()=>{this.check(owner);return this.cloud.api('purchase-web-confirm',{intentId:quote.intentId,paymentId:payload.razorpay_payment_id,signature:payload.razorpay_signature});}).then(value=>{this.check(owner);if(['verified','refunded'].includes(value.state)){this.clear(owner,quote.intentId);this.quote=null;}resolve(value);}).catch(reject);
   };
   try{
    const widget=new this.Checkout({key:quote.keyId,amount:quote.amount,currency:quote.currency,order_id:quote.orderId,name:'SpeedInno · Brick Breaker',description:`${(quote.milliseconds/1000).toLocaleString()} seconds of autoplay`,handler,modal:{ondismiss:()=>{if(!settled){settled=true;resolve({state:'pending'});}}},theme:{color:'#ffc095'}});
    // No await precedes open(): this is the fresh explicit confirmation click.
    widget.open();
   }catch{if(!settled){settled=true;reject(Error('Checkout could not open. Recover purchases before trying again.'));}}
  });
  this.check(owner);if(result.state==='pending')return this.status(owner,quote.intentId);return result;
 });}
 async recover(){return this.exclusive(async()=>{
  const owner=this.cloud.userId;this.check(owner);if(!this.configuration?.available||this.catalogOwner!==owner)throw Error('Refresh time packs before recovering purchases.');
  const key='brick-breaker-web-recovery-v1:'+owner+':'+this.configuration.environment,repair=key+':repair';this.pending(owner);
  if(this.journalCorrupt&&!this.storage.getItem(repair)){this.storage.removeItem(key);this.storage.setItem(repair,'1');}
  const result=await recoverPurchasePages({cloud:this.cloud,owner,storage:this.storage,key,action:'purchase-web-sync'});
  if(!result.complete)return {state:'recovery-partial',wallet:result.wallet};
  const pending=this.pending(owner);if(!pending){if(this.journalCorrupt){this.storage.removeItem(this.key(owner));this.journalCorrupt=false;}this.storage.removeItem(repair);return {state:'synced',wallet:result.wallet};}
  const status=await this.status(owner,pending.intentId);if(['verified','refunded'].includes(status.state))return status;
  // A successful status lookup proves the intent already exists. Reopening its
  // quote cannot create a second provider order or silently open a payment UI.
  const quote=await this.prepare(owner,pending);return {...quote,wallet:status.wallet};
 });}
}
