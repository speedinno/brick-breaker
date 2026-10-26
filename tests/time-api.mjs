// Disposable localhost integration fixture. Loaded only by server.mjs when
// QA_FIXTURES=1. No production credentials, store transaction or ad event.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createDefinition, definitionHash} from '../dist/catalog.js';
import {canonicalLayout} from '../dist/generated.js';
const user = '11111111-1111-4111-8111-111111111111';
let db, queue = Promise.resolve();
async function initialize(milliseconds = 60000) {
  await db?.close(); db = new PGlite();
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${user}');`);
  for (const name of ['202610210001_game.sql','202610210002_catalog_budget.sql','202610260001_time_ledger.sql','202610260002_rewards_mastery.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+name, import.meta.url), 'utf8'));
  for (let level=1;level<=12;level++) {
    const definition=createDefinition(level);
    await db.query('select public.game_publish_level($1,$2::jsonb,$3,$4)',[level,JSON.stringify(definition),canonicalLayout(definition.layout),await definitionHash(definition)]);
  }
  if(milliseconds>0)await db.query("select public.game_credit_verified($1,'intro','localhost-fixture',$2,'server','fixture-v1')",[user,milliseconds]);
}
async function handle(body) {
  if(body.action==='qa-reset'){await initialize(Number.isSafeInteger(body.milliseconds)&&body.milliseconds>=0?body.milliseconds:60000);return {fixture:true};}
  if(!db)await initialize();
  if(body.accountId!==user)throw Error('Test identity mismatch');
  if(body.action==='qa-ledger')return (await db.query('select kind,sum(amount_ms)::integer as ms from public.game_time_ledger group by kind')).rows;
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`);
  async function rpc(sql,args=[]){return (await db.query('select public.'+sql+' as value',args)).rows[0].value;}
  try{
    switch(body.action){
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
