import {RazorpayCheckout,WebCheckoutError} from './razorpay.js';
export function webCommerce(env,request=fetch){
 try{
  const config=JSON.parse(env('RAZORPAY_CONFIG_JSON')||'null');if(!config)return null;
  const provider=new RazorpayCheckout({...config,keyId:env('RAZORPAY_KEY_ID'),keySecret:env('RAZORPAY_KEY_SECRET'),fetch:request});
  if(!Array.isArray(config.ownedOrigins)||!config.ownedOrigins.length||config.ownedOrigins.length>8)return null;
  const origins=new Set(config.ownedOrigins.map(value=>{const url=new URL(value);if(url.origin!==value||url.protocol!=='https:'&&!(provider.environment==='sandbox'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error();return value;}));
  const secrets=JSON.parse(env('RAZORPAY_WEBHOOK_SECRETS_JSON')||'[]');
  if(!Array.isArray(secrets)||!secrets.length||secrets.length>3||secrets.some(s=>typeof s!=='string'||s.length<32))return null;
  return {provider,origins,secrets};
 }catch{return null;}
}
const unavailable=()=>new WebCheckoutError('Web checkout is not configured yet. Manual play is available.');
async function rpc(admin,name,args){const result=await admin.rpc(name,args);if(result.error)throw new WebCheckoutError('Could not reconcile this checkout. Recover purchases before trying again.');return result.data;}
export async function webCatalog(commerce,admin){
 if(!commerce)return {available:false,reason:'Web checkout is not configured yet.'};
 const {scope,environment}=commerce.provider;
 const prices=await admin.from('game_web_prices').select('id,product_id').eq('scope',scope).eq('environment',environment).eq('current',true).limit(64);
 if(prices.error)throw unavailable();const products=[];
 for(const price of prices.data||[]){const row=await admin.from('game_purchase_products').select('milliseconds,benefit_key,config_version').eq('provider','razorpay').eq('scope',scope).eq('environment',environment).eq('product_id',price.product_id).eq('platform','web').eq('available',true).maybeSingle();if(row.error)throw unavailable();if(row.data)products.push({id:price.id,milliseconds:Number(row.data.milliseconds),benefit:row.data.benefit_key,version:row.data.config_version});}
 return {available:true,provider:'razorpay',environment,products};
}
async function attach(commerce,admin,intent,order){
 const canonical=commerce.provider.verifyOrder(order,intent);
 return rpc(admin,'game_attach_web_order',{p_id:intent.id,p_order:canonical.id,p_amount:canonical.amount,p_currency:canonical.currency});
}
export async function prepareWebCheckout(commerce,admin,user,intentId,priceId){
 if(!commerce)throw unavailable();const {provider}=commerce;
 const prepared=await rpc(admin,'game_prepare_web_order',{p_user:user,p_id:intentId,p_scope:provider.scope,p_environment:provider.environment,p_price:priceId});
 let intent=prepared.order,order;
 if(intent.order_id)order=provider.verifyOrder(await provider.getOrder(intent.order_id),intent);
 else{
  order=prepared.create?await provider.create(intent):await provider.lookup(intent);
  if(!order)return {state:'preparing',intentId:intent.id};
  intent=await attach(commerce,admin,intent,order);
 }
 return {state:order.status==='paid'?'paid':'quoted',intentId:intent.id,orderId:intent.order_id,keyId:provider.keyId,environment:provider.environment,amount:order.amount,currency:order.currency,milliseconds:Number(intent.milliseconds),quoteUntil:intent.quote_until};
}
export async function findWebIntent(commerce,admin,id,user){
 if(!commerce)throw unavailable();let query=admin.from('game_web_orders').select('*').eq('id',id).eq('scope',commerce.provider.scope).eq('environment',commerce.provider.environment);
 if(user)query=query.eq('owner_user_id',user);
 const result=await query.maybeSingle();if(result.error||!result.data)throw new WebCheckoutError('This checkout is unavailable for this game account.');return result.data;
}
async function apply(commerce,admin,intent,payment){
 if(payment.state!=='captured')return {state:payment.state};
 const result=await rpc(admin,'game_apply_web_payment',{p_id:intent.id,p_order:intent.order_id,p_payment:payment.payment,p_amount:payment.amount,p_currency:payment.currency,p_refunded:payment.refunded,p_purchased_at:payment.purchasedAt,p_fee:payment.fee,p_tax:payment.tax});
 return {state:result.state==='owned'||result.state==='partially_refunded'?'verified':result.state,refundedMs:result.refundedMs,chargebackMs:result.chargebackMs,disputeReview:result.disputeReview};
}
/** @param {{paymentId?:string,signature?:string,requireSignature?:boolean}} options */
export async function recoverWebCheckout(commerce,admin,intent,options={}){
 const {paymentId,signature,requireSignature=false}=options;
 if(!commerce)throw unavailable();const {provider}=commerce;
 if(!intent.order_id){const order=await provider.lookup(intent);if(!order)return {state:'pending',unopened:true};intent=await attach(commerce,admin,intent,order);}
 if(requireSignature&&!await provider.callbackSignature(intent,paymentId,signature))throw new WebCheckoutError('The checkout response could not be authenticated. Recover purchases to check the store.');
 if(paymentId)return apply(commerce,admin,intent,await provider.payment(intent,paymentId));
 if(intent.payment_id)return apply(commerce,admin,intent,await provider.payment(intent,intent.payment_id));
 const order=provider.verifyOrder(await provider.getOrder(intent.order_id),intent),payments=await provider.payments(intent);
 if(!payments.length)return {state:'pending',unopened:order.status==='created'};
 return apply(commerce,admin,intent,payments[0]);
}
export async function webhookWebPayment(commerce,admin,paymentId,{minimumRefund=0}={}){
 if(!commerce)throw unavailable();const {provider}=commerce,payment=await provider.readPayment(paymentId),order=await provider.getOrder(payment.order_id),id=order.notes?.game_intent;
 if(typeof id!=='string'||!/^[a-f\d-]{36}$/i.test(id)||order.notes?.game_scope!==provider.scope||order.notes?.game_environment!==provider.environment)return {ignored:true};
 let intent=await findWebIntent(commerce,admin,id);provider.verifyOrder(order,intent);
 if(!intent.order_id)intent=await attach(commerce,admin,intent,order);
 const verified=provider.verifyPayment(payment,intent);
 // A signed processed-refund notification can request a later retry, but its
 // amount is never used to mint or reverse credit without a provider lookup.
 if(minimumRefund>0&&(verified.state!=='captured'||verified.refunded<minimumRefund))throw new WebCheckoutError('Refund reconciliation is pending.');
 return apply(commerce,admin,intent,verified);
}
async function readWebDispute(commerce,admin,disputeId){
 if(!commerce)throw unavailable();const {provider}=commerce;
 const raw=await provider.readDispute(disputeId),payment=await provider.readPayment(raw.payment_id),order=await provider.getOrder(payment.order_id),id=order.notes?.game_intent;
 if(typeof id!=='string'||!/^[a-f\d-]{36}$/i.test(id)||order.notes?.game_scope!==provider.scope||order.notes?.game_environment!==provider.environment)return{ignored:true};
 let intent=await findWebIntent(commerce,admin,id);provider.verifyOrder(order,intent);
 if(intent.order_id&&intent.order_id!==order.id)throw new WebCheckoutError('Dispute order verification is pending.');
 intent={...intent,order_id:order.id};
 const dispute=provider.verifyDispute(raw,intent,payment),verified=provider.verifyPayment(payment,intent);
 const previous=await admin.from('game_web_disputes').select('revision,status,phase,amount,amount_deducted,effective_deducted,needs_review,review_phase').eq('scope',provider.scope).eq('environment',provider.environment).eq('dispute_id',dispute.id).maybeSingle();
 if(previous.error||previous.data&&!(typeof previous.data.revision==='number'&&Number.isSafeInteger(previous.data.revision)&&previous.data.revision>=0||typeof previous.data.revision==='string'&&/^(0|[1-9]\d{0,18})$/.test(previous.data.revision)))throw new WebCheckoutError('Dispute review state is unavailable.');
 const record=previous.data?{revision:String(previous.data.revision),status:previous.data.status,phase:previous.data.phase,amount:Number(previous.data.amount),deducted:Number(previous.data.amount_deducted),effectiveDeducted:Number(previous.data.effective_deducted),needsReview:previous.data.needs_review,reviewPhase:previous.data.review_phase}:null;
 const facts={scope:provider.scope,environment:provider.environment,intentId:intent.id,orderId:order.id,productId:intent.product_id,milliseconds:Number(intent.milliseconds),record,dispute,payment:{...verified,payment:payment.id,amount:payment.amount,currency:payment.currency}};
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(facts))),fingerprint=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
 return{intent,order,facts,fingerprint};
}
export async function inspectWebDispute(commerce,admin,disputeId){const read=await readWebDispute(commerce,admin,disputeId);if('ignored' in read)return read;return{...read.facts,fingerprint:read.fingerprint};}
/** @param {{hintPhase?:string,hintStatus?:string,minimumDeducted?:number,allowCorrection?:boolean,expectedFingerprint?:string}} options */
export async function reconcileWebDispute(commerce,admin,disputeId,options={}){
 const read=await readWebDispute(commerce,admin,disputeId);if('ignored' in read)return read;
 const {intent,order,facts,fingerprint}=read,{dispute,payment:verified}=facts;
 const phases=['fraud','retrieval','chargeback','pre_arbitration','arbitration'],rank=status=>status==='open'?0:status==='under_review'?1:2;
 const hint=phases.indexOf(options.hintPhase??''),current=phases.indexOf(dispute.phase);
 // Signed webhook facts are freshness hints, never grant/reversal authority.
 // Retry if the independently read provider state has not caught up yet.
 if(hint>=0&&(current<hint||current===hint&&options.hintStatus&&rank(dispute.status)<rank(options.hintStatus)))throw new WebCheckoutError('Dispute verification is still pending.');
 if(current===hint&&dispute.status==='lost'&&Number.isSafeInteger(options.minimumDeducted)&&dispute.deducted<(options.minimumDeducted??0))throw new WebCheckoutError('Dispute verification is still pending.');
 if(verified.state!=='captured'&&intent.purchase_id)throw new WebCheckoutError('Dispute payment verification is still pending.');
 if(options.allowCorrection===true&&(!facts.record||!/^[a-f\d]{64}$/.test(options.expectedFingerprint??'')||options.expectedFingerprint!==fingerprint))throw new WebCheckoutError('The reviewed financial facts changed. Inspect the dispute again before resolving it.');
 await attach(commerce,admin,intent,order);
 return rpc(admin,'game_record_web_dispute',{p_id:intent.id,p_order:intent.order_id,p_dispute:dispute,p_payment:verified,p_allow_correction:options.allowCorrection===true,p_expected_revision:options.allowCorrection===true?facts.record?.revision:null});
}
