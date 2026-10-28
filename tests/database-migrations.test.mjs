import {test,before} from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {baselineVersions,loadMigrations,managementDatabase,migrationBody,migrationPlan,migrationStatement,baselineObservationQuery,baselineAdoptionStatement,fingerprint} from '../scripts/database-migrations.mjs';
import {migrateDatabase} from '../scripts/migrate-database.mjs';
let files;before(async()=>{files=await loadMigrations();});
async function fixture({baseline=false}={}){
 const db=new PGlite();await db.exec("create schema auth;create table auth.users(id uuid primary key,email text);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;alter default privileges in schema public grant execute on functions to service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 if(baseline)for(const file of files.filter(row=>baselineVersions.includes(row.version)))await db.exec(file.source);
 const query=async(sql)=>{try{return(await db.query(sql)).rows;}catch(error){throw Error(error.message);}};
 return {db,query};
}
test('live-style manual baseline is recognized without writes; atomic adoption and all migrations preserve progress',async()=>{
 const {db,query}=await fixture({baseline:true});try{
  const id=crypto.randomUUID();await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into game_players(user_id,starter_completed) values($1,$2)',[id,[1,2,3,4,5,6]]);
  const plan=await migrateDatabase({query,files});assert.equal(plan.baselineRecognized,true);assert.equal(plan.files.filter(row=>row.state==='adopt-baseline').length,2);assert.equal((await query("select to_regclass('public.game_schema_revisions') as value"))[0].value,null);
  await assert.rejects(()=>migrateDatabase({query,files,apply:true}),/adopt-existing-baseline/);
  const result=await migrateDatabase({query,files,apply:true,adoptBaseline:true});assert.equal(result.applied.length,18);assert.ok(result.files.every(row=>row.state==='installed'));
  assert.deepEqual((await db.query('select starter_completed from game_players where user_id=$1',[id])).rows[0].starter_completed,[1,2,3,4,5,6]);
  assert.equal((await query('select count(*)::int as count from game_wallets'))[0].count,1);
  assert.equal((await query('select count(*)::int as count from game_schema_revisions where adopted'))[0].count,2);
  for(const role of ['anon','authenticated','service_role'])await assert.rejects(()=>db.exec(`set role ${role};select * from public.game_schema_revisions;`),/permission denied/).finally(()=>db.exec('reset role'));
  assert.deepEqual((await migrateDatabase({query,files,apply:true})).applied,[]);
 }finally{await db.close();}
});
test('lost adoption and migration acknowledgements resume from committed checksums without repeating DDL',async()=>{
 const {db,query}=await fixture({baseline:true});try{
  let dropAdoption=true;const flaky=async(sql,options)=>{const result=await query(sql);if(options?.readOnly===false&&dropAdoption){dropAdoption=false;throw Error('simulated lost ACK');}return result;};
  await assert.rejects(()=>migrateDatabase({query:flaky,files,apply:true,adoptBaseline:true}),/lost ACK/);
  assert.equal((await query('select count(*)::int as count from game_schema_revisions'))[0].count,2);
  let dropDDL=true;const flakyDDL=async(sql,options)=>{const result=await query(sql);if(options?.readOnly===false&&dropDDL){dropDDL=false;throw Error('simulated lost ACK');}return result;};
  await assert.rejects(()=>migrateDatabase({query:flakyDDL,files,apply:true}),/lost ACK/);
  assert.equal((await query('select count(*)::int as count from game_schema_revisions'))[0].count,3);
  const recovered=await migrateDatabase({query,files,apply:true});assert.equal(recovered.applied.length,15);
 }finally{await db.close();}
});
test('a fresh schema installs the original files normally and failed DDL rolls back its journal atomically',async()=>{
 const {db,query}=await fixture();try{
  const broken={version:'202610200001',checksum:'a'.repeat(64),body:'create table game_should_rollback(id int); select game_missing_function();'};
  await assert.rejects(()=>query(migrationStatement(broken)),/game_missing_function/);
  assert.equal((await query("select to_regclass('game_should_rollback') as scratch,to_regclass('game_schema_revisions') as journal"))[0].scratch,null);
  assert.equal((await query("select to_regclass('game_schema_revisions') as journal"))[0].journal,null);
  const result=await migrateDatabase({query,files,apply:true});assert.equal(result.applied.length,18);assert.equal((await query('select count(*)::int as count from game_schema_revisions where adopted'))[0].count,0);
 }finally{await db.close();}
});
test('untracked drift, changes between inspection and adoption, checksum conflicts and history gaps fail closed',async()=>{
 const {db,query}=await fixture({baseline:true});try{
  const observed=(await query(baselineObservationQuery))[0];const adoption=baselineAdoptionStatement(files,{digest:observed.digest,baselineFingerprint:fingerprint(observed.schema)});
  await db.exec('alter table game_players alter column highest_unlocked set default 13');
  await assert.rejects(()=>migrateDatabase({query,files,apply:true,adoptBaseline:true}),/differs from the original/);
  await assert.rejects(()=>query(adoption),/Baseline changed/);assert.equal((await query("select to_regclass('game_schema_revisions') as value"))[0].value,null);
  await db.exec('alter table game_players alter column highest_unlocked set default 12');await query(adoption);
  await assert.rejects(()=>query(migrationStatement({...files[0],checksum:'f'.repeat(64)})),/checksum conflict/);
  assert.throws(()=>migrationPlan(files,[{...files[0],adopted:true}]),/Incomplete baseline/);
  assert.throws(()=>migrationPlan(files,[{...files[1],adopted:false}]),/contiguous prefix/);
  await assert.rejects(()=>query(migrationStatement(files[3],{predecessor:files[2].version})),/predecessor missing/);
 }finally{await db.close();}
});
test('safe management requests are read-only by default and do not expose provider bodies or credentials',async()=>{
 const settings=name=>({SUPABASE_URL:'https://fixtureproject.supabase.co',SUPABASE_ACCESS_TOKEN:'private-test-token'})[name];let seen;
 const query=managementDatabase(settings,{request:async(url,init)=>{seen={url,init};return new Response('[]',{status:201});}});
 await query('select 1');assert.equal(JSON.parse(seen.init.body).read_only,true);assert.equal(seen.init.headers.Authorization,'Bearer private-test-token');await query('do $$begin end$$',{readOnly:false});assert.equal(JSON.parse(seen.init.body).read_only,false);
 const bad=managementDatabase(settings,{request:async()=>new Response('private-test-token sensitive body',{status:403})});await assert.rejects(()=>bad('select 1'),error=>error.message.includes('HTTP 403')&&!error.message.includes('private-test-token')&&!error.message.includes('sensitive body'));
 const transport=managementDatabase(settings,{request:async()=>{throw Error('private-test-token');}});await assert.rejects(()=>transport('select 1'),/inspect migration history/);
 for(const url of ['http://fixtureproject.supabase.co','https://private@fixtureproject.supabase.co','https://fixtureproject.supabase.co?secret=x','https://other.example'])assert.throws(()=>managementDatabase(name=>name==='SUPABASE_URL'?url:'private'),/configuration/);
});
test('outer transaction parsing and dollar quoting accept original SQL and reject unsupported transaction forms',async()=>{
 assert.equal(migrationBody('-- intro\r\nbegin;\r\nselect 1;\r\ncommit;\r\n'),'\nselect 1;\n');
 for(const sql of ['select 1;','begin; select 1;','begin;\ncommit;\nselect 1;\ncommit;'])assert.throws(()=>migrationBody(sql),/transaction/);
 const {db,query}=await fixture();try{
  const file={version:'202610200001',checksum:'a'.repeat(64),body:"create table game_dollar_test(value text); insert into game_dollar_test values('$game_apply$ $game_migration$');"};
  await query(migrationStatement(file));assert.equal((await query('select value from game_dollar_test'))[0].value,'$game_apply$ $game_migration$');await query(migrationStatement(file));assert.equal((await query('select count(*)::int as count from game_dollar_test'))[0].count,1);
 }finally{await db.close();}
});
