// Exercises the actual Edge entrypoint and Supabase SDK over a mocked HTTP
// transport. SQL/RLS are separately tested against actual embedded Postgres.
const owner='00000000-0000-4000-8000-000000000001';
Deno.env.set('SUPABASE_URL','https://backend.test');Deno.env.set('SUPABASE_ANON_KEY','public-test-key');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','server-test-key');Deno.env.delete('ALLOWED_ORIGINS');
let handler:(request:Request)=>Promise<Response>;
let calls:string[]=[],authorized=true,rpcError='',signedAt=new Date().toISOString();
const originalFetch=globalThis.fetch,originalServe=Deno.serve;
const mockFetch:typeof fetch=async(input,init)=>{
 const url=String(input instanceof Request?input.url:input);calls.push((init?.method||'GET')+' '+new URL(url).pathname);
 if(url.includes('/auth/v1/user'))return authorized?Response.json({id:owner,email:'test@example.test',created_at:'2026-01-01T00:00:00Z',last_sign_in_at:signedAt}):Response.json({message:'Invalid JWT'},{status:401});
 if(url.includes('/auth/v1/admin/users/'))return Response.json({user:{id:owner}});
 if(url.includes('/rest/v1/rpc/'))return rpcError?Response.json({message:rpcError,code:'P0001'},{status:400}):Response.json({highest_unlocked:12,starter_completed:[],recent:[]});
 throw Error('Unexpected transport request: '+url);
};
Object.defineProperty(Deno,'serve',{value:(callback:typeof handler)=>{handler=callback;return{};},configurable:true});
await import('./index.ts');
Object.defineProperty(Deno,'serve',{value:originalServe,configurable:true});
function assert(value:unknown,message='Assertion failed'):asserts value{if(!value)throw Error(message);}
function test(name:string,action:()=>Promise<void>){Deno.test(name,async()=>{globalThis.fetch=mockFetch;try{await action();}finally{globalThis.fetch=originalFetch;}});}
function reset(){calls=[];authorized=true;rpcError='';signedAt=new Date().toISOString();}
function request(body:unknown={action:'state',accountId:owner},headers:Record<string,string>={},method='POST'){
 return new Request('https://game.test/game-api',{method,headers:{Authorization:'Bearer test-token',Origin:'https://speedinno.github.io',...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
}
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
 assert(!calls.some(s=>s.includes('/admin/')));signedAt=new Date().toISOString();const response=await handler(request({action:'delete',accountId:owner}));assert(response.status===200);assert(calls.some(s=>s==='DELETE /auth/v1/admin/users/'+owner));
});

