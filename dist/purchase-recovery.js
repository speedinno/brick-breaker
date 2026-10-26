// Continue bounded recovery across restarts instead of restarting a large
// history at page one forever. This cursor is not authority to grant credit.
export async function recoverPurchasePages({cloud,owner,storage,key,action,maxPages=100}){
 const cursor=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(value);
 let after=null,result,deletedAccountPurchase=false,chargeback=false,disputeReview=false,seen=new Set();try{const saved=JSON.parse(storage?.getItem(key)||'null');if(cursor(saved?.after)){after=saved.after;deletedAccountPurchase=saved.deletedAccountPurchase===true;chargeback=saved.chargeback===true;disputeReview=saved.disputeReview===true;}}catch{}
 const check=()=>{if(!owner||cloud.userId!==owner)throw Error('Your account changed. Reopen purchase recovery.');};check();
 for(let page=0;page<maxPages;page++){
  result=await cloud.api(action,{after});check();deletedAccountPurchase||=!!result.deletedAccountPurchase;chargeback||=result.chargeback===true;disputeReview||=result.disputeReview===true;const next=result.next??null;
  if(next!==null&&(!cursor(next)||next===after||seen.has(next)))throw Error('Purchase recovery returned an invalid page. Try again later.');
  if(next)seen.add(next);
  try{if(!storage?.setItem||!storage?.removeItem)throw Error();if(next)storage.setItem(key,JSON.stringify({after:next,deletedAccountPurchase,chargeback,disputeReview}));else storage.removeItem(key);}catch{throw Error('Device storage cannot save recovery progress. Your server balance is safe.');}
  after=next;if(!after)return {...result,deletedAccountPurchase,chargeback,disputeReview,complete:true};
 }
 return {...result,deletedAccountPurchase,chargeback,disputeReview,complete:false};
}
