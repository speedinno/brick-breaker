const ROOT='https://api.razorpay.com/v1';
const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
const orderId=value=>typeof value==='string'&&/^order_[A-Za-z0-9]{1,80}$/.test(value);
const paymentId=value=>typeof value==='string'&&/^pay_[A-Za-z0-9]{1,80}$/.test(value);
const integer=(value,min=0,max=100000000)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
export class WebCheckoutError extends Error {}
const failure=()=>new WebCheckoutError('Checkout verification is unavailable. Recover purchases after reconnecting.');
export async function verifyHmac(message,signature,secret){
 if(typeof signature!=='string'||!/^[a-f\d]{64}$/i.test(signature)||typeof secret!=='string'||secret.length<16)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g),pair=>parseInt(pair,16)),typeof message==='string'?new TextEncoder().encode(message):message);
}
export class RazorpayCheckout {
 constructor({keyId,keySecret,merchantId,scope,environment='production',fetch:request=fetch,now=()=>Date.now()}){
  if(!['production','sandbox'].includes(environment)||typeof keyId!=='string'||!new RegExp('^rzp_'+(environment==='production'?'live':'test')+'_[A-Za-z0-9]{4,100}$').test(keyId)||typeof keySecret!=='string'||keySecret.length<16||typeof merchantId!=='string'||!/^acc_[A-Za-z0-9]{1,80}$/.test(merchantId)||typeof scope!=='string'||!/^web:[A-Za-z0-9._-]{3,160}$/.test(scope))throw failure();
  this.keyId=keyId;this.keySecret=keySecret;this.merchantId=merchantId;this.scope=scope;this.environment=environment;this.request=request;this.now=now;
 }
 async api(path,body){
  let response;try{response=await this.request(ROOT+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+btoa(this.keyId+':'+this.keySecret),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw failure();}
  if(!response.ok)throw failure();const reader=response.body?.getReader();if(!reader)throw failure();let total=0,chunks=[];
  try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>524288){await reader.cancel();throw failure();}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw failure();}
 }
 intent(value){
  if(!value||!uuid(value.id)||value.scope!==this.scope||value.environment!==this.environment||typeof value.product_id!=='string'||!value.product_id||!integer(Number(value.amount),100)||value.currency!=='INR'||!integer(Number(value.milliseconds),1,9000000000)||!Number.isFinite(Date.parse(value.created_at)))throw failure();
  return value;
 }
 receipt(intent){return 'bb_'+this.intent(intent).id;}
 verifyOrder(order,intent){
  this.intent(intent);const notes=order?.notes;
  if(order?.entity!=='order'||!orderId(order.id)||order.amount!==Number(intent.amount)||order.currency!==intent.currency||order.receipt!==this.receipt(intent)||notes?.game_intent!==intent.id||notes?.game_product!==intent.product_id||notes?.game_scope!==this.scope||notes?.game_environment!==this.environment||!['created','attempted','paid'].includes(order.status)||order.partial_payment===true||!integer(order.created_at,946684800,Math.floor(this.now()/1000)+300)||order.created_at<Date.parse(intent.created_at)/1000-300)throw failure();
  return order;
 }
 async create(intent){
  this.intent(intent);
  const result=await this.api('/orders',{amount:Number(intent.amount),currency:intent.currency,receipt:this.receipt(intent),partial_payment:false,notes:{game_intent:intent.id,game_product:intent.product_id,game_scope:this.scope,game_environment:this.environment}});
  return this.verifyOrder(result,intent);
 }
 async lookup(intent){
  const page=await this.api('/orders?'+new URLSearchParams({receipt:this.receipt(intent),count:'100',skip:'0'}));
  if(page.entity!=='collection'||!Array.isArray(page.items)||page.items.length>=100)throw failure();
  const matches=page.items.filter(row=>row.receipt===this.receipt(intent));if(matches.length>1)throw failure();
  return matches.length?this.verifyOrder(matches[0],intent):null;
 }
 async getOrder(id){if(!orderId(id))throw failure();return this.api('/orders/'+id);}
 async readPayment(id){if(!paymentId(id))throw failure();const payment=await this.api('/payments/'+id);if(payment?.entity!=='payment'||payment.id!==id||!orderId(payment.order_id))throw failure();return payment;}
 verifyPayment(payment,intent){
  this.intent(intent);
  if(payment?.entity!=='payment'||!paymentId(payment.id)||payment.order_id!==intent.order_id||!orderId(intent.order_id)||payment.amount!==Number(intent.amount)||payment.currency!==intent.currency||!integer(payment.amount_refunded,0,payment.amount)||!integer(payment.created_at,946684800,Math.floor(this.now()/1000)+300)||payment.created_at<Date.parse(intent.created_at)/1000-300||![payment.fee,payment.tax].every(value=>value===null||value===undefined||integer(value)))throw failure();
  if(['created','authorized','failed'].includes(payment.status))return {state:payment.status==='failed'?'failed':'pending'};
  if(!['captured','refunded'].includes(payment.status)||payment.captured!==true||payment.status==='refunded'&&payment.amount_refunded!==payment.amount)throw failure();
  return {state:'captured',payment:payment.id,amount:payment.amount,currency:payment.currency,refunded:payment.amount_refunded,purchasedAt:new Date(payment.created_at*1000).toISOString(),fee:payment.fee??null,tax:payment.tax??null};
 }
 async payment(intent,id){return this.verifyPayment(await this.readPayment(id),intent);}
 async payments(intent){
  this.intent(intent);if(!orderId(intent.order_id))throw failure();const result=await this.api('/orders/'+intent.order_id+'/payments');
  if(result.entity!=='collection'||!Array.isArray(result.items)||result.items.length>100)throw failure();
  const completed=result.items.filter(row=>['captured','refunded'].includes(row.status));
  if(completed.length>1)throw new WebCheckoutError('Multiple payments need support review. Your existing balance is safe.');
  return completed.length?[await this.payment(intent,completed[0].id)]:[];
 }
 async callbackSignature(intent,payment,signature){this.intent(intent);if(!orderId(intent.order_id)||!paymentId(payment))return false;return verifyHmac(intent.order_id+'|'+payment,signature,this.keySecret);}
}
