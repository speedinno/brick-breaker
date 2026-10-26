import {createHash} from 'node:crypto';
import {RevenueCatPrivacy,runPrivacyBatch} from '../supabase/functions/_shared/privacy.js';
import {webCommerce,reconcileWebDispute} from '../supabase/functions/_shared/web-commerce.js';
import {recoverDisputeBatch} from './dispute-recovery.mjs';
import {discoverPrivacyBatch} from './privacy-discovery.mjs';
export const operationKey=(kind,identity)=>kind+'-'+createHash('sha256').update(JSON.stringify(Object.entries(identity).sort(([a],[b])=>a.localeCompare(b)))).digest('hex').slice(0,32);
const summaryKeys=new Set(['processed','ignored','reviews','complete','pending','next','pages','examined','matched','claimed','acknowledged','stale','queued','absent','review','retry','events','streams','assignments','days','batchLimit','received','applied','skipped','failed','halted','exhausted']);
export function operationSummary(value){const result={};for(const [key,item]of Object.entries(value??{})){if(!summaryKeys.has(key)||!(typeof item==='boolean'||Number.isSafeInteger(item)&&item>=0&&item<=1e9))throw Error('Invalid private operation summary');result[key]=item;}return result;}
export async function runOperations({admin,settings,batch=20,halt=()=>false,request=fetch}){
 const environment=settings('MONETIZATION_ENVIRONMENT'),rawDatabase=settings('SUPABASE_URL');
 if(!Number.isSafeInteger(batch)||batch<1||batch>100||!['sandbox','production'].includes(environment)||typeof rawDatabase!=='string')throw Error('Operations configuration is invalid.');
 const parsed=new URL(rawDatabase);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw Error('Operations configuration is invalid.');
 const database=parsed.origin,internal={provider:'internal',environment,database},tasks=[],deferred=[];
 const rpc=async(name,args={})=>{const result=await admin.rpc(name,args);if(result.error)throw Error('Operations database request failed. Durable state is retained.');return result.data;};
 async function run(kind,identity,work){
  const key=operationKey(kind,identity);if(halt()){tasks.push({kind,key,outcome:'deferred'});return;}let lease,journal;
  try{
   lease=await rpc('game_operation_claim',{p_key:key,p_kind:kind,p_identity:identity});if(lease?.busy===true){tasks.push({kind,key,outcome:'busy'});return;}
   if(lease?.busy!==false||lease.key!==key||typeof lease.generation!=='string'||!/^[1-9]\d{0,18}$/.test(lease.generation)||typeof lease.token!=='string'||!/^[a-f\d-]{36}$/i.test(lease.token))throw Error('Invalid operation lease');
   journal=lease.journal;
   const finish=async(outcome,summary,clear=false)=>rpc('game_operation_finish',{p_key:key,p_generation:lease.generation,p_token:lease.token,p_outcome:outcome,p_summary:summary,p_clear:clear});
   const taskDeadline=Date.now()+30000,localHalt=()=>halt()||Date.now()>=taskDeadline;
   const ports={halt:localHalt,read:async()=>structuredClone(journal),write:async state=>{if(!await rpc('game_operation_put',{p_key:key,p_generation:lease.generation,p_token:lease.token,p_journal:state}))throw Error('Operation lease changed');journal=structuredClone(state);}};
   const result=await work(ports),summary=operationSummary({...result,halted:localHalt()});
   const outcome=summary.reviews>0||summary.review>0||summary.exhausted>0?'review':summary.complete===false||summary.halted?'partial':'success';
   if(!await finish(outcome,summary,journal?.complete===true))throw Error('Operation acknowledgement changed');tasks.push({kind,key,outcome,summary});
  }catch{
   if(lease?.busy===false)try{await rpc('game_operation_finish',{p_key:key,p_generation:lease.generation,p_token:lease.token,p_outcome:'error',p_summary:{failed:1},p_clear:false});}catch{}
   tasks.push({kind,key,outcome:'error'});
  }
 }
 const firstHealth=await rpc('game_operation_status');if(!firstHealth||!Array.isArray(firstHealth.jobs))throw Error('Operations health is unavailable.');
 await run('ad_reconcile',internal,async()=>{const result=await rpc('game_retry_admob_rewards',{p_limit:batch});if(!result||!['processed','applied','reviews','exhausted'].every(key=>Number.isSafeInteger(result[key])&&result[key]>=0)||result.processed>batch||result.applied>result.processed||result.reviews>result.processed)throw Error('Invalid ad recovery result');return result;});
 await run('metrics_prune',internal,async()=>{const result=await rpc('game_prune_play_metrics',{p_limit:Math.min(5000,batch*50)});if(result?.batchLimit!==Math.min(5000,batch*50)||!['events','streams','assignments','days'].every(key=>Number.isSafeInteger(result[key])&&result[key]>=0&&result[key]<=result.batchLimit))throw Error('Invalid retention result');return{...result,complete:!['events','streams','assignments','days'].some(key=>result[key]>=result.batchLimit)};});
 const providers=new Map();let privacyInvalid=false;
 try{const configs=JSON.parse(settings('PRIVACY_REVENUECAT_KEYS_JSON')||'[]');if(!Array.isArray(configs)||configs.length>20)throw Error();for(const config of configs){if(config?.environment!==environment)throw Error();const provider=new RevenueCatPrivacy({...config,fetch:request}),key=provider.projectId+':'+provider.environment;if(providers.has(key))throw Error();providers.set(key,provider);}}
 catch{privacyInvalid=true;providers.clear();tasks.push({kind:'privacy_configuration',outcome:'error'});}
 if(providers.size){
  deferred.push({kind:'privacy_cleanup',identity:internal,work:ports=>runPrivacyBatch({admin,providers,batch:Math.min(50,batch),halt:ports.halt})});
  for(const provider of providers.values()){
   const identity={provider:'revenuecat',projectId:provider.projectId,environment,database};
   deferred.push({kind:'privacy_discovery',identity,work:ports=>discoverPrivacyBatch({...ports,identity,batch:Math.min(5,batch),page:after=>provider.customerPage(after),observe:(id,customers)=>rpc('game_discover_privacy_customers',{p_id:id,p_project:provider.projectId,p_environment:environment,p_customers:customers})})});
  }
 }
 const commerce=webCommerce(settings,request),webInvalid=Boolean(settings('RAZORPAY_CONFIG_JSON'))&&(!commerce||commerce.provider.environment!==environment);
 if(webInvalid)tasks.push({kind:'web_configuration',outcome:'error'});
 else if(commerce){
  const {provider}=commerce,identity={provider:'razorpay',scope:provider.scope,environment,merchantId:provider.merchantId,database};
  deferred.push({kind:'web_disputes',identity,work:ports=>recoverDisputeBatch({...ports,identity,batch,page:skip=>provider.disputePage(skip),reconcile:id=>reconcileWebDispute(commerce,admin,id)})});
 }
 const last=new Map(firstHealth.jobs.map(job=>[job.key,Date.parse(job.finishedAt)||0]));
 deferred.sort((a,b)=>(last.get(operationKey(a.kind,a.identity))??0)-(last.get(operationKey(b.kind,b.identity))??0));
 for(const task of deferred)await run(task.kind,task.identity,task.work);
 const health=await rpc('game_operation_status'),issues=[];
 if(!health||!Array.isArray(health.jobs)||!['adReviews','adRetryExhausted','privacyManualReview','privacyDue','webPurchaseRecords','expiredMetricRows'].every(key=>Number.isSafeInteger(health[key])&&health[key]>=0))throw Error('Operations health is unavailable.');
 const expectedKeys=new Set([operationKey('ad_reconcile',internal),operationKey('metrics_prune',internal),...deferred.map(task=>operationKey(task.kind,task.identity))]);
 if(health.adReviews>0)issues.push('ad_review');if(health.adRetryExhausted>0)issues.push('ad_retry_exhausted');if(health.privacyManualReview>0)issues.push('privacy_manual_review');if(health.jobs.some(job=>expectedKeys.has(job.key)&&job.overdue))issues.push('job_overdue');
 if(health.privacyDue>0&&!providers.size)issues.push('privacy_configuration_missing');if(health.webPurchaseRecords>0&&!commerce)issues.push('web_configuration_missing');if(health.oldestExpiredMetricAt&&Date.parse(health.oldestExpiredMetricAt)<Date.now()-86400000)issues.push('retention_overdue');
 return{environment,tasks,configuration:{privacy:providers.size>0,privacyInvalid,web:Boolean(commerce)&&!webInvalid,webInvalid},health,issues,halted:halt(),failed:tasks.some(task=>task.outcome==='error')||issues.length>0};
}
