const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
const project=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(value);
export class PrivacyProviderError extends Error {constructor(code){super('Provider privacy operation needs retry or review.');this.code=code;}}
export class RevenueCatPrivacy {
 constructor({projectId,environment,apiKey,fetch:request=fetch,now=()=>Date.now()}){
  if(!project(projectId)||!['production','sandbox'].includes(environment)||typeof apiKey!=='string'||apiKey.length<16||typeof request!=='function'||typeof now!=='function')throw new PrivacyProviderError('config_missing');
  this.projectId=projectId;this.environment=environment;this.apiKey=apiKey;this.request=request;this.now=now;this.projectCheckedUntil=0;
 }
 async requestBody(path,method,allowAbsent=false){
  let response;try{response=await this.request('https://api.revenuecat.com/v2'+path,{method,headers:{Authorization:'Bearer '+this.apiKey,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw new PrivacyProviderError('network');}
  if(response.status===404){if(allowAbsent)return null;throw new PrivacyProviderError('config_missing');}
  if([401,403].includes(response.status))throw new PrivacyProviderError('permission_denied');
  if(response.status===429)throw new PrivacyProviderError('rate_limited');
  if(response.status>=500||[409,423].includes(response.status))throw new PrivacyProviderError('upstream_error');
  if(!response.ok)throw new PrivacyProviderError('invalid_response');
  const reader=response.body?.getReader();if(!reader)throw new PrivacyProviderError('invalid_response');let size=0,chunks=[];
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw new PrivacyProviderError('invalid_response');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new PrivacyProviderError('invalid_response');}
  return body;
 }
 async verifyProject(){
  if(this.projectCheckedUntil>this.now())return;
  // A customer 404 must not turn a mistyped/inaccessible project into proof of
  // erasure. Prove this key can see the configured project independently.
  let cursor='',seen=new Set();
  for(let page=0;page<100;page++){
   const body=await this.requestBody('/projects?limit=100'+(cursor?'&starting_after='+encodeURIComponent(cursor):''),'GET');
   if(body?.object!=='list'||!Array.isArray(body.items)||body.items.length>100)throw new PrivacyProviderError('invalid_response');
   for(const item of body.items){if(item?.object!=='project'||!project(item.id)||seen.has(item.id))throw new PrivacyProviderError('invalid_response');seen.add(item.id);}
   if(body.items.some(item=>item.id===this.projectId)){this.projectCheckedUntil=this.now()+60000;return;}
   if(body.next_page===null)throw new PrivacyProviderError('config_missing');
   cursor=body.items.at(-1)?.id;if(!cursor||typeof body.next_page!=='string')throw new PrivacyProviderError('invalid_response');
   let next;try{next=new URL(body.next_page,'https://api.revenuecat.com');}catch{throw new PrivacyProviderError('invalid_response');}
   if(next.origin!=='https://api.revenuecat.com'||next.pathname!=='/v2/projects'||next.searchParams.get('starting_after')!==cursor||[...next.searchParams.keys()].some(key=>!['starting_after','limit'].includes(key))||[...next.searchParams.keys()].length!==new Set(next.searchParams.keys()).size||next.hash||next.username||next.password)throw new PrivacyProviderError('invalid_response');
  }
  throw new PrivacyProviderError('invalid_response');
 }
 async call(subject,method){
  if(!uuid(subject))throw new PrivacyProviderError('invalid_response');
  const body=await this.requestBody('/projects/'+this.projectId+'/customers/'+subject,method,true);
  if(body===null)return{absent:true};
  if(body?.object!=='customer'||body.id!==subject||method==='GET'&&body.project_id!==this.projectId||method==='DELETE'&&(!Number.isSafeInteger(body.deleted_at)||body.deleted_at<946684800000||body.deleted_at>this.now()+300000))throw new PrivacyProviderError('invalid_response');
  return{absent:false};
 }
 async customerPage(after=null){
  const cursor=value=>typeof value==='string'&&value.length>0&&value.length<=1500&&value.isWellFormed()&&!/[\u0000-\u001f\u007f]/.test(value);
  if(after!==null&&!cursor(after))throw new PrivacyProviderError('invalid_response');await this.verifyProject();
  const path='/v2/projects/'+this.projectId+'/customers',body=await this.requestBody('/projects/'+this.projectId+'/customers?limit=20'+(after===null?'':'&starting_after='+encodeURIComponent(after)),'GET');
  if(body?.object!=='list'||!Array.isArray(body.items)||body.items.length>20||body.items.some(item=>item?.object!=='customer'||item.project_id!==this.projectId||!cursor(item.id))||new Set(body.items.map(item=>item.id)).size!==body.items.length)throw new PrivacyProviderError('invalid_response');
  let next=null;
  if(body.next_page!==null){
   let target;try{target=new URL(body.next_page,'https://api.revenuecat.com');}catch{throw new PrivacyProviderError('invalid_response');}
   next=target.searchParams.get('starting_after');
   if(typeof body.next_page!=='string'||target.origin!=='https://api.revenuecat.com'||target.pathname!==path||target.username||target.password||target.hash||!cursor(next)||next!==body.items.at(-1)?.id||next===after||[...target.searchParams.keys()].some(key=>!['starting_after','limit'].includes(key))||[...target.searchParams.keys()].length!==new Set(target.searchParams.keys()).size)throw new PrivacyProviderError('invalid_response');
  }
  // Game Auth IDs are canonical lowercase UUIDs. Other applications' custom
  // IDs/anonymous SDK IDs can be paged past, but are never cleanup subjects.
  return{customers:body.items.map(item=>item.id).filter(id=>uuid(id)&&id===id.toLowerCase()),next,count:body.items.length};
 }
 async erase(job){
  if(job.provider!=='revenuecat'||job.scope!==this.projectId||job.environment!==this.environment)throw new PrivacyProviderError('config_missing');
  await this.verifyProject();
  if((await this.call(job.subject,'GET')).absent)return'absent';
  // A 200 deletion is queued asynchronously, not evidence of completed erasure.
  return(await this.call(job.subject,'DELETE')).absent?'absent':'queued';
 }
}

export async function runPrivacyBatch({admin,providers,batch=10,halt=()=>false}){
 if(!Number.isSafeInteger(batch)||batch<1||batch>50)throw Error('Invalid privacy batch');
 const rpc=async(name,args)=>{const result=await admin.rpc(name,args);if(result.error)throw Error('Privacy recovery is temporarily unavailable. The durable job is retained.');return result.data;};
 const summary={claimed:0,acknowledged:0,stale:0,queued:0,absent:0,review:0,retry:0};
 while(summary.claimed<batch&&!halt()){
  // Claim just in time, rather than letting the last job's lease expire while
  // a whole prefetched batch waits behind slow provider requests.
  const jobs=await rpc('game_claim_privacy_jobs',{p_limit:1});if(!Array.isArray(jobs)||jobs.length>1)throw Error('Invalid privacy job response');if(!jobs.length)break;
  const job=jobs[0];summary.claimed++;let result;
  try{const provider=providers.get(job.scope+':'+job.environment);if(!provider)throw new PrivacyProviderError('config_missing');result=await provider.erase(job);}
  catch(error){result=error instanceof PrivacyProviderError?error.code:'upstream_error';}
  const applied=await rpc('game_finish_privacy_job',{p_id:job.id,p_generation:job.generation,p_lease:job.leaseToken,p_result:result});
  if(!applied){summary.stale++;continue;}summary.acknowledged++;
  if(result==='queued')summary.queued++;else if(result==='absent')summary.absent++;else if(['config_missing','permission_denied','invalid_response'].includes(result))summary.review++;else summary.retry++;
 }
 return summary;
}
