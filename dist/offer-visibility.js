// A loaded catalog is not an exposure. Report only after at least half of the
// actual priced element remains viewable for 250ms in a foreground document.
export function observeOffer(element,report,{isCurrent=()=>true,scope=globalThis}={}){
 const doc=scope.document;if(!doc||!scope.IntersectionObserver)return()=>{};
 let intersecting=false,timer=null,done=false;
 const stopTimer=()=>{if(timer!==null)scope.clearTimeout(timer);timer=null;};
 const visible=()=>{
  if(done||doc.hidden||!intersecting||!element.isConnected||!element.getClientRects().length||!isCurrent())return false;
  // IntersectionObserver alone does not account for a dialog/payment overlay.
  if(doc.elementFromPoint){const box=element.getBoundingClientRect(),hit=doc.elementFromPoint(box.left+box.width/2,box.top+box.height/2);if(!hit||!element.contains(hit))return false;}
  return true;
 };
 const check=()=>{stopTimer();if(visible())timer=scope.setTimeout(()=>{timer=null;if(visible()&&report()===true){done=true;observer.disconnect();doc.removeEventListener('visibilitychange',check);}},250);};
 const observer=new scope.IntersectionObserver(entries=>{for(const entry of entries)if(entry.target===element)intersecting=entry.isIntersecting&&entry.intersectionRatio>=.5;check();},{threshold:[0,.5,1]});
 observer.observe(element);doc.addEventListener('visibilitychange',check);
 return()=>{done=true;stopTimer();observer.disconnect();doc.removeEventListener('visibilitychange',check);};
}
export function nativeOffer(item,platform){
 const product=item?.product,value=product?.price;
 if(!['android','ios'].includes(platform)||!Number.isFinite(value)||value<0||!Number.isSafeInteger(Math.round(value*1e6)))return null;
 return{platform,sku:item.storeId,currency:product.currencyCode,amountMicros:Math.round(value*1e6),benefitMs:item.milliseconds,configVersion:item.version};
}
export function webOffer(quote){return quote?{platform:'web',sku:quote.productId,currency:quote.currency,amountMicros:quote.amount*10000,benefitMs:quote.milliseconds,configVersion:quote.configVersion}:null;}
