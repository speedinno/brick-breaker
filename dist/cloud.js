import {createClient} from './vendor/supabase.js';
import config from './cloud-config.js';
const allowedUrl=url=>{try{const parsed=new URL(url);return parsed.protocol==='https:'&&parsed.pathname==='/'&&!parsed.username&&!parsed.password;}catch{return false;}};
async function boundedFetch(input,init={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000),signal=init.signal;const abort=()=>controller.abort();if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',abort,{once:true});try{return await fetch(input,{...init,signal:controller.signal});}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}}
export class CloudAccount {
  constructor(onChange=()=>{},{settings=config,clientFactory=createClient,storage}={}){
    this.apiUrl=settings.apiUrl||'';
    if(this.apiUrl){let parsed;try{parsed=new URL(this.apiUrl);}catch{throw Error('Invalid API URL');}if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('Invalid API URL');}
    this.configured=allowedUrl(settings.supabaseUrl)&&typeof settings.publishableKey==='string'&&settings.publishableKey.length>20;
    // Use the same adapter as game saves: Android startup reconciles WebView
    // storage with native storage, including this authentication namespace.
    this.client=this.configured?clientFactory(settings.supabaseUrl,settings.publishableKey,{global:{fetch:boundedFetch},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'brick-breaker-auth-v3',...(storage?{storage}:{})}}):null;
    this.session=null;this.onChange=onChange;this.state=null;this.unsubscribe=null;
  }
  get signedIn(){return Boolean(this.session?.user);}
  get userId(){return this.session?.user.id||null;}
  get email(){return this.session?.user.email||'';}
  async init(){
    if(!this.client)return;
    const {data,error}=await this.client.auth.getSession();if(error)throw error;this.session=data.session;
    this.unsubscribe=this.client.auth.onAuthStateChange((_event,session)=>{const prior=this.userId;this.session=session;if(prior!==this.userId){this.state=null;queueMicrotask(()=>Promise.resolve(this.onChange(this)).catch(()=>{}));}}).data.subscription;
    if(this.session)await this.onChange(this);
  }
  require(){if(!this.client)throw Error('Cloud saving is not available yet. Your progress stays on this device.');}
  async sendCode(email,captchaToken){this.require();const {error}=await this.client.auth.signInWithOtp({email,options:{shouldCreateUser:true,...(captchaToken?{captchaToken}:{})}});if(error)throw error;}
  async verifyCode(email,token){this.require();const {data,error}=await this.client.auth.verifyOtp({email,token,type:'email'});if(error)throw error;this.session=data.session;await this.onChange(this);}
  async passwordLogin(email,password){this.require();const {data,error}=await this.client.auth.signInWithPassword({email,password});if(error)throw error;this.session=data.session;await this.onChange(this);}
  async signOut(){this.require();const {error}=await this.client.auth.signOut({scope:'local'});if(error)throw error;this.session=null;this.state=null;await this.onChange(this);}
  async invoke(body){
    if(!this.apiUrl)return this.client.functions.invoke('game-api',{body});
    // getSession refreshes expired tokens through Supabase before calling the
    // independently hosted API. Never send an old account's pending request.
    const {data,error}=await this.client.auth.getSession();
    if(error||!data.session)return {error:{context:{status:401,json:async()=>({error:'Your session expired. Sign in again.'})}}};
    if(data.session.user.id!==body.accountId||this.userId!==body.accountId)return {error:{context:{status:409,json:async()=>({error:'Your account changed. Reopen Account and try again.'})}}};
    try{
      const response=await boundedFetch(this.apiUrl,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(body)});
      return response.ok?{data:await response.json()}:{error:{context:response}};
    }catch{return {error:{}};}
  }
  async api(action,body={}){
    this.require();if(!this.signedIn)throw Error('Sign in to use cloud saves.');
    const owner=this.userId;
    const {data,error}=await this.invoke({...body,action,accountId:owner});
    if(this.userId!==owner){const failure=Error('Your account changed. Reopen Account and try again.');failure.status=409;failure.network=false;throw failure;}
    if(error){let message='Cloud saving is unavailable. Your device progress is safe.';const status=error.context?.status;try{const payload=await error.context?.json();if(payload?.error)message=payload.error;}catch{}const failure=Error(message);failure.status=status;failure.network=!status||status>=500;throw failure;}
    if(data?.error)throw Error(data.error);return data;
  }
  async progress(){const state=await this.api('state');this.state=state;return state;}
  async level(level){const row=await this.api('level',{level});return {...row.definition,published:true,hash:row.layout_hash};}
  async start(level,requestId){return this.api('start',{level,requestId});}
  async complete(run){return this.api('complete',run);}
  async importGuest(progress){return this.api('import',{starters:progress.starters,journeyNext:progress.journeyNext,records:Object.values(progress.records).slice(-128)});}
  async history(before=null){return this.api('history',{before});}
  async exportData(before=null){return this.api('export',{before});}
  async deleteAccount(){await this.api('delete');try{await this.client.auth.signOut({scope:'local'});}finally{this.session=null;this.state=null;await this.onChange(this);}}
}
