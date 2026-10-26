import {readFile} from 'node:fs/promises';import {createClient} from '@supabase/supabase-js';
import {RevenueCatPrivacy,runPrivacyBatch} from '../supabase/functions/_shared/privacy.js';
async function main(){
 const options={batch:10,inspect:null,retry:null,resolve:null,outcome:null,reference:null};const args=process.argv.slice(2);
 for(let i=0;i<args.length;i++){const key=args[i],value=args[++i];if(!value||!['--batch','--inspect','--retry','--resolve-manual','--outcome','--reference'].includes(key))throw Error('Usage: --batch 1..50, --inspect JOB, --retry JOB, or --resolve-manual JOB --outcome erased|retained --reference TICKET.');if(key==='--batch')options.batch=Number(value);else options[{'--inspect':'inspect','--retry':'retry','--resolve-manual':'resolve','--outcome':'outcome','--reference':'reference'}[key]]=value;}
 const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
 if(!Number.isSafeInteger(options.batch)||options.batch<1||options.batch>50||[options.inspect,options.retry,options.resolve].filter(Boolean).length>1||[options.inspect,options.retry,options.resolve].filter(Boolean).some(id=>!uuid(id))||!options.resolve&&(options.outcome||options.reference)||options.resolve&&(!['erased','retained'].includes(options.outcome)||!/^[A-Za-z0-9._:/# -]{3,160}$/.test(options.reference??'')))throw Error('Choose one privacy recovery operation and its required arguments.');
 const file={};try{for(const line of(await readFile('.env.api','utf8')).split(/\r?\n/)){const match=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(match){let value=match[2];if(value.length>=2&&['"',"'"].includes(value[0])&&value.at(-1)===value[0])value=value.slice(1,-1);file[match[1]]=value;}}}catch(error){if(error.code!=='ENOENT')throw Error('The ignored configuration file could not be read.');}
 const env=key=>process.env[key]??file[key],database=env('SUPABASE_URL'),secret=env('SUPABASE_SERVICE_ROLE_KEY'),environment=env('MONETIZATION_ENVIRONMENT');
 if(!database||!secret||!['production','sandbox'].includes(environment))throw Error('Privacy recovery is not configured. Set server-side Supabase settings and an explicit monetization environment in ignored configuration.');
 const admin=createClient(database,secret,{global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(10000)])})},auth:{persistSession:false,autoRefreshToken:false}});
 const rpc=async(name,args)=>{const result=await admin.rpc(name,args);if(result.error)throw Error('Privacy recovery database operation failed. The durable job is retained.');return result.data;};
 if(options.inspect){const result=await admin.from('game_privacy_jobs').select('id,processor_id,state,generation,attempts,next_attempt_at,last_code,outcome,resolution_reference,created_at,finished_at').eq('id',options.inspect).maybeSingle();if(result.error)throw Error('Privacy recovery database operation failed.');console.log(JSON.stringify({job:result.data},null,2));return;}
 if(options.retry){console.log(JSON.stringify({retried:await rpc('game_retry_privacy_job',{p_id:options.retry})}));return;}
 if(options.resolve){console.log(JSON.stringify({resolved:await rpc('game_resolve_manual_privacy',{p_id:options.resolve,p_outcome:'manual_'+options.outcome,p_reference:options.reference})}));return;}
 const providers=new Map();let configs;
 try{configs=JSON.parse(env('PRIVACY_REVENUECAT_KEYS_JSON')||'[]');if(!Array.isArray(configs)||configs.length>20)throw Error();}catch{throw Error('Privacy recovery provider keyring is invalid.');}
 // The explicit keyring keeps retired projects recoverable after the active
 // purchase catalog changes. Do not silently replace old processor identities.
 for(const config of configs){if(config?.environment!==environment)throw Error('Privacy recovery provider environment differs from this database deployment.');const provider=new RevenueCatPrivacy({projectId:config.projectId,environment:config.environment,apiKey:config.apiKey}),key=provider.projectId+':'+provider.environment;if(providers.has(key))throw Error('Privacy recovery provider keyring contains duplicate identities.');providers.set(key,provider);}
 if(!providers.size)throw Error('Privacy recovery has no provider keys. Configure the private RevenueCat privacy keyring first.');
 let interrupted=false;const interrupt=()=>{interrupted=true;};process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
 try{console.log(JSON.stringify({...await runPrivacyBatch({admin,providers,batch:options.batch,halt:()=>interrupted}),interrupted}));if(interrupted)process.exitCode=130;}
 finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);}
}
try{await main();}catch(error){console.error(error instanceof Error&&/^(Privacy recovery|Usage:|Choose one privacy|The ignored configuration)/.test(error.message)?error.message:'Privacy recovery failed. Check configuration and retry; no completed provider erasure is assumed.');process.exitCode=1;}
