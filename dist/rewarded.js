const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
const changed=()=>Error('Your account or screen changed. Reopen the time bank to recover any pending reward.');
const phases=['requesting','prepared','ready','presenting','pending'];
export class RewardedService {
 constructor({cloud,storage,platform,deviceId,adapter,now=()=>Date.now(),monotonic=()=>performance.now(),id=()=>crypto.randomUUID(),canPresent=()=>true}){
  Object.assign(this,{cloud,storage,platform,deviceId,adapter,now,monotonic,id,canPresent});this.busy=false;this.epoch=0;this.ready=null;this.configuration=null;this.state=null;this.catalogOwner=null;this.inFlight=null;
 }
 key(owner){return 'brick-breaker-rewarded-v1:'+owner;}
 records(owner){
  const raw=this.storage.getItem(this.key(owner));if(raw===null)return[];
  let value;try{value=JSON.parse(raw);}catch{throw Error('The ad recovery record needs checking. Reopen the game before watching another ad.');}
  if(value?.version!==1||value.owner!==owner||!Array.isArray(value.records)||value.records.length>10||value.records.some(r=>!uuid(r.id)||!uuid(r.deviceId)||!['web','android','ios'].includes(r.platform)||!phases.includes(r.phase)||typeof r.invoked!=='boolean'||!(r.earnedAtMs===null||Number.isSafeInteger(r.earnedAtMs)&&r.earnedAtMs>=946684800000)||typeof r.definitivelyUnearned!=='boolean')||new Set(value.records.map(r=>r.id)).size!==value.records.length)throw Error('The ad recovery record needs checking. Reopen the game before watching another ad.');
  return value.records;
 }
 write(owner,records){this.storage.setItem(this.key(owner),JSON.stringify({version:1,owner,records}));}
 save(owner,record){const records=this.records(owner).filter(r=>r.id!==record.id);if(records.length>=10)throw Error('Recover pending rewards before watching another ad.');this.write(owner,[...records,record]);}
 clear(owner,id){this.write(owner,this.records(owner).filter(r=>r.id!==id));}
 check(owner,epoch=this.epoch){if(!owner||owner!==this.cloud.userId||epoch!==this.epoch)throw changed();}
 async exclusive(work){if(this.busy)throw Error('An ad is still loading or open.');this.busy=true;try{return await work();}finally{this.busy=false;}}
 reset(){
  ++this.epoch;this.configuration=null;this.catalogOwner=null;this.state=null;
  if(this.ready){this.ready.handle.cancel();this.ready=null;}
 }
 async load(){return this.exclusive(async()=>{
  const owner=this.cloud.userId,epoch=this.epoch;this.check(owner,epoch);
  const catalog=await this.cloud.api('ad-catalog',{platform:this.platform});this.check(owner,epoch);
  if(catalog.available&&(catalog.platform!==this.platform||catalog.provider!==(this.platform==='web'?'h5':'admob')||!['production','sandbox'].includes(catalog.environment)))throw Error('Ad configuration does not match this edition.');
  this.configuration=catalog;this.catalogOwner=owner;this.state=catalog.state||null;return catalog;
 });}
 async prepare(){return this.exclusive(async()=>{
  const owner=this.cloud.userId,epoch=this.epoch;this.check(owner,epoch);
  if(this.ready)throw Error('Watch or cancel the prepared ad first.');
  if(!this.configuration?.available||this.catalogOwner!==owner)throw Error('Refresh rewarded ads before preparing an offer.');
  // Refuse to open an SDK if this device cannot preserve recovery evidence.
  this.records(owner);
  const record={id:this.id(),deviceId:this.deviceId,platform:this.platform,phase:'requesting',invoked:false,earnedAtMs:null,definitivelyUnearned:false};this.save(owner,record);
  let handle,serverAnchor=null,clockAnchor=null;
  try{
   const prepared=await this.cloud.api('ad-prepare',{platform:this.platform,offerId:record.id,deviceId:record.deviceId});this.check(owner,epoch);
   const offer=prepared.offer;if(offer?.id!==record.id||offer.device_id!==record.deviceId||offer.platform!==this.platform||offer.placement_id!==this.configuration.placementId||offer.provider!==this.configuration.provider||offer.environment!==this.configuration.environment||offer.state!=='prepared'||!Number.isSafeInteger(offer.promised_ms)||offer.promised_ms<1||offer.promised_ms>60000)throw Error('Ad settings changed. Refresh availability before preparing another offer.');
   this.state=prepared.state;record.phase='prepared';record.milliseconds=offer.promised_ms;this.save(owner,record);
   handle=await this.adapter.prepare({...this.configuration,offerId:record.id},{rewarded:()=>{
    if(!record.invoked||record.earnedAtMs!==null)return;
    // Retain the original callback time across failed claims, restart and UTC
    // rollover. Never replace it with the time a recovery request is sent.
    record.earnedAtMs=serverAnchor===null?this.now():Math.round(serverAnchor+Math.max(0,this.monotonic()-clockAnchor));try{this.save(owner,record);}catch{record.storageFailed=true;}
   }});this.check(owner,epoch);
   const committed=await this.cloud.api('ad-start',{offerId:record.id,deviceId:record.deviceId});this.check(owner,epoch);
   // Device wall clocks can be wrong. Anchor the original browser completion
   // timestamp to this server authorization and a monotonic elapsed duration.
   serverAnchor=Date.parse(committed?.show_requested_at);clockAnchor=this.monotonic();
   if(!Number.isSafeInteger(serverAnchor)||serverAnchor<946684800000)throw Error('Invalid ad authorization time. Refresh availability.');
   if(committed?.id!==record.id||committed.state!=='showing'||committed.promised_ms!==record.milliseconds||!this.canPresent())throw changed();
   record.phase='ready';this.save(owner,record);this.ready={owner,epoch,record,handle,deadline:this.monotonic()+120000};return{state:'ready',milliseconds:record.milliseconds,wallet:this.state?.wallet};
  }catch(error){
   handle?.cancel();
   // A changed account cannot authenticate cancellation for its predecessor.
   // Its durable journal is reconciled when that owner next signs in.
   if(this.cloud.userId===owner){try{const state=await this.cloud.api('ad-cancel',{offerId:record.id,deviceId:record.deviceId,neverPresented:true});this.clear(owner,record.id);if(epoch===this.epoch)this.state=state;}catch{}}
   throw error;
  }
 });}
 show(){
  // Do not make this method async: H5's showAdFn must run directly in the
  // fresh Watch button gesture, after all server authorization has finished.
  if(this.busy||!this.ready)throw Error('Prepare an ad before watching.');
  const current=this.ready,{owner,epoch,record,handle}=current;this.check(owner,epoch);
  if(!this.canPresent())throw changed();
  if(this.monotonic()>=current.deadline)throw Error('This unopened ad expired. Cancel it and prepare another offer.');
  record.phase='presenting';record.invoked=true;
  try{this.save(owner,record);}catch(error){record.invoked=false;record.phase='ready';throw error;}
  this.busy=true;this.ready=null;this.inFlight=current;
  let completion;try{completion=handle.show();}catch{completion=Promise.resolve({definitivelyUnearned:false,reason:'failed'});}
  return Promise.resolve(completion).then(async result=>{
   record.phase='pending';record.definitivelyUnearned=result?.definitivelyUnearned===true&&record.earnedAtMs===null;
   this.save(owner,record);this.check(owner,epoch);
   return this.reconcile(owner,record,epoch);
  }).finally(()=>{this.busy=false;});
 }
 async reconcile(owner,record,epoch){
  this.check(owner,epoch);
  if(record.platform==='web'&&record.earnedAtMs!==null){
   const result=await this.cloud.api('ad-web-earned',{offerId:record.id,deviceId:record.deviceId,earnedAtMs:record.earnedAtMs});this.check(owner,epoch);
   // A successful claim still needs the authoritative terminal offer state.
   if(result?.wallet)this.state={...this.state,wallet:result.wallet};
  }else{
   const state=await this.cloud.api('ad-cancel',{offerId:record.id,deviceId:record.deviceId,neverPresented:!record.invoked,definitivelyUnearned:record.definitivelyUnearned});this.check(owner,epoch);this.state=state;
  }
  const result=await this.cloud.api('ad-status',{offerId:record.id});this.check(owner,epoch);this.state=result.state;
  const terminal=['earned','cancelled'].includes(result.offer?.state);
  // Native late delivery belongs to the server inbox, not this device. Once
  // acknowledged as awaiting, it needs no client proof and must not fill a
  // finite local journal forever after unearned dismissals on earlier days.
  if(terminal||record.platform!=='web'&&result.offer?.state==='awaiting'){this.clear(owner,record.id);if(this.inFlight?.record.id===record.id)this.inFlight=null;}
  return{state:result.offer?.state==='earned'?'verified':result.offer?.state==='cancelled'?'cancelled':'pending',milliseconds:result.offer?.promised_ms,wallet:this.state?.wallet};
 }
 async cancel(){return this.exclusive(async()=>{
  if(!this.ready)return{state:'cancelled'};
  const {owner,epoch,record,handle}=this.ready;this.check(owner,epoch);
  if(!handle.cancel())throw Error('Wait until the ad closes.');this.ready=null;return this.reconcile(owner,record,epoch);
 });}
 async recover(){return this.exclusive(async()=>{
  const owner=this.cloud.userId,epoch=this.epoch;this.check(owner,epoch);
  if(this.ready)throw Error('Watch or cancel the prepared ad first.');
  let records;
  try{records=this.records(owner);}catch{
   // Server offers prove no H5 completion event. Do not overwrite a damaged
   // journal, fabricate viewing or silently abandon possible earned evidence.
   const state=await this.cloud.api('ad-state');this.check(owner,epoch);this.state=state;
   throw Error('A device recovery record is damaged. Your server balance is safe. Contact support before watching another ad.');
  }
  if(this.inFlight?.owner===owner)records=[...records.filter(r=>r.id!==this.inFlight.record.id),this.inFlight.record];
  let pending=false;
  for(const record of records){
   this.check(owner,epoch);if(record.deviceId!==this.deviceId){pending=true;continue;}
   try{const result=await this.reconcile(owner,record,epoch);pending ||=result.state==='pending';}
   catch(error){
    if(record.phase==='requesting'&&!record.invoked&&error.status===400&&error.message==='Unknown reward opportunity'){this.clear(owner,record.id);continue;}
    throw error;
   }
  }
  const state=await this.cloud.api('ad-state');this.check(owner,epoch);this.state=state;
  return{state:pending||state.pending?.length?'pending':'synced',wallet:state.wallet};
 });}
}
