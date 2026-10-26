const adPurposes=['adStoragePurposeConsentStatus','adUserDataPurposeConsentStatus','adPersonalizationPurposeConsentStatus'];
export function googleAdPurposesAllowed(fc){
 const values=fc.getGoogleConsentModeValues?.(),enums=fc.ConsentModePurposeStatusEnum;
 if(!values||!enums||enums.GRANTED===undefined||enums.NOT_APPLICABLE===undefined)return false;
 // Deliberately reject NOT_CONFIGURED: an unpublished/misconfigured message
 // must not be mistaken for a consent decision. No analytics is requested.
 return adPurposes.every(key=>values[key]===enums.GRANTED||values[key]===enums.NOT_APPLICABLE);
}
export function gppAdsAllowed(ping){
 if(ping?.cmpStatus!=='loaded'||ping.signalStatus!=='ready'||!Array.isArray(ping.applicableSections)||!ping.applicableSections.length)return false;
 if(ping.applicableSections.length===1&&ping.applicableSections[0]===-1)return true;
 if(!Array.isArray(ping.supportedAPIs)||!ping.parsedSections)return false;
 for(const id of ping.applicableSections){
  if(!Number.isInteger(id)||id<1)return false;
  const api=ping.supportedAPIs.find(value=>typeof value==='string'&&value.startsWith(id+':'))?.split(':')[1];
  // EU decisions are checked separately using Google's ad-purpose signals.
  if(id===2&&api==='tcfeuv2')continue;
  if(!api||!/^us[a-z]{2,4}$/.test(api))return false;
  const segments=ping.parsedSections[api];if(!Array.isArray(segments)||!segments.length)return false;
  let flags=0;
  for(const segment of segments){
   if(!segment||typeof segment!=='object'||segment.Gpc===true)return false;
   for(const key of ['SaleOptOut','SharingOptOut','TargetedAdvertisingOptOut'])if(key in segment){flags++;if(![0,2].includes(segment[key]))return false;}
   // This release's optional ads are for adults. A known-child signal cannot
   // be overridden by this device's eligibility acknowledgement.
   if('KnownChildSensitiveDataConsents' in segment){const known=segment.KnownChildSensitiveDataConsents;if(Array.isArray(known)?known.some(value=>value!==0):known!==0)return false;}
  }
  if(!flags)return false;
 }
 return true;
}

export class GoogleAdConsent {
 constructor({settings,scope=globalThis,timeoutMs=20000}={}){Object.assign(this,{settings,scope,timeoutMs});this.loading=null;this.checking=null;this.euRequired=false;this.forms=new Set();}
 get formVisible(){return this.forms.size>0;}
 visibility(kind,visible){visible?this.forms.add(kind):this.forms.delete(kind);}
 available(){
  const s=this.settings;if(!s||s.consentReviewed!==true||!s.origins?.includes(this.scope.location?.origin)||this.scope.Capacitor?.isNativePlatform?.())return false;
  try{const url=new URL(s.cmpScriptUrl);return /^ca-pub-\d{16}$/.test(s.publisherId)&&url.protocol==='https:'&&url.hostname==='fundingchoicesmessages.google.com'&&!url.port&&!url.username&&!url.password&&!url.hash&&url.pathname==='/i/pub-'+s.publisherId.slice(7)&&[...url.searchParams].length<=1&&[...url.searchParams].every(([key,value])=>key==='ers'&&value==='1');}catch{return false;}
 }
 boot(){
  if(this.loading)return this.loading;
  this.loading=new Promise((resolve,reject)=>{
   const script=this.scope.document.createElement('script');script.async=true;script.crossOrigin='anonymous';script.src=this.settings.cmpScriptUrl;
   let timer;const expire=()=>{if(this.formVisible){timer=setTimeout(expire,this.timeoutMs);return;}script.remove();reject(Error('Ad privacy settings could not load. Manual play remains available.'));};timer=setTimeout(expire,this.timeoutMs);
   script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('Ad privacy settings could not load. Manual play remains available.'));};this.scope.document.head.append(script);
  });return this.loading;
 }
 request(){
  if(this.checking)return this.checking;
  if(!this.available()||this.scope.navigator?.globalPrivacyControl===true)return Promise.resolve(false);
  this.checking=this.check().finally(()=>{this.checking=null;});return this.checking;
 }
 async check(){
  const scope=this.scope,fc=scope.googlefc=scope.googlefc||{};fc.callbackQueue=fc.callbackQueue||[];fc.usstatesoptout=fc.usstatesoptout||{};
  let finished=false,mode=null,gpp=null,tcfId=null,gppId=null,timer;
  const clean=()=>{clearTimeout(timer);if(tcfId!==null)try{scope.__tcfapi('removeEventListener',0,()=>{},tcfId);}catch{}if(gppId!==null)try{scope.__gpp('removeEventListener',()=>{},gppId);}catch{}};
  const consent=new Promise(resolve=>{
   const finish=value=>{if(finished)return;finished=true;clean();resolve(value);};
   const complete=()=>{if(mode!==null&&gpp!==null&&!this.formVisible)finish(mode&&gpp&&scope.navigator?.globalPrivacyControl!==true);};
   const expire=()=>{if(this.formVisible){timer=setTimeout(expire,this.timeoutMs);return;}finish(false);};timer=setTimeout(expire,this.timeoutMs);
   fc.callbackQueue.push({CONSENT_API_READY:()=>{
    if(finished)return;
    try{scope.__tcfapi?.('addEventListener',0,(data,success)=>{if(data?.listenerId!==undefined)tcfId=data.listenerId;if(finished){clean();return;}if(success&&data){this.euRequired=data.gdprApplies===true;this.visibility('eu',data.eventStatus==='cmpuishown');complete();}});}catch{}
    try{scope.__gpp?.('addEventListener',(event,success)=>{if(event?.listenerId!==undefined)gppId=event.listenerId;if(finished){clean();return;}if(success&&event?.pingData){this.visibility('gpp',event.pingData.cmpDisplayStatus==='visible');complete();}});}catch{}
   }});
   fc.callbackQueue.push({CONSENT_MODE_DATA_READY:()=>{if(finished)return;try{mode=googleAdPurposesAllowed(fc);}catch{mode=false;}complete();}});
   fc.callbackQueue.push({CONSENT_DATA_READY:()=>{
    if(finished)return;
    try{if(typeof scope.__gpp!=='function'){gpp=false;complete();return;}scope.__gpp('ping',(data,success)=>{if(finished)return;gpp=success===true&&gppAdsAllowed(data);complete();});}catch{gpp=false;complete();}
   }});
  });
  try{await this.boot();return await consent;}finally{finished=true;clean();}
 }
 async europeanChoices(){
  if(!this.available()||!this.euRequired||!this.scope.googlefc)throw Error('European consent settings do not apply here. Use Google’s Do not sell or share link for applicable US choices.');
  const scope=this.scope,fc=scope.googlefc;
  return new Promise((resolve,reject)=>{
   let listener=null,invoked=false,finished=false,timer;
   const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);if(listener!==null)try{scope.__tcfapi('removeEventListener',0,()=>{},listener);}catch{}error?reject(error):resolve();};
   const expire=()=>{if(this.formVisible){timer=setTimeout(expire,this.timeoutMs);return;}finish(Error('Privacy settings could not be opened. Reload the game to try again.'));};timer=setTimeout(expire,this.timeoutMs);
   fc.callbackQueue.push({CONSENT_API_READY:()=>{
    if(finished)return;
    try{
     scope.__tcfapi('addEventListener',0,(data,success)=>{if(data?.listenerId!==undefined)listener=data.listenerId;if(finished){try{scope.__tcfapi('removeEventListener',0,()=>{},listener);}catch{}return;}if(!success)return;if(data?.eventStatus==='cmpuishown')this.visibility('eu',true);if(invoked&&data?.eventStatus==='useractioncomplete'){this.visibility('eu',false);finish();}});
     invoked=true;fc.showRevocationMessage();
    }catch{finish(Error('Privacy settings could not be opened. Reload the game to try again.'));}
   }});
  });
 }
}
