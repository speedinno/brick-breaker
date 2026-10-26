import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {AdMobVerifier} from '../_shared/admob-ssv.js';
import {admobCallback} from '../_shared/admob-handler.js';
// Dedicated edge ingress avoids the Azure API's scale-to-zero startup path.
// Keeping this module small does not guarantee an unmeasured delivery SLA.
const limited=(ms:number):typeof fetch=>(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(ms)])});
const admin=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{global:{fetch:limited(3500)},auth:{persistSession:false,autoRefreshToken:false}});
const callback=admobCallback({admin,verifier:new AdMobVerifier({fetch:limited(2000)})});
Deno.serve(request=>{
 const path=new URL(request.url).pathname;
 if(request.method==='GET'&&path.endsWith('/healthz'))return Response.json({status:'ok'},{headers:{'Cache-Control':'no-store'}});
 if(!path.endsWith('/reward-callback'))return Response.json({error:'Unknown callback path'},{status:404,headers:{'Cache-Control':'no-store'}});
 return callback(request);
});
