import test from 'node:test';import assert from 'node:assert/strict';import {AccountPrivacy,accountStorageKeys} from '../dist/account-privacy.js';import {CloudAccount} from '../dist/cloud.js';import {PurchaseService} from '../dist/purchases.js';
const owner=crypto.randomUUID(),other=crypto.randomUUID(),settings={supabaseUrl:'https://example.supabase.co/',publishableKey:'sb_publishable_example_test_key',apiUrl:'https://game.example.invalid/game-api'};
function store(){const data=new Map();return{data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};}
test('confirmed deletion removes every account journal while preserving guest, other accounts and device settings',()=>{
 const raw=store(),privacy=new AccountPrivacy(raw);for(const key of accountStorageKeys(owner))raw.setItem(key,'private');for(const key of [...accountStorageKeys(other),'brick-breaker-v3:guest','brick-breaker-device-v1','brick-breaker-options-v3'])raw.setItem(key,'keep');
 raw.setItem('brick-breaker-auth-v3',JSON.stringify({user:{id:owner}}));raw.setItem('brick-breaker-auth-v3-code-verifier','private');const receipt=privacy.prepare(owner);assert.equal(privacy.prepare(owner).requestId,receipt.requestId);
 privacy.seal(owner);privacy.purge(owner);for(const key of accountStorageKeys(owner))assert.equal(raw.getItem(key),null);for(const key of [...accountStorageKeys(other),'brick-breaker-v3:guest','brick-breaker-device-v1','brick-breaker-options-v3'])assert.equal(raw.getItem(key),'keep');assert.equal(raw.getItem('brick-breaker-auth-v3'),null);assert.equal(raw.getItem('brick-breaker-auth-v3-code-verifier'),null);assert.deepEqual(privacy.pending(),[]);
 assert.throws(()=>privacy.storage.setItem(accountStorageKeys(owner)[0],'late private write'),/deleted/);assert.throws(()=>privacy.storage.setItem('brick-breaker-auth-v3',JSON.stringify({user:{id:owner}})),/deleted/);privacy.storage.setItem(accountStorageKeys(other)[0],'valid');
});
test('a failed local removal keeps its durable receipt and blocks late callbacks across restart',async()=>{
 const raw=store(),privacy=new AccountPrivacy(raw),target=accountStorageKeys(owner)[2];raw.setItem(target,'private');privacy.prepare(owner);privacy.seal(owner);const remove=raw.removeItem;raw.removeItem=key=>{if(key===target)throw Error('disk failure');return remove(key);};assert.throws(()=>privacy.purge(owner),/Device cleanup/);assert.equal(privacy.pending()[0].state,'deleted');
 const restarted=new AccountPrivacy(raw);assert.equal(restarted.storage.getItem(target),null);assert.throws(()=>restarted.storage.setItem(target,'late'),/deleted/);raw.removeItem=remove;
 assert.deepEqual(await restarted.recover(()=>{throw Error('confirmed deletion needs no network');}),{cleared:1,pending:0});assert.equal(raw.getItem(target),null);assert.deepEqual(restarted.pending(),[]);
});
test('lost-response recovery checks the random receipt and never deletes another signed-in identity',async()=>{
 const raw=store(),privacy=new AccountPrivacy(raw),record=privacy.prepare(owner);const canonical=crypto.randomUUID();privacy.canonical(owner,canonical);raw.setItem('brick-breaker-auth-v3',JSON.stringify({user:{id:other}}));raw.setItem('brick-breaker-auth-v3-code-verifier','other verifier');raw.setItem(accountStorageKeys(owner)[0],'old account');
 assert.deepEqual(await privacy.recover(async id=>{assert.equal(id,canonical);return{deleted:false};}),{cleared:0,pending:1});assert(raw.getItem(accountStorageKeys(owner)[0]));
 assert.deepEqual(await privacy.recover(async id=>({deleted:id===canonical})),{cleared:1,pending:0});assert.equal(JSON.parse(raw.getItem('brick-breaker-auth-v3')).user.id,other);assert.equal(raw.getItem('brick-breaker-auth-v3-code-verifier'),'other verifier');assert.notEqual(record.requestId,canonical);
});
test('unreadable or malformed deletion journals never silently remove existing saves',async()=>{
 const raw=store();raw.setItem(accountStorageKeys(owner)[0],'private');raw.setItem('brick-breaker-deletions-v1','invalid');const privacy=new AccountPrivacy(raw);await assert.rejects(()=>privacy.recover(async()=>({deleted:true})),/storage/);assert.equal(raw.getItem(accountStorageKeys(owner)[0]),'private');assert.throws(()=>privacy.prepare(owner),/storage/);
 assert.throws(()=>accountStorageKeys('arbitrary:guest'),/Invalid account/);
});
test('an interrupted auth-cache removal retries its verifier cleanup without erasing a newer account',async()=>{
 const raw=store(),privacy=new AccountPrivacy(raw);raw.setItem('brick-breaker-auth-v3',JSON.stringify({user:{id:owner}}));raw.setItem('brick-breaker-auth-v3-code-verifier','old verifier');privacy.prepare(owner);privacy.seal(owner);const remove=raw.removeItem;raw.removeItem=key=>{if(key.endsWith('-code-verifier'))throw Error('disk');return remove(key);};assert.throws(()=>privacy.purge(owner),/cleanup/);assert.equal(raw.getItem('brick-breaker-auth-v3'),null);raw.removeItem=remove;
 const restarted=new AccountPrivacy(raw);await restarted.recover(async()=>({deleted:true}));assert.equal(raw.getItem('brick-breaker-auth-v3-code-verifier'),null);
});
function cloudFixture(invoke,onChange=()=>{}){const events=[],cloud=new CloudAccount(onChange,{settings,clientFactory:()=>({functions:{invoke},auth:{signOut:async()=>{events.push('signOut');return{};}}})});cloud.session={user:{id:owner}};return{cloud,events};}
test('confirmed cloud deletion seals local data before auth change callbacks can persist the old account',async()=>{
 const f=cloudFixture(async()=>({data:{deleted:true}}),()=>f.events.push('changed'));
 // The external API invoke path is independently tested; use a transport stub
 // here to exercise the real deletion orchestration and lifecycle ordering.
 f.cloud.invoke=async()=>({data:{deleted:true}});await f.cloud.deleteAccount(crypto.randomUUID(),{onDeleted:()=>f.events.push('seal')});assert.deepEqual(f.events,['seal','signOut','changed']);assert.equal(f.cloud.userId,null);
});
test('a lost delete response can recover without an auth token; a failed deletion keeps its saves',async()=>{
 const f=cloudFixture();f.cloud.invoke=async()=>({error:{context:{status:401,json:async()=>({error:'expired'})}}});let sealed=0,checked=0;f.cloud.deletionStatus=async()=>{checked++;return{deleted:true};};await f.cloud.deleteAccount(crypto.randomUUID(),{onDeleted:()=>sealed++});assert.equal(sealed,1);assert.equal(checked,1);assert.equal(f.cloud.userId,null);assert.equal(f.cloud.syncError,null);
 const failed=cloudFixture();failed.cloud.invoke=f.cloud.invoke;failed.cloud.deletionStatus=async()=>({deleted:false});await assert.rejects(()=>failed.cloud.deleteAccount(crypto.randomUUID(),{onDeleted:()=>sealed++}),/expired/);assert.equal(failed.cloud.userId,owner);assert.equal(sealed,1);assert.equal(failed.cloud.syncError,null);
});
test('local cleanup failure still signs out the deleted identity and reports the remaining cleanup',async()=>{
 const f=cloudFixture();f.cloud.invoke=async()=>({data:{deleted:true}});await assert.rejects(()=>f.cloud.deleteAccount(crypto.randomUUID(),{onDeleted:()=>{throw Error('cleanup needs retry');}}),/cleanup/);assert.equal(f.cloud.userId,null);assert.deepEqual(f.events,['signOut']);
});
test('anonymous receipt status uses the configured trusted API and sends no email, account or bearer',async()=>{
 const original=globalThis.fetch,requestId=crypto.randomUUID();try{globalThis.fetch=async(url,options)=>{assert.equal(url,'https://game.example.invalid/game-api/privacy/deletion-status');assert.deepEqual(JSON.parse(options.body),{requestId});assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.apikey,settings.publishableKey);return Response.json({deleted:true,ignored:'private'});};const f=cloudFixture();assert.deepEqual(await f.cloud.deletionStatus(requestId),{deleted:true});await assert.rejects(()=>f.cloud.deletionStatus('invalid'),/Invalid/);}finally{globalThis.fetch=original;}
});
test('native SDK deletion waits for in-flight identity setup, logs out once, and logs in without reconfiguration',async()=>{
 let release,started;const begin=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve),calls=[],cloud={userId:owner};const sdk={Purchases:{configure:async()=>{calls.push('configure');started();await gate;},logOut:async()=>calls.push('logout'),logIn:async({appUserID})=>calls.push('login:'+appUserID)}};
 const service=new PurchaseService({cloud,platform:'android',storage:store(),loadSDK:async()=>sdk}),configuration={publicKey:'goog_fixture'};
 const identify=service.identified(owner,configuration);await begin;const retired=service.retire(owner);release();await assert.rejects(()=>identify,/account changed/);await retired;assert.deepEqual(calls,['configure','logout']);cloud.userId=other;await service.identified(other,configuration);assert.deepEqual(calls,['configure','logout','login:'+other]);cloud.userId=owner;await assert.rejects(()=>service.identified(owner,configuration),/account changed/);
});
