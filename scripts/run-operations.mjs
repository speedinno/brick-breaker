import {createClient} from '@supabase/supabase-js';import {privateSettings} from './private-settings.mjs';import {runOperations} from './operations.mjs';
async function main(){
 const args=process.argv.slice(2);let batch=20;if(args.length){if(args.length!==2||args[0]!=='--batch'||!/^\d{1,3}$/.test(args[1])||Number(args[1])<1||Number(args[1])>100)throw Error('Usage: --batch 1..100.');batch=Number(args[1]);}
 const settings=process.env.OPERATIONS_ENV_ONLY==='true'?name=>process.env[name]:await privateSettings(),url=settings('SUPABASE_URL'),key=settings('SUPABASE_SERVICE_ROLE_KEY')||settings('SUPABASE_SECRET_KEY');if(!url||!key||!['production','sandbox'].includes(settings('MONETIZATION_ENVIRONMENT')))throw Error('Operations are not configured. Supply a matching private database, service key and explicit environment.');
 const admin=createClient(url,key,{global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(10000)])})},auth:{persistSession:false,autoRefreshToken:false}});
 let stopped=false;const deadline=Date.now()+150000,stop=()=>stopped=true,halt=()=>stopped||Date.now()>=deadline;process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{const result=await runOperations({admin,settings,batch,halt});console.log(JSON.stringify(result));if(stopped)process.exitCode=130;else if(result.failed)process.exitCode=2;}
 finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
try{await main();}catch(error){console.error(error instanceof Error&&/^(Usage:|Operations |The ignored server)/.test(error.message)?error.message:'Operations failed. Durable recovery state is retained; no completed recovery is assumed.');process.exitCode=1;}
