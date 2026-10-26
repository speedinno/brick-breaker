import {createClient} from '@supabase/supabase-js';import {privateSettings} from './private-settings.mjs';
async function main(){
 const args=process.argv.slice(2);let batch=1000;if(args.length){if(args.length!==2||args[0]!=='--batch'||!/^[0-9]{1,4}$/.test(args[1]))throw Error('Usage: --batch 1..5000.');batch=Number(args[1]);}if(batch<1||batch>5000)throw Error('Usage: --batch 1..5000.');
 const env=await privateSettings(),url=env('SUPABASE_URL'),secret=env('SUPABASE_SERVICE_ROLE_KEY')||env('SUPABASE_SECRET_KEY');if(!url||!secret||!['production','sandbox'].includes(env('MONETIZATION_ENVIRONMENT')))throw Error('Analytics retention is not configured. Set the matching server database, secret and explicit monetization environment.');
 const admin=createClient(url,secret,{global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(30000)])})},auth:{persistSession:false,autoRefreshToken:false}}),result=await admin.rpc('game_prune_play_metrics',{p_limit:batch});
 if(result.error||result.data?.batchLimit!==batch)throw Error('Analytics retention failed. Retry and investigate before enabling collection.');console.log(JSON.stringify({environment:env('MONETIZATION_ENVIRONMENT'),...result.data}));
}
try{await main();}catch(error){console.error(error instanceof Error&&/^(Analytics retention|Usage:|The ignored server)/.test(error.message)?error.message:'Analytics retention failed. No completed retention cleanup is assumed.');process.exitCode=1;}
