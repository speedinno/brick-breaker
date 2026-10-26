import {readFile,writeFile,rename,mkdir,open,unlink} from 'node:fs/promises';import {resolve} from 'node:path';
import {createClient} from '@supabase/supabase-js';import {webCommerce,reconcileWebDispute,inspectWebDispute} from '../supabase/functions/_shared/web-commerce.js';import {recoverDisputeBatch} from './dispute-recovery.mjs';
async function main(){
 const args=process.argv.slice(2),options={batch:20,restart:false,inspect:null,resolve:null,expected:null};
 for(let index=0;index<args.length;index++){
  const key=args[index];if(key==='--restart-scan')options.restart=true;
  else if(['--batch','--inspect','--resolve-terminal','--expected-sha256'].includes(key)&&args[index+1]){const value=args[++index];if(key==='--batch')options.batch=Number(value);if(key==='--inspect')options.inspect=value;if(key==='--resolve-terminal')options.resolve=value;if(key==='--expected-sha256')options.expected=value;}
  else throw Error('Usage: --batch 1..200 [--restart-scan], --inspect disp_ID, or --resolve-terminal disp_ID --expected-sha256 SHA256.');
 }
 if(options.inspect&&options.resolve||options.expected&&!options.resolve||options.resolve&&!/^[a-f\d]{64}$/.test(options.expected??'')||!Number.isSafeInteger(options.batch)||options.batch<1||options.batch>200)throw Error('Choose one recovery operation and its required arguments.');
 const file={};try{for(const line of(await readFile('.env.api','utf8')).split(/\r?\n/)){const match=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(match){let value=match[2];if(value.length>=2&&['"',"'"].includes(value[0])&&value.at(-1)===value[0])value=value.slice(1,-1);file[match[1]]=value;}}}catch(error){if(error.code!=='ENOENT')throw Error('The ignored configuration file could not be read.');}
 const env=key=>process.env[key]??file[key],commerce=webCommerce(env),database=env('SUPABASE_URL'),secret=env('SUPABASE_SERVICE_ROLE_KEY')||env('SUPABASE_SECRET_KEY');
 if(!commerce||!database||!secret||commerce.provider.environment!==env('MONETIZATION_ENVIRONMENT'))throw Error('Dispute recovery is not configured. Set matching Razorpay, monetization environment and server-side Supabase settings in the ignored configuration.');
 const admin=createClient(database,secret,{global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(10000)])})},auth:{persistSession:false,autoRefreshToken:false}});
 if(options.inspect){console.log(JSON.stringify(await inspectWebDispute(commerce,admin,options.inspect),null,2));return;}
 if(options.resolve){console.log(JSON.stringify(await reconcileWebDispute(commerce,admin,options.resolve,{allowCorrection:true,expectedFingerprint:options.expected})));return;}
 const directory=resolve('.openai/local'),path=resolve(directory,'web-dispute-recovery.json'),lock=path+'.lock';await mkdir(directory,{recursive:true});
 let handle;try{handle=await open(lock,'wx',0o600);}catch{throw Error('Another recovery command or an interrupted lock exists. Verify its process before removing the local lock.');}
 let interrupted=false;const interrupt=()=>{interrupted=true;};process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
 try{
  await handle.writeFile(JSON.stringify({pid:process.pid,started:new Date().toISOString()}));
  const {provider}=commerce,identity={provider:'razorpay',scope:provider.scope,environment:provider.environment,merchantId:provider.merchantId,database};
  const result=await recoverDisputeBatch({identity,batch:options.batch,restart:options.restart,halt:()=>interrupted,
   read:async()=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw Error('Recovery journal could not be read. Preserve it for review.');}},
   write:async value=>{const temporary=path+'.'+process.pid+'.tmp';await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(temporary,path);},
   page:skip=>provider.disputePage(skip),reconcile:id=>reconcileWebDispute(commerce,admin,id)});
  console.log(JSON.stringify({...result,interrupted}));if(interrupted)process.exitCode=130;
 }finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);await handle.close();await unlink(lock);}
}
try{await main();}catch(error){console.error(error instanceof Error&&/^(Dispute recovery is not configured|Usage:|Choose one|Another recovery|The recovery journal|Finish the current|The provider|Recovery journal|The reviewed financial facts|Dispute verification|Checkout verification|Could not reconcile|Web checkout)/.test(error.message)?error.message:'Dispute recovery failed. Check configuration and retry; no successful grant or correction is assumed.');process.exitCode=1;}
