import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createDefinition,validateCatalogDefinition,canonicalLayout,definitionHash,structuralDistance} from '../_shared/catalog.js';
import {readLimitedJson,readLimitedBytes,parseJsonObject,RequestError} from '../_shared/request.js';
import {nativeCommerce,nativeCatalog,persistVerifiedPurchase} from '../_shared/native-commerce.js';
import {equalSecret,PurchaseVerificationError} from '../_shared/revenuecat.js';
import {webCommerce,webCatalog,prepareWebCheckout,findWebIntent,recoverWebCheckout,webhookWebPayment,reconcileWebDispute} from '../_shared/web-commerce.js';
import {verifyHmac,WebCheckoutError} from '../_shared/razorpay.js';
import {AdMobVerifier} from '../_shared/admob-ssv.js';
import {admobCallback} from '../_shared/admob-handler.js';
import {rewardedAdConfig,adPlacement} from '../_shared/ad-config.js';
import {deletionStatus,prepareAccountDeletion,deletePreparedAccount} from '../_shared/account-deletion.js';
const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const serverFetch:typeof fetch=(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(10000)])});
const admin=createClient(url,service,{global:{fetch:serverFetch},auth:{persistSession:false,autoRefreshToken:false}});
const monetizationEnvironment=Deno.env.get('MONETIZATION_ENVIRONMENT')||'production';
const nativeCandidate=nativeCommerce((key:string)=>Deno.env.get(key)),webCandidate=webCommerce((key:string)=>Deno.env.get(key)),adsCandidate=rewardedAdConfig((key:string)=>Deno.env.get(key));
// Test and production providers must never be mixed by a deployment profile.
// Staging also needs its own database; provider setup must keep it isolated.
const commerce=nativeCandidate?.verifier.environment===monetizationEnvironment?nativeCandidate:null;
const webBilling=webCandidate?.provider.environment===monetizationEnvironment?webCandidate:null;
const adsConfig=adsCandidate?.environment===monetizationEnvironment?adsCandidate:null,adVerifier=new AdMobVerifier();
const receiveAdMob=admobCallback({admin,verifier:adVerifier});
const playMetricsEnabled=Deno.env.get('PLAY_METRICS_ENABLED')==='true';
const origins=new Set((Deno.env.get('ALLOWED_ORIGINS')||'https://speedinno.github.io,https://localhost,capacitor://localhost').split(',').map(s=>s.trim()));
const safeLevel=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<Number.MAX_SAFE_INTEGER;
const safeUuid=(n:unknown):n is string=>typeof n==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(n);
const businessErrors=new Set(['Authentication required','Stage is locked','Run ID already used','Too many attempts. Try again later.','Stage is not ready','This offline attempt expired. Replay the stage to save it online.','Stage version differs. Reconnect and replay this stage.','Attempt is too short','Invalid completion statistics','Invalid stage score','Invalid guest progress','Complete all starter stages first','Invalid history','Too many new stages. Try again later.']);
for(const message of ['Invalid time reservation','Reservation identity conflict','Recover or finish the existing activation first','Active run required','Not enough autoplay time','Unknown time reservation','Wait for the previous activation lease to end','Wrong activation device','Invalid consumed time','Activation lease expired','Reconcile autoplay before completing this run','Invalid mastery import'])businessErrors.add(message);
for(const message of ['Invalid reward opportunity','Reward opportunity identity conflict','Rewarded ads are unavailable','No rewarded opportunities remain today','Unknown reward opportunity','This reward opportunity expired','Another reward is still pending verification','Recover this reward on its original device','Unknown browser reward opportunity','Invalid reward timestamp'])businessErrors.add(message);
async function ensureLevel(level:number,authorize:()=>Promise<unknown>){
  const version=level<=12?5:3;
  const existing=await admin.from('game_catalog').select('definition,layout_hash').eq('version',version).eq('level',level).maybeSingle();
  if(existing.error)throw Error('Catalog is unavailable');if(existing.data)return existing.data;
  await authorize();
  const recent=await admin.from('game_catalog').select('canonical_layout').eq('version',version).order('level',{ascending:false}).limit(48);
  for(let nonce=0;nonce<32;nonce++){
    const definition=createDefinition(level,nonce);validateCatalogDefinition(definition);
    const canonical=canonicalLayout(definition.layout),hash=await definitionHash(definition);
    if(level>12&&recent.data?.some(row=>structuralDistance(canonical,row.canonical_layout)<.085))continue;
    const result=await admin.rpc('game_publish_level',{p_level:level,p_definition:definition,p_canonical:canonical,p_hash:hash});
    if(!result.error)return result.data;
    if(result.error.code!=='23505')throw Error('Could not publish this stage');
    // Another request might have won this level while we were generating it.
    const winner=await admin.from('game_catalog').select('definition,layout_hash').eq('version',version).eq('level',level).maybeSingle();if(winner.data)return winner.data;
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
  if(request.method==='GET'&&new URL(request.url).pathname.endsWith('/webhooks/admob')){
    // Honour old valid promises independently of today's advertising config.
    return receiveAdMob(request);
  }
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Max-Age':'600'}});
  if(request.method!=='POST')return reply({error:'POST required'},405);
  try{
    if(new URL(request.url).pathname.endsWith('/privacy/deletion-status')){
      const body=await readLimitedJson(request);
      return reply(await deletionStatus(admin,body.requestId));
    }
    if(new URL(request.url).pathname.endsWith('/webhooks/razorpay')){
      if(!webBilling)return reply({error:'Web checkout is not configured'},503);
      const bytes=await readLimitedBytes(request),signature=request.headers.get('X-Razorpay-Signature');
      const valid=await Promise.all(webBilling.secrets.map(secret=>verifyHmac(bytes,signature,secret)));
      if(!valid.some(Boolean))return reply({error:'Webhook authentication required'},401);
      const body=parseJsonObject(bytes);
      if(body.account_id!==webBilling.provider.merchantId)return reply({error:'Webhook account mismatch'},403);
      if(['payment.dispute.created','payment.dispute.won','payment.dispute.lost','payment.dispute.closed','payment.dispute.under_review','payment.dispute.action_required'].includes(String(body.event))){
        const dispute=(body.payload as {dispute?:{entity?:{id?:unknown,phase?:unknown,status?:unknown,amount_deducted?:unknown}}}|undefined)?.dispute?.entity;
        if(typeof dispute?.id!=='string')return reply({error:'Dispute identifier required'},400);
        const result=await reconcileWebDispute(webBilling,admin,dispute.id,{hintPhase:typeof dispute.phase==='string'?dispute.phase:undefined,hintStatus:typeof dispute.status==='string'?dispute.status:undefined,minimumDeducted:dispute.status==='lost'&&Number.isSafeInteger(dispute.amount_deducted)?Number(dispute.amount_deducted):undefined});
        return reply({processed:!('ignored' in result&&result.ignored)});
      }
      if(!['payment.captured','payment.authorized','payment.failed','order.paid','refund.processed','refund.failed'].includes(String(body.event)))return reply({ignored:true});
      const payload=body.payload as {payment?:{entity?:{id?:unknown}},refund?:{entity?:{payment_id?:unknown,amount?:unknown}}}|undefined;
      const paymentId=payload?.payment?.entity?.id??payload?.refund?.entity?.payment_id;
      if(typeof paymentId!=='string')return reply({ignored:true});
      const amount=payload?.refund?.entity?.amount;
      const minimumRefund=body.event==='refund.processed'&&Number.isSafeInteger(amount)&&Number(amount)>0?Number(amount):0;
      const result=await webhookWebPayment(webBilling,admin,paymentId,{minimumRefund});
      return reply({processed:!('ignored' in result&&result.ignored)});
    }
    if(new URL(request.url).pathname.endsWith('/webhooks/revenuecat')){
      if(!await equalSecret(request.headers.get('Authorization'),Deno.env.get('REVENUECAT_WEBHOOK_AUTH')))return reply({error:'Webhook authentication required'},401);
      if(!commerce)return reply({error:'Purchase verification is not configured'},503);
      const body=await readLimitedJson(request),event=body.event as Record<string,unknown>|undefined;
      if(event?.type==='TEST')return reply({ignored:true});
      if(typeof event?.transaction_id!=='string')return reply({ignored:true});
      const receipts=await commerce.verifier.transaction(event.transaction_id);
      for(const receipt of receipts)await persistVerifiedPurchase(admin,receipt,commerce.verifier.projectId);
      return reply({processed:receipts.length});
    }
    const bearer=request.headers.get('Authorization')||'';
    if(!/^Bearer \S+$/i.test(bearer))return reply({error:'Sign in to use cloud saves'},401);
    const auth=await admin.auth.getUser(bearer.slice(7));
    if(auth.error||!auth.data.user)return reply({error:'Your session expired. Sign in again.'},401);
    const user=auth.data.user,client=createClient(url,anon,{global:{headers:{Authorization:bearer},fetch:serverFetch},auth:{persistSession:false,autoRefreshToken:false}});
    const body=await readLimitedJson(request);
    if(body.accountId!==user.id)return reply({error:'Your account changed. Please reopen Account and try again.'},409);
    const rpc=async(name:string,args:Record<string,unknown>={})=>{const result=await client.rpc(name,args);if(result.error)throw Error(result.error.message);return result.data;};
    if(typeof body.action==='string'&&body.action.startsWith('metrics-')){
      const revision=(value:unknown):value is string=>typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n;
      const metricReply=(data:Record<string,unknown>)=>reply({...data,available:playMetricsEnabled});
      if(body.action==='metrics-state')return metricReply(await rpc('game_metrics_state',{p_allow_assignment:playMetricsEnabled}));
      if(body.action==='metrics-export'){
        if(body.before!==undefined&&body.before!==null&&(!revision(body.before)||body.before==='0'))return reply({error:'Invalid analytics cursor'},400);
        return reply(await rpc('game_metrics_export',{p_before:body.before??null}));
      }
      if(body.action==='metrics-set'){
        if(typeof body.enabled!=='boolean'||!revision(body.expectedRevision))return reply({error:'Invalid analytics preference'},400);
        if(body.enabled&&!playMetricsEnabled)return metricReply({...await rpc('game_metrics_state',{p_allow_assignment:false}),applied:false});
        return metricReply(await rpc('game_metrics_set',{p_enabled:body.enabled,p_expected:body.expectedRevision}));
      }
      if(body.action==='metrics-collect'){
        if(!revision(body.revision)||!safeUuid(body.streamId)||!Number.isSafeInteger(body.dropped)||Number(body.dropped)<0||Number(body.dropped)>1000000000||!Array.isArray(body.events)||body.events.length>40)return reply({error:'Invalid analytics batch'},400);
        if(!playMetricsEnabled)return metricReply({...await rpc('game_metrics_state',{p_allow_assignment:false}),accepted:false});
        return metricReply(await rpc('game_metrics_collect',{p_revision:body.revision,p_stream:body.streamId,p_dropped:body.dropped,p_events:body.events}));
      }
      return reply({error:'Unknown analytics action'},400);
    }
    if(typeof body.action==='string'&&body.action.startsWith('ad-')){
      if(body.action==='ad-state')return reply(await rpc('game_ad_state'));
      if(body.action==='ad-catalog'||body.action==='ad-prepare'){
        if(!['android','ios','web'].includes(String(body.platform)))return reply({error:'Unknown game edition'},400);
        const placement=await adPlacement(adsConfig,admin,body.platform,origin);
        if(!placement)return reply({available:false,reason:'Rewarded ads are not available in this edition yet.'});
        if(body.action==='ad-catalog')return reply({available:true,provider:placement.provider,platform:placement.platform,environment:placement.environment,placementId:placement.id,unit:placement.request_unit,state:await rpc('game_ad_state')});
        if(!safeUuid(body.offerId)||!safeUuid(body.deviceId))return reply({error:'Invalid reward opportunity'},400);
        return reply(await rpc('game_prepare_ad',{p_id:body.offerId,p_device:body.deviceId,p_placement:placement.id}));
      }
      if(!safeUuid(body.offerId))return reply({error:'Invalid reward opportunity'},400);
      if(body.action==='ad-status'){
        const offer=await client.from('game_ad_offers').select('id,state,promised_ms,provider,platform,prepare_until,earned_at,device_id,placement_id').eq('id',body.offerId).eq('owner_user_id',user.id).maybeSingle();
        if(offer.error||!offer.data)return reply({error:'Unknown reward opportunity'},400);
        const placement=await admin.from('game_ad_placements').select('id,provider,platform,environment,request_unit').eq('id',offer.data.placement_id).maybeSingle();
        if(placement.error)throw Error('Reward placement is unavailable');
        return reply({offer:offer.data,placement:placement.data,state:await rpc('game_ad_state')});
      }
      if(!safeUuid(body.deviceId))return reply({error:'Invalid reward device'},400);
      if(body.action==='ad-start')return reply(await rpc('game_commit_ad',{p_id:body.offerId,p_device:body.deviceId}));
      if(body.action==='ad-cancel')return reply(await rpc('game_cancel_ad',{p_id:body.offerId,p_device:body.deviceId,p_web_unearned:body.definitivelyUnearned===true,p_never_presented:body.neverPresented===true}));
      if(body.action==='ad-web-earned'){
        if(!Number.isSafeInteger(body.earnedAtMs)||Number(body.earnedAtMs)<946684800000||Number(body.earnedAtMs)>Date.now()+300000)return reply({error:'Invalid reward timestamp'},400);
        return reply(await rpc('game_claim_web_ad',{p_id:body.offerId,p_device:body.deviceId,p_earned_at:new Date(Number(body.earnedAtMs)).toISOString()}));
      }
      return reply({error:'Unknown reward action'},400);
    }
    if(body.action==='purchase-catalog'){
      if(!['android','ios','web'].includes(String(body.platform)))return reply({error:'Unknown game edition'},400);
      if(body.platform==='web')return reply(!webBilling?{available:false,reason:'Web checkout is not configured yet.'}:webBilling.origins.has(origin||'')?await webCatalog(webBilling,admin):{available:false,reason:'Purchases are available only in the official game edition.'});
      return reply(await nativeCatalog(commerce,admin,body.platform,user.id));
    }
    if(body.action==='purchase-sync'){
      if(!commerce)return reply({error:'Purchases are not configured yet. Manual play is available.'},503);
      const {records,next}=await commerce.verifier.page(user.id,body.after??null);
      const results=[];for(const receipt of records)results.push(await persistVerifiedPurchase(admin,receipt,commerce.verifier.projectId));
      return reply({processed:results.length,deletedAccountPurchase:results.some(r=>r.state==='account-deleted'),next,wallet:await rpc('game_time_state')});
    }
    if(body.action==='purchase-verify'){
      if(!commerce)return reply({error:'Purchases are not configured yet. Manual play is available.'},503);
      const records=await commerce.verifier.transaction(body.transactionId);
      if(records.some(r=>r.user!==user.id))return reply({error:'This purchase belongs to another game account.'},409);
      const results=[];for(const receipt of records)results.push(await persistVerifiedPurchase(admin,receipt,commerce.verifier.projectId));
      return reply({verified:results.some(r=>r.state==='owned'),refunded:results.some(r=>r.state==='refunded'),deletedAccountPurchase:results.some(r=>r.state==='account-deleted'),wallet:await rpc('game_time_state')});
    }
    if(typeof body.action==='string'&&body.action.startsWith('purchase-web-')){
      if(!webBilling?.origins.has(origin||''))return reply({error:'Checkout is unavailable in this game edition.'},403);
      if(body.action==='purchase-web-sync'){
        if(body.after!==null&&body.after!==undefined&&!safeUuid(body.after))return reply({error:'Invalid purchase recovery cursor'},400);
        let query=admin.from('game_web_orders').select('*').eq('owner_user_id',user.id).eq('scope',webBilling.provider.scope).eq('environment',webBilling.provider.environment).order('id',{ascending:true}).limit(5);
        if(body.after)query=query.gt('id',body.after);
        const rows=await query;if(rows.error)throw new WebCheckoutError('Could not read purchase recovery. Try again later.');
        const results=await Promise.all((rows.data||[]).map(intent=>recoverWebCheckout(webBilling,admin,intent)));
        return reply({next:rows.data?.length===5?rows.data.at(-1)?.id:null,processed:results.length,chargeback:results.some(result=>result.state==='charged_back'),disputeReview:results.some(result=>'disputeReview' in result&&result.disputeReview),wallet:await rpc('game_time_state')});
      }
      if(!safeUuid(body.intentId))return reply({error:'Invalid checkout ID'},400);
      if(body.action==='purchase-web-order'){
        if(!safeUuid(body.priceId))return reply({error:'Invalid time pack'},400);
        return reply(await prepareWebCheckout(webBilling,admin,user.id,body.intentId,body.priceId));
      }
      const intent=await findWebIntent(webBilling,admin,body.intentId,user.id);
      if(body.action==='purchase-web-confirm'||body.action==='purchase-web-status'){
        const result=await recoverWebCheckout(webBilling,admin,intent,body.action==='purchase-web-confirm'?{paymentId:body.paymentId,signature:body.signature,requireSignature:true}:{});
        return reply({...result,wallet:await rpc('game_time_state')});
      }
      return reply({error:'Unknown checkout action'},400);
    }
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
    if(body.action==='delete-prepare')return reply(await prepareAccountDeletion(admin,user,body.requestId));
    if(body.action==='delete'){
      // Progress/balance cascade; minimal provider transaction tombstones lose
      // their owner reference but remain non-mintable after account deletion.
      // The shared catalog contains no creator identifier.
      return reply(await deletePreparedAccount(admin,user,body.requestId??crypto.randomUUID()));
    }
    return reply({error:'Unknown action'},400);
  }catch(error){
    if(error instanceof PurchaseVerificationError||error instanceof WebCheckoutError)return reply({error:error.message},503);
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
