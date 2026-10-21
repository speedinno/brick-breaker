// Explicit hosted acceptance test, never included in npm test or mobile assets.
// Uses two disposable, confirmed accounts without sending email. Always removes
// their identities/private data; shared anonymous stage definitions are retained.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const apiUrl=process.argv[2];
assert(apiUrl&&new URL(apiUrl).protocol==='https:','Supply the deployed HTTPS API endpoint');
const url=process.env.SUPABASE_URL,publicKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY,secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url&&publicKey&&secret,'Load server configuration from the ignored .env.api file');
const options={global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})},auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,secret,options),created=new Set(),checks=[];
async function call(account,action,body={},expected=200){
  const response=await fetch(apiUrl,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+account.token},body:JSON.stringify({...body,action,accountId:account.id}),signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,expected,`${action}: unexpected HTTP status`);
  return response.json();
}
async function account(label){
  const email=`brick-launch-${label}-${randomUUID()}@example.test`,password=randomBytes(32).toString('base64url');
  const result=await admin.auth.admin.createUser({email,password,email_confirm:true});
  assert(!result.error&&result.data.user,`Cannot create disposable ${label} account`);
  const id=result.data.user.id;created.add(id);
  const client=createClient(url,publicKey,options),signed=await client.auth.signInWithPassword({email,password});
  assert(!signed.error&&signed.data.session,`Cannot sign in disposable ${label} account`);
  return {id,client,token:signed.data.session.access_token};
}
try{
  const health=await fetch(apiUrl.replace(/\/$/,'')+'/healthz',{signal:AbortSignal.timeout(30000)});
  assert.equal(health.status,200);assert.equal((await health.json()).status,'ok');
  const anonymous=await fetch(apiUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
  assert.equal(anonymous.status,401);checks.push('process health and anonymous rejection');
  const a=await account('a'),b=await account('b');
  for(const current of [a,b]){const state=await call(current,'state');assert.equal(state.highest_unlocked,12);assert.equal(state.recent.length,0);}
  checks.push('Supabase password login and private account state');
  await call(a,'level',{level:13},403);
  const stage=await call(a,'level',{level:1});assert.equal(stage.definition.level,1);assert.match(stage.layout_hash,/^[a-f\d]{64}$/);
  const run=await call(a,'start',{level:1,requestId:randomUUID()});
  const result={runId:run.runId,hash:stage.layout_hash,score:[...stage.definition.layout].filter(c=>c==='b'||c==='g').length*10+1000,seconds:1,peak:1,mode:'play'};
  await call(b,'complete',result,400);
  await new Promise(resolve=>setTimeout(resolve,1100));
  const completed=await call(a,'complete',result);assert(completed.starter_completed.includes(1));
  const replay=await call(a,'complete',result);assert.equal(replay.recent.find(row=>row.level===1).clears,1);
  checks.push('locked stages, catalog publication, run ownership and idempotent completion');
  const linked=await call(a,'import',{starters:Array.from({length:12},(_,i)=>i+1),journeyNext:13,records:[]});
  assert.equal(linked.highest_unlocked,13);
  const generated=await call(a,'level',{level:13});assert.equal(generated.definition.level,13);
  await call(b,'level',{level:13},403);
  const crossRead=await b.client.from('game_completions').select('user_id').eq('user_id',a.id);
  assert.equal(crossRead.error,null);assert.equal(crossRead.data.length,0);
  const bState=await call(b,'state');assert.equal(bState.highest_unlocked,12);assert.equal(bState.recent.length,0);
  const exported=await call(a,'export');assert.equal(exported.account.id,a.id);assert(exported.history.some(row=>row.level===1));
  const bExport=await call(b,'export');assert.equal(bExport.account.id,b.id);assert.equal(bExport.history.length,0);
  checks.push('generated stage access, guest import, RLS isolation and private export');
  for(const current of [a,b]){
    const deleted=await call(current,'delete');assert.equal(deleted.deleted,true);
    for(const table of ['game_players','game_runs','game_completions']){
      const remaining=await admin.from(table).select('user_id',{count:'exact',head:true}).eq('user_id',current.id);
      assert.equal(remaining.error,null);assert.equal(remaining.count,0,`Deletion did not cascade through ${table}`);
    }
    const identity=await admin.auth.admin.getUserById(current.id);assert(identity.error,'Deleted identity must no longer exist');
    created.delete(current.id);
  }
  const shared=await admin.from('game_catalog').select('level').eq('version',3).in('level',[1,13]);
  assert.equal(shared.error,null);assert.equal(shared.data.length,2);
  checks.push('fresh-sign-in deletion, private cascades and shared catalog preservation');
  console.log(JSON.stringify({status:'passed',apiUrl,checkedAt:new Date().toISOString(),checks,disposableAccountsRemoved:true,emailDeliveryTested:false,completionWasSynthetic:true},null,2));
}finally{
  for(const id of created){
    const result=await admin.auth.admin.deleteUser(id);
    if(result.error&&result.error.status!==404)throw Error(`Disposable account cleanup failed for ${id}; remove it before further testing`);
  }
}
