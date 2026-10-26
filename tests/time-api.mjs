import {migrateGame} from './db-migrations.mjs';
// Disposable localhost integration fixture. Loaded only by server.mjs when
// QA_FIXTURES=1. No production credentials, store transaction or ad event.
import {PGlite} from '@electric-sql/pglite';
import {createDefinition, definitionHash} from '../dist/catalog.js';
import {canonicalLayout} from '../dist/generated.js';
import {createWebCommerceFixture} from './web-commerce-fixture.mjs';
import {deletionStatus,prepareAccountDeletion,deletePreparedAccount} from '../supabase/functions/_shared/account-deletion.js';
const user = '11111111-1111-4111-8111-111111111111';
let db, commerceFixture, adsFixture=false, queue = Promise.resolve();
async function initialize(milliseconds = 60000, commerce=false, ads=false, privacy=false) {
  await db?.close(); db = new PGlite();
  await db.exec(`create schema auth;create table auth.users(id uuid primary key,email text);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${user}','time-test@example.test');`);
  await migrateGame(db);
  if(privacy)await db.query("select game_privacy_note_account($1,'proj_localPrivacy','sandbox')",[user]);
  for (let level=1;level<=12;level++) {
    const definition=createDefinition(level);
    await db.query('select public.game_publish_level($1,$2::jsonb,$3,$4)',[level,JSON.stringify(definition),canonicalLayout(definition.layout),await definitionHash(definition)]);
  }
  if(milliseconds>0)await db.query("select public.game_credit_verified($1,'intro','localhost-fixture',$2,'server','fixture-v1')",[user,milliseconds]);
  commerceFixture=commerce?await createWebCommerceFixture(db,user):null;
  adsFixture=ads;
  if(ads)await db.exec("insert into public.game_ad_placements(id,provider,platform,environment,request_unit,active) values('local-web-v1','h5','web','sandbox','ca-pub-1234567890123456',true)");
}
async function handle(body) {
  if(body.action==='qa-reset'){await initialize(Number.isSafeInteger(body.milliseconds)&&body.milliseconds>=0?body.milliseconds:60000,body.commerce===true,body.ads===true,body.privacy===true);return {fixture:true};}
  if(!db)await initialize();
  if(body.accountId!==user)throw Error('Test identity mismatch');
  if(['delete','delete-prepare','privacy-status'].includes(body.action)){
    const admin={rpc:async(_name,args)=>({data:(await db.query('select game_prepare_account_deletion($1,$2) as value',[args.p_user,args.p_request])).rows[0].value}),auth:{admin:{deleteUser:async id=>{await db.query('delete from auth.users where id=$1',[id]);return{};}}},from:()=>({select:()=>({eq:(_key,id)=>({maybeSingle:async()=>({data:(await db.query('select deleted_at from game_deletion_requests where id=$1',[id])).rows[0]??null})})})})};
    const authUser={id:user,last_sign_in_at:new Date().toISOString()};
    return body.action==='privacy-status'?deletionStatus(admin,body.requestId):body.action==='delete-prepare'?prepareAccountDeletion(admin,authUser,body.requestId):deletePreparedAccount(admin,authUser,body.requestId);
  }
  if(body.action==='qa-privacy-jobs')return(await db.query('select state,last_code,subject is not null as has_subject from game_privacy_jobs order by state')).rows;
  if(body.action==='qa-ledger')return (await db.query('select kind,sum(amount_ms)::integer as ms from public.game_time_ledger group by kind')).rows;
  if(body.action?.startsWith('ad-')&&!adsFixture){if(body.action==='ad-catalog')return{available:false,reason:'Local fixture ads are disabled.'};throw Error('Local fixture ads are disabled');}
  if(body.action?.startsWith('purchase-')||body.action==='qa-commerce-capture'||body.action==='qa-commerce-dispute'){
    if(!commerceFixture){if(body.action==='purchase-catalog')return{available:false,reason:'Local fixture purchases are disabled.'};throw Error('Local fixture purchases are disabled');}
    return commerceFixture.handle(body);
  }
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`);
  async function rpc(sql,args=[]){return (await db.query('select public.'+sql+' as value',args)).rows[0].value;}
  try{
    switch(body.action){
      case 'ad-catalog': return{available:true,provider:'h5',platform:'web',environment:'sandbox',placementId:'local-web-v1',unit:'ca-pub-1234567890123456',state:await rpc('game_ad_state()')};
      case 'ad-state': return rpc('game_ad_state()');
      case 'ad-prepare': return rpc('game_prepare_ad($1,$2,$3)',[body.offerId,body.deviceId,'local-web-v1']);
      case 'ad-start': return rpc('game_commit_ad($1,$2)',[body.offerId,body.deviceId]);
      case 'ad-cancel': return rpc('game_cancel_ad($1,$2,$3,$4)',[body.offerId,body.deviceId,body.definitivelyUnearned===true,body.neverPresented===true]);
      case 'ad-web-earned': return rpc('game_claim_web_ad($1,$2,$3)',[body.offerId,body.deviceId,new Date(body.earnedAtMs).toISOString()]);
      case 'ad-status': return{offer:(await db.query('select id,state,promised_ms from public.game_ad_offers where id=$1',[body.offerId])).rows[0],state:await rpc('game_ad_state()')};
      case 'state': return rpc('game_state()');
      case 'level': return (await db.query('select definition,layout_hash from public.game_catalog where version=3 and level=$1',[body.level])).rows[0];
      case 'start': return rpc('game_start($1,$2)',[body.level,body.requestId]);
      case 'complete': return rpc('game_complete($1,$2,$3,$4,$5,$6,$7)',[body.runId,body.hash,body.score,body.seconds,body.peak,body.mode,body.stageLosses??null]);
      case 'import': return rpc('game_link_progress($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)',[body.starters,body.journeyNext,JSON.stringify(body.records),JSON.stringify(body.mastery?.manual||[]),JSON.stringify(body.mastery?.clean||[])]);
      case 'time-state': return rpc('game_time_state()');
      case 'time-reserve': return rpc('game_reserve_time($1,$2,$3,$4)',[body.reservationId,body.deviceId,body.runId,body.milliseconds]);
      case 'time-checkpoint': return rpc('game_checkpoint_time($1,$2,$3)',[body.reservationId,body.deviceId,body.consumedMs]);
      case 'time-settle': return rpc('game_settle_time($1,$2,$3)',[body.reservationId,body.deviceId,body.consumedMs]);
      case 'time-recover': return rpc('game_recover_time($1)',[body.reservationId]);
      default: throw Error('Unsupported local test action');
    }
  }finally{await db.exec('reset role');}
}
export function timeFixture(body){
  // This fixture uses one PGlite connection. Serialize role changes so two
  // browser requests cannot accidentally inherit another request's SQL role.
  const pending=queue.then(()=>handle(body));queue=pending.catch(()=>{});return pending;
}
