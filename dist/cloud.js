import {createClient} from './vendor/supabase.js';
import config from './cloud-config.js';
const allowedUrl=url=>{try{const parsed=new URL(url);return parsed.protocol==='https:'&&parsed.pathname==='/'&&!parsed.username&&!parsed.password;}catch{return false;}};
async function boundedFetch(input,init={},timeoutMs=12000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs),signal=init.signal;const abort=()=>controller.abort();if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',abort,{once:true});try{return await fetch(input,{...init,signal:controller.signal});}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}}
export class CloudAccount {
  constructor(onChange=()=>{},{settings=config,clientFactory=createClient,storage,onStatus=()=>{}}={}){
    this.apiUrl=settings.apiUrl||'';
    this.deletionStatusUrl=(this.apiUrl||settings.supabaseUrl+'functions/v1/game-api').replace(/\/$/,'')+'/privacy/deletion-status';this.publishableKey=settings.publishableKey;
    if(this.apiUrl){let parsed;try{parsed=new URL(this.apiUrl);}catch{throw Error('Invalid API URL');}if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('Invalid API URL');}
    this.configured=allowedUrl(settings.supabaseUrl)&&typeof settings.publishableKey==='string'&&settings.publishableKey.length>20;
    // Use the same adapter as game saves: Android startup reconciles WebView
    // storage with native storage, including this authentication namespace.
    this.client=this.configured?clientFactory(settings.supabaseUrl,settings.publishableKey,{global:{fetch:boundedFetch},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'brick-breaker-auth-v3',...(storage?{storage}:{})}}):null;
    this.session=null;this.onChange=onChange;this.onStatus=onStatus;this.state=null;this.syncError=null;this.unsubscribe=null;this.changeTask=null;
  }
  get signedIn(){return Boolean(this.session?.user);}
  get userId(){return this.session?.user.id||null;}
  get email(){return this.session?.user.email||'';}
  async init(){
    if(!this.client)return;
    const {data,error}=await this.client.auth.getSession();if(error)throw error;this.session=data.session;
    this.unsubscribe=this.client.auth.onAuthStateChange((_event,session)=>{const prior=this.userId;this.session=session;if(prior!==this.userId){this.state=null;this.syncError=null;queueMicrotask(()=>this.notifyChange().catch(()=>{}));}}).data.subscription;
    if(this.session)await this.notifyChange();
  }
  // The SDK event and verifyOtp can report the same sign-in concurrently.
  // Both callers must await the same account load before announcing success.
  notifyChange(){const id=this.userId;if(this.changeTask?.id===id)return this.changeTask.promise;const promise=Promise.resolve().then(()=>this.onChange(this));this.changeTask={id,promise};return promise;}
  require(){if(!this.client)throw Error('Cloud saving is not available yet. Your progress stays on this device.');}
  async sendCode(email,captchaToken){this.require();const {error}=await this.client.auth.signInWithOtp({email,options:{shouldCreateUser:true,...(captchaToken?{captchaToken}:{})}});if(error)throw error;}
  async verifyCode(email,token){this.require();const {data,error}=await this.client.auth.verifyOtp({email,token,type:'email'});if(error)throw error;this.session=data.session;await this.notifyChange();}
  async passwordLogin(email,password){this.require();const {data,error}=await this.client.auth.signInWithPassword({email,password});if(error)throw error;this.session=data.session;await this.notifyChange();}
  async signOut(){this.require();const {error}=await this.client.auth.signOut({scope:'local'});if(error)throw error;this.session=null;this.state=null;this.syncError=null;await this.notifyChange();}
  async invoke(body){
    if(!this.apiUrl)return this.client.functions.invoke('game-api',{body});
    // getSession refreshes expired tokens through Supabase before calling the
    // independently hosted API. Never send an old account's pending request.
    const {data,error}=await this.client.auth.getSession();
    if(error||!data.session)return {error:{context:{status:401,json:async()=>({error:'Your session expired. Sign in again.'})}}};
    if(data.session.user.id!==body.accountId||this.userId!==body.accountId)return {error:{context:{status:409,json:async()=>({error:'Your account changed. Reopen Account and try again.'})}}};
    try{
      // Azure scales to zero. A measured cold start exceeds the auth client's
      // 12-second deadline; give the API 45 seconds without retrying mutations.
      const response=await boundedFetch(this.apiUrl,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(body)},45000);
      return response.ok?{data:await response.json()}:{error:{context:response}};
    }catch{return {error:{}};}
  }
  async api(action,body={}){
    this.require();if(!this.signedIn)throw Error('Sign in to use cloud saves.');
    const owner=this.userId;
    let result;try{result=await this.invoke({...body,action,accountId:owner});}catch{result={error:{}};}const {data,error}=result;
    if(this.userId!==owner){const failure=Error('Your account changed. Reopen Account and try again.');failure.status=409;failure.network=false;throw failure;}
    const timeAction=action.startsWith('time-'),purchaseAction=action.startsWith('purchase-'),adAction=action.startsWith('ad-'),isolatedAction=timeAction||purchaseAction||adAction||action.startsWith('metrics-')||action==='delete'||action==='delete-prepare';
    if(error){let message=adAction?'Could not reach rewarded ads. Manual play remains available.':purchaseAction?'Could not reach purchases. Your receipt can be recovered later.':timeAction?'Could not reach your time bank. Manual play is available.':'Could not reach cloud saves. Your device progress is safe. Tap Sync now to retry.';const status=error.context?.status;try{const payload=await error.context?.json();if(payload?.error)message=payload.error;}catch{}const failure=Error(message);failure.status=status;failure.network=!status||status>=500;if(!isolatedAction&&this.userId===owner){this.syncError=failure;this.onStatus();}throw failure;}
    if(data?.error){const failure=Error(data.error);if(!isolatedAction){this.syncError=failure;this.onStatus();}throw failure;}
    if(['state','import','complete'].includes(action)){this.state=data;this.syncError=null;this.onStatus();}return data;
  }
  async progress(){return this.api('state');}
  async time(action,body={}){return this.api('time-'+action,body);}
  async metrics(action,body={}){return this.api('metrics-'+action,body);}
  async level(level){const row=await this.api('level',{level});return {...row.definition,published:true,hash:row.layout_hash};}
  async start(level,requestId){return this.api('start',{level,requestId});}
  async complete(run){return this.api('complete',run);}
  async importGuest(progress){return this.api('import',{starters:progress.starters,journeyNext:progress.journeyNext,records:Object.values(progress.records).slice(-128),mastery:progress.mastery||{manual:[],clean:[]}});}
  async history(before=null){return this.api('history',{before});}
  async exportData(before=null){return this.api('export',{before});}
  async deletionStatus(requestId){
    this.require();
    if(typeof requestId!=='string'||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(requestId))throw Error('Invalid account deletion receipt');
    let response;try{response=await boundedFetch(this.deletionStatusUrl,{method:'POST',headers:{'Content-Type':'application/json',apikey:this.publishableKey},body:JSON.stringify({requestId})},45000);}catch{throw Error('Could not confirm account deletion. Keep this app installed and retry.');}
    if(!response.ok)throw Error('Could not confirm account deletion. Keep this app installed and retry.');const result=await response.json();if(typeof result?.deleted!=='boolean')throw Error('Invalid account deletion status');return{deleted:result.deleted};
  }
  async deleteAccount(requestId,{onDeleted=()=>{}}={}){
    const owner=this.userId;let result;
    try{result=await this.api('delete',{...(requestId?{requestId}:{})});if(result?.deleted!==true)throw Error('Account deletion needs confirmation.');}
    catch(error){if(!requestId||(await this.deletionStatus(requestId)).deleted!==true)throw error;result={deleted:true,requestId,providerCleanup:'queued'};}
    let cleanupError;try{await onDeleted(result);}catch(error){cleanupError=error;}
    if(this.userId===owner){try{await this.client.auth.signOut({scope:'local'});}catch{}finally{this.session=null;this.state=null;this.syncError=null;await this.notifyChange();}}
    if(cleanupError)throw cleanupError;return result;
  }
}
