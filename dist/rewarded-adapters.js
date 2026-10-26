// These adapters report SDK events. They never grant bank credit. Native rewards
// require Google SSV; H5 has only its documented, bounded client callback.
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const unavailable=()=>Error('No rewarded ad is available right now. Manual play is always available.');
const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
// Optional observations cannot break an SDK callback or change reward proof.
const observe=(hooks,phase,data)=>{try{hooks.observed?.(phase,data);}catch{}};

export class NativeRewardedAdapter {
 constructor({available=()=>false,eligible=()=>false,loadSDK=()=>import('./vendor/ads.js'),externalStart=()=>null,externalEnd=()=>{}}={}){
  Object.assign(this,{available,eligible,loadSDK,externalStart,externalEnd});this.busy=false;this.initialized=false;this.sdk=null;this.privacyRequired=false;
 }
 async consent(){
  if(!this.available()||!this.eligible())throw unavailable();
  this.sdk??=await this.loadSDK();const api=this.sdk.AdMob;
  const returning=this.externalStart();
  try{
   let info=await api.requestConsentInfo();
   if(info.status==='REQUIRED'&&info.isConsentFormAvailable)info=await api.showConsentForm();
   this.privacyRequired=info.privacyOptionsRequirementStatus==='REQUIRED';
   if(info.canRequestAds!==true)throw Error('Ads are unavailable with the current privacy choices. Manual play remains free.');
  }finally{this.externalEnd(returning);}
  if(!this.initialized){await api.initialize({tagForChildDirectedTreatment:false,tagForUnderAgeOfConsent:false,maxAdContentRating:'General'});this.initialized=true;}
 }
 async privacy(){
  if(this.busy)throw Error('Finish the current ad before changing privacy choices.');
  if(!this.available()||!this.sdk)throw unavailable();
  this.busy=true;const returning=this.externalStart();
  try{await this.sdk.AdMob.showPrivacyOptionsForm();const info=await this.sdk.AdMob.requestConsentInfo();this.privacyRequired=info.privacyOptionsRequirementStatus==='REQUIRED';}
  finally{this.busy=false;this.externalEnd(returning);}
 }
 async prepare({unit,offerId,environment},hooks={}){
  if(this.busy)throw Error('Another ad is still open or loading.');
  if(!/^ca-app-pub-\d{16}\/\d{6,16}$/.test(unit)||!uuid(offerId)||!['production','sandbox'].includes(environment))throw unavailable();
  this.busy=true;const handles=[],closed=deferred();let invoked=false,ended=false,earned=false,displayed=false;const values=new Set();
  const clean=()=>{for(const handle of handles.splice(0))void handle.remove().catch(()=>{});this.busy=false;};
  const finish=(reason)=>{if(ended)return;ended=true;if(reason==='dismissed'&&invoked)observe(hooks,'closed');else if(reason==='failed')observe(hooks,'failed');clean();closed.resolve({reason,earnedHint:earned,definitivelyUnearned:false});};
  const reward=()=>{if(!invoked||ended||earned)return;earned=true;observe(hooks,'reward_signal');hooks.rewarded?.();};
  const display=()=>{if(!invoked||ended||displayed)return;displayed=true;observe(hooks,'display');};
  const value=data=>{if(!invoked||ended||data?.adUnitId!==unit||!Number.isSafeInteger(data.valueMicros)||data.valueMicros<0||data.valueMicros>1e15||typeof data.currencyCode!=='string'||!/^[A-Z]{3}$/.test(data.currencyCode)||!Number.isInteger(data.precision)||data.precision<0||data.precision>3)return;const normalized={valueMicros:data.valueMicros,currency:data.currencyCode,precision:data.precision},key=JSON.stringify(normalized);if(values.has(key)||values.size>=4)return;values.add(key);observe(hooks,'value',normalized);};
  try{
   await this.consent();const api=this.sdk.AdMob,events=this.sdk.RewardAdPluginEvents;
   for(const [event,callback] of [[events.Rewarded,reward],[events.Dismissed,()=>{if(invoked)finish('dismissed');}],[events.FailedToShow,()=>{if(invoked)finish('failed');}],[events.Showed,display],[events.AdImpression,value]])if(event)handles.push(await api.addListener(event,callback));
   observe(hooks,'request');
   const loaded=await api.prepareRewardVideoAd({adId:unit,isTesting:environment==='sandbox',npa:true,ssv:{userId:offerId,customData:offerId}});
   if(loaded?.adUnitId!==unit)throw unavailable();
   return{
    // Deliberately synchronous until the SDK invocation. The service journals
    // presentation before calling this method; the native promise may resolve
    // at Rewarded, while the full-screen ad is still visible.
    show:()=>{if(invoked||ended)throw unavailable();hooks.beforeAd?.();invoked=true;try{Promise.resolve(api.showRewardVideoAd({adId:unit})).then(reward,()=>finish('failed'));}catch{finish('failed');}return closed.promise;},
    cancel:()=>{if(invoked)return false;if(!ended){ended=true;clean();closed.resolve({reason:'cancelled',earnedHint:false,definitivelyUnearned:true});}return true;}
   };
  }catch(error){observe(hooks,'failed');ended=true;clean();throw error;}
 }
}

// The page's configured certified CMP must explicitly authorize ad requests.
// Absence, failure or denial does not load Google's advertising script.
export class H5RewardedAdapter {
 constructor({consent=async()=>false,load=loadH5,externalStart=()=>null,externalEnd=()=>{},timeoutMs=20000,sound=()=>false}={}){Object.assign(this,{consent,load,externalStart,externalEnd,timeoutMs,sound});this.busy=false;}
 async prepare({unit,offerId,environment},hooks={}){
  if(this.busy)throw Error('Another ad is still open or loading.');
  if(!/^ca-pub-\d{16}$/.test(unit)||!uuid(offerId)||!['production','sandbox'].includes(environment))throw unavailable();
  this.busy=true;let invoked=false,ended=false,viewed=false,displayed=false,notedClosure=false,showAd=null,timer;
  const ready=deferred(),closed=deferred();
  const finish=(reason,definitive=true)=>{
   if(ended)return;ended=true;clearTimeout(timer);this.busy=false;
   if(displayed&&!notedClosure){notedClosure=true;observe(hooks,'closed');}else if(!displayed&&!['cancelled','ignored'].includes(reason))observe(hooks,'failed');
   if(!showAd)ready.reject(unavailable());
   closed.resolve({reason,earnedHint:viewed,definitivelyUnearned:definitive&&!viewed});
  };
  try{
   const returning=this.externalStart();let permitted;
   try{permitted=await this.consent();}finally{this.externalEnd(returning);}
   if(permitted!==true)throw Error('Ads are unavailable with the current privacy choices. Manual play remains free.');
   const sdk=await this.load({unit,environment});sdk.config({sound:this.sound()?'on':'off',preloadAdBreaks:'on'});
   timer=setTimeout(()=>finish('unavailable'),this.timeoutMs);
   observe(hooks,'request');sdk.break({type:'reward',name:'autoplay_time',
    beforeReward:fn=>{if(ended||showAd||typeof fn!=='function')return;clearTimeout(timer);showAd=fn;ready.resolve({
     show:()=>{if(invoked||ended)throw unavailable();hooks.beforeAd?.();invoked=true;try{showAd();}catch{finish('failed',false);}return closed.promise;},
     cancel:()=>{if(invoked)return false;finish('cancelled');return true;}
    });},
    beforeAd:()=>{if(invoked&&!ended){hooks.beforeAd?.();if(!displayed){displayed=true;observe(hooks,'display');}}},
    adViewed:()=>{if(!invoked||ended||viewed)return;viewed=true;observe(hooks,'reward_signal');hooks.rewarded?.();},
    adDismissed:()=>{},afterAd:()=>{if(invoked&&!ended&&displayed&&!notedClosure){notedClosure=true;observe(hooks,'closed');}},
    adBreakDone:info=>finish(info?.breakStatus||'finished')
   });
   return await ready.promise;
  }catch(error){if(!ended)observe(hooks,'failed');clearTimeout(timer);ended=true;this.busy=false;throw error;}
 }
}

let h5Identity=null,h5Loading=null;
export function loadH5({unit,environment},scope=globalThis){
 const identity=unit+':'+environment;
 if(h5Identity&&h5Identity!==identity)return Promise.reject(Error('Ad settings changed. Reload the game before requesting another ad.'));
 if(h5Loading)return h5Loading;
 h5Identity=identity;
 h5Loading=new Promise((resolve,reject)=>{
  const document=scope.document;if(!document||scope.Capacitor?.isNativePlatform?.()){reject(unavailable());return;}
  scope.adsbygoogle=scope.adsbygoogle||[];
  const enqueue=options=>scope.adsbygoogle.push(options),script=document.createElement('script');
  script.async=true;script.crossOrigin='anonymous';script.dataset.adClient=unit;
  if(environment==='sandbox')script.dataset.adbreakTest='on';
  script.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+encodeURIComponent(unit);
  const timer=setTimeout(()=>{script.remove();reject(unavailable());},20000);
  script.onload=()=>{clearTimeout(timer);resolve({break:enqueue,config:enqueue});};
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(unavailable());};document.head.append(script);
 });
 // Failed script loading is sticky for this page: a second script can execute
 // after a timeout and duplicate the global queue. Reload is a safe retry.
 return h5Loading;
}
