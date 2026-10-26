import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {migrateGame} from './db-migrations.mjs';
import {mkdtemp,rmdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
let db;const a=crypto.randomUUID(),b=crypto.randomUUID(),sid=crypto.randomUUID(),run=()=>crypto.randomUUID(),date=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
const report=(from=date(-40),to=date(0))=>scalar('select game_play_metrics_report($1,$2) as value',[from,to]);
before(async()=>{db=new PGlite();await db.exec("create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");try{await migrateGame(db);}catch(error){throw Error(error.message);}await db.query('insert into auth.users values($1),($2)',[a,b]);await db.query('insert into game_metric_preferences(user_id,enabled,revision,first_observed_day) values($1,true,1,$3),($2,true,1,$3)',[a,b,date(-31)]);});after(async()=>db?.close());
async function event(owner,type,data,day=-31){
 const id=run();await db.query("insert into game_metric_events(user_id,id,revision,type,session_id,data,fingerprint,received_at) values($1,$2::uuid,1,$3,$4,$5::jsonb,($2::uuid)::text,$6::date+interval '12 hours')",[owner,id,type,sid,JSON.stringify(data),date(day)]);return id;
}
test('empty activity and unknown financial values remain explicit, with no user identities in the operator result',async()=>{
 const result=await report();assert.equal(result.source,'optional_client_reported_account_activity');assert.equal(result.netContribution,null);assert.equal(result.winningVariant,null);assert.equal(result.cohorts.length,2);assert.equal(result.cohorts[0].currentlyConsentingAccounts,2);assert.equal(result.cohorts[0].manualActiveMs,'0');assert.deepEqual(result.sdkAdValues,[]);assert(!JSON.stringify(result).includes(a));assert(result.limitations.some(s=>s.includes('survivorship')));
});
test('D7/D30 use end-exclusive receipt-day windows and separate exact return days with maturity flags',async()=>{
 await event(a,'play_segment',{runId:run(),level:1,mode:'manual',activeMs:1000},-31);await event(a,'play_segment',{runId:run(),level:1,mode:'assisted',activeMs:2000},-25);await event(a,'play_segment',{runId:run(),level:1,mode:'manual',activeMs:4000},-24);await event(a,'play_segment',{runId:run(),level:1,mode:'manual',activeMs:8000},-1);
 await event(a,'stage_end',{runId:run(),level:1,mode:'assisted',simulationMs:3000,losses:0,outcome:'cleared'},-25);
 const result=await report(),seven=result.cohorts.find(r=>r.windowDays===7),thirty=result.cohorts.find(r=>r.windowDays===30);assert.equal(seven.manualActiveMs,'1000');assert.equal(seven.assistedActiveMs,'2000');assert.equal(seven.manualClears,'0');assert.equal(seven.assistedClears,'1');assert.equal(seven.observedReturnAccounts,1);assert.equal(seven.windowMature,true);assert.equal(seven.returnDayMature,true);
 assert.equal(thirty.manualActiveMs,'5000');assert.equal(thirty.observedReturnAccounts,1);assert.equal(thirty.windowMature,true);assert.equal(thirty.rawWindowFullyRetained,true);
 await db.query('update game_metric_preferences set first_observed_day=$2 where user_id=$1',[b,date(0)]);const fresh=(await report()).cohorts.find(r=>r.firstObservedDay===date(0)&&r.windowDays===7);assert.equal(fresh.windowMature,false);assert.equal(fresh.returnDayMature,false);
});
test('actual price/configuration and currencies remain separate, and lifecycle callbacks count one opportunity per phase',async()=>{
 const base={platform:'ios',sku:'time.small',currency:'USD',amountMicros:1290000,benefitMs:300000,configVersion:'original'};await event(a,'purchase_offer',base);await event(a,'purchase_offer',base);await event(b,'purchase_offer',{...base,currency:'INR',amountMicros:129000000});
 const opportunity=run();for(const phase of ['request','display','display','reward_signal','closed'])await event(a,'ad_event',{provider:'admob',platform:'ios',opportunityId:opportunity,phase});
 const result=await report();assert.equal(result.priceExposures.length,2);const usd=result.priceExposures.find(r=>r.currency==='USD');assert.equal(usd.clientReportedExposures,2);assert.equal(usd.distinctAccounts,1);assert.equal(usd.configVersion,'original');assert.equal(usd.priceMicros,'1290000');assert.equal(result.adLifecycle.find(r=>r.phase==='display').clientReportedOpportunities,1);assert.deepEqual(result.sdkAdValues,[]);
});
test('paid callback duplicates do not add money; conflicting snapshots are unknown and SDK values never become publisher proceeds',async()=>{
 const opportunity=run(),base={provider:'admob',platform:'ios',opportunityId:opportunity,valueMicros:1200,currency:'USD',precision:1};await event(a,'ad_value',base);await event(a,'ad_value',base);
 let result=await report();assert.equal(result.sdkAdValues[0].clientReportedSdkValueMicros,'1200');assert.equal(result.sdkAdValues[0].opportunities,1);assert.equal(result.sdkAdValues[0].publisherProceedsMicros,null);
 await event(a,'ad_value',{...base,valueMicros:9900},0);await event(a,'ad_value',{...base,opportunityId:run(),valueMicros:3,currency:'INR',precision:3});result=await report();const conflict=result.sdkAdValues.find(r=>r.conflictingOpportunities);assert.equal(conflict.clientReportedSdkValueMicros,null);assert.equal(conflict.currency,null);assert.equal(conflict.precision,null);assert.equal(result.sdkAdValues.find(r=>r.currency==='INR').clientReportedSdkValueMicros,'3');assert.equal(result.netContribution,null);
 assert.equal((await report(date(-31),date(-31))).sdkAdValues.find(r=>r.conflictingOpportunities).clientReportedSdkValueMicros,null);assert.deepEqual((await report(date(0),date(0))).sdkAdValues,[]);
});
test('assignment is not exposure; same-batch earlier or assisted clears cannot count as post-exposure manual success',async()=>{
 await db.query("insert into game_metric_assignments(user_id,experiment_id,variant,revision,issued_at) values($1,'aim-coaching-2026-10-v1','aim_hint',1,$3::date),($2,'aim-coaching-2026-10-v1','standard',1,$3::date)",[a,b,date(-20)]);
 const clear={runId:run(),level:1,mode:'manual',simulationMs:1000,losses:0,outcome:'cleared'};await event(a,'stage_end',clear,-19);await event(a,'coach_exposure',{experiment:'aim-coaching-2026-10-v1',variant:'aim_hint'},-19);await event(a,'coach_exposure',{experiment:'aim-coaching-2026-10-v1',variant:'aim_hint'},-18);await event(a,'stage_end',{...clear,runId:run(),mode:'assisted'},-18);
 let result=await report(),hint=result.coaching.find(r=>r.variant==='aim_hint'),standard=result.coaching.find(r=>r.variant==='standard');assert.equal(hint.clientReportedExposed,1);assert.equal(hint.sevenDayMatureExposed,1);assert.equal(hint.manualStageOneClearedInMatureSevenDayWindow,0);assert.equal(standard.currentlyConsentingAssigned,1);assert.equal(standard.clientReportedExposed,0);
 await event(a,'stage_end',{...clear,runId:run()},-18);result=await report();hint=result.coaching.find(r=>r.variant==='aim_hint');assert.equal(hint.manualStageOneClearedInMatureSevenDayWindow,1);assert.equal(result.winningVariant,null);
});
test('expiry removes observations from analysis before pruning; old raw-window coverage is labelled incomplete',async()=>{
 const id=await event(a,'play_segment',{runId:run(),level:1,mode:'manual',activeMs:9999},-31);await db.query("update game_metric_events set expires_at=now()-interval '1 day' where id=$1",[id]);const result=await report();assert.equal(result.cohorts.find(r=>r.windowDays===7).manualActiveMs,'1000');assert.equal(result.quality.expiredRawRowsAwaitingPrune,1);
 await db.query('update game_metric_preferences set first_observed_day=$2 where user_id=$1',[b,date(-100)]);const old=await report(date(-100),date(-99));assert.equal(old.cohorts[0].rawWindowFullyRetained,false);
});
test('bounds and privileges prevent public or player access to aggregate business reports',async()=>{
 await assert.rejects(()=>report(date(-100),date(0)),/at most 90/);await assert.rejects(()=>report(date(0),date(1)),/at most 90/);await assert.rejects(()=>report(null,date(0)),/at most 90/);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(()=>report(),/permission denied/);}finally{await db.exec('reset role');}}
 await db.exec('set role service_role');try{assert.equal((await report()).source,'optional_client_reported_account_activity');}finally{await db.exec('reset role');}
});
test('opt-out and account deletion remove the account from reported cohorts instead of retaining a hidden tracking denominator',async()=>{
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);await scalar('select game_metrics_set(false,1) as value');let result=await report();assert.equal(result.priceExposures.length,1);assert.equal(result.coaching.length,1);assert.equal(result.cohorts.length,0);assert(!result.priceExposures.some(r=>r.currency==='USD'));
 await db.query('delete from auth.users where id=$1',[b]);result=await report();assert.deepEqual(result.priceExposures,[]);assert.deepEqual(result.coaching,[]);assert.deepEqual(result.cohorts,[]);
});
test('the operator CLI fails closed without configuration or for impossible dates and never prints credentials',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'brick-play-report-')),env={...process.env};for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','MONETIZATION_ENVIRONMENT'])delete env[key];const script=new URL('../scripts/play-metrics-report.mjs',import.meta.url).pathname.replace(/^\/(\w:)/,'$1');
 try{for(const args of [['--from',date(-1),'--to',date(0)],['--from','2026-02-30','--to','2026-03-01']]){await assert.rejects(()=>promisify(execFile)(process.execPath,[script,...args],{cwd,env}),error=>{assert.equal(error.code,1);assert.match(error.stderr,/not configured|valid inclusive/);assert.equal(error.stdout,'');return true;});}}finally{await rmdir(cwd);}
});
