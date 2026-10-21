import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudAccount} from '../dist/cloud.js';
import {durableStorage} from '../dist/storage.js';

const settings={supabaseUrl:'https://backend.test/',publishableKey:'sb_publishable_local_storage_test'};
const user={id:'00000000-0000-4000-8000-000000000001',email:'test@example.test'};
const authKey='brick-breaker-auth-v3';
function webStorage(initial={}){
  const values=new Map(Object.entries(initial));
  return {get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
}
function nativeStore(){
  let initialized=false,values={};
  return {snapshot:()=>JSON.stringify({initialized,values}),initialize:seed=>{initialized=true;values=JSON.parse(seed);return true;},write:(k,v)=>{values[k]=v;return true;},remove:k=>{delete values[k];return true;}};
}
function token(revision){
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,revision})}.test-signature`;
}

// Use the shipped Supabase SDK, rather than a client double, to exercise its
// real session serialization, refresh and removal through the native adapter.
for(const removal of ['signOut','deleteAccount'])test(`native authentication survives refresh/restart and ${removal} stays removed`,async t=>{
  const bridge=nativeStore(),clients=[],originalFetch=globalThis.fetch;
  const refreshedToken=token(2);
  globalThis.fetch=async input=>{
    const url=new URL(input instanceof Request?input.url:input);
    if(url.pathname==='/auth/v1/user')return Response.json(user);
    if(url.pathname==='/auth/v1/token')return Response.json({access_token:refreshedToken,refresh_token:'refreshed-test-token',expires_in:3600,token_type:'bearer',user});
    if(url.pathname==='/auth/v1/logout')return new Response('{}');
    if(url.pathname==='/functions/v1/game-api')return Response.json({deleted:true});
    throw Error('Unexpected request: '+url.pathname);
  };
  t.after(async()=>{
    for(const cloud of clients){cloud.unsubscribe?.unsubscribe();await cloud.client.auth.stopAutoRefresh();}
    globalThis.fetch=originalFetch;
  });
  const create=storage=>{const cloud=new CloudAccount(()=>{},{settings,storage});clients.push(cloud);return cloud;};
  const cloud=create(durableStorage(webStorage(),bridge));
  const signedIn=await cloud.client.auth.setSession({access_token:token(1),refresh_token:'initial-test-token'});
  assert.equal(signedIn.error,null);
  const refreshed=await cloud.client.auth.refreshSession();
  assert.equal(refreshed.error,null);
  assert.equal(JSON.parse(JSON.parse(bridge.snapshot()).values[authKey]).access_token,refreshedToken);
  await cloud.client.auth.stopAutoRefresh();

  // A new WebView/process can have no storage, or older storage than native.
  const restarted=create(durableStorage(webStorage({[authKey]:'stale-webview-session'}),bridge));
  await restarted.init();
  assert.equal(restarted.userId,user.id);
  assert.equal(restarted.session.access_token,refreshedToken);
  await restarted[removal]();
  assert.equal(restarted.signedIn,false);
  assert.equal(JSON.parse(bridge.snapshot()).values[authKey],undefined);
  const staleWeb=webStorage({[authKey]:JSON.stringify(refreshed.data.session)});
  const afterRemoval=create(durableStorage(staleWeb,bridge));
  await afterRemoval.init();
  assert.equal(afterRemoval.signedIn,false);
  assert.equal(staleWeb.getItem(authKey),null);
});
