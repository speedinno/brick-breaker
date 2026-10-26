// Server-only verification. SDK callbacks and webhook bodies are lookup hints,
// never evidence that time was bought. No provider diagnostic bodies are exposed.
const ROOT='https://api.revenuecat.com';
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
export class PurchaseVerificationError extends Error {}
const invalid=()=>new PurchaseVerificationError('Purchase verification is unavailable. Your receipt can be recovered later.');
export class RevenueCatVerifier {
 constructor({apiKey,projectId,environment='production',products=[],fetch:request=fetch,now=()=>Date.now()}){
  if(!apiKey||!identifier(projectId)||!['production','sandbox'].includes(environment)||!Array.isArray(products)||products.length>64)throw invalid();
  this.apiKey=apiKey;this.projectId=projectId;this.environment=environment;this.request=request;this.now=now;this.products=new Map();this.cache=new Map();
  for(const p of products){
   if(!identifier(p.id)||!identifier(p.appId)||!['android','ios'].includes(p.platform)||typeof p.bundleId!=='string'||!/^[-A-Za-z0-9._]{3,160}$/.test(p.bundleId)||typeof p.storeId!=='string'||!p.storeId||p.storeId.length>200||this.products.has(p.id))throw invalid();
   // Identity follows the real store app/SKU, so moving RevenueCat projects
   // cannot turn an already-consumed store transaction into a new purchase.
   this.products.set(p.id,Object.freeze({...p,store:p.platform==='android'?'play_store':'app_store',scope:(p.platform==='android'?'play_store':'app_store')+':'+p.bundleId}));
  }
 }
 async get(path){
  let response;try{response=await this.request(ROOT+path,{headers:{Authorization:'Bearer '+this.apiKey,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw invalid();}
  if(!response.ok)throw invalid();
  // Bound provider responses as well as client input. Do not parse an arbitrary
  // huge upstream response, or follow a Location URL with our authorization.
  const reader=response.body?.getReader();if(!reader)throw invalid();let size=0,chunks=[];
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>524288){await reader.cancel();throw invalid();}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw invalid();}
 }
 async product(mapping){
  let cached=this.cache.get(mapping.id);if(cached&&cached.until>this.now())return cached.promise;
  const promise=this.get(`/v2/projects/${this.projectId}/products/${mapping.id}?expand=app`).then(p=>{
   const consumable=p.type==='consumable'||(p.type==='one_time'&&p.one_time?.is_consumable===true);
   if(p.object!=='product'||p.id!==mapping.id||p.app_id!==mapping.appId||p.store_identifier!==mapping.storeId||!consumable)throw invalid();
   const app=p.app,bundle=app?.[mapping.store]?.[mapping.platform==='android'?'package_name':'bundle_id'];
   if(app?.object!=='app'||app.id!==mapping.appId||app.project_id!==this.projectId||app.type!==mapping.store||bundle!==mapping.bundleId)throw invalid();
   return p;
  });
  cached={until:this.now()+900000,promise};this.cache.set(mapping.id,cached);
  try{return await promise;}catch(error){if(this.cache.get(mapping.id)===cached)this.cache.delete(mapping.id);throw error;}
 }
 async verify(p,user){
  if(!p||typeof p!=='object')throw invalid();
  const mapping=this.products.get(p.product_id);if(!mapping)return null; // unrelated project product; never mint it
  if(!uuid(user)||p.object!=='purchase'||p.customer_id!==user||p.original_customer_id!==user||p.ownership!=='purchased'||p.store!==mapping.store||p.environment!==this.environment||!['owned','refunded'].includes(p.status)||typeof p.store_purchase_identifier!=='string'||!p.store_purchase_identifier||p.store_purchase_identifier.length>255||!Number.isInteger(p.quantity)||p.quantity<1||p.quantity>100||!Number.isSafeInteger(p.purchased_at)||p.purchased_at<946684800000||p.purchased_at>this.now()+300000)throw invalid();
  await this.product(mapping);
  return {user,provider:'revenuecat',scope:mapping.scope,environment:this.environment,transaction:p.store_purchase_identifier,product:mapping.storeId,quantity:p.quantity,state:p.status,purchasedAt:new Date(p.purchased_at).toISOString()};
 }
 async page(user,after=null){
  if(!uuid(user)||(after!==null&&!identifier(after)))throw invalid();
  const path=`/v2/projects/${this.projectId}/customers/${user}/purchases`,query=new URLSearchParams({environment:this.environment,limit:'100'});if(after)query.set('starting_after',after);
  const page=await this.get(path+'?'+query);if(page.object!=='list'||!Array.isArray(page.items)||page.items.length>100)throw invalid();
  let next=null;
  if(page.next_page){
   let url;try{url=new URL(page.next_page,ROOT);}catch{throw invalid();}
   next=url.searchParams.get('starting_after');
   if(url.origin!==ROOT||url.username||url.password||url.pathname!==path||url.hash||!identifier(next)||next===after)throw invalid();
  }
  const records=(await Promise.all(page.items.map(p=>this.verify(p,user)))).filter(Boolean);
  return {records,next};
 }
 async transaction(transaction){
  if(typeof transaction!=='string'||!transaction||transaction.length>255)throw invalid();
  const query=new URLSearchParams({store_purchase_identifier:transaction});
  const page=await this.get(`/v2/projects/${this.projectId}/purchases?${query}`);
  if(page.object!=='list'||!Array.isArray(page.items)||page.items.length>100||page.next_page)throw invalid();
  const records=[];
  for(const p of page.items){
   if(!this.products.has(p.product_id)||p.environment!==this.environment)continue;
   if(p.store_purchase_identifier!==transaction)throw invalid();
   const receipt=await this.verify(p,p.original_customer_id);if(receipt)records.push(receipt);
  }
  return records;
 }
}

export async function equalSecret(actual,expected){
 if(typeof actual!=='string'||typeof expected!=='string'||expected.length<32)return false;
 const encode=new TextEncoder(),[a,b]=await Promise.all([actual,expected].map(s=>crypto.subtle.digest('SHA-256',encode.encode(s))));
 const x=new Uint8Array(a),y=new Uint8Array(b);let difference=0;for(let n=0;n<x.length;n++)difference|=x[n]^y[n];return difference===0;
}
