import {migrateGame} from './db-migrations.mjs';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createDefinition,definitionHash} from '../dist/catalog.js';
import {canonicalLayout} from '../dist/generated.js';
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
let db;
async function asUser(id,sql,args=[]){await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);try{return await db.query(sql,args);}finally{await db.exec('reset role');}}
async function publish(level){const d=createDefinition(level);return (await db.query('select public.game_publish_level($1,$2::jsonb,$3,$4) as value',[level,JSON.stringify(d),canonicalLayout(d.layout),await definitionHash(d)])).rows[0].value;}
before(async()=>{
 db=new PGlite();await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;insert into auth.users values('${alice}'),('${bob}');`);
 await migrateGame(db);
 for(let n=1;n<=14;n++)await publish(n);
});
after(async()=>{await db?.close();});
test('Postgres RLS and permissions isolate accounts and forbid direct progress/catalog writes',async()=>{
 await asUser(alice,'select public.game_state()');await asUser(bob,'select public.game_state()');
 const rows=await asUser(alice,'select user_id from public.game_players');assert.deepEqual(rows.rows.map(r=>r.user_id),[alice]);
 await assert.rejects(()=>asUser(alice,'update public.game_players set highest_unlocked=999 where user_id=$1',[alice]),/permission denied/i);
 await assert.rejects(()=>asUser(alice,'delete from public.game_catalog'),/permission denied/i);
 await assert.rejects(()=>asUser(alice,"select public.game_publish_level(999,'{}','x','x')"),/permission denied/i);
 const locked=await asUser(alice,'select level from public.game_catalog where level=13');assert.equal(locked.rows.length,0);
});
test('catalog insert is idempotent and duplicate structural hashes cannot be assigned to another stage',async()=>{
 const a=await publish(13),b=await publish(13);assert.deepEqual(a,b);
 const d={...a.definition,level:999};await assert.rejects(()=>db.query('select public.game_publish_level($1,$2::jsonb,$3,$4)',[999,JSON.stringify(d),canonicalLayout(d.layout),a.layout_hash]),/unique|duplicate/i);
 assert.equal((await db.query('select count(*) as n from public.game_catalog where level=999')).rows[0].n,0);
});
test('database blocks stage skipping, cross-user runs, forged scores and replayed advancement',async()=>{
 await assert.rejects(()=>asUser(alice,'select public.game_start(13,$1)',[crypto.randomUUID()]),/locked/i);
 for(let level=1;level<=12;level++){
  const id=crypto.randomUUID(),stage=await publish(level),score=[...stage.definition.layout].filter(t=>t==='b'||t==='g').length*10+1000;
  const start=await asUser(alice,'select public.game_start($1,$2) as run',[level,id]);assert.equal(start.rows[0].run.runId,id);
  const duplicate=await asUser(alice,'select public.game_start($1,$2) as run',[level,id]);assert.deepEqual(duplicate.rows[0].run,start.rows[0].run);
  await db.query("update public.game_runs set started_at=now()-interval '3 seconds' where id=$1",[id]);
  await assert.rejects(()=>asUser(bob,'select public.game_complete($1,$2,$3,1,10,\'play\')',[id,stage.layout_hash,score]),/Unknown run/);
  await assert.rejects(()=>asUser(alice,'select public.game_complete($1,$2,99999999,1,10,\'play\')',[id,stage.layout_hash]),/Invalid stage score/);
  const done=await asUser(alice,"select public.game_complete($1,$2,$3,1,10,'play') as state",[id,stage.layout_hash,score]);
  assert.equal(done.rows[0].state.starter_completed.length,level);assert.equal(done.rows[0].state.highest_unlocked,level===12?13:12);
  await asUser(alice,"select public.game_complete($1,$2,$3,1,10,'play')",[id,stage.layout_hash,score]);
 }
 assert.equal((await asUser(alice,'select count(*) as n from public.game_completions')).rows[0].n,12);
 const available=await asUser(alice,'select level from public.game_catalog where level>=13');assert.deepEqual(available.rows.map(r=>Number(r.level)),[13]);
});
test('guest import validates the starter requirement and cannot change another account',async()=>{
 await assert.rejects(()=>asUser(bob,"select public.game_import_progress(array[1],99,'[]')"),/Complete all starter/);
 const imported=await asUser(bob,"select public.game_import_progress(array[1,2,3,4,5,6,7,8,9,10,11,12],15,'[]') as state");assert.equal(imported.rows[0].state.highest_unlocked,15);
 assert.equal(imported.rows[0].state.selected_level,15);
 const a=await asUser(alice,'select public.game_state() as state');assert.equal(a.rows[0].state.highest_unlocked,13);
});
test('v3-v8 starter runs retain their hashes while new signed-in runs use v9 boards',async()=>{
 const newer=await publish(1),original={...newer.definition,version:3},layout=[...newer.definition.layout];
 for(const c of [23,24,27,28])layout[51*52+c]='w';original.layout=layout.join('');
 const oldHash=await definitionHash(original),oldRun=crypto.randomUUID();
 await db.query('insert into public.game_catalog(version,level,definition,canonical_layout,layout_hash) values(3,1,$1::jsonb,$2,$3)',[JSON.stringify(original),canonicalLayout(original.layout),oldHash]);
 await db.query("insert into public.game_runs(id,user_id,version,level,layout_hash,started_at) values($1,$2,3,1,$3,now()-interval '3 seconds')",[oldRun,bob,oldHash]);
 const newRun=crypto.randomUUID(),started=await asUser(bob,'select public.game_start(1,$1) as run',[newRun]);
 assert.equal(started.rows[0].run.layout_hash,newer.layout_hash);
 assert.equal((await db.query('select version from public.game_runs where id=$1',[newRun])).rows[0].version,9);
 const oldScore=[...original.layout].filter(t=>t==='b'||t==='g').length*10+1000;
 const completed=await asUser(bob,"select public.game_complete($1,$2,$3,1,10,'play') as state",[oldRun,oldHash,oldScore]);
 assert(completed.rows[0].state.starter_completed.includes(1));
 const previous={...newer.definition,version:4},priorLayout=[...newer.definition.layout];
 for(const c of [21,22,29,30])priorLayout[51*52+c]='w';previous.layout=priorLayout.join('');
 const previousHash=await definitionHash(previous),previousRun=crypto.randomUUID();
 await db.query('insert into public.game_catalog(version,level,definition,canonical_layout,layout_hash) values(4,1,$1::jsonb,$2,$3)',[JSON.stringify(previous),canonicalLayout(previous.layout),previousHash]);
 await db.query("insert into public.game_runs(id,user_id,version,level,layout_hash,started_at) values($1,$2,4,1,$3,now()-interval '3 seconds')",[previousRun,bob,previousHash]);
 const previousScore=[...previous.layout].filter(t=>t==='b'||t==='g').length*10+1000;
 const previousClear=await asUser(bob,"select public.game_complete($1,$2,$3,1,10,'play') as state",[previousRun,previousHash,previousScore]);
 assert(previousClear.rows[0].state.starter_completed.includes(1));
 const v5={...newer.definition,version:5},v5Layout=[...newer.definition.layout];
 for(const c of [19,20,31,32])v5Layout[51*52+c]='w';v5.layout=v5Layout.join('');
 const v5Hash=await definitionHash(v5),v5Run=crypto.randomUUID();
 await db.query('insert into public.game_catalog(version,level,definition,canonical_layout,layout_hash) values(5,1,$1::jsonb,$2,$3)',[JSON.stringify(v5),canonicalLayout(v5.layout),v5Hash]);
 await db.query("insert into public.game_runs(id,user_id,version,level,layout_hash,started_at) values($1,$2,5,1,$3,now()-interval '3 seconds')",[v5Run,bob,v5Hash]);
 const v5Score=[...v5.layout].filter(t=>t==='b'||t==='g').length*10+1000;
 const v5Clear=await asUser(bob,"select public.game_complete($1,$2,$3,1,10,'play') as state",[v5Run,v5Hash,v5Score]);
 assert(v5Clear.rows[0].state.starter_completed.includes(1));
 const v6={...newer.definition,version:6},v6Layout=[...newer.definition.layout];
 for(const c of [17,18,33,34])v6Layout[51*52+c]='w';v6.layout=v6Layout.join('');
 const v6Hash=await definitionHash(v6),v6Run=crypto.randomUUID();
 await db.query('insert into public.game_catalog(version,level,definition,canonical_layout,layout_hash) values(6,1,$1::jsonb,$2,$3)',[JSON.stringify(v6),canonicalLayout(v6.layout),v6Hash]);
 await db.query("insert into public.game_runs(id,user_id,version,level,layout_hash,started_at) values($1,$2,6,1,$3,now()-interval '3 seconds')",[v6Run,bob,v6Hash]);
 const v6Score=[...v6.layout].filter(t=>t==='b'||t==='g').length*10+1000;
 const v6Clear=await asUser(bob,"select public.game_complete($1,$2,$3,1,10,'play') as state",[v6Run,v6Hash,v6Score]);
 assert(v6Clear.rows[0].state.starter_completed.includes(1));
 const v7={...newer.definition,version:7},v7Layout=[...newer.definition.layout];
 for(const c of [22,23,28,29])v7Layout[51*52+c]='w';v7.layout=v7Layout.join('');
 const v7Hash=await definitionHash(v7),v7Run=crypto.randomUUID();
 await db.query('insert into public.game_catalog(version,level,definition,canonical_layout,layout_hash) values(7,1,$1::jsonb,$2,$3)',[JSON.stringify(v7),canonicalLayout(v7.layout),v7Hash]);
 await db.query("insert into public.game_runs(id,user_id,version,level,layout_hash,started_at) values($1,$2,7,1,$3,now()-interval '3 seconds')",[v7Run,bob,v7Hash]);
 const v7Score=[...v7.layout].filter(t=>t==='b'||t==='g').length*10+1000;
 const v7Clear=await asUser(bob,"select public.game_complete($1,$2,$3,1,10,'play') as state",[v7Run,v7Hash,v7Score]);
 assert(v7Clear.rows[0].state.starter_completed.includes(1));
 const v8={...newer.definition,version:8},v8Layout=[...newer.definition.layout];
 for(const c of [24,25,26,27])v8Layout[50*52+c]='w';v8.layout=v8Layout.join('');
 const v8Hash=await definitionHash(v8),v8Run=crypto.randomUUID();
 await db.query('insert into public.game_catalog(version,level,definition,canonical_layout,layout_hash) values(8,1,$1::jsonb,$2,$3)',[JSON.stringify(v8),canonicalLayout(v8.layout),v8Hash]);
 await db.query("insert into public.game_runs(id,user_id,version,level,layout_hash,started_at) values($1,$2,8,1,$3,now()-interval '3 seconds')",[v8Run,bob,v8Hash]);
 const v8Score=[...v8.layout].filter(t=>t==='b'||t==='g').length*10+1000;
 const v8Clear=await asUser(bob,"select public.game_complete($1,$2,$3,1,10,'play') as state",[v8Run,v8Hash,v8Score]);
 assert(v8Clear.rows[0].state.starter_completed.includes(1));
});
test('deleting an auth identity cascades private history but keeps shared stages',async()=>{
 await db.query('delete from auth.users where id=$1',[alice]);
 assert.equal((await db.query('select count(*) as n from public.game_completions where user_id=$1',[alice])).rows[0].n,0);
 assert.equal((await db.query('select count(*) as n from public.game_runs where user_id=$1',[alice])).rows[0].n,0);
 assert.equal((await db.query('select count(*) as n from public.game_catalog')).rows[0].n,20);
});
test('imported frontiers cannot request unlimited unpublished layouts or reset the quota',async()=>{
 await asUser(bob,"select public.game_import_progress(array[1,2,3,4,5,6,7,8,9,10,11,12],9999,'[]')");
 await assert.rejects(()=>asUser(bob,'select public.game_prepare_level(10000)'),/locked/);
 for(let n=0;n<120;n++)await asUser(bob,'select public.game_prepare_level(9000)');
 await assert.rejects(()=>asUser(bob,'select public.game_prepare_level(9001)'),/Too many new stages/);
 // Existing shared designs remain available, and an importer cannot reset the
 // budget through normal progress import or direct row updates.
 await asUser(bob,'select public.game_prepare_level(13)');
 await asUser(bob,"select public.game_import_progress(array[1,2,3,4,5,6,7,8,9,10,11,12],9999,'[]')");
 await assert.rejects(()=>asUser(bob,'select public.game_prepare_level(9001)'),/Too many new stages/);
 await assert.rejects(()=>asUser(bob,'update public.game_players set catalog_requests=0'),/permission denied/);
 await db.query("update public.game_players set catalog_window=now()-interval '11 minutes' where user_id=$1",[bob]);
 await asUser(bob,'select public.game_prepare_level(9001)');
});
