import {RevenueCatVerifier} from './revenuecat.js';
// Public SDK keys and product mappings are deployment configuration; the
// secret API key stays server-side. Missing setup leaves ordinary play intact.
export function nativeCommerce(env,request=fetch){
 try{
  const value=JSON.parse(env('REVENUECAT_CONFIG_JSON')||'null');
  if(!value||!Array.isArray(value.products)||value.products.length<1)return null;
  const verifier=new RevenueCatVerifier({apiKey:env('REVENUECAT_SECRET_KEY'),projectId:value.projectId,environment:value.environment,products:value.products,fetch:request});
  const keys={};
  for(const platform of ['android','ios']){
   const key=value[platform]?.publicKey;
   if(typeof key==='string'&&new RegExp('^'+(platform==='android'?'goog_':'appl_')+'[A-Za-z0-9]{10,}$').test(key))keys[platform]=key;
  }
  return {verifier,keys};
 }catch{return null;}
}
export async function nativeCatalog(commerce,admin,platform,user){
 const key=commerce?.keys[platform];if(!key)return {available:false,reason:'Purchases are not configured for this edition yet.'};
 const privacy=await admin.rpc('game_privacy_note_account',{p_user:user,p_project:commerce.verifier.projectId,p_environment:commerce.verifier.environment});
 if(privacy.error)throw Error('Purchase privacy settings are not ready. Manual play remains available.');
 const mappings=[...commerce.verifier.products.values()].filter(p=>p.platform===platform),products=[];
 for(const mapping of mappings){
  const result=await admin.from('game_purchase_products').select('milliseconds,benefit_key,config_version,available').eq('provider','revenuecat').eq('scope',mapping.scope).eq('environment',commerce.verifier.environment).eq('product_id',mapping.storeId).maybeSingle();
  if(result.error)throw Error('Purchase catalog is unavailable');
  if(!result.data?.available)continue;
  // Verify the mapping at the provider before exposing a sellable product.
  await commerce.verifier.product(mapping);
  products.push({id:mapping.id,storeId:mapping.storeId,milliseconds:Number(result.data.milliseconds),benefit:result.data.benefit_key,version:result.data.config_version});
 }
 // Retiring every pack must never remove purchase recovery for existing buyers.
 return {available:true,provider:'revenuecat',environment:commerce.verifier.environment,publicKey:key,products};
}
export async function persistVerifiedPurchase(admin,r,projectId){
 const result=await admin.rpc('game_record_purchase',{p_user:r.user,p_provider:r.provider,p_scope:r.scope,p_environment:r.environment,p_transaction:r.transaction,p_product:r.product,p_quantity:r.quantity,p_state:r.state,p_purchased_at:r.purchasedAt});
 if(result.error)throw Error('Could not reconcile this purchase. Try purchase recovery again.');
 if(result.data?.state==='account-deleted'&&projectId){const cleanup=await admin.rpc('game_privacy_requeue_deleted',{p_user:r.user,p_project:projectId,p_environment:r.environment});if(cleanup.error)throw Error('Provider cleanup needs retry. No purchase credit is confirmed.');}
 return result.data;
}
