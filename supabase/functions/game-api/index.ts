import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createDefinition,validateCatalogDefinition,canonicalLayout,definitionHash,structuralDistance} from '../_shared/catalog.js';
import {readLimitedJson,RequestError} from '../_shared/request.js';
const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const serverFetch:typeof fetch=(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(10000)])});
const admin=createClient(url,service,{global:{fetch:serverFetch},auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set((Deno.env.get('ALLOWED_ORIGINS')||'https://speedinno.github.io,https://localhost,capacitor://localhost').split(',').map(s=>s.trim()));
const safeLevel=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<Number.MAX_SAFE_INTEGER;
const safeUuid=(n:unknown):n is string=>typeof n==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(n);
const businessErrors=new Set(['Authentication required','Stage is locked','Run ID already used','Too many attempts. Try again later.','Stage is not ready','This offline attempt expired. Replay the stage to save it online.','Stage version differs. Reconnect and replay this stage.','Attempt is too short','Invalid completion statistics','Invalid stage score','Invalid guest progress','Complete all starter stages first','Invalid history','Too many new stages. Try again later.']);
for(const message of ['Invalid time reservation','Reservation identity conflict','Recover or finish the existing activation first','Active run required','Not enough autoplay time','Unknown time reservation','Wait for the previous activation lease to end','Wrong activation device','Invalid consumed time','Activation lease expired','Reconcile autoplay before completing this run','Invalid mastery import'])businessErrors.add(message);
async function ensureLevel(level:number,authorize:()=>Promise<unknown>){
  const existing=await admin.from('game_catalog').select('definition,layout_hash').eq('version',3).eq('level',level).maybeSingle();
  if(existing.error)throw Error('Catalog is unavailable');if(existing.data)return existing.data;
  await authorize();
  const recent=await admin.from('game_catalog').select('canonical_layout').eq('version',3).order('level',{ascending:false}).limit(48);
  for(let nonce=0;nonce<32;nonce++){
    const definition=createDefinition(level,nonce);validateCatalogDefinition(definition);
    const canonical=canonicalLayout(definition.layout),hash=await definitionHash(definition);
    if(level>12&&recent.data?.some(row=>structuralDistance(canonical,row.canonical_layout)<.085))continue;
    const result=await admin.rpc('game_publish_level',{p_level:level,p_definition:definition,p_canonical:canonical,p_hash:hash});
    if(!result.error)return result.data;
    if(result.error.code!=='23505')throw Error('Could not publish this stage');
    // Another request might have won this level while we were generating it.
    const winner=await admin.from('game_catalog').select('definition,layout_hash').eq('version',3).eq('level',level).maybeSingle();if(winner.data)return winner.data;
  }
  throw Error('A new stage is being prepared. Please try again.');
}
const fields='level,best_score,best_seconds,peak_balls,play_mode,clears,source,first_completed_at,last_completed_at';
Deno.serve({port:Number(Deno.env.get('PORT')||8000)},async request=>{
  if(request.method==='GET'&&new URL(request.url).pathname==='/healthz')return Response.json({status:'ok'},{headers:{'Cache-Control':'no-store'}});
  const origin=request.headers.get('Origin');
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(origin&&origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(origin&&!origins.has(origin))return reply({error:'Origin is not allowed'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Max-Age':'600'}});
  if(request.method!=='POST')return reply({error:'POST required'},405);
  try{
    const bearer=request.headers.get('Authorization')||'';
    if(!/^Bearer \S+$/i.test(bearer))return reply({error:'Sign in to use cloud saves'},401);
    const auth=await admin.auth.getUser(bearer.slice(7));
    if(auth.error||!auth.data.user)return reply({error:'Your session expired. Sign in again.'},401);
    const user=auth.data.user,client=createClient(url,anon,{global:{headers:{Authorization:bearer},fetch:serverFetch},auth:{persistSession:false,autoRefreshToken:false}});
    const body=await readLimitedJson(request);
    if(body.accountId!==user.id)return reply({error:'Your account changed. Please reopen Account and try again.'},409);
    const rpc=async(name:string,args:Record<string,unknown>={})=>{const result=await client.rpc(name,args);if(result.error)throw Error(result.error.message);return result.data;};
    if(typeof body.action==='string'&&body.action.startsWith('time-')){
      if(body.action==='time-state')return reply(await rpc('game_time_state'));
      if(!safeUuid(body.reservationId))return reply({error:'Invalid time reservation'},400);
      if(body.action==='time-recover')return reply(await rpc('game_recover_time',{p_id:body.reservationId}));
      if(!safeUuid(body.deviceId))return reply({error:'Invalid activation device'},400);
      if(body.action==='time-reserve'){
        if(!safeUuid(body.runId)||!Number.isSafeInteger(body.milliseconds)||Number(body.milliseconds)<1||Number(body.milliseconds)>30000)return reply({error:'Invalid time reservation'},400);
        return reply(await rpc('game_reserve_time',{p_id:body.reservationId,p_device:body.deviceId,p_run:body.runId,p_ms:body.milliseconds}));
      }
      if(body.action==='time-checkpoint'||body.action==='time-settle'){
        if(!Number.isSafeInteger(body.consumedMs)||Number(body.consumedMs)<0||Number(body.consumedMs)>30000)return reply({error:'Invalid consumed time'},400);
        return reply(await rpc(body.action==='time-checkpoint'?'game_checkpoint_time':'game_settle_time',{p_id:body.reservationId,p_device:body.deviceId,p_consumed:body.consumedMs}));
      }
      return reply({error:'Unknown time action'},400);
    }
    if(body.action==='state')return reply(await rpc('game_state'));
    if(body.action==='level'||body.action==='start'){
      if(!safeLevel(body.level))return reply({error:'Invalid stage'},400);
      const state=await rpc('game_state');
      if(body.level>Math.max(12,Number(state.highest_unlocked)))return reply({error:'Finish earlier stages to unlock this one'},403);
      const stage=await ensureLevel(body.level,()=>rpc('game_prepare_level',{p_level:body.level}));
      if(body.action==='level')return reply(stage);
      if(typeof body.requestId!=='string'||!/^[a-f\d-]{36}$/i.test(body.requestId))return reply({error:'Invalid attempt ID'},400);
      return reply(await rpc('game_start',{p_level:body.level,p_request_id:body.requestId}));
    }
    if(body.action==='complete'){
      if(typeof body.runId!=='string'||!/^[a-f\d-]{36}$/i.test(body.runId)||typeof body.hash!=='string'||!/^[a-f\d]{64}$/.test(body.hash))return reply({error:'Invalid attempt'},400);
      // Generate stages only on level/start requests, where the account's
      // generation budget is checked. Completion retries must never publish
      // an imported frontier or its locked successor in the background.
      if(body.stageLosses!==undefined&&body.stageLosses!==null&&(!Number.isInteger(body.stageLosses)||Number(body.stageLosses)<0||Number(body.stageLosses)>5))return reply({error:'Invalid completion statistics'},400);
      return reply(await rpc('game_complete',{p_run_id:body.runId,p_hash:body.hash,p_score:body.score,p_seconds:body.seconds,p_peak:body.peak,p_mode:body.mode,p_losses:body.stageLosses??null}));
    }
    if(body.action==='import')return reply(await rpc('game_link_progress',{p_starters:body.starters,p_journey_next:body.journeyNext,p_records:body.records,p_manual:(body.mastery as {manual?:unknown}|undefined)?.manual??[],p_clean:(body.mastery as {clean?:unknown}|undefined)?.clean??[]}));
    if(body.action==='history'||body.action==='export'){
      let query=client.from('game_completions').select(fields).eq('version',3).order('level',{ascending:false}).limit(100);
      if(body.before!==null&&body.before!==undefined){if(!safeLevel(body.before))return reply({error:'Invalid history cursor'},400);query=query.lt('level',body.before);}
      const result=await query;if(result.error)throw Error('Could not read history');
      const rows=result.data||[],nextBefore=rows.length===100?Number(rows.at(-1)?.level):null;
      if(rows.length){
        const mastery=await client.from('game_mastery').select('level,best_manual_seconds,best_clean_seconds').in('level',rows.map(row=>row.level));
        if(mastery.error)throw Error('Could not read mastery history');
        const byLevel=new Map((mastery.data||[]).map(row=>[String(row.level),row]));
        for(const row of rows)Object.assign(row,byLevel.get(String(row.level))||{});
      }
      return reply({...(body.action==='export'?{account:{id:user.id,email:user.email,createdAt:user.created_at},progress:await rpc('game_state')} : {}),history:rows,nextBefore});
    }
    if(body.action==='delete'){
      const signedAt=Date.parse(user.last_sign_in_at||'');
      if(!Number.isFinite(signedAt)||signedAt>Date.now()+60000||Date.now()-signedAt>15*60*1000)return reply({error:'Sign out, sign in again, then delete your account within 15 minutes.'},409);
      // All private game records have ON DELETE CASCADE; the shared catalog has
      // no creator identifier and is intentionally retained for other players.
      const result=await admin.auth.admin.deleteUser(user.id);
      if(result.error)throw Error('Could not delete the account. Please try again.');
      return reply({deleted:true});
    }
    return reply({error:'Unknown action'},400);
  }catch(error){
    if(error instanceof RequestError)return reply({error:error.message},error.status);
    const message=error instanceof Error?error.message:'Cloud request failed';
    // Known SQL/business errors contain no credentials. Do not return stack
    // traces, raw queries, tokens or provider diagnostic objects to the client.
    if(message==='Unknown run')return reply({error:'This offline attempt expired. Your device progress can still be linked.'},400);
    if(businessErrors.has(message))return reply({error:message},400);
    // Provider errors may contain familiar words such as "stage" plus private
    // diagnostics. Only exact, controlled business messages leave the server.
    return reply({error:'The game service is unavailable. Please try again.'},503);
  }
});
