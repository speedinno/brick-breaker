export const STARTER_COUNT=12,PROGRESS_VERSION=3;
const safeLevel=n=>Number.isSafeInteger(n)&&n>0&&n<Number.MAX_SAFE_INTEGER;
const bounded=(value,min,max,fallback)=>Number.isFinite(value)&&value>=min&&value<=max?value:fallback;
export function emptyProgress(){return {version:3,starters:[],journeyNext:13,records:{},selected:1,best:0,pending:[],updatedAt:0};}
export function normalizeProgress(input){
  const out=emptyProgress();if(!input||typeof input!=='object'||Array.isArray(input))return out;
  out.starters=[...new Set(Array.isArray(input.starters)?input.starters.filter(n=>Number.isInteger(n)&&n>=1&&n<=12):[])].sort((a,b)=>a-b);
  out.journeyNext=out.starters.length===12&&safeLevel(input.journeyNext)&&input.journeyNext>=13?input.journeyNext:13;
  out.best=bounded(input.best,0,1e12,0);out.updatedAt=bounded(input.updatedAt,0,Number.MAX_SAFE_INTEGER,0);
  if(input.records&&typeof input.records==='object'&&!Array.isArray(input.records))for(const [key,r]of Object.entries(input.records).slice(-256)){
    const level=Number(key);if(!safeLevel(level)||!r||typeof r!=='object')continue;
    if(level<=12&&!out.starters.includes(level)||level>12&&level>=out.journeyNext)continue;
    out.records[level]={level,score:bounded(r.score,0,1e9,0),seconds:bounded(r.seconds,0,86400,0),peak:bounded(r.peak,1,768,1),mode:r.mode==='watch'?'watch':'play',clears:bounded(r.clears,1,1e9,1),completedAt:bounded(r.completedAt,0,Number.MAX_SAFE_INTEGER,0)};
  }
  out.selected=safeLevel(input.selected)&&isUnlocked(out,input.selected)?input.selected:nextRequired(out);
  if(Array.isArray(input.pending))out.pending=input.pending.filter(p=>p&&/^[a-f\d-]{36}$/i.test(p.runId)&&safeLevel(p.level)&&typeof p.hash==='string'&&/^[a-f\d]{64}$/.test(p.hash)).slice(-256);
  return out;
}
export function startersComplete(progress){return progress.starters.length===12;}
export function isCompleted(progress,level){return level<=12?progress.starters.includes(level):startersComplete(progress)&&level<progress.journeyNext;}
export function isUnlocked(progress,level){return safeLevel(level)&&(level<=12||startersComplete(progress)&&level<=progress.journeyNext);}
export function nextRequired(progress){for(let n=1;n<=12;n++)if(!progress.starters.includes(n))return n;return progress.journeyNext;}
export function completedCount(progress){return progress.starters.length+(startersComplete(progress)?progress.journeyNext-13:0);}
export function unlinkedGuestCount(account,guest){return guest.starters.filter(n=>!isCompleted(account,n)).length+(startersComplete(guest)?Math.max(0,guest.journeyNext-(startersComplete(account)?account.journeyNext:13)):0);}
export function lockReason(progress,level){
  if(isUnlocked(progress,level))return '';
  if(!startersComplete(progress))return `Finish all 12 starter stages first. ${12-progress.starters.length} ${12-progress.starters.length===1?'stage remains':'stages remain'}. Next: stage ${nextRequired(progress)}.`;
  return level===progress.journeyNext+1?`Finish stage ${progress.journeyNext} to unlock stage ${level}.`:`Finish the journey stages in order. Your next stage is ${progress.journeyNext}.`;
}
export function markCompleted(progress,level,result={}){
  const out=normalizeProgress(progress);if(!isUnlocked(out,level))throw Error(lockReason(out,level));
  if(level<=12&&!out.starters.includes(level))out.starters.push(level);
  if(level>=13&&level===out.journeyNext)out.journeyNext++;
  out.starters.sort((a,b)=>a-b);
  const prior=out.records[level];out.records[level]={level,score:Math.max(prior?.score||0,bounded(result.score,0,1e9,0)),seconds:prior?.seconds?Math.min(prior.seconds,bounded(result.seconds,0,86400,86400)):bounded(result.seconds,0,86400,0),peak:Math.max(prior?.peak||1,bounded(result.peak,1,768,1)),mode:result.mode==='watch'?'watch':'play',clears:(prior?.clears||0)+1,completedAt:Date.now()};
  out.best=Math.max(out.best,out.records[level].score);out.selected=nextRequired(out);out.updatedAt=Date.now();
  const keys=Object.keys(out.records).map(Number).filter(n=>n>12).sort((a,b)=>a-b);while(keys.length>128)delete out.records[keys.shift()];
  return out;
}
export function mergeProgress(local,remote){
  const a=normalizeProgress(local),b=normalizeProgress(remote),out=emptyProgress();out.starters=[...new Set([...a.starters,...b.starters])].sort((x,y)=>x-y);
  out.journeyNext=out.starters.length===12?Math.max(a.journeyNext,b.journeyNext):13;
  out.records={...a.records,...b.records};for(const key of Object.keys(out.records)){const x=a.records[key],y=b.records[key];if(x&&y)out.records[key]={...out.records[key],score:Math.max(x.score,y.score),seconds:Math.min(x.seconds,y.seconds),peak:Math.max(x.peak,y.peak),clears:Math.max(x.clears,y.clears),completedAt:Math.max(x.completedAt,y.completedAt)};}out.best=Math.max(a.best,b.best);out.updatedAt=Math.max(a.updatedAt,b.updatedAt);out.pending=a.pending;
  out.selected=!a.updatedAt?b.selected:isUnlocked(out,a.selected)?a.selected:nextRequired(out);return normalizeProgress(out);
}
export function cloudProgress(state){
  const out=emptyProgress();out.starters=state.starter_completed||[];out.journeyNext=Math.max(13,Number(state.highest_unlocked)||13);out.best=Number(state.best_score)||0;out.selected=Number(state.selected_level)||nextRequired(out);
  for(const row of state.recent||[])out.records[row.level]={level:Number(row.level),score:Number(row.best_score),seconds:Number(row.best_seconds),peak:Number(row.peak_balls),mode:row.play_mode,clears:row.clears,completedAt:Date.parse(row.last_completed_at)||0};
  return normalizeProgress(out);
}
export class ProgressStore{
  constructor(storage=globalThis.localStorage,accountId=null){this.storage=storage;this.accountId=accountId;this.value=this.read();}
  get key(){return `brick-breaker-v3:${this.accountId?'user:'+this.accountId:'guest'}`;}
  read(){try{return normalizeProgress(JSON.parse(this.storage.getItem(this.key)||'null'));}catch{return emptyProgress();}}
  save(value){this.value=normalizeProgress(value);try{this.storage.setItem(this.key,JSON.stringify(this.value));this.storageError=false;}catch{this.storageError=true;}return this.value;}
  switchAccount(id){this.accountId=id||null;this.value=this.read();return this.value;}
  complete(level,result){return this.save(markCompleted(mergeProgress(this.value,this.read()),level,result));}
  clear(){try{this.storage.removeItem(this.key);}catch{}this.value=emptyProgress();}
}
