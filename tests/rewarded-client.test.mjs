import test from 'node:test';import assert from 'node:assert/strict';
import {NativeRewardedAdapter,H5RewardedAdapter} from '../dist/rewarded-adapters.js';
import {RewardedService} from '../dist/rewarded.js';
const unit='ca-app-pub-1234567890123456/1234567890',webUnit='ca-pub-1234567890123456',owner=crypto.randomUUID(),deviceId=crypto.randomUUID();
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function native(overrides={}){
 const listeners=new Map(),calls=[];let removed=0;
 const AdMob={requestConsentInfo:async()=>({status:'NOT_REQUIRED',canRequestAds:true,privacyOptionsRequirementStatus:'REQUIRED'}),initialize:async options=>calls.push(['initialize',options]),addListener:async(event,callback)=>{listeners.set(event,callback);return{remove:async()=>{removed++;listeners.delete(event);}};},prepareRewardVideoAd:async options=>{calls.push(['prepare',options]);return{adUnitId:options.adId};},showRewardVideoAd:async()=>({amount:1,type:'autoplay_time'}),showPrivacyOptionsForm:async()=>calls.push(['privacy']),...overrides};
 const adapter=new NativeRewardedAdapter({available:()=>true,eligible:()=>true,loadSDK:async()=>({AdMob,RewardAdPluginEvents:{Rewarded:'reward',Dismissed:'dismiss',FailedToShow:'failed'}})});
 return{adapter,calls,listeners,get removed(){return removed;}};
}
test('native reward callback is a hint and does not complete the fullscreen session before dismissal',async()=>{
 const n=native();let hints=0,completed=false;const id=crypto.randomUUID(),handle=await n.adapter.prepare({unit,offerId:id,environment:'production'},{rewarded:()=>hints++});
 assert.deepEqual(n.calls.at(-1)[1],{adId:unit,isTesting:false,npa:true,ssv:{userId:id,customData:id}});
 const closing=handle.show().then(result=>{completed=true;return result;});await tick();assert.equal(hints,1);assert.equal(completed,false);assert.equal(n.adapter.busy,true);
 n.listeners.get('reward')();assert.equal(hints,1);n.listeners.get('dismiss')();const result=await closing;assert.equal(result.earnedHint,true);assert.equal(result.definitivelyUnearned,false);assert.equal(n.removed,3);assert.equal(n.adapter.busy,false);
});
test('native privacy denial never initializes or loads ads and restores the external surface',async()=>{
 const n=native({requestConsentInfo:async()=>({status:'REQUIRED',canRequestAds:false,isConsentFormAvailable:true}),showConsentForm:async()=>({canRequestAds:false,privacyOptionsRequirementStatus:'REQUIRED'})});let started=0,ended=0;
 n.adapter.externalStart=()=>++started;n.adapter.externalEnd=token=>ended=token;
 await assert.rejects(()=>n.adapter.prepare({unit,offerId:crypto.randomUUID(),environment:'production'}),/privacy choices/);assert.equal(n.calls.length,0);assert.equal(started,1);assert.equal(ended,1);assert.equal(n.adapter.busy,false);
});
test('native load is serialized and cancellation before presentation cannot later show',async()=>{
 const loading=defer(),n=native({prepareRewardVideoAd:()=>loading.promise});const preparing=n.adapter.prepare({unit,offerId:crypto.randomUUID(),environment:'sandbox'});await tick();
 await assert.rejects(()=>n.adapter.prepare({unit,offerId:crypto.randomUUID(),environment:'sandbox'}),/still open/);loading.resolve({adUnitId:unit});const handle=await preparing;assert.equal(handle.cancel(),true);assert.throws(()=>handle.show(),/available/);assert.equal(n.removed,3);
});
test('native show failure is conservatively unverified, and a mismatched loaded unit cleans up',async()=>{
 const n=native({showRewardVideoAd:async()=>{throw Error('OS refused');}}),h=await n.adapter.prepare({unit,offerId:crypto.randomUUID(),environment:'production'});assert.equal((await h.show()).definitivelyUnearned,false);assert.equal(n.removed,3);
 const mismatch=native({prepareRewardVideoAd:async()=>({adUnitId:'different'})});await assert.rejects(()=>mismatch.adapter.prepare({unit,offerId:crypto.randomUUID(),environment:'production'}));assert.equal(mismatch.removed,3);
});
test('native unavailable or ineligible builds do not import an SDK',async()=>{
 let imports=0;const adapter=new NativeRewardedAdapter({available:()=>false,eligible:()=>true,loadSDK:async()=>imports++});await assert.rejects(()=>adapter.prepare({unit,offerId:crypto.randomUUID(),environment:'production'}));assert.equal(imports,0);
});
function h5({consent=async()=>true,loadError=false,timeoutMs=1000}={}){
 let options,loaded=0,showed=0;const adapter=new H5RewardedAdapter({consent,timeoutMs,load:async()=>{loaded++;if(loadError)throw Error('blocked');return{config(){},break:o=>{options=o;}};}});
 return{adapter,get options(){return options;},get loaded(){return loaded;},get showed(){return showed;},async ready(hooks){const pending=adapter.prepare({unit:webUnit,offerId:crypto.randomUUID(),environment:'sandbox'},hooks);await tick();options.beforeReward(()=>showed++);return pending;}};
}
test('H5 show runs synchronously in the final gesture and reward is sticky through dismissal',async()=>{
 const h=h5();let rewards=0,muted=0;const handle=await h.ready({rewarded:()=>rewards++,beforeAd:()=>muted++});const closed=handle.show();assert.equal(h.showed,1);assert.equal(muted,1);
 h.options.beforeAd();h.options.adViewed();h.options.adViewed();h.options.adDismissed();assert.equal(rewards,1);h.options.afterAd();assert.equal(h.adapter.busy,true);h.options.adBreakDone({breakStatus:'viewed'});assert.deepEqual(await closed,{reason:'viewed',earnedHint:true,definitivelyUnearned:false});assert.equal(h.adapter.busy,false);
});
test('H5 denied consent never injects advertising code; no-fill and readiness timeout release loading',async()=>{
 const denied=h5({consent:async()=>false});await assert.rejects(()=>denied.adapter.prepare({unit:webUnit,offerId:crypto.randomUUID(),environment:'production'}),/privacy/);assert.equal(denied.loaded,0);
 const h=h5(),pending=h.adapter.prepare({unit:webUnit,offerId:crypto.randomUUID(),environment:'production'});await tick();h.options.adBreakDone({breakStatus:'noAdPreloaded'});await assert.rejects(()=>pending);assert.equal(h.adapter.busy,false);
 const timeout=h5({timeoutMs:5});await assert.rejects(()=>timeout.adapter.prepare({unit:webUnit,offerId:crypto.randomUUID(),environment:'sandbox'}));timeout.options.beforeReward(()=>assert.fail('late callback showed an ad'));assert.equal(timeout.adapter.busy,false);
});
test('H5 cancelled or definitively dismissed offers cannot show or fabricate rewards',async()=>{
 const h=h5(),handle=await h.ready();assert.equal(handle.cancel(),true);assert.throws(()=>handle.show());
 const second=h5(),show=await second.ready();const closing=show.show();second.options.adDismissed();second.options.adBreakDone({breakStatus:'dismissed'});assert.equal((await closing).definitivelyUnearned,true);
});
function fixture(platform='web'){
 const data=new Map(),offers=new Map(),calls=[];let wallet={availableMs:0},reward,closing=defer(),shows=0,sequence=0;
 const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)},state=()=>({wallet,remaining:3,pending:[...offers.values()].filter(o=>!['cancelled','earned'].includes(o.state))});
 const cloud={userId:owner,async api(action,args={}){calls.push([action,args]);const offer=offers.get(args.offerId);
  if(action==='ad-catalog')return{available:true,platform,provider:platform==='web'?'h5':'admob',environment:'sandbox',placementId:'fixture-v1',unit:platform==='web'?webUnit:unit,state:state()};
  if(action==='ad-prepare'){const row={id:args.offerId,device_id:args.deviceId,platform,provider:platform==='web'?'h5':'admob',environment:'sandbox',placement_id:'fixture-v1',state:'prepared',promised_ms:30000};offers.set(row.id,row);return{offer:row,state:state()};}
  if(action==='ad-start'){offer.state='showing';offer.show_requested_at=new Date(1793027000000).toISOString();return structuredClone(offer);}
  if(action==='ad-cancel'){if(args.neverPresented||args.definitivelyUnearned)offer.state='cancelled';else if(offer.state!=='earned')offer.state='awaiting';return state();}
  if(action==='ad-web-earned'){if(offer.state!=='earned'){wallet={availableMs:30000};offer.state='earned';}return state();}
  if(action==='ad-status')return{offer:structuredClone(offer),state:state()};if(action==='ad-state')return state();throw Error(action);
 }};
 const adapter={async prepare(config,hooks){reward=hooks.rewarded;return{show(){shows++;return closing.promise;},cancel:()=>true};}};
 const service=()=>new RewardedService({cloud,storage,platform,deviceId,adapter,now:()=>1793027000000+sequence++});
 return{service,cloud,storage,data,offers,calls,adapter,get shows(){return shows;},reward:()=>reward(),close:result=>closing.resolve(result)};
}
test('H5 service journals presentation before synchronous SDK show and claims only after actual completion',async()=>{
 const f=fixture(),service=f.service();await service.load();assert.equal((await service.prepare()).milliseconds,30000);assert.equal(f.shows,0);
 const closing=service.show();assert.equal(f.shows,1);assert.equal(service.records(owner)[0].invoked,true);assert.equal(f.calls.some(([action])=>action==='ad-web-earned'),false);
 f.reward();f.reward();const timestamp=service.records(owner)[0].earnedAtMs;f.close({definitivelyUnearned:false});const result=await closing;assert.equal(result.state,'verified');assert.equal(result.wallet.availableMs,30000);assert.equal(f.calls.find(([action])=>action==='ad-web-earned')[1].earnedAtMs,timestamp);assert.deepEqual(service.records(owner),[]);
});
test('native client completion never claims browser credit or pretends SSV succeeded',async()=>{
 const f=fixture('android'),service=f.service();await service.load();await service.prepare();const completion=service.show();f.reward();f.close({definitivelyUnearned:false});assert.equal((await completion).state,'pending');assert.equal(f.calls.some(([a])=>a==='ad-web-earned'),false);assert.equal(service.records(owner).length,0);
 f.offers.values().next().value.state='earned';assert.equal((await service.recover()).state,'synced');assert.equal(service.records(owner).length,0);
});
test('cancel before showing releases the original promise; changed screens never automatically show',async()=>{
 const f=fixture(),service=f.service();await service.load();await service.prepare();assert.equal((await service.cancel()).state,'cancelled');assert.equal(f.shows,0);assert.equal(f.calls.find(([a])=>a==='ad-cancel')[1].neverPresented,true);
 const second=fixture(),s=second.service();await s.load();s.canPresent=()=>false;await assert.rejects(()=>s.prepare(),/screen changed/);assert.equal(second.shows,0);assert.equal(s.records(owner).length,0);
});
test('offline H5 completion recovers its original timestamp after restart without refilling twice',async()=>{
 const f=fixture(),s=f.service();await s.load();await s.prepare();const normal=f.cloud.api;let offline=true;
 f.cloud.api=async(a,b)=>{if(a==='ad-web-earned'&&offline)throw Error('offline');return normal(a,b);};const completion=s.show();f.reward();const earnedAtMs=s.records(owner)[0].earnedAtMs;f.close({definitivelyUnearned:false});await assert.rejects(()=>completion,/offline/);
 offline=false;const restarted=f.service();assert.equal((await restarted.recover()).wallet.availableMs,30000);assert.equal(f.calls.find(([a])=>a==='ad-web-earned')[1].earnedAtMs,earnedAtMs);await restarted.recover();assert.equal(f.calls.filter(([a])=>a==='ad-web-earned').length,1);
});
test('account changes retain the original owner journal and cannot credit or cancel into the next account',async()=>{
 const f=fixture(),s=f.service();await s.load();await s.prepare();const closing=s.show();f.reward();f.cloud.userId=crypto.randomUUID();s.reset();f.close({definitivelyUnearned:false});await assert.rejects(()=>closing,/account or screen changed/);
 assert.equal(s.records(owner).length,1);assert.equal(f.calls.some(([a])=>['ad-web-earned','ad-cancel'].includes(a)),false);assert.equal(s.records(f.cloud.userId).length,0);
});
test('storage refusal prevents SDK presentation; corrupted evidence is preserved during recovery',async()=>{
 const f=fixture(),s=f.service();await s.load();await s.prepare();const write=f.storage.setItem;f.storage.setItem=()=>{throw Error('full');};assert.throws(()=>s.show(),/full/);assert.equal(f.shows,0);assert.equal(s.ready.record.invoked,false);
 f.storage.setItem=write;f.data.set(s.key(owner),'{broken');await assert.rejects(()=>s.recover(),/prepared ad/);s.reset();await assert.rejects(()=>s.recover(),/damaged/);assert.equal(f.data.get(s.key(owner)),'{broken');
});


test('a placement rotation between catalog and reservation never opens the stale SDK unit',async()=>{
 const f=fixture(),s=f.service();await s.load();const normal=f.cloud.api;let loads=0;
 f.adapter.prepare=async()=>{loads++;throw Error('must not load');};
 f.cloud.api=async(a,b)=>{const result=await normal(a,b);if(a==='ad-prepare')result.offer.placement_id='rotated-v2';return result;};
 await assert.rejects(()=>s.prepare(),/settings changed/);assert.equal(loads,0);assert.equal(s.records(owner).length,0);assert.equal([...f.offers.values()][0].state,'cancelled');
});

test('unopened offers have a monotonic deadline that wall-clock changes cannot extend',async()=>{
 const f=fixture(),s=f.service();let elapsed=100;s.monotonic=()=>elapsed;await s.load();await s.prepare();elapsed+=120000;s.now=()=>0;
 assert.throws(()=>s.show(),/expired/);assert.equal(f.shows,0);assert.equal((await s.cancel()).state,'cancelled');
});

test('reset during native preparation waits for loading, cancels the handle, and never starts an ad',async()=>{
 const f=fixture('android'),s=f.service(),loading=defer();let cancelled=0;f.adapter.prepare=()=>loading.promise;await s.load();const preparing=s.prepare();await tick();s.reset();
 loading.resolve({cancel:()=>{cancelled++;return true;},show:()=>assert.fail('automatic show')});await assert.rejects(()=>preparing,/screen changed/);assert.equal(cancelled,1);assert.equal(s.records(owner).length,0);
});

test('a partial native listener registration failure removes the listeners already installed',async()=>{
 let count=0,removed=0;const n=native({addListener:async()=>{if(++count===2)throw Error('bridge unavailable');return{remove:async()=>removed++};}});
 await assert.rejects(()=>n.adapter.prepare({unit,offerId:crypto.randomUUID(),environment:'production'}),/bridge/);assert.equal(removed,1);assert.equal(n.adapter.busy,false);
});


test('H5 callback timing uses the server authorization clock even if the device clock is wrong',async()=>{
 const f=fixture(),s=f.service();let elapsed=100;s.monotonic=()=>elapsed;s.now=()=>0;await s.load();await s.prepare();const completion=s.show();elapsed+=25000;f.reward();
 assert.equal(s.records(owner)[0].earnedAtMs,1793027025000);s.now=()=>9999999999999;f.close({definitivelyUnearned:false});assert.equal((await completion).state,'verified');
 assert.equal(f.calls.find(([a])=>a==='ad-web-earned')[1].earnedAtMs,1793027025000);
});
