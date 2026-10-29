// Exercises the actual Edge entrypoint and Supabase SDK over a mocked HTTP
// transport. SQL/RLS are separately tested against actual embedded Postgres.
const owner='00000000-0000-4000-8000-000000000001';
Deno.env.set('SUPABASE_URL','https://backend.test');Deno.env.set('SUPABASE_ANON_KEY','public-test-key');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','server-test-key');Deno.env.delete('ALLOWED_ORIGINS');
let handler:(request:Request)=>Promise<Response>;
let calls:string[]=[],authorized=true,rpcError='',signedAt=new Date().toISOString();
let frontier=12,budgetError='',deletionPrepareBad=false;
let prepared:number[]=[],published:number[]=[];
const catalog=new Map<number,{definition:Record<string,unknown>,layout_hash:string}>();
const originalFetch=globalThis.fetch,originalServe=Deno.serve;
const mockFetch:typeof fetch=async(input,init)=>{
 const url=String(input instanceof Request?input.url:input);calls.push((init?.method||'GET')+' '+new URL(url).pathname);
 if(url.includes('/auth/v1/user'))return authorized?Response.json({id:owner,email:'test@example.test',created_at:'2026-01-01T00:00:00Z',last_sign_in_at:signedAt}):Response.json({message:'Invalid JWT'},{status:401});
 if(url.includes('/auth/v1/admin/users/'))return Response.json({user:{id:owner}});
 if(url.includes('/rest/v1/game_catalog')){
  const query=new URL(url).searchParams;
  return Response.json(query.get('select')==='canonical_layout'?[]:catalog.get(Number(query.get('level')?.replace('eq.','')))||null);
 }
 if(url.includes('/rest/v1/rpc/')){
  if(rpcError)return Response.json({message:rpcError,code:'P0001'},{status:400});
  const args=JSON.parse(String(init?.body||'{}'));
  if(url.endsWith('/game_prepare_level')){prepared.push(args.p_level);return budgetError?Response.json({message:budgetError,code:'P0001'},{status:400}):Response.json(null);}
  if(url.endsWith('/game_publish_level')){const row={definition:args.p_definition,layout_hash:args.p_hash};published.push(args.p_level);catalog.set(args.p_level,row);return Response.json(row);}
  if(url.endsWith('/game_start'))return Response.json({runId:args.p_request_id,layout_hash:catalog.get(args.p_level)?.layout_hash});
  if(url.endsWith('/game_prepare_account_deletion'))return Response.json(deletionPrepareBad?{}:{requestId:args.p_request});
  return Response.json({highest_unlocked:frontier,starter_completed:[],recent:[]});
 }
 throw Error('Unexpected transport request: '+url);
};
Object.defineProperty(Deno,'serve',{value:(_options:unknown,callback:typeof handler)=>{handler=callback;return{};},configurable:true});
await import('./index.ts');
Object.defineProperty(Deno,'serve',{value:originalServe,configurable:true});
function assert(value:unknown,message='Assertion failed'):asserts value{if(!value)throw Error(message);}
function test(name:string,action:()=>Promise<void>){Deno.test(name,async()=>{globalThis.fetch=mockFetch;try{await action();}finally{globalThis.fetch=originalFetch;}});}
function reset(){calls=[];authorized=true;rpcError='';signedAt=new Date().toISOString();frontier=12;budgetError='';deletionPrepareBad=false;prepared=[];published=[];catalog.clear();}
function request(body:unknown={action:'state',accountId:owner},headers:Record<string,string>={},method='POST'){
 return new Request('https://game.test/game-api',{method,headers:{Authorization:'Bearer test-token',Origin:'https://speedinno.github.io',...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
}
test('HTTP contract: health probe is public and performs no Auth/database calls',async()=>{
 reset();const response=await handler(new Request('https://api.test/healthz'));
 assert(response.status===200);assert((await response.json()).status==='ok');assert(response.headers.get('Cache-Control')==='no-store');assert(calls.length===0);
});
test('HTTP contract: native Android and iPhone origins can call the authenticated API',async()=>{
 reset();for(const Origin of ['https://localhost','capacitor://localhost']){const response=await handler(request(undefined,{Origin}));assert(response.status===200);assert(response.headers.get('Access-Control-Allow-Origin')===Origin);}
});
test('HTTP contract: CORS, preflight and method restrictions precede auth',async()=>{
 reset();let r=await handler(request(null,{},'OPTIONS'));assert(r.status===204);assert(r.headers.get('Access-Control-Allow-Origin')==='https://speedinno.github.io');
 r=await handler(request(null,{Origin:'https://evil.test'},'OPTIONS'));assert(r.status===403);
 r=await handler(request(null,{},'GET'));assert(r.status===405);assert(calls.length===0);
});
test('HTTP contract: missing/invalid bearer and changed identity cannot reach SQL',async()=>{
 reset();assert((await handler(request(undefined,{Authorization:''}))).status===401);assert(calls.length===0);
 authorized=false;assert((await handler(request())).status===401);assert(!calls.some(s=>s.includes('/rest/')));
 reset();assert((await handler(request({action:'state',accountId:'someone-else'}))).status===409);assert(!calls.some(s=>s.includes('/rest/')));
});
test('HTTP contract: valid state is private/no-store; locked or invalid levels never generate',async()=>{
 reset();const state=await handler(request());assert(state.status===200);assert(state.headers.get('Cache-Control')==='no-store');assert((await state.json()).highest_unlocked===12);
 assert(calls.some(s=>s.endsWith('/rpc/game_state')));calls=[];
 assert((await handler(request({action:'level',accountId:owner,level:13}))).status===403);assert(!calls.some(s=>s.includes('/game_catalog')));
 calls=[];assert((await handler(request({action:'level',accountId:owner,level:0}))).status===400);assert(!calls.some(s=>s.includes('/rest/')));
});
test('HTTP contract: malformed/oversized input cannot invoke game operations',async()=>{
 reset();for(const body of ['{bad','[]','null'])assert((await handler(request(body))).status===400);
 assert((await handler(request('x'.repeat(32769)))).status===413);assert(!calls.some(s=>s.includes('/rest/')));
});
test('HTTP contract: provider diagnostics never leak; expired unknown runs stay recoverable',async()=>{
 reset();rpcError='stage database failure: PRIVATE_DIAGNOSTIC select internal_secret';let response=await handler(request());assert(response.status===503);assert(!(await response.text()).includes('PRIVATE_DIAGNOSTIC'));
 rpcError='Stage is locked';response=await handler(request());assert(response.status===400);assert((await response.json()).error==='Stage is locked');
 rpcError='Unknown run';response=await handler(request());assert(response.status===400);assert((await response.json()).error.includes('expired'));
});
test('HTTP contract: deletion requires a valid recent sign-in and deletes only the authenticated owner',async()=>{
 reset();for(const value of ['invalid',new Date(Date.now()-3600000).toISOString(),new Date(Date.now()+3600000).toISOString()]){signedAt=value;assert((await handler(request({action:'delete',accountId:owner}))).status===409);}
 assert(!calls.some(s=>s.includes('/admin/')));signedAt=new Date().toISOString();const response=await handler(request({action:'delete',accountId:owner}));assert(response.status===200);assert(calls.some(s=>s==='DELETE /auth/v1/admin/users/'+owner));assert(calls.findIndex(s=>s.endsWith('/rpc/game_prepare_account_deletion'))<calls.findIndex(s=>s==='DELETE /auth/v1/admin/users/'+owner));
});
test('HTTP contract: invalid deletion preparation cannot remove the auth account',async()=>{
 reset();deletionPrepareBad=true;const response=await handler(request({action:'delete',accountId:owner}));assert(response.status===503);assert(calls.some(s=>s.endsWith('/rpc/game_prepare_account_deletion')));assert(!calls.some(s=>s.includes('/admin/users/')));
});

test('HTTP contract: completion retries cannot generate an imported frontier or its locked successor',async()=>{
 reset();
 const body={action:'complete',accountId:owner,runId:'00000000-0000-4000-8000-000000000002',hash:'a'.repeat(64),score:1000,seconds:1,peak:1,mode:'play'};
 for(const next of [13,9000,9100]){
  frontier=next;
  for(let retry=0;retry<2;retry++){
   const response=await handler(request(body));assert(response.status===200);assert((await response.json()).highest_unlocked===next);
  }
 }
 assert(!calls.some(s=>s.includes('/game_catalog')),'Completion must not query or generate catalog stages');
 assert(prepared.length===0&&published.length===0);
});

for(const action of ['level','start'])test(`HTTP contract: ${action} budgets every unpublished stage and reuses published stages at quota`,async()=>{
 reset();frontier=13;budgetError='Too many new stages. Try again later.';
 const body={action,accountId:owner,level:13,requestId:'00000000-0000-4000-8000-000000000002'};
 let response=await handler(request(body));assert(response.status===400);assert((await response.json()).error===budgetError);
 assert(prepared.length===1&&prepared[0]===13);assert(Number(published.length)===0);
 assert(!calls.some(s=>s.includes('/game_publish_level')));
 budgetError='';response=await handler(request(body));assert(response.status===200);
 assert(published.length===1&&published[0]===13);
 assert(calls.findIndex(s=>s.endsWith('/game_prepare_level'))<calls.findIndex(s=>s.endsWith('/game_publish_level')));
 const authorizations=prepared.length;
 budgetError='Too many new stages. Try again later.';
 response=await handler(request(body));assert(response.status===200);
 assert(prepared.length===authorizations,'Published stages must not consume generation budget');
 assert(published.length===1,'An existing definition must never be republished');
});
test('HTTP contract: a newly published starter uses catalog revision eight',async()=>{
 reset();const response=await handler(request({action:'level',accountId:owner,level:1}));assert(response.status===200);
 const stage=await response.json();assert(stage.definition.version===8);assert(published.length===1&&published[0]===1);
 const started=await handler(request({action:'start',accountId:owner,level:1,requestId:'00000000-0000-4000-8000-000000000002'}));assert(started.status===200);
});

