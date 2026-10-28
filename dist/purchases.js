// SDK callbacks do not change a balance. Only an authenticated, independently
// verified backend response can update the shared bank.
import {recoverPurchasePages} from './purchase-recovery.js';
const changed=()=>Error('Your account changed. Reopen the time bank. Purchases stay with the account used at checkout.');
export class PurchaseService {
 constructor({cloud,platform,storage,loadSDK=()=>import('./vendor/purchases.js')}){Object.assign(this,{cloud,platform,storage,loadSDK});this.items=[];this.busy=false;this.sdk=null;this.sdkOwner=null;this.configuration=null;this.catalogOwner=null;this.retiredOwners=new Set();this.identityTask=Promise.resolve();}
 check(owner){if(!owner||this.cloud.userId!==owner||this.retiredOwners.has(owner))throw changed();}
 reset(){this.items=[];this.configuration=null;this.catalogOwner=null;}
 async exclusive(work){if(this.busy)throw Error('A purchase or recovery is already in progress.');this.busy=true;try{return await work();}finally{this.busy=false;}}
 identified(owner,configuration){const work=async()=>{
  this.check(owner);if(!this.sdk)this.sdk=await this.loadSDK();this.check(owner);
  if(this.sdkKey&&this.sdkKey!==configuration.publicKey)throw Error('Purchase settings changed. Restart the app before purchasing.');
  if(!this.sdkKey){await this.sdk.Purchases.configure({apiKey:configuration.publicKey,appUserID:owner});this.sdkOwner=owner;this.sdkKey=configuration.publicKey;}
  else if(this.sdkOwner!==owner){await this.sdk.Purchases.logIn({appUserID:owner});this.sdkOwner=owner;}
  this.check(owner);return this.sdk;
 };const task=this.identityTask.catch(()=>{}).then(work);this.identityTask=task;return task;}
 retire(owner){this.retiredOwners.add(owner);this.reset();const task=this.identityTask.catch(()=>{}).then(async()=>{if(this.sdkOwner===owner){await this.sdk.Purchases.logOut();this.sdkOwner=null;}});this.identityTask=task;return task;}
 key(owner){return 'brick-breaker-purchase-pending-v1:'+owner;}
 journal(owner,value){try{if(!this.storage?.setItem)throw Error();this.storage.setItem(this.key(owner),JSON.stringify(value));}catch{throw Error('Device storage is unavailable. Reopen the app before purchasing.');}}
 pending(owner){try{return JSON.parse(this.storage?.getItem(this.key(owner))||'null');}catch{return null;}}
 clear(owner){try{this.storage?.removeItem(this.key(owner));}catch{}}
 async load(){return this.exclusive(async()=>{
  const owner=this.cloud.userId;this.check(owner);this.reset();
  const configuration=await this.cloud.api('purchase-catalog',{platform:this.platform});this.check(owner);
  this.configuration=configuration;this.catalogOwner=owner;
  if(!configuration.available)return configuration;
  // Web has its own checkout adapter. Never load a native SDK in a browser.
  if(!['android','ios'].includes(this.platform)||configuration.provider!=='revenuecat')throw Error('Checkout is unavailable for this edition.');
  const products=configuration.products;
  if(!Array.isArray(products)||products.length>64||products.some(p=>typeof p.storeId!=='string'||!p.storeId||!Number.isSafeInteger(p.milliseconds)||p.milliseconds<=0))throw Error('The purchase catalog is invalid.');
  const sdk=await this.identified(owner,configuration),result=products.length?await sdk.Purchases.getProducts({productIdentifiers:products.map(p=>p.storeId),type:sdk.PRODUCT_CATEGORY.NON_SUBSCRIPTION}):{products:[]};this.check(owner);
  this.items=products.flatMap(p=>{const product=result.products.find(row=>row.identifier===p.storeId);return product&&typeof product.priceString==='string'&&product.priceString&&Number.isFinite(product.price)&&product.price>=0?[{...p,price:product.priceString,product}]:[];});
  return {...configuration,products:this.items};
 });}
 async verify(owner,transaction){
  this.check(owner);const result=await this.cloud.api('purchase-verify',{transactionId:transaction});this.check(owner);
  if(result.deletedAccountPurchase)throw Error('This receipt belongs to a deleted account. Contact support for purchase assistance.');
  if(result.verified||result.refunded)this.clear(owner);
  return {state:result.verified?'verified':result.refunded?'refunded':'pending',wallet:result.wallet};
 }
 async buy(id){return this.exclusive(async()=>{
  const owner=this.cloud.userId;this.check(owner);
  const unresolved=this.pending(owner);
  if(unresolved?.transaction)return this.verify(owner,unresolved.transaction);
  if(unresolved)throw Error('A previous store checkout is unresolved. Recover purchases before buying again.');
  const item=this.items.find(p=>p.id===id);if(!item||this.catalogOwner!==owner||!this.configuration?.available)throw Error('Refresh the time packs before purchasing.');
  const sdk=await this.identified(owner,this.configuration);this.check(owner);
  this.journal(owner,{stage:'store',productId:item.storeId,createdAt:Date.now()});
  let result;
  try{result=await sdk.Purchases.purchaseStoreProduct({product:item.product});}
  catch(error){
   this.check(owner);
   if(error?.userCancelled||String(error?.code)==='1'){this.clear(owner);return {state:'cancelled'};}
   if(String(error?.code)==='20')return {state:'pending'};
   throw Error('The store could not confirm this purchase. Recover purchases before trying again.');
  }
  this.check(owner);
  const transaction=result?.transaction?.transactionIdentifier;
  if(result?.productIdentifier!==item.storeId||typeof transaction!=='string'||!transaction)throw Error('The purchase needs recovery. Reopen the time bank and recover purchases.');
  this.journal(owner,{stage:'verify',productId:item.storeId,transaction,createdAt:Date.now()});
  return this.verify(owner,transaction);
 });}
 async recover(){return this.exclusive(async()=>{
  const owner=this.cloud.userId;this.check(owner);
  if(!this.configuration?.available||this.catalogOwner!==owner)throw Error('Refresh the time packs before recovering purchases.');
  const sdk=await this.identified(owner,this.configuration),restored=await sdk.Purchases.restorePurchases();this.check(owner);
  const result=await recoverPurchasePages({cloud:this.cloud,owner,storage:this.storage,key:'brick-breaker-native-recovery-v1:'+owner+':'+(this.configuration.environment||'production'),action:'purchase-sync'});
  if(result.deletedAccountPurchase)throw Error('A receipt belongs to a deleted account. Contact support for purchase assistance.');
  if(!result.complete)return {state:'recovery-partial',wallet:result.wallet};
  const pending=this.pending(owner);
  if(pending?.transaction)return this.verify(owner,pending.transaction);
  if(pending?.stage==='store'){
   const recent=restored?.customerInfo?.nonSubscriptionTransactions?.filter(row=>row.productIdentifier===pending.productId&&Date.parse(row.purchaseDate)>=pending.createdAt-120000)||[];
   const transaction=recent.length===1?recent[0].transactionIdentifier:null;
   if(transaction){this.journal(owner,{...pending,stage:'verify',transaction});return this.verify(owner,transaction);}
  }
  return {state:'synced',wallet:result.wallet,pending:!!pending};
 });}
}
