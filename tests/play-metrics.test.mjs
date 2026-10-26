import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {migrateGame} from './db-migrations.mjs';
const owner=crypto.randomUUID(),other=crypto.randomUUID(),session=crypto.randomUUID(),stream=crypto.randomUUID();let db;
before(async()=>{db=new PGlite();await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);try{await migrateGame(db);}catch(error){throw Error(error.message);}await db.query('insert into auth.users values($1),($2)',[owner,other]);});after(async()=>db?.close());
const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
async function as(id,work){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');try{return await work();}finally{await db.exec('reset role');}}
const state=id=>as(id,()=>value('select game_metrics_state() as value'));
const set=(id,enabled,revision)=>as(id,()=>value('select game_metrics_set($1,$2) as value',[enabled,revision]));
const send=(id,revision,events,extra={})=>as(id,()=>value('select game_metrics_collect($1,$2,$3,$4::jsonb) as value',[revision,extra.stream??stream,extra.dropped??0,JSON.stringify(events)]));
const event=(type='session_start',data={platform:'android',build:'3.2.0'})=>({id:crypto.randomUUID(),type,sessionId:session,clientAt:Date.now(),data});
test('optional collection is off by default, account-bound and independently revisioned',async()=>{
 const first=await state(owner);assert.equal(first.enabled,false);assert.equal(first.revision,'0');assert.equal(first.assignment,null);assert.equal((await send(owner,'0',[event()])).accepted,false);
 const enabled=await set(owner,true,'0');assert.equal(enabled.applied,true);assert.equal(enabled.enabled,true);assert.equal(enabled.revision,'1');assert.equal((await state(other)).enabled,false);assert.equal((await set(owner,true,'1')).revision,'1');
});
test('duplicate event delivery is idempotent and a changed payload cannot rewrite an earlier observation',async()=>{
 const first=event();assert.equal((await send(owner,'1',[first])).inserted,1);assert.equal((await send(owner,'1',[first])).duplicates,1);assert.equal((await send(owner,'1',[{...first,data:{platform:'ios',build:'3.2.0'}}])).rejected,1);assert.equal(await value('select count(*)::integer as value from game_metric_events where user_id=$1',[owner]),1);
});
test('raw contacts, unknown fields, arbitrary strings and invalid statistics are rejected transactionally',async()=>{
 for(const raw of [event('session_start',{platform:'android',build:'3.2.0',email:'private@example.invalid'}),{...event(),email:'private@example.invalid'},event('play_segment',{level:1,runId:crypto.randomUUID(),mode:'manual',activeMs:-1,reason:'periodic'}),event('help_open',{surface:'private-contact'}),event('purchase_offer',{platform:'web',sku:'private@example.invalid',currency:'INR',amountMicros:1000000,benefitMs:300000,configVersion:'v1'})])await assert.rejects(()=>send(owner,'1',[event(),raw]),/Invalid analytics event/);
 assert.equal(await value('select count(*)::integer as value from game_metric_events where user_id=$1',[owner]),1);
});
test('manual and assisted segments are separate and a terminal run is not counted twice',async()=>{
 const runId=crypto.randomUUID(),segments=['manual','assisted'].map(mode=>event('play_segment',{level:1,runId,mode,activeMs:5000,reason:'takeover'})),ended=event('stage_end',{level:1,runId,mode:'assisted',simulationMs:24000,losses:0,outcome:'cleared'});const result=await send(owner,'1',[...segments,ended]);assert.equal(result.inserted,3);assert.equal((await send(owner,'1',[{...ended,id:crypto.randomUUID()}])).duplicates,1);const modes=await db.query("select data->>'mode' as mode from game_metric_events where type='play_segment' and user_id=$1 order by mode",[owner]);assert.deepEqual(modes.rows.map(row=>row.mode),['assisted','manual']);
});
test('the same linked account receives the same curated assignment across sessions and prices cannot affect it',async()=>{
 await db.query("update game_metric_experiments set active=true where id='aim-coaching-2026-10-v1'");const a=await state(owner),b=await state(owner);assert.deepEqual(a.assignment,b.assignment);assert(['standard','aim_hint'].includes(a.assignment.variant));const exposure=event('coach_exposure',{experiment:a.assignment.experiment,variant:a.assignment.variant});assert.equal((await send(owner,'1',[exposure])).inserted,1);assert.equal((await send(owner,'1',[event('coach_exposure',{...exposure.data,variant:a.assignment.variant==='standard'?'aim_hint':'standard'})])).rejected,1);
 await assert.rejects(()=>db.query("update game_metric_experiments set hint_weight=9000"),/immutable/);await db.query('update game_metric_experiments set active=false');assert.equal((await state(owner)).assignment,null);assert.equal((await send(owner,'1',[{...exposure,id:crypto.randomUUID()}])).inserted,1);
});
test('an opt-out deletes optional data and fences late events and stale opt-ins from every device',async()=>{
 const off=await set(owner,false,'1');assert.equal(off.revision,'2');assert.equal(await value('select count(*)::integer as value from game_metric_events where user_id=$1',[owner]),0);assert.equal(await value('select count(*)::integer as value from game_metric_assignments where user_id=$1',[owner]),0);assert.equal((await send(owner,'1',[event()])).accepted,false);const stale=await set(owner,true,'1');assert.equal(stale.applied,false);assert.equal(stale.enabled,false);assert.equal(stale.revision,'2');
 await db.query('update game_metric_experiments set active=true');const again=await set(owner,true,'2');assert.equal(again.revision,'3');assert.equal((await send(owner,'1',[event()])).accepted,false);
});
test('daily ingestion quotas bound collection without changing the game wallet',async()=>{
 await db.query("insert into game_metric_daily(user_id,day,accepted) values($1,(now() at time zone 'UTC')::date,999) on conflict(user_id,day) do update set accepted=999",[owner]);const result=await send(owner,'3',[event(),event()],{dropped:4});assert.equal(result.inserted,1);assert.equal(result.quotaDropAttempts,1);assert.equal(result.ack.length,2);await send(owner,'3',[],{dropped:2});assert.equal(await value('select client_dropped::integer as value from game_metric_streams where user_id=$1 and id=$2',[owner,stream]),4);assert.equal(await value('select count(*)::integer as value from game_credit_lots where user_id=$1',[owner]),0);
 await db.query('delete from game_metric_daily where user_id=$1',[owner]);
});
test('device clocks cannot invent server observation dates, and export only returns that account',async()=>{
 await send(owner,'3',[{...event(),clientAt:0}]);const page=await as(owner,()=>value('select game_metrics_export() as value'));assert(page.events.some(row=>row.clientAt===null));assert(page.events.every(row=>row.receivedAt&&row.source==='client_reported'));assert.deepEqual((await as(other,()=>value('select game_metrics_export() as value'))).events,[]);assert(!JSON.stringify(page).includes('private@example.invalid'));
});
test('anonymous/direct table access cannot collect, change assignments or inspect other accounts',async()=>{
 await db.exec('set role anon');try{await assert.rejects(()=>db.query('select game_metrics_state()'),/permission denied/);}finally{await db.exec('reset role');}
 await as(owner,async()=>{for(const table of ['game_metric_events','game_metric_preferences','game_metric_assignments','game_metric_experiments','game_metric_streams'])await assert.rejects(()=>db.query('select * from '+table),/permission denied/);});
});
test('a paused deployment view does not enroll an already consenting account into a new experiment',async()=>{
 await db.query('update game_metric_preferences set enabled=true,revision=1 where user_id=$1',[other]);const snapshot=await as(other,()=>value('select game_metrics_state(false) as value'));assert.equal(snapshot.enabled,true);assert.equal(snapshot.assignment,null);assert.equal(await value('select count(*)::integer as value from game_metric_assignments where user_id=$1',[other]),0);
});
test('expired raw events disappear from export and bounded retention cleanup preserves live observations',async()=>{
 const expired=event('help_open',{surface:'game'}),live=event('help_open',{surface:'home'});await send(owner,'3',[expired,live]);await db.query("update game_metric_events set expires_at=now()-interval '1 day' where id=$1",[expired.id]);const exported=await as(owner,()=>value('select game_metrics_export() as value'));assert(!exported.events.some(row=>row.id===expired.id));assert(exported.events.some(row=>row.id===live.id));const pruned=await value('select game_prune_play_metrics(1) as value');assert.equal(pruned.events,1);assert.equal(await value('select exists(select 1 from game_metric_events where id=$1) as value',[expired.id]),false);assert.equal(await value('select exists(select 1 from game_metric_events where id=$1) as value',[live.id]),true);assert(await value('select first_observed_day is not null as value from game_metric_preferences where user_id=$1',[owner]));await as(owner,()=>assert.rejects(()=>value('select game_prune_play_metrics(1) as value'),/permission denied/));
});
test('device stream metadata is bounded even when empty collection attempts are sent repeatedly',async()=>{
 const existing=await value('select count(*)::integer as value from game_metric_streams where user_id=$1',[owner]);for(let i=existing;i<32;i++)await send(owner,'3',[],{stream:crypto.randomUUID()});await assert.rejects(()=>send(owner,'3',[],{stream:crypto.randomUUID()}),/Too many analytics streams/);assert.equal(await value('select count(*)::integer as value from game_metric_streams where user_id=$1',[owner]),32);
});
test('account deletion cascades all optional analytics while retaining no external analytics profile',async()=>{
 await db.query('delete from auth.users where id=$1',[owner]);for(const table of ['game_metric_events','game_metric_preferences','game_metric_assignments','game_metric_streams','game_metric_daily'])assert.equal(await value('select count(*)::integer as value from '+table+' where user_id=$1',[owner]),0);
});
