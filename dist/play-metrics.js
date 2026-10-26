const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/.test(value);
const revision=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n;
const types=new Set(['session_start','help_open','play_segment','stage_end','coach_exposure','purchase_offer','ad_event','ad_value']);
const assigned=a=>a?.kind==='aim_coaching'&&typeof a.experiment==='string'&&/^[a-z0-9_-]{1,80}$/.test(a.experiment)&&['standard','aim_hint'].includes(a.variant)?{experiment:a.experiment,kind:a.kind,variant:a.variant}:null;
function validData(type,d){
 if(!d||typeof d!=='object'||Array.isArray(d))return false;
 const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max,member=(value,values)=>typeof value==='string'&&values.includes(value),text=(value,pattern)=>typeof value==='string'&&pattern.test(value);let keys,valid=false;
 if(type==='session_start'){keys=['platform','build'];valid=member(d.platform,['android','ios','web'])&&text(d.build,/^\d{1,3}\.\d{1,3}\.\d{1,3}$/);}
 if(type==='help_open'){keys=['surface'];valid=member(d.surface,['home','game','settings']);}
 if(type==='play_segment'||type==='stage_end'){
  valid=integer(d.level,1,9007199254740990)&&uuid(d.runId)&&member(d.mode,['manual','assisted']);
  if(type==='play_segment'){keys=['level','runId','mode','activeMs','reason'];valid&&=integer(d.activeMs,1,60000)&&member(d.reason,['periodic','paused','background','cleared','game_over','lost','takeover','home','account']);}
  else{keys=['level','runId','mode','simulationMs','losses','outcome'];valid&&=integer(d.simulationMs,0,86400000)&&integer(d.losses,0,5)&&member(d.outcome,['cleared','game_over']);}
 }
 if(type==='coach_exposure'){keys=['experiment','variant'];valid=text(d.experiment,/^[a-z0-9_-]{1,80}$/)&&member(d.variant,['standard','aim_hint']);}
 if(type==='purchase_offer'){keys=['platform','sku','currency','amountMicros','benefitMs','configVersion'];valid=member(d.platform,['android','ios','web'])&&text(d.sku,/^[A-Za-z0-9_.:-]{1,200}$/)&&text(d.currency,/^[A-Z]{3}$/)&&integer(d.amountMicros,0,1000000000000000)&&integer(d.benefitMs,1,9000000000)&&text(d.configVersion,/^[A-Za-z0-9_.:-]{1,80}$/);}
 if(type==='ad_event'){keys=['opportunityId','provider','platform','phase'];valid=uuid(d.opportunityId)&&member(d.provider,['admob','h5'])&&member(d.platform,['android','ios','web'])&&member(d.phase,['request','display','reward_signal','closed','failed']);}
 if(type==='ad_value'){keys=['opportunityId','provider','platform','valueMicros','currency','precision'];valid=uuid(d.opportunityId)&&d.provider==='admob'&&member(d.platform,['android','ios'])&&integer(d.valueMicros,0,1e15)&&text(d.currency,/^[A-Z]{3}$/)&&integer(d.precision,0,3);}
 return valid&&Object.keys(d).every(key=>keys.includes(key));
}
export class PlayMetrics {
 constructor({storage,account,api,platform,build='3.3.0',now=()=>Date.now(),onChange=()=>{}}){Object.assign(this,{storage,account,api,platform,build,now,onChange});this.owner=null;this.data=null;this.epoch=0;this.ready=false;this.busy=false;this.error='';this.timer=null;this.flushing=null;this.segment=null;this.exposures=new Set();this.retired=new Set();}
 key(owner){return'brick-breaker-metrics-v1:user:'+owner;}
 get choiceEnabled(){return Boolean(this.owner&&this.owner===this.account()&&this.data?.enabled&&!this.data.suppressed&&!this.data.pendingOff&&!this.retired.has(this.owner));}
 get enabled(){return this.choiceEnabled&&this.data.available!==false;}
 get assignment(){return this.enabled?this.data.assignment:null;}
 fresh(owner){return{version:1,owner,enabled:false,revision:'0',assignment:null,streamId:crypto.randomUUID(),events:[],dropped:0,pendingOff:null,suppressed:false};}
 persist(){if(!this.owner||!this.data||this.owner!==this.account()||this.retired.has(this.owner))return false;try{this.storage.setItem(this.key(this.owner),JSON.stringify(this.data));return true;}catch{this.error='Device storage cannot save optional analytics. Gameplay is unaffected.';this.onChange();return false;}}
 saveSoon(){if(this.timer!==null)return;this.timer=setTimeout(()=>{this.timer=null;this.persist();},0);}
 accept(state){
  if(typeof state?.enabled!=='boolean'||!revision(state.revision))throw Error('Optional analytics settings need a retry.');
  if(BigInt(state.revision)<BigInt(this.data.revision))return false;
  if(state.revision!==this.data.revision){this.data.events=[];this.segment=null;this.exposures.clear();this.data.streamId=crypto.randomUUID();this.data.dropped=0;}
  this.data.assignment=assigned(state.assignment);
  this.data.revision=state.revision;this.data.enabled=state.enabled;this.data.available=state.available!==false;if(!state.enabled||state.available===false){this.data.events=[];this.segment=null;this.exposures.clear();}this.ready=true;this.persist();this.onChange();
 }
 async identify(){
  clearTimeout(this.timer);this.timer=null;this.segment=null;this.exposures.clear();this.owner=this.account();const epoch=++this.epoch;this.ready=false;this.busy=false;this.error='';this.flushing=null;this.data=null;this.sessionId=crypto.randomUUID();
  if(!uuid(this.owner)||this.retired.has(this.owner)){this.owner=null;this.onChange();return;}
  this.data=this.fresh(this.owner);
  try{const saved=JSON.parse(this.storage.getItem(this.key(this.owner))||'null');if(saved?.version===1&&saved.owner===this.owner&&revision(saved.revision)&&typeof saved.enabled==='boolean'&&uuid(saved.streamId)&&Array.isArray(saved.events)&&saved.events.length<=256&&saved.events.every(e=>uuid(e?.id)&&types.has(e?.type)&&uuid(e.sessionId)&&Number.isSafeInteger(e.clientAt)&&e.clientAt>=0&&validData(e.type,e.data)&&Object.keys(e).every(key=>['id','type','sessionId','clientAt','data'].includes(key)))&&Number.isSafeInteger(saved.dropped)&&saved.dropped>=0&&saved.dropped<=1000000000&&(saved.pendingOff===null||revision(saved.pendingOff))){this.data={version:1,owner:this.owner,enabled:saved.enabled,available:saved.available!==false,revision:saved.revision,streamId:saved.streamId,assignment:assigned(saved.assignment),events:saved.events,dropped:saved.dropped,pendingOff:saved.pendingOff,suppressed:saved.suppressed===true};}}
  catch{this.error='Optional analytics storage could not be read.';}
  const owner=this.owner;await this.refresh();if(epoch!==this.epoch||owner!==this.account())return;if(this.enabled)this.record('session_start',{platform:this.platform,build:this.build});this.onChange();
 }
 async refresh(){
  const epoch=this.epoch,owner=this.owner;if(this.busy||!owner||owner!==this.account())return;
  this.busy=true;this.onChange();
  try{
   const pending=this.data.pendingOff,result=await this.api(pending?'set':'state',pending?{enabled:false,expectedRevision:pending}:{});if(epoch!==this.epoch||owner!==this.account())return;
   this.error='';if(pending){this.data.pendingOff=null;this.data.suppressed=result.enabled===true; if(result.enabled)this.error='Your account setting changed elsewhere. This device keeps optional analytics off until you choose again.';}
   this.accept(result);
  }catch{if(epoch===this.epoch){this.error=this.data?.pendingOff?'Analytics are off on this device. Reconnect to finish the account opt-out.':'Optional analytics could not connect. Gameplay is unaffected.';}}
  finally{if(epoch===this.epoch){this.busy=false;this.onChange();}}
 }
 async toggle(enabled){
  if(!this.owner||this.owner!==this.account()||this.busy||typeof enabled!=='boolean'||enabled&&(!this.ready||this.data.available===false))return;
  const epoch=++this.epoch,owner=this.owner,expectedRevision=this.data.revision;this.flushing=null;this.busy=true;this.error='';
  if(!enabled){this.data.pendingOff=expectedRevision;this.data.suppressed=true;this.data.events=[];this.segment=null;this.exposures.clear();this.persist();}this.onChange();
  try{
   const result=await this.api('set',{enabled,expectedRevision});if(epoch!==this.epoch||owner!==this.account())return;
   this.data.pendingOff=null;this.data.suppressed=!enabled&&result.enabled;this.accept(result);
   if(!result.applied&&result.enabled!==enabled)this.error='Your account setting changed elsewhere. Review the current choice.';
   else if(this.enabled)this.record('session_start',{platform:this.platform,build:this.build});
  }catch{if(epoch===this.epoch)this.error=enabled?'Could not enable optional analytics. Try again after reconnecting.':'Analytics are off on this device. Reconnect to finish the account opt-out.';}
  finally{if(epoch===this.epoch){this.busy=false;this.persist();this.onChange();}}
 }
 record(type,data){
  if(!this.enabled||!types.has(type))return false;
  if(!validData(type,data)){this.data.dropped=Math.min(1000000000,this.data.dropped+1);return false;}
  try{const item={id:crypto.randomUUID(),type,sessionId:this.sessionId,clientAt:Math.max(0,Math.floor(this.now())),data:structuredClone(data)};if(!Number.isSafeInteger(item.clientAt)||JSON.stringify(item).length>2048)throw Error();if(this.data.events.length>=256){this.data.events.shift();this.data.dropped=Math.min(1000000000,this.data.dropped+1);}this.data.events.push(item);this.saveSoon();return true;}catch{this.data.dropped=Math.min(1000000000,this.data.dropped+1);return false;}
 }
 accrue(milliseconds,level,runId,mode){
  if(!this.enabled||!uuid(runId)||!Number.isFinite(milliseconds)||milliseconds<=0)return;
  if(this.segment&&(this.segment.level!==level||this.segment.runId!==runId||this.segment.mode!==mode))this.endSegment('takeover');
  this.segment??={level,runId,mode,activeMs:0};this.segment.activeMs+=milliseconds;
  if(this.segment.activeMs>=60000){const remainder=this.segment.activeMs-60000;this.segment.activeMs=60000;this.endSegment('periodic');if(remainder>0)this.segment={level,runId,mode,activeMs:remainder};}
 }
 endSegment(reason='paused'){const segment=this.segment;this.segment=null;if(!segment)return;const activeMs=Math.min(60000,Math.round(segment.activeMs));if(activeMs>0)this.record('play_segment',{...segment,activeMs,reason});}
 coaching(base,level){return level===1&&this.assignment?.variant==='aim_hint'?'Drag to move. Centre hits go up; edge hits aim left or right.':base;}
 exposeCoach(key,level){const assignment=this.assignment;if(level!==1||!assignment||this.exposures.has(key+':'+assignment.experiment))return;this.exposures.add(key+':'+assignment.experiment);this.record('coach_exposure',{experiment:assignment.experiment,variant:assignment.variant});}
 async flush(){
  if(this.busy)return;if(this.flushing)return this.flushing;if(this.data?.pendingOff){await this.refresh();return;}if(!this.enabled)return;
  this.endSegment('periodic');if(!this.data.events.length)return;
  const epoch=this.epoch,owner=this.owner,rev=this.data.revision,streamId=this.data.streamId,dropped=this.data.dropped,events=this.data.events.slice(0,20);if(!this.persist())return;
  const work=Promise.resolve().then(async()=>{try{if(epoch!==this.epoch||owner!==this.account()||!this.enabled||this.data.revision!==rev)return;const result=await this.api('collect',{revision:rev,streamId,dropped,events});if(epoch!==this.epoch||owner!==this.account())return;
   if(result.accepted===true){const ids=new Set(events.map(e=>e.id));if(!Array.isArray(result.ack)||new Set(result.ack).size!==result.ack.length||result.ack.some(id=>!ids.has(id)))throw Error();this.data.events=this.data.events.filter(e=>!result.ack.includes(e.id));}else if(result.revision===rev&&result.enabled&&result.available!==false)throw Error();
   this.error='';this.accept(result);
  }catch{if(epoch===this.epoch){this.error='Optional analytics will retry later. Gameplay is unaffected.';this.onChange();}}finally{if(epoch===this.epoch)this.flushing=null;}});this.flushing=work;return work;
 }
 forget(owner){this.retired.add(owner);if(this.owner===owner){++this.epoch;clearTimeout(this.timer);this.timer=null;this.segment=null;this.data=null;this.owner=null;this.ready=false;this.flushing=null;this.onChange();}this.storage.removeItem(this.key(owner));}
 dispose(){++this.epoch;clearTimeout(this.timer);this.timer=null;this.owner=null;this.segment=null;this.flushing=null;}
}
