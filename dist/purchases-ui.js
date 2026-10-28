import {observeOffer,nativeOffer,webOffer} from './offer-visibility.js';
const $=id=>document.getElementById(id);
export class PurchasePanel {
 constructor({service,cloud,onBusy,onWallet,canStart=()=>true,externalStart=()=>null,externalEnd=()=>{},onOffer=()=>false,observe=observeOffer}){Object.assign(this,{service,cloud,onBusy,onWallet,canStart,externalStart,externalEnd,onOffer,observe});this.epoch=0;this.busy=false;this.offerObservers=[];this.quoteObserver=null;this.observedQuote=null;
  $('purchaseRefresh').onclick=()=>void this.load();$('purchaseRecover').onclick=()=>void this.operation(()=>service.recover(),['android','ios'].includes(service.platform));this.reset();
  $('purchaseConfirm').onclick=()=>void this.operation(()=>service.confirm(),true);$('purchaseDiscard').onclick=()=>void this.operation(()=>service.discardQuote());
 }
 message(text,error=false){$('purchaseMessage').textContent=text;$('purchaseMessage').classList.toggle('error',error);}
 reset(){++this.epoch;this.busy=false;this.clearOffers();$('purchaseOffers').replaceChildren();this.message('');$('purchaseStatus').textContent='Sign in to see available time packs.';this.render();}
 clearOffers(){for(const stop of this.offerObservers.splice(0))stop();this.quoteObserver?.();this.quoteObserver=null;this.observedQuote=null;}
 watchOffer(element,data){const owner=this.cloud.userId,epoch=this.epoch;return this.observe(element,()=>{try{return this.onOffer(owner,data)===true;}catch{return false;}},{isCurrent:()=>owner===this.cloud.userId&&epoch===this.epoch});}
 render(){
  const signed=this.cloud.signedIn,busy=this.busy||this.service.busy||!this.canStart();
  $('purchaseRefresh').hidden=!signed;$('purchaseRefresh').disabled=busy;
  $('purchaseRecover').hidden=!signed||!this.service.configuration?.available;$('purchaseRecover').disabled=busy;
  const quote=this.service.quote,pending=this.service.pending(this.cloud.userId);
  for(const button of $('purchaseOffers').querySelectorAll('button'))button.disabled=busy||!signed||!!quote||(['android','ios'].includes(this.service.platform)&&!!pending);
  $('purchaseQuote').hidden=!quote;$('purchaseConfirm').disabled=busy||!signed;
  $('purchaseDiscard').hidden=!(this.service.discardQuote&&pending&&['preparing','review'].includes(pending.stage));$('purchaseDiscard').disabled=busy;
  if(quote){$('purchaseQuoteDetails').textContent=`${(quote.milliseconds/1000).toLocaleString()} seconds · ${quote.price}. One-time payment in ${quote.currency}, linked to this game account. Your bank is updated only after verification.`;$('purchaseConfirm').textContent=`Continue to checkout · ${quote.price}`;}
  if(quote!==this.observedQuote){this.quoteObserver?.();this.quoteObserver=null;this.observedQuote=quote;if(quote)this.quoteObserver=this.watchOffer($('purchaseQuoteDetails'),webOffer(quote));}
 }
 async load(){
  if(this.busy||this.service.busy||!this.cloud.signedIn||!this.canStart())return;
  const epoch=++this.epoch;this.clearOffers();this.busy=true;this.onBusy(true);this.render();this.message('');$('purchaseStatus').textContent='Checking available time packs…';$('purchaseOffers').replaceChildren();
  try{
   const catalog=await this.service.load();if(epoch!==this.epoch)return;
   $('purchaseStatus').textContent=catalog.available?'One-time purchases. Unused seconds do not expire. Your balance stays with this game account across official editions.':catalog.reason;
   for(const offer of this.service.items){const button=document.createElement('button');button.className='secondary full';button.textContent=offer.price?`Buy ${(offer.milliseconds/1000).toLocaleString()} seconds · ${offer.price}`:`Check price · ${(offer.milliseconds/1000).toLocaleString()} seconds`;button.onclick=()=>void this.operation(()=>this.service.buy(offer.id),['android','ios'].includes(this.service.platform));$('purchaseOffers').append(button);if(offer.price){const data=nativeOffer(offer,this.service.platform);if(data)this.offerObservers.push(this.watchOffer(button,data));}}
   if(catalog.available&&!this.service.items.length)$('purchaseStatus').textContent='The store has no available prices. Try again later.';
   if(this.service.pending(this.cloud.userId)||this.service.journalCorrupt)this.message('A previous checkout needs checking. Recover purchases before buying again.');
  }catch{if(epoch===this.epoch)$('purchaseStatus').textContent='Time packs are unavailable right now. Manual play and existing time remain available.';}
  finally{if(epoch===this.epoch){this.busy=false;this.onBusy(false);this.render();}}
 }
 async operation(work,external=false){
  if(this.busy||this.service.busy||!this.canStart())return;const epoch=this.epoch;this.busy=true;this.onBusy(true);this.render();this.message('Waiting for the store and receipt verification…');
  const returning=external?this.externalStart():null;let review=false;
  try{
   const result=await work();if(epoch!==this.epoch)return;
   if(result.wallet)this.onWallet(result.wallet);
   review=result.state==='quoted';if(result.disputeReview)this.message('A payment dispute needs support review. The bank shows the last confirmed financial outcome.'+(result.state==='recovery-partial'?' Choose Recover purchases again to finish checking the remaining history.':''),true);
   if(!result.disputeReview){let message={'recovery-partial':'Some purchases were checked. Choose Recover purchases again to continue the remaining history.',quoted:'Review the price, then choose whether to open secure checkout.',preparing:'The unopened quote is still being checked. Recover it or discard it to request a fresh quote.', 'quote-discarded':'Unopened quote discarded. No payment window was opened.',verified:'Purchase verified. Your time bank is updated.',refunded:'This purchase was refunded. Your time bank is updated.',charged_back:'A confirmed payment dispute changed the time from this purchase. Your current bank is updated. Contact support if the outcome is incorrect.',cancelled:'Purchase cancelled. No time was added.',failed:'The payment was not completed. Recover purchases before trying again.',pending:'The purchase is pending verification or store approval. No credit is confirmed yet. Recover purchases after reconnecting.',synced:result.pending?'Your existing balance is synchronized. A previous checkout may still be pending at the store.':'Your existing purchase balance is synchronized. Recovery does not refill consumed time.'}[result.state]||'Check your time bank after reconnecting.';if(result.chargeback&&result.state!=='charged_back')message+=' Your purchase history includes a confirmed chargeback; the corresponding time is reflected in your bank.';this.message(message);}
  }catch(error){if(epoch===this.epoch)this.message(error.message||'Could not verify this purchase. Recover purchases after reconnecting.',true);}
  finally{if(external)this.externalEnd(returning);if(epoch===this.epoch){this.busy=false;this.onBusy(false);this.render();if($('assist').open)(review?$('purchaseConfirm'):$('purchaseMessage')).focus();}}
 }
}
