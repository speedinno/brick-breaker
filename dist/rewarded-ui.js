const $=id=>document.getElementById(id);
const seconds=ms=>(ms/1000).toLocaleString(undefined,{maximumFractionDigits:3});
export class RewardedPanel {
 constructor({service,cloud,configured=()=>false,canStart=()=>true,onBusy=()=>{},onWallet=()=>{},externalStart=()=>null,externalEnd=()=>{}}){
  Object.assign(this,{service,cloud,configured,canStart,onBusy,onWallet,externalStart,externalEnd});this.epoch=0;this.busy=false;
  $('adRefresh').onclick=()=>void this.load();$('adPrepare').onclick=()=>void this.operation(()=>service.prepare());
  $('adWatch').onclick=()=>void this.operation(()=>service.show(),true);$('adCancel').onclick=()=>void this.operation(()=>service.cancel());
  $('adRecover').onclick=()=>void this.operation(()=>service.recover());
  $('adAdult').onchange=()=>this.render();
  $('adPrivacy').onclick=()=>void this.operation(()=>service.adapter.privacy());this.reset();
 }
 eligible(){return this.configured()&&$('adAdult').checked;}
 reset(){++this.epoch;this.busy=false;$('adAdult').checked=false;this.message('');this.render();}
 message(text,error=false){$('adMessage').textContent=text;$('adMessage').classList.toggle('error',error);}
 render(){
  const configured=this.configured(),signed=this.cloud.signedIn,ready=this.service.ready,busy=this.busy||this.service.busy||!this.canStart(),state=this.service.state;
  $('adEligibility').hidden=!configured||!signed;$('adAdult').disabled=!!ready||busy;
  $('adStatus').textContent=!configured?'Rewarded ads are not available in this build.':!signed?'Sign in to receive ad rewards in your shared bank.':this.service.configuration?.available?state?`${state.remaining} of ${state.limit} opportunities available. Each completed ad earns ${seconds(state.milliseconds)} seconds. Pending rewards reserve a slot until checked. Daily opportunities reset at midnight UTC.`:'Check availability before preparing an offer.':this.service.configuration?.reason||'Check availability before preparing an offer.';
  $('adRefresh').hidden=!configured||!signed;$('adRefresh').disabled=busy||!!ready;
  $('adPrepare').hidden=!configured||!signed||!this.service.configuration?.available||!!ready;$('adPrepare').disabled=busy||!this.eligible()||!(state?.remaining>0);
  $('adWatch').hidden=!ready;$('adWatch').disabled=busy||!this.eligible();$('adWatch').textContent=ready?`Watch ad · earn ${seconds(ready.record.milliseconds)} seconds`:'Watch ad';
  $('adCancel').hidden=!ready;$('adCancel').disabled=busy;
  $('adRecover').hidden=!signed||!configured;$('adRecover').disabled=busy||!!ready;
  $('adPrivacy').hidden=!this.service.adapter.privacyRequired;$('adPrivacy').disabled=busy||!!ready;
 }
 async load(){
  if(this.busy||this.service.busy||!this.canStart()||!this.configured()||!this.cloud.signedIn||this.service.ready)return;
  const epoch=this.epoch;this.busy=true;this.onBusy(true);this.render();
  try{const result=await this.service.load();if(epoch===this.epoch&&result.state?.wallet)this.onWallet(result.state.wallet);}
  catch(error){if(epoch===this.epoch)this.message(error.message,true);}
  finally{if(epoch===this.epoch){this.busy=false;this.onBusy(false);this.render();}}
 }
 async operation(work,external=false){
  if(this.busy||this.service.busy||!this.canStart())return;
  const epoch=this.epoch;this.busy=true;this.onBusy(true);this.render();
  const token=external?this.externalStart():null;this.message(external?'The game stays paused until you return.':'Checking your reward opportunity…');
  // No await before work(): the final H5 show runs inside this click gesture.
  try{
   const result=await work();if(epoch!==this.epoch)return;
   if(result?.wallet)this.onWallet(result.wallet);
   this.message({ready:'Your offer is ready. Watching is optional. You can cancel without opening the ad.',verified:`Reward verified: ${seconds(result?.milliseconds||0)} seconds added to your time bank.`,cancelled:'Ad cancelled. No time was added.',pending:'Reward verification is pending. No credit is confirmed yet. Check pending rewards after reconnecting.',synced:'Pending rewards checked. Your bank is up to date.'}[result?.state]||'Privacy choices updated.');
  }catch(error){if(epoch===this.epoch)this.message(error.message||'The reward needs checking. Use Check pending rewards after reconnecting.',true);}
  finally{
   // External UI must always release its mute, even if account/navigation
   // changes suppress returning to this panel.
   if(external)this.externalEnd(token);
   if(epoch===this.epoch){this.busy=false;this.onBusy(false);this.render();if($('assist').open)($('adWatch').hidden?$('adMessage'):$('adWatch')).focus();}
  }
 }
}
