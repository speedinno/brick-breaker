import {migrateGame} from './db-migrations.mjs';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createDefinition,definitionHash} from '../dist/catalog.js';
import {canonicalLayout} from '../dist/generated.js';
let db;const stages=new Map();
async function rpc(user,sql,args=[]){
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`);
 try{return (await db.query('select public.'+sql+' as value',args)).rows[0].value;}
 finally{await db.exec('reset role');}
}
async function identity(){const id=crypto.randomUUID();await db.query('insert into auth.users values($1)',[id]);await rpc(id,'game_state()');return id;}
async function start(user,level=1){const id=crypto.randomUUID();await rpc(user,'game_start($1,$2)',[level,id]);await db.query("update public.game_runs set started_at=now()-interval '3 seconds' where id=$1",[id]);return id;}
async function finish(user,level=1,{id,mode='play',losses=0,seconds=2}={}){id??=await start(user,level);const stage=stages.get(level);const state=await rpc(user,'game_complete($1,$2,$3,$4,$5,$6,$7)',[id,stage.hash,stage.score,seconds,10,mode,losses]);return{id,state};}
before(async()=>{
 db=new PGlite();await db.exec("create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 await migrateGame(db);
 for(let level=1;level<=12;level++){const d=createDefinition(level),hash=await definitionHash(d);await db.query('select public.game_publish_level($1,$2::jsonb,$3,$4)',[level,JSON.stringify(d),canonicalLayout(d.layout),hash]);stages.set(level,{hash,score:[...d.layout].filter(c=>c==='b'||c==='g').length*10+1000});}
});
after(async()=>db?.close());

test('COM-07/08: first manual clear grants introduction and one mission exactly once',async()=>{
 const user=await identity(),first=await finish(user,1);
 assert.equal(first.state.earnedTimeMs,45000);assert.equal(first.state.wallet.availableMs,45000);
 assert.deepEqual(first.state.mastery,{manual:[[1,1]],clean:[[1,1]]});
 await finish(user,1,{id:first.id});assert.equal((await rpc(user,'game_time_state()')).availableMs,45000);
 const replay=await finish(user,1,{losses:1});assert.equal(replay.state.earnedTimeMs,0);assert.equal(replay.state.wallet.availableMs,45000);
 const row=(await db.query('select * from public.game_mastery where user_id=$1 and level=1',[user])).rows[0];
 assert.equal(Number(row.manual_clears),2);assert.equal(Number(row.clean_clears),1);
});

test('daily missions require distinct stages, stop at four and never block manual progression',async()=>{
 const user=await identity();for(let level=1;level<=6;level++)await finish(user,level);
 const state=await rpc(user,'game_state()');assert.equal(state.wallet.availableMs,90000);assert.equal(state.wallet.manualRewardsToday,4);assert.equal(state.wallet.manualRewardsRemaining,0);
 assert.deepEqual(state.starter_completed,[1,2,3,4,5,6]);assert.deepEqual(state.mastery.manual,[[1,6]]);
 assert.equal((await db.query('select count(*)::integer n from public.game_manual_claims where user_id=$1',[user])).rows[0].n,4);
});

test('COM-06/26: actual assistance is sticky even when completion falsely reports manual',async()=>{
 const user=await identity();await finish(user,1);const run=await start(user,2),id=crypto.randomUUID(),device=crypto.randomUUID();
 await rpc(user,'game_reserve_time($1,$2,$3,15000)',[id,device,run]);
 await assert.rejects(()=>finish(user,2,{id:run}),/Reconcile autoplay/);
 await rpc(user,'game_settle_time($1,$2,1)',[id,device]);
 const before=(await rpc(user,'game_time_state()')).availableMs;
 const done=await finish(user,2,{id:run,mode:'play',losses:0});
 assert.equal(done.state.earnedTimeMs,0);assert.equal(done.state.wallet.availableMs,before);
 assert.equal(done.state.recent.find(r=>Number(r.level)===2).play_mode,'watch');assert.deepEqual(done.state.mastery.manual,[[1,1]]);
});

test('cancelled unused authorization does not invalidate an otherwise manual clear',async()=>{
 const user=await identity();await db.query("select public.game_credit_verified($1,'purchase',$2,15000,'web','fixture')",[user,crypto.randomUUID()]);
 const run=await start(user),id=crypto.randomUUID(),device=crypto.randomUUID();
 await rpc(user,'game_reserve_time($1,$2,$3,15000)',[id,device,run]);await rpc(user,'game_settle_time($1,$2,0)',[id,device]);
 const done=await finish(user,1,{id:run});assert.equal(done.state.earnedTimeMs,45000);assert.deepEqual(done.state.mastery.manual,[[1,1]]);
});

test('unknown loss history remains unknown; assisted clears still advance the campaign',async()=>{
 const user=await identity();const old=await finish(user,1,{losses:null});assert.deepEqual(old.state.mastery.clean,[]);assert.equal(old.state.recent[0].best_clean_seconds,null);
 const watched=await finish(user,2,{mode:'watch',losses:0});assert(watched.state.starter_completed.includes(2));assert.deepEqual(watched.state.mastery.manual,[[1,1]]);assert.equal(watched.state.earnedTimeMs,0);
});

test('COM-02/22: guest linking unions personal mastery idempotently but cannot grant currency',async()=>{
 const user=await identity(),args=[[1,3],13,JSON.stringify([{level:1,score:100,seconds:20,peak:2,mode:'play',manualSeconds:20,cleanSeconds:20}]),JSON.stringify([[1,5]]),JSON.stringify([[1,5]])];
 const linked=await rpc(user,'game_link_progress($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)',args);
 assert.deepEqual(linked.mastery,{manual:[[1,1],[3,3]],clean:[[1,1],[3,3]]});assert.equal(linked.wallet.availableMs,0);assert.equal(linked.wallet.introClaimed,false);
 assert.equal(Number(linked.recent[0].best_manual_seconds),20);
 const again=await rpc(user,'game_link_progress($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)',args);assert.deepEqual(again.mastery,linked.mastery);assert.equal(again.wallet.availableMs,0);
 assert.equal((await db.query('select count(*)::integer n from public.game_runs where user_id=$1',[user])).rows[0].n,0);
});

test('compact ranges preserve old mastery without expanding a large imported frontier',async()=>{
 const user=await identity(),state=await rpc(user,'game_link_progress($1,1000000,\'[]\',\'[[1,1000000]]\',\'[[20,999999]]\')',[[1,2,3,4,5,6,7,8,9,10,11,12]]);
 assert.deepEqual(state.mastery.manual,[[1,999999]]);assert.deepEqual(state.mastery.clean,[[20,999999]]);
 assert.equal((await db.query('select count(*)::integer n from public.game_mastery where user_id=$1',[user])).rows[0].n,0);assert.equal(state.wallet.availableMs,0);
});

test('bad mastery payload rolls back linking instead of creating partial progress',async()=>{
 const user=await identity();
 for(const bad of ['{}','[[0,1]]','[[2,1]]','[[1.5,2]]','[["1",2]]','[[1,9007199254740991]]'])await assert.rejects(()=>rpc(user,'game_link_progress(array[1],13,\'[]\',$1::jsonb,\'[]\')',[bad]),/Invalid mastery/);
 assert.deepEqual((await rpc(user,'game_state()')).starter_completed,[]);
});

test('reward identity survives configuration/day changes and clients cannot call private minting rules',async()=>{
 const user=await identity(),first=await finish(user,1);
 await db.query("update public.game_manual_claims set eligibility_day=eligibility_day-1 where user_id=$1",[user]);
 assert.equal((await db.query('select public.game_reward_manual_run($1,$2) value',[user,first.id])).rows[0].value,0);
 assert.equal((await rpc(user,'game_time_state()')).availableMs,45000);
 await assert.rejects(()=>rpc(user,'game_reward_manual_run($1,$2)',[user,first.id]),/permission denied/);
 await assert.rejects(()=>rpc(user,"game_mastery_ranges($1,false)",[crypto.randomUUID()]),/permission denied/);
});

test('configuration is typed, versioned, immutable and cannot retroactively change grants',async()=>{
 const user=await identity(),first=await finish(user,1);const original=(await db.query("select settings from public.game_economy_config where version='2026-10-v1'")).rows[0].settings;
 for(const changed of [{...original,introMs:null},{...original,manualMs:1.5},{...original,manualMs:'15000'},{...original,activationMs:[null]},{...original,products:{time_300:{milliseconds:-1}}}])await assert.rejects(()=>db.query('insert into public.game_economy_config(version,settings) values($1,$2::jsonb)',[crypto.randomUUID(),JSON.stringify(changed)]));
 await assert.rejects(()=>db.query("update public.game_economy_config set settings=settings||'{\"introMs\":60000}' where current"),/new configuration version/);
 await assert.rejects(()=>rpc(user,'game_credit_verified($1,\'intro\',\'forged\',60000,\'web\',\'x\')',[user]),/permission denied/);
 try{
  await db.query('update public.game_economy_config set current=false where current');
  await db.query("insert into public.game_economy_config(version,current,settings) values('test-v2',true,$1::jsonb)",[JSON.stringify({...original,manualMs:1000,introMs:60000,maxActivationMs:15000,activationMs:[5000,15000]})]);
  const second=await finish(user,2);assert.equal(second.state.earnedTimeMs,1000);assert.equal(second.state.wallet.availableMs,46000);assert.equal(second.state.wallet.config.version,'test-v2');
  await finish(user,1,{id:first.id});assert.equal((await rpc(user,'game_time_state()')).availableMs,46000);
  const run=await start(user,3),id=crypto.randomUUID(),device=crypto.randomUUID();
  await assert.rejects(()=>rpc(user,'game_reserve_time($1,$2,$3,30000)',[id,device,run]),/Invalid time reservation/);
  const reservation=await rpc(user,'game_reserve_time($1,$2,$3,15000)',[id,device,run]);assert.equal(reservation.reservation.config_version,'test-v2');await rpc(user,'game_settle_time($1,$2,0)',[id,device]);
 }finally{await db.query('update public.game_economy_config set current=false where current');await db.query("update public.game_economy_config set current=true where version='2026-10-v1'");}
 const lot=(await db.query("select granted_ms,config_version from public.game_credit_lots where user_id=$1 and source='intro'",[user])).rows[0];assert.equal(Number(lot.granted_ms),30000);assert.equal(lot.config_version,'2026-10-v1');
});
