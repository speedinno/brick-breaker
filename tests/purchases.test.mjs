import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PurchaseService} from '../dist/purchases.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function setup(){
 const saved=new Map(),calls=[],configuration={available:true,provider:'revenuecat',publicKey:'goog_public',products:[{id:'prodA',storeId:'pack300',milliseconds:300000,version:'v1'}]},wallet={availableMs:300000};
 const api=async(action,body)=>{calls.push({action,body});return action==='purchase-catalog'?configuration:action==='purchase-sync'?{wallet,next:null}:{wallet,verified:true};};
 const cloud={userId:'account-a',api},sdk={PRODUCT_CATEGORY:{NON_SUBSCRIPTION:'NON_SUBSCRIPTION'},Purchases:{
  configure:async options=>{calls.push({configure:options});},logIn:async options=>{calls.push({logIn:options});},
  getProducts:async()=>({products:[{identifier:'pack300',price:129,priceString:'₹129.00'}]}),
  purchaseStoreProduct:async options=>{calls.push({purchase:options});return{productIdentifier:'pack300',transaction:{transactionIdentifier:'GPA.123'}};},
  restorePurchases:async()=>{calls.push({restore:true});}
 }};
 const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 let loads=0;const service=new PurchaseService({cloud,platform:'android',storage,loadSDK:async()=>{loads++;return sdk;}});
 return {service,cloud,sdk,configuration,wallet,calls,saved,get loads(){return loads;}};
}
test('COM-21: price and product come from native SDK; only server verification supplies balance',async()=>{
 const t=setup();const result=await t.service.load();assert.equal(result.products[0].price,'₹129.00');assert.equal(result.products[0].milliseconds,300000);
 const bought=await t.service.buy('prodA');assert.equal(bought.state,'verified');assert.equal(bought.wallet,t.wallet);
 assert.equal(t.calls.find(c=>c.configure).configure.appUserID,'account-a');assert.equal(t.calls.find(c=>c.action==='purchase-verify').body.transactionId,'GPA.123');assert.equal(t.service.pending('account-a'),null);
});
test('SDK success followed by a failed backend keeps a durable recoverable receipt, never a successful balance',async()=>{
 const t=setup();await t.service.load();t.cloud.api=async(action)=>{if(action==='purchase-verify')throw Error('Server unavailable');return{wallet:t.wallet,next:null};};
 await assert.rejects(()=>t.service.buy('prodA'),/Server unavailable/);assert.equal(t.service.pending('account-a').transaction,'GPA.123');
 t.cloud.api=async action=>action==='purchase-sync'?{wallet:t.wallet,next:null}:{verified:true,wallet:t.wallet};
 assert.equal((await t.service.recover()).state,'verified');assert.equal(t.service.pending('account-a'),null);
});
test('pending store approval and empty verification never manufacture purchase success',async()=>{
 const t=setup();await t.service.load();t.sdk.Purchases.purchaseStoreProduct=async()=>{throw{code:'20'};};
 assert.equal((await t.service.buy('prodA')).state,'pending');assert.equal(t.service.pending('account-a').stage,'store');
 t.sdk.Purchases.purchaseStoreProduct=async()=>({productIdentifier:'pack300',transaction:{transactionIdentifier:'GPA.late'}});
 t.cloud.api=async()=>({verified:false,wallet:{availableMs:0}});assert.equal((await t.service.buy('prodA')).state,'pending');assert.equal(t.service.pending('account-a').transaction,'GPA.late');
});
test('cancel is explicit and concurrent purchase attempts cannot open a second checkout',async()=>{
 const t=setup();await t.service.load();const wait=deferred();t.sdk.Purchases.purchaseStoreProduct=()=>wait.promise;
 const one=t.service.buy('prodA');await assert.rejects(()=>t.service.buy('prodA'),/already in progress/);
 wait.reject({userCancelled:true});assert.equal((await one).state,'cancelled');assert.equal(t.service.pending('account-a'),null);
});
test('account switching during a store prompt cannot verify or grant into the next account',async()=>{
 const t=setup();await t.service.load();const wait=deferred(),entered=deferred();t.sdk.Purchases.purchaseStoreProduct=()=>{entered.resolve();return wait.promise;};
 const one=t.service.buy('prodA'),rejected=assert.rejects(()=>one,/account changed/);await entered.promise;
 t.cloud.userId='account-b';t.service.reset();wait.resolve({productIdentifier:'pack300',transaction:{transactionIdentifier:'GPA.old'}});await rejected;
 assert(!t.calls.some(c=>c.action==='purchase-verify'));assert(t.service.pending('account-a'));assert.equal(t.service.pending('account-b'),null);
 await t.service.load();assert.deepEqual(t.calls.find(c=>c.logIn).logIn,{appUserID:'account-b'});
});
test('absent configuration and browser edition never invoke a native purchase plugin',async()=>{
 const t=setup();t.configuration.available=false;assert.equal((await t.service.load()).available,false);assert.equal(t.loads,0);await assert.rejects(()=>t.service.buy('prodA'),/Refresh/);
 t.configuration.available=true;t.service.platform='web';await assert.rejects(()=>t.service.load(),/unavailable for this edition/);assert.equal(t.loads,0);
});
test('restore paginates authoritative history and synchronizes an existing balance without adding pack quantities',async()=>{
 const t=setup();await t.service.load();let n=0;t.cloud.api=async(action,body)=>{assert.equal(action,'purchase-sync');assert.equal(body.after,n===0?null:'purchB');return{wallet:{availableMs:7},next:n++===0?'purchB':null};};
 const result=await t.service.recover();assert.equal(result.state,'synced');assert.equal(result.wallet.availableMs,7);assert.equal(n,2);
});
test('recovery cannot loop forever or erase a still-unverified receipt',async()=>{
 const t=setup();await t.service.load();t.service.journal('account-a',{transaction:'GPA.unknown'});t.cloud.api=async()=>({next:'same',wallet:{availableMs:0}});
 await assert.rejects(()=>t.service.recover(),/longer than expected/);assert.equal(t.service.pending('account-a').transaction,'GPA.unknown');
});
test('storage failure prevents checkout before money can be charged',async()=>{
 const t=setup();await t.service.load();t.service.storage.setItem=()=>{throw Error();};
 await assert.rejects(()=>t.service.buy('prodA'),/storage is unavailable/);assert(!t.calls.some(c=>c.purchase));
});
test('retiring all time packs cannot disable recovery of an existing purchased balance',async()=>{
 const t=setup();t.configuration.products=[];t.sdk.Purchases.getProducts=async()=>{throw Error('Must not request empty store product list');};
 assert.deepEqual((await t.service.load()).products,[]);assert.equal((await t.service.recover()).state,'synced');
});
test('a backend environment/key change requires restart rather than mixing SDK projects',async()=>{
 const t=setup();await t.service.load();t.configuration.publicKey='goog_other';
 await assert.rejects(()=>t.service.load(),/settings changed/);assert.equal(t.calls.filter(c=>c.configure).length,1);
});
