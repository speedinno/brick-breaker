import test from 'node:test';import assert from 'node:assert/strict';
import {GoogleAdConsent,googleAdPurposesAllowed,gppAdsAllowed} from '../dist/ad-consent.js';
const enums={UNKNOWN:0,GRANTED:1,DENIED:2,NOT_APPLICABLE:3,NOT_CONFIGURED:4};
const values=()=>({adStoragePurposeConsentStatus:1,adUserDataPurposeConsentStatus:1,adPersonalizationPurposeConsentStatus:1});
const ping=()=>({cmpStatus:'loaded',signalStatus:'ready',cmpDisplayStatus:'hidden',applicableSections:[-1],supportedAPIs:[],parsedSections:{}});
test('ad-purpose consent must be granted or not applicable; missing and unconfigured are not permission',()=>{
 const fc={ConsentModePurposeStatusEnum:enums,getGoogleConsentModeValues:values};assert(googleAdPurposesAllowed(fc));
 for(const status of [0,2,4,undefined,9])assert.equal(googleAdPurposesAllowed({...fc,getGoogleConsentModeValues:()=>({...values(),adStoragePurposeConsentStatus:status})}),false);
 assert.equal(googleAdPurposesAllowed({...fc,getGoogleConsentModeValues:()=>({...values(),adPersonalizationPurposeConsentStatus:3})}),true);assert.equal(googleAdPurposesAllowed({}),false);
});
test('GPP uses current 1.1 ping data and rejects opt-outs, GPC, known-child and unknown applicable sections',()=>{
 const data={...ping(),applicableSections:[7],supportedAPIs:['7:usnat'],parsedSections:{usnat:[{SaleOptOut:2,SharingOptOut:2,TargetedAdvertisingOptOut:2,KnownChildSensitiveDataConsents:[0,0]},{Gpc:false}]}};assert(gppAdsAllowed(data));assert(gppAdsAllowed(ping()));
 for(const field of ['SaleOptOut','SharingOptOut','TargetedAdvertisingOptOut'])assert.equal(gppAdsAllowed({...data,parsedSections:{usnat:[{...data.parsedSections.usnat[0],[field]:1}]}}),false);
 assert.equal(gppAdsAllowed({...data,parsedSections:{usnat:[{SaleOptOut:2},{Gpc:true}]}}),false);assert.equal(gppAdsAllowed({...data,parsedSections:{usnat:[{SaleOptOut:2,KnownChildSensitiveDataConsents:[0,1]}]}}),false);
 for(const change of [{cmpStatus:'stub'},{signalStatus:'not ready'},{applicableSections:[]},{applicableSections:[999]},{parsedSections:{usnat:[{}]}}])assert.equal(gppAdsAllowed({...data,...change}),false);
 assert(gppAdsAllowed({...data,applicableSections:[2],supportedAPIs:['2:tcfeuv2']}));
});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({initialForm=false,blocked=false,timeoutMs=1000}={}){
 let loaded=false,injected=0,id=0,mode=values(),currentPing=ping(),tcfEvent=initialForm?'cmpuishown':'tcloaded';const queued=[],tcf=new Map(),gpp=new Map();
 const fc={ConsentModePurposeStatusEnum:enums,getGoogleConsentModeValues:()=>mode,usstatesoptout:{},callbackQueue:{push(map){queued.push(map);if(loaded)queueMicrotask(()=>Object.values(map)[0]());}}};
 const scope={location:{origin:'https://game.example.com'},navigator:{},googlefc:fc,document:{createElement:()=>({remove(){}}),head:{append(script){injected++;queueMicrotask(()=>{if(blocked){script.onerror();return;}loaded=true;script.onload();for(const item of queued)Object.values(item)[0]();});}}},__tcfapi(command,version,callback,parameter){if(command==='addEventListener'){const listener=++id;tcf.set(listener,callback);callback({listenerId:listener,gdprApplies:true,eventStatus:tcfEvent},true);}else{tcf.delete(parameter);callback(true);}},__gpp(command,callback,parameter){if(command==='ping')callback(currentPing,true);else if(command==='addEventListener'){const listener=++id;gpp.set(listener,callback);callback({listenerId:listener,pingData:currentPing},true);}else{gpp.delete(parameter);callback(true);}}};
 function emit(event){tcfEvent=event;for(const [listenerId,callback]of [...tcf])callback({listenerId,gdprApplies:true,eventStatus:event},true);}
 fc.showRevocationMessage=()=>emit('cmpuishown');
 const settings={publisherId:'ca-pub-1234567890123456',cmpScriptUrl:'https://fundingchoicesmessages.google.com/i/pub-1234567890123456?ers=1',consentReviewed:true,origins:['https://game.example.com']};
 const bridge=new GoogleAdConsent({scope,settings,timeoutMs});
 return{bridge,scope,settings,emit,get injected(){return injected;},get listeners(){return tcf.size+gpp.size;},deny(){mode={...values(),adStoragePurposeConsentStatus:2};},optOut(){currentPing={...ping(),applicableSections:[7],supportedAPIs:['7:usnat'],parsedSections:{usnat:[{SaleOptOut:1}]}};}};
}
test('approved owned-origin consent loads one official CMP and checks live signals again for every opportunity',async()=>{
 const f=fixture(),first=f.bridge.request(),second=f.bridge.request();assert.equal(await first,true);assert.equal(await second,true);assert.equal(f.injected,1);assert.equal(f.listeners,0);f.deny();assert.equal(await f.bridge.request(),false);assert.equal(f.injected,1);assert.equal(f.listeners,0);
});
test('missing review, foreign origins, native WebViews and global privacy control never load the CMP',async()=>{
 for(const change of ['review','origin','native','gpc','url']){const f=fixture();if(change==='review')f.settings.consentReviewed=false;if(change==='origin')f.scope.location.origin='https://other.example.com';if(change==='native')f.scope.Capacitor={isNativePlatform:()=>true};if(change==='gpc')f.scope.navigator.globalPrivacyControl=true;if(change==='url')f.settings.cmpScriptUrl='https://evil.example.com';assert.equal(await f.bridge.request(),false);assert.equal(f.injected,0);}
});
test('a current US opt-out blocks the next request instead of reusing an initial allow state',async()=>{
 const f=fixture();assert.equal(await f.bridge.request(),true);f.optOut();assert.equal(await f.bridge.request(),false);
});
test('a visible consent form cannot time out and return the game beneath it',async()=>{
 const f=fixture({initialForm:true,timeoutMs:8});let done=false;const request=f.bridge.request().then(result=>{done=true;return result;});await pause(25);assert.equal(done,false);assert.equal(f.bridge.formVisible,true);f.emit('useractioncomplete');assert.equal(await request,true);assert.equal(f.bridge.formVisible,false);assert.equal(f.listeners,0);
});
test('European privacy changes wait for actual user completion, then future ads recheck the choice',async()=>{
 const f=fixture({timeoutMs:8});assert.equal(await f.bridge.request(),true);assert.equal(f.bridge.euRequired,true);let done=false;const changing=f.bridge.europeanChoices().then(()=>done=true);await tick();await pause(25);assert.equal(done,false);f.deny();f.emit('useractioncomplete');await changing;assert.equal(f.listeners,0);assert.equal(await f.bridge.request(),false);
});
test('a blocked CMP is not permission and a retry cannot inject duplicate scripts',async()=>{
 const f=fixture({blocked:true});await assert.rejects(()=>f.bridge.request(),/could not load/);await assert.rejects(()=>f.bridge.request(),/could not load/);assert.equal(f.injected,1);assert.equal(f.listeners,0);
});
