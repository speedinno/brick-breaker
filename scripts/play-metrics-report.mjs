import {createClient} from '@supabase/supabase-js';
import {privateSettings} from './private-settings.mjs';
async function main(){
 const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!['--from','--to'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Usage: --from YYYY-MM-DD --to YYYY-MM-DD (at most 90 inclusive UTC dates through today).');options[args[i]]=args[i+1];}
 const valid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 const from=options['--from'],to=options['--to'];if(!valid(from)||!valid(to)||from>to||to>new Date().toISOString().slice(0,10)||Date.parse(to)-Date.parse(from)>89*86400000)throw Error('Choose at most 90 valid inclusive UTC dates through today.');
 const settings=await privateSettings(),url=settings('SUPABASE_URL'),key=settings('SUPABASE_SERVICE_ROLE_KEY')||settings('SUPABASE_SECRET_KEY'),environment=settings('MONETIZATION_ENVIRONMENT');
 if(!url||!key||!['sandbox','production'].includes(environment))throw Error('Play reporting is not configured. Use a matching private database, service key and explicit environment.');
 const admin=createClient(url,key,{global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(30000)])})},auth:{persistSession:false,autoRefreshToken:false}});
 const result=await admin.rpc('game_play_metrics_report',{p_from:from,p_to:to});if(result.error||result.data?.source!=='optional_client_reported_account_activity'||!Array.isArray(result.data.cohorts))throw Error('Play report is unavailable. Check migration and retry; absent activity is not zero.');
 // Environment is an operator configuration label. Activity is database-scoped,
 // so sandbox and production must use separate projects, never a mixed sample.
 console.log(JSON.stringify({configuredEnvironment:environment,...result.data},null,2));
}
try{await main();}catch(error){console.error(error instanceof Error&&/^(Usage:|Choose at most|Play reporting|Play report|The ignored server)/.test(error.message)?error.message:'Play reporting failed. No retention, revenue or experiment conclusion is assumed.');process.exitCode=1;}
