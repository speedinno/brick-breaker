import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {migrateGame} from './db-migrations.mjs';import {RevenueCatPrivacy,runPrivacyBatch} from '../supabase/functions/_shared/privacy.js';
import {deletionStatus,prepareAccountDeletion,deletePreparedAccount} from '../supabase/functions/_shared/account-deletion.js';
import {nativeCatalog,persistVerifiedPurchase} from '../supabase/functions/_shared/native-commerce.js';
import {discoverPrivacyBatch} from '../scripts/privacy-discovery.mjs';
import {mkdtemp,rmdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
let db;const project='proj_privacy';
before(async()=>{db=new PGlite();await db.exec(`create schema auth;create table auth.users(id uuid primary key,email text);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema auth,public to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);await migrateGame(db);});
after(async()=>db?.close());
const query=(sql,args=[])=>db.query(sql,args),value=async(sql,args=[])=>(await query(sql,args)).rows[0]?.value;
async function account(email=null){const user=crypto.randomUUID();await query('insert into auth.users(id,email) values($1,$2)',[user,email]);return user;}
const note=(user,scope=project,environment='sandbox')=>query('select game_privacy_note_account($1,$2,$3)',[user,scope,environment]);
const remove=user=>query('delete from auth.users where id=$1',[user]);
const jobs=user=>query('select j.*,p.provider,p.scope,p.environment from game_privacy_jobs j join game_privacy_processors p on p.id=j.processor_id where subject_hash=game_privacy_subject($1) order by p.provider',[user]).then(r=>r.rows);
const due=id=>query("update game_privacy_jobs set next_attempt_at=now()-interval '1 second' where id=$1",[id]);
const claim=()=>value('select game_claim_privacy_jobs(1) as value');
const finish=(job,result)=>value('select game_finish_privacy_job($1,$2,$3,$4) as value',[job.id,job.generation,job.leaseToken,result]);
async function queued(){const user=await account();await note(user);await remove(user);const [job]=await jobs(user);await due(job.id);return{user,job};}
test('deletion, private provider outbox and a recoverable receipt commit or roll back together',async()=>{
 const user=await account('fixture@example.invalid'),receipt=crypto.randomUUID();await note(user);
 assert.equal((await value('select game_prepare_account_deletion($1,$2) as value',[user,receipt])).requestId,receipt);
 assert.equal((await value('select game_prepare_account_deletion($1,$2) as value',[user,receipt])).requestId,receipt);
 const secondReceipt=crypto.randomUUID();assert.equal((await value('select game_prepare_account_deletion($1,$2) as value',[user,secondReceipt])).requestId,secondReceipt);
 await db.exec('begin');await remove(user);assert.equal((await jobs(user)).length,2);await db.exec('rollback');
 assert.equal((await jobs(user)).length,0);assert.equal(await value('select count(*)::integer as value from game_privacy_deleted where subject_hash=game_privacy_subject($1)',[user]),0);
 await remove(user);const rows=await jobs(user);assert.equal(rows.length,2);assert.equal(rows.find(j=>j.provider==='revenuecat').subject,user);assert.equal(rows.find(j=>j.provider==='mail_delivery').state,'manual_review');
 assert.equal(await value('select user_id is null and deleted_at is not null as value from game_deletion_requests where id=$1',[receipt]),true);
 assert.equal(await value('select user_id is null and deleted_at is not null as value from game_deletion_requests where id=$1',[secondReceipt]),true);
 assert.equal(await value('select count(*)::integer as value from game_privacy_accounts where user_id=$1',[user]),0);
});
test('identity registrations cannot mix environments and stale receipts cannot delete another account',async()=>{
 const user=await account(),other=await account(),receipt=crypto.randomUUID();await note(user);await note(user);
 await assert.rejects(()=>note(user,project,'production'),/separate RevenueCat project/);
 await query('select game_prepare_account_deletion($1,$2)',[user,receipt]);await assert.rejects(()=>query('select game_prepare_account_deletion($1,$2)',[other,receipt]),/identity conflict/);
 assert.equal(await value('select game_privacy_requeue_deleted($1,$2,$3) as value',[user,project,'sandbox']),false);
});
test('an asynchronous deletion stays pending until two confirmed absences a day apart',async()=>{
 const {user,job}=await queued();let leased=(await claim())[0];assert.equal(leased.id,job.id);assert.deepEqual(await claim(),[]);
 assert.equal(await finish(leased,'queued'),true);assert.equal((await jobs(user))[0].state,'verifying');
 await due(job.id);leased=(await claim())[0];await finish(leased,'absent');assert.equal((await jobs(user))[0].subject,user);
 await due(job.id);leased=(await claim())[0];await finish(leased,'absent');assert.equal((await jobs(user))[0].state,'verifying');
 await query("update game_privacy_jobs set absent_since=now()-interval '25 hours',next_attempt_at=now()-interval '1 second' where id=$1",[job.id]);leased=(await claim())[0];await finish(leased,'absent');
 const done=(await jobs(user))[0];assert.equal(done.state,'done');assert.equal(done.subject,null);assert.equal(done.outcome,'provider_absent');assert.match(done.subject_hash,/^[a-f0-9]{64}$/);
});
test('late verified receipts invalidate leases, restore redacted subjects and cannot mint credit',async()=>{
 const {user,job}=await queued(),leased=(await claim())[0];
 assert.equal(await value('select game_privacy_requeue_deleted($1,$2,$3) as value',[user,project,'sandbox']),true);assert.equal(await finish(leased,'absent'),false);
 assert.equal((await jobs(user))[0].generation,leased.generation+1);
 await query("update game_privacy_jobs set state='done',subject=null,outcome='provider_absent',finished_at=now() where id=$1",[job.id]);
 await query('select game_privacy_requeue_deleted($1,$2,$3)',[user,project,'sandbox']);const renewed=(await jobs(user))[0];assert.equal(renewed.subject,user);assert.equal(renewed.state,'pending');assert.equal(renewed.outcome,null);
 // The production receipt orchestrator schedules erasure only on the
 // database's existing account-deleted tombstone result, never a client hint.
 const calls=[];const admin={rpc:async(name,args)=>{calls.push({name,args});return{data:name==='game_record_purchase'?{state:'account-deleted'}:true};}};
 await persistVerifiedPurchase(admin,{user,environment:'sandbox'},project);assert.equal(calls[1].name,'game_privacy_requeue_deleted');assert.equal(calls[1].args.p_user,user);
 await query("update game_privacy_jobs set next_attempt_at=now()+interval '2 days' where id=$1",[job.id]);
});
test('retryable errors back off; invalid configuration and email retention require explicit review',async()=>{
 const {user,job}=await queued();let leased=(await claim())[0];await finish(leased,'rate_limited');let row=(await jobs(user))[0];assert.equal(row.state,'pending');assert(new Date(row.next_attempt_at)>new Date());
 await due(job.id);leased=(await claim())[0];await finish(leased,'permission_denied');row=(await jobs(user))[0];assert.equal(row.state,'manual_review');assert.equal(row.subject,user);assert.deepEqual(await claim(),[]);
 assert.equal(await value('select game_retry_privacy_job($1) as value',[job.id]),true);leased=(await claim())[0];assert.equal(leased.generation,row.generation+1);await finish(leased,'invalid_response');
 await assert.rejects(()=>query("select game_resolve_manual_privacy($1,'manual_erased','person@example.invalid')",[job.id]),/non-contact/);
 assert.equal(await value("select game_resolve_manual_privacy($1,'manual_retained','privacy-ticket-100') as value",[job.id]),true);row=(await jobs(user))[0];assert.equal(row.subject,null);assert.equal(row.outcome,'manual_retained');assert.equal(row.resolution_reference,'privacy-ticket-100');
});
test('expired worker acknowledgements cannot finalize a newer lease',async()=>{
 const {job}=await queued(),first=(await claim())[0];await query("update game_privacy_jobs set lease_until=now()-interval '1 second' where id=$1",[job.id]);const second=(await claim())[0];assert.notEqual(second.leaseToken,first.leaseToken);assert.equal(await finish(first,'absent'),false);assert.equal(await finish(second,'config_missing'),true);
});
test('authenticated and anonymous roles cannot read identities, forge receipts, or finish jobs',async()=>{
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{for(const sql of ['select * from game_privacy_jobs','select * from game_deletion_requests','select * from game_privacy_deleted','select game_claim_privacy_jobs(1)'])await assert.rejects(()=>db.exec(sql),/permission denied/);}finally{await db.exec('reset role');}}
});
test('catalog registers the authenticated provider identity before exposing a native SDK key',async()=>{
 const order=[],commerce={keys:{android:'goog_publicFixture'},verifier:{projectId:project,environment:'sandbox',products:new Map()}};
 const result=await nativeCatalog(commerce,{rpc:async(name,args)=>{order.push({name,args});return{};}},'android','owner');assert.equal(result.publicKey,'goog_publicFixture');assert.equal(order[0].name,'game_privacy_note_account');assert.equal(order[0].args.p_user,'owner');
 await assert.rejects(()=>nativeCatalog(commerce,{rpc:async()=>({error:{message:'private'}})},'android','owner'),/privacy settings/);
});
function providerFixture(handler,overrides={}){const calls=[],subject=crypto.randomUUID(),now=Date.now();const provider=new RevenueCatPrivacy({projectId:project,environment:'sandbox',apiKey:'sk_private_fixture',now:()=>now,fetch:async(url,options)=>{calls.push({url,method:options.method});assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer sk_private_fixture');return handler(new URL(url),options,subject,now);},...overrides});return{calls,subject,provider,job:{subject,scope:project,environment:'sandbox',provider:'revenuecat'}};}
const projects=()=>Response.json({object:'list',items:[{object:'project',id:project}],next_page:null});
test('provider adapter proves project access, binds customer identity, and treats DELETE 200 as queued',async()=>{
 const f=providerFixture((url,options,subject,now)=>url.pathname==='/v2/projects'?projects():Response.json(options.method==='GET'?{object:'customer',id:subject,project_id:project}:{object:'customer',id:subject,deleted_at:now}));
 assert.equal(await f.provider.erase(f.job),'queued');assert.deepEqual(f.calls.map(c=>c.method),['GET','GET','DELETE']);
 const wrong=providerFixture(url=>url.pathname==='/v2/projects'?projects():Response.json({object:'customer',id:crypto.randomUUID(),project_id:project}));await assert.rejects(()=>wrong.provider.erase(wrong.job),{code:'invalid_response'});
 assert(!wrong.calls.some(c=>c.method==='DELETE'));
});
test('a missing or inaccessible project never turns a customer 404 into erasure success',async()=>{
 for(const [response,code] of [[()=>Response.json({object:'list',items:[],next_page:null}),'config_missing'],[()=>new Response('',{status:403}),'permission_denied'],[()=>new Response('',{status:404}),'config_missing']]){
  const f=providerFixture(response);await assert.rejects(()=>f.provider.erase(f.job),{code});assert.equal(f.calls.length,1);
 }
 const absent=providerFixture(url=>url.pathname==='/v2/projects'?projects():new Response('',{status:404}));assert.equal(await absent.provider.erase(absent.job),'absent');assert.equal(absent.calls.length,2);
});
test('project discovery follows bounded verified cursors and never forwards credentials off origin',async()=>{
 const f=providerFixture(url=>url.pathname==='/v2/projects'?(url.searchParams.has('starting_after')?projects():Response.json({object:'list',items:[{object:'project',id:'proj_other'}],next_page:'/v2/projects?starting_after=proj_other'})):new Response('',{status:404}));assert.equal(await f.provider.erase(f.job),'absent');assert.equal(new URL(f.calls[1].url).searchParams.get('starting_after'),'proj_other');
 for(const next of ['https://evil.invalid/v2/projects?starting_after=proj_other','/v2/projects?starting_after=wrong','/v2/projects?starting_after=proj_other&starting_after=proj_other']){const bad=providerFixture(()=>Response.json({object:'list',items:[{object:'project',id:'proj_other'}],next_page:next}));await assert.rejects(()=>bad.provider.erase(bad.job),{code:'invalid_response'});assert.equal(bad.calls.length,1);}
});
test('provider failures are classified without retaining response contacts, tokens, or unbounded bodies',async()=>{
 for(const [status,code] of [[401,'permission_denied'],[429,'rate_limited'],[503,'upstream_error'],[423,'upstream_error'],[400,'invalid_response']]){const f=providerFixture(()=>new Response('private diagnostic',{status}));await assert.rejects(()=>f.provider.erase(f.job),error=>error.code===code&&!error.message.includes('private'));}
 const large=providerFixture(()=>new Response('x'.repeat(65537)));await assert.rejects(()=>large.provider.erase(large.job),{code:'invalid_response'});
 const offline=providerFixture(()=>{throw Error('private URL');});await assert.rejects(()=>offline.provider.erase(offline.job),{code:'network'});
});
test('bounded workers claim just in time and preserve unknown configurations for operator review',async()=>{
 const {job}=await queued(),events=[];const admin={rpc:async(name,args)=>{events.push(name);try{if(name==='game_claim_privacy_jobs')return{data:await claim()};return{data:await value('select game_finish_privacy_job($1,$2,$3,$4) as value',[args.p_id,args.p_generation,args.p_lease,args.p_result])};}catch(error){return{error};}}};
 const result=await runPrivacyBatch({admin,providers:new Map(),batch:1});assert.equal(result.review,1);assert.equal(result.acknowledged,1);assert.deepEqual(events,['game_claim_privacy_jobs','game_finish_privacy_job']);assert.equal(await value('select state as value from game_privacy_jobs where id=$1',[job.id]),'manual_review');
 let calls=0;const stopped=await runPrivacyBatch({admin:{rpc:async()=>{calls++;}},providers:new Map(),halt:()=>true});assert.equal(calls,0);assert.equal(stopped.claimed,0);
});
test('deletion orchestrator requires fresh authentication and lost-response status exposes only a boolean',async()=>{
 const user=await account(),now=Date.now(),requestId=crypto.randomUUID(),authUser={id:user,last_sign_in_at:new Date(now).toISOString()};
 const admin={rpc:async(_name,args)=>{try{return{data:await value('select game_prepare_account_deletion($1,$2) as value',[args.p_user,args.p_request])};}catch(error){return{error};}},auth:{admin:{deleteUser:async id=>{await remove(id);return{};}}},from:table=>{assert.equal(table,'game_deletion_requests');return{select:columns=>{assert.equal(columns,'deleted_at');return{eq:(key,id)=>{assert.equal(key,'id');return{maybeSingle:async()=>({data:(await query('select deleted_at from game_deletion_requests where id=$1',[id])).rows[0]??null})};}};}};}};
 await assert.rejects(()=>prepareAccountDeletion(admin,{...authUser,last_sign_in_at:new Date(now-901000).toISOString()},requestId,now),{status:409});
 const prepared=await prepareAccountDeletion(admin,authUser,requestId,now);assert.equal(prepared.requestId,requestId);assert.deepEqual(await deletionStatus(admin,requestId),{deleted:false});
 assert.deepEqual(await deletePreparedAccount(admin,authUser,requestId,now),{requestId,deleted:true,providerCleanup:'queued'});assert.deepEqual(await deletionStatus(admin,requestId),{deleted:true});assert.deepEqual(await deletionStatus(admin,crypto.randomUUID()),{deleted:false});await assert.rejects(()=>deletionStatus(admin,user+'x'),{status:400});
});
test('the privacy CLI fails closed before network work when setup or command arguments are missing',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'brick-privacy-')),env={...process.env};for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','MONETIZATION_ENVIRONMENT','PRIVACY_REVENUECAT_KEYS_JSON'])delete env[key];
 try{for(const args of [[],['--batch','51'],['--resolve-manual',crypto.randomUUID(),'--outcome','erased','--reference','person@example.invalid']]){const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/reconcile-privacy.mjs',import.meta.url)),...args],{cwd:directory,env,encoding:'utf8',timeout:10000});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/Privacy recovery is not configured|Choose one privacy/);}}
 finally{await rmdir(directory);}
});
test('customer discovery schedules only known retired identities and exact replay does not invalidate a worker',async()=>{
 const retired=await account(),active=await account(),unknown=crypto.randomUUID(),observation=crypto.randomUUID();await remove(retired);
 const observe=(id,subjects,scope=project,environment='sandbox')=>value('select game_discover_privacy_customers($1,$2,$3,$4) as value',[id,scope,environment,subjects]);
 assert.equal(await observe(observation,[unknown,retired,active]),1);assert.equal((await jobs(active)).length,0);assert.equal((await jobs(unknown)).length,0);const [job]=await jobs(retired);assert.equal(job.subject,retired);await due(job.id);const leased=(await claim())[0];assert.equal(leased.id,job.id);
 assert.equal(await observe(observation,[active,retired,unknown]),1);assert.equal((await jobs(retired))[0].lease_token,leased.leaseToken);assert.equal((await jobs(retired))[0].generation,leased.generation);
 await assert.rejects(()=>observe(observation,[retired]),/identity conflict/);await assert.rejects(()=>observe(crypto.randomUUID(),[retired,retired]),/Invalid privacy discovery/);await assert.rejects(()=>observe(crypto.randomUUID(),[retired],project,'production'),/environment mismatch/);
 assert.equal(await observe(crypto.randomUUID(),[retired]),1);assert.equal(await finish(leased,'absent'),false);await query("update game_privacy_jobs set next_attempt_at=now()+interval '2 days' where id=$1",[job.id]);
});
test('a retained-provider review is never silently turned back into an automatic erase by discovery',async()=>{
 const {user,job}=await queued(),leased=(await claim())[0];await finish(leased,'permission_denied');await value("select game_resolve_manual_privacy($1,'manual_retained','retention-case-200') as value",[job.id]);
 await value('select game_discover_privacy_customers($1,$2,$3,$4) as value',[crypto.randomUUID(),project,'sandbox',[user]]);let row=(await jobs(user))[0];assert.equal(row.state,'manual_review');assert.equal(row.outcome,'manual_retained');assert.equal(row.resolution_reference,'retention-case-200');await due(job.id);assert.deepEqual(await claim(),[]);
 await value('select game_retry_privacy_job($1) as value',[job.id]);row=(await jobs(user))[0];assert.equal(row.outcome,null);assert.equal((await claim())[0].id,job.id);await query("update game_privacy_jobs set state='manual_review',lease_token=null,lease_until=null where id=$1",[job.id]);
});
test('the customer-page adapter validates scope and cursors while skipping unrelated custom IDs',async()=>{
 const id=crypto.randomUUID(),other='other-app@example.invalid',path='/v2/projects/'+project+'/customers';
 const f=providerFixture(url=>url.pathname==='/v2/projects'?projects():Response.json({object:'list',items:[{object:'customer',id,project_id:project},{object:'customer',id:other,project_id:project}],next_page:path+'?starting_after='+encodeURIComponent(other)}));
 assert.deepEqual(await f.provider.customerPage(),{customers:[id],next:other,count:2});assert(f.calls.every(call=>call.method==='GET'));
 for(const body of [
  {object:'list',items:[{object:'customer',id,project_id:'proj_foreign'}],next_page:null},
  {object:'list',items:[{object:'customer',id,project_id:project},{object:'customer',id,project_id:project}],next_page:null},
  {object:'list',items:[{object:'customer',id,project_id:project}],next_page:'https://evil.invalid'+path+'?starting_after='+id},
  {object:'list',items:[{object:'customer',id,project_id:project}],next_page:path+'?starting_after=wrong'},
  {object:'list',items:[],next_page:path+'?starting_after='+id}
 ]){const bad=providerFixture(url=>url.pathname==='/v2/projects'?projects():Response.json(body));await assert.rejects(()=>bad.provider.customerPage(),{code:'invalid_response'});assert.equal(bad.calls.length,2);}
});
test('the real discovery pipeline survives a committed SQL observation whose response was lost',async()=>{
 const retired=await account(),active=await account();await remove(retired);let stored=null,loseResponse=true;
 const f=providerFixture(url=>url.pathname==='/v2/projects'?projects():Response.json({object:'list',items:[retired,active,'unrelated-sdk-user'].map(id=>({object:'customer',id,project_id:project})),next_page:null}));
 const options={identity:{provider:'revenuecat',projectId:project,environment:'sandbox',database:'https://db.example.invalid'},read:async()=>structuredClone(stored),write:async state=>{stored=structuredClone(state);},page:after=>f.provider.customerPage(after),observe:async(id,customers)=>{const matched=await value('select game_discover_privacy_customers($1,$2,$3,$4) as value',[id,project,'sandbox',customers]);if(loseResponse){loseResponse=false;throw Error('response lost after commit');}return matched;}};
 await assert.rejects(()=>discoverPrivacyBatch(options),/response lost/);const [job]=await jobs(retired);assert.equal((await jobs(active)).length,0);await due(job.id);const leased=(await claim())[0];assert.equal(leased.id,job.id);
 const result=await discoverPrivacyBatch(options);assert.equal(result.complete,true);assert.equal(result.matched,1);assert.equal(result.examined,3);assert.equal(f.calls.length,2);assert.equal(stored.pending,null);assert.equal(stored.cursor,null);assert.equal((await jobs(retired))[0].lease_token,leased.leaseToken);assert.equal(await finish(leased,'config_missing'),true);
});
