import {readFile} from 'node:fs/promises';import {createClient} from '@supabase/supabase-js';
async function main(){
 const options={},args=process.argv.slice(2);for(let i=0;i<args.length;i+=2){if(!['--from','--to'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Usage: --from YYYY-MM-DD --to YYYY-MM-DD (inclusive UTC, maximum 367 dates).');options[args[i]]=args[i+1];}
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 if(!date(options['--from'])||!date(options['--to'])||Date.parse(options['--to'])<Date.parse(options['--from'])||Date.parse(options['--to'])-Date.parse(options['--from'])>366*86400000)throw Error('Choose valid inclusive UTC dates spanning at most 367 dates.');
 const file={};try{for(const line of(await readFile('.env.api','utf8')).split(/\r?\n/)){const match=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(match){let value=match[2];if(value.length>=2&&['"',"'"].includes(value[0])&&value.at(-1)===value[0])value=value.slice(1,-1);file[match[1]]=value;}}}catch(error){if(error.code!=='ENOENT')throw Error('The ignored financial report configuration could not be read.');}
 const env=key=>process.env[key]??file[key],database=env('SUPABASE_URL'),secret=env('SUPABASE_SERVICE_ROLE_KEY'),environment=env('MONETIZATION_ENVIRONMENT');
 if(!database||!secret||!['production','sandbox'].includes(environment))throw Error('Financial reporting is not configured. Set the matching server database, secret and explicit monetization environment.');
 const admin=createClient(database,secret,{global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(30000)])})},auth:{persistSession:false,autoRefreshToken:false}});
 const result=await admin.rpc('game_commercial_financial_report',{p_from:options['--from'],p_to:options['--to'],p_environment:environment});
 if(result.error||!Array.isArray(result.data?.purchaseGroups)||result.data.environment!==environment)throw Error('Financial report is unavailable. Check deployment and retry; missing proceeds are not zero.');
 console.log(JSON.stringify({generatedAt:new Date().toISOString(),...result.data},null,2));
}
try{await main();}catch(error){console.error(error instanceof Error&&/^(Financial report|Financial reporting|Usage:|Choose valid|The ignored financial)/.test(error.message)?error.message:'Financial reporting failed. No completed settlement or profit calculation is assumed.');process.exitCode=1;}
