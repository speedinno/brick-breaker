const $=id=>document.getElementById(id);
export class PurchasePanel {
 constructor({service,cloud,onBusy,onWallet,canStart=()=>true,externalStart=()=>null,externalEnd=()=>{}}){Object.assign(this,{service,cloud,onBusy,onWallet,canStart,externalStart,externalEnd});this.epoch=0;this.busy=false;
  $('purchaseRefresh').onclick=()=>void this.load();$('purchaseRecover').onclick=()=>void this.operation(()=>service.recover());this.reset();
  $('purchaseConfirm').onclick=()=>void this.operation(()=>service.confirm(),true);$('purchaseDiscard').onclick=()=>void this.operation(()=>service.discardQuote());
 }
 message(text,error=false){$('purchaseMessage').textContent=text;$('purchaseMessage').classList.toggle('error',error);}
 reset(){++this.epoch;this.busy=false;$('purchaseOffers').replaceChildren();this.message('');$('purchaseStatus').textContent='Sign in to see available time packs.';this.render();}
 render(){
  const signed=this.cloud.signedIn,busy=this.busy||this.service.busy||!this.canStart();
  $('purchaseRefresh').hidden=!signed;$('purchaseRefresh').disabled=busy;
  $('purchaseRecover').hidden=!signed||!this.service.configuration?.available;$('purchaseRecover').disabled=busy;
  for(const button of $('purchaseOffers').querySelectorAll('button'))button.disabled=busy||!signed||!!this.service.quote;
  const quote=this.service.quote,pending=this.service.pending(this.cloud.userId);
  $('purchaseQuote').hidden=!quote;$('purchaseConfirm').disabled=busy||!signed;
  $('purchaseDiscard').hidden=!(this.service.discardQuote&&pending&&['preparing','review'].includes(pending.stage));$('purchaseDiscard').disabled=busy;
  if(quote){$('purchaseQuoteDetails').textContent=`${(quote.milliseconds/1000).toLocaleString()} seconds · ${quote.price}. One-time payment in ${quote.currency}, linked to this game account. Your bank is updated only after verification.`;$('purchaseConfirm').textContent=`Continue to checkout · ${quote.price}`;}
 }
 async load(){
  if(this.busy||this.service.busy||!this.cloud.signedIn||!this.canStart())return;
  const epoch=++this.epoch;this.busy=true;this.onBusy(true);this.render();this.message('');$('purchaseStatus').textContent='Checking available time packs…';$('purchaseOffers').replaceChildren();
  try{
   const catalog=await this.service.load();if(epoch!==this.epoch)return;
   $('purchaseStatus').textContent=catalog.available?'One-time purchases. Unused seconds do not expire. Your balance stays with this game account across official editions.':catalog.reason;
   for(const offer of this.service.items){const button=document.createElement('button');button.className='secondary full';button.textContent=offer.price?`Buy ${(offer.milliseconds/1000).toLocaleString()} seconds · ${offer.price}`:`Check price · ${(offer.milliseconds/1000).toLocaleString()} seconds`;button.onclick=()=>void this.operation(()=>this.service.buy(offer.id));$('purchaseOffers').append(button);}
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
   review=result.state==='quoted';
   this.message({'recovery-partial':'Some purchases were checked. Choose Recover purchases again to continue the remaining history.',quoted:'Review the price, then choose whether to open secure checkout.',preparing:'The unopened quote is still being checked. Recover it or discard it to request a fresh quote.', 'quote-discarded':'Unopened quote discarded. No payment window was opened.',verified:'Purchase verified. Your time bank is updated.',refunded:'This purchase was refunded. Your time bank is updated.',cancelled:'Purchase cancelled. No time was added.',failed:'The payment was not completed. Recover purchases before trying again.',pending:'The purchase is pending verification or store approval. No credit is confirmed yet. Recover purchases after reconnecting.',synced:result.pending?'Your existing balance is synchronized. A previous checkout may still be pending at the store.':'Your existing purchase balance is synchronized. Recovery does not refill consumed time.'}[result.state]||'Check your time bank after reconnecting.');
  }catch(error){if(epoch===this.epoch)this.message(error.message||'Could not verify this purchase. Recover purchases after reconnecting.',true);}
  finally{if(external)this.externalEnd(returning);if(epoch===this.epoch){this.busy=false;this.onBusy(false);this.render();if($('assist').open)(review?$('purchaseConfirm'):$('purchaseMessage')).focus();}}
 }
}
