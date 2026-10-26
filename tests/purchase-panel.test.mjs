import test from 'node:test';
import assert from 'node:assert/strict';
import {PurchasePanel} from '../dist/purchases-ui.js';

// A small DOM boundary for the real panel. No store or game behavior is
// reimplemented: the assertions observe when the panel invokes those ports.
function fixture(platform){
 const nodes=new Map(),calls=[];
 const node=()=>({children:[],classList:{toggle(){}},replaceChildren(){this.children=[];},append(child){this.children.push(child);},querySelectorAll(){return this.children;},focus(){},open:true});
 globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node};
 let finish;
 const service={platform,items:[{id:'pack',price:'₹129',milliseconds:300000}],configuration:{available:true},pending:()=>null,load:async()=>({available:true}),buy:()=>{calls.push('buy');return new Promise(resolve=>finish=resolve);},recover:async()=>{calls.push('recover');return{state:'synced'};},confirm:async()=>{calls.push('confirm');return{state:'pending'};}};
 const panel=new PurchasePanel({service,cloud:{signedIn:true,userId:'owner'},onBusy:()=>{},onWallet:()=>calls.push('wallet'),externalStart:()=>{calls.push('pause-save-mute');return 'context';},externalEnd:context=>calls.push('return:'+context)});
 return {panel,service,calls,get:id=>nodes.get(id),finish:value=>finish(value)};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
for(const platform of ['android','ios'])test(`${platform} purchase and restore pause/save/mute before invoking the store`,async()=>{
 const f=fixture(platform);await f.panel.load();f.get('purchaseOffers').children[0].onclick();
 assert.deepEqual(f.calls,['pause-save-mute','buy']);assert.equal(f.panel.busy,true);
 f.finish({state:'cancelled'});await settle();assert.deepEqual(f.calls,['pause-save-mute','buy','return:context']);assert.equal(f.panel.busy,false);
 f.calls.length=0;f.get('purchaseRecover').onclick();await settle();assert.deepEqual(f.calls,['pause-save-mute','recover','return:context']);
 delete globalThis.document;
});
test('web price review keeps its dialog; only explicit checkout confirmation enters the external context',async()=>{
 const f=fixture('web');await f.panel.load();f.get('purchaseOffers').children[0].onclick();assert.deepEqual(f.calls,['buy']);
 f.finish({state:'quoted'});await settle();assert.deepEqual(f.calls,['buy']);
 f.calls.length=0;f.get('purchaseConfirm').onclick();await settle();assert.deepEqual(f.calls,['pause-save-mute','confirm','return:context']);delete globalThis.document;
});
test('store failure still restores the saved external context without fabricating credit',async()=>{
 const f=fixture('android');f.service.recover=async()=>{throw Error('Store offline');};
 await f.panel.operation(()=>f.service.recover(),true);assert.deepEqual(f.calls,['pause-save-mute','return:context']);assert.equal(f.panel.busy,false);assert.equal(f.get('purchaseMessage').textContent,'Store offline');delete globalThis.document;
});
test('the panel watches real priced native elements and quote text, never a price-free web catalog',async()=>{
 const f=fixture('android'),watched=[],reported=[];f.panel.observe=(element,report,options)=>{const watch={element,report,options,stopped:false};watched.push(watch);return()=>watch.stopped=true;};f.panel.onOffer=(owner,data)=>{reported.push({owner,data});return true;};
 f.service.items=[{id:'pack',storeId:'time.small',price:'$1.29',version:'v3',milliseconds:300000,product:{price:1.29,currencyCode:'USD'}}];await f.panel.load();assert.equal(watched.length,1);assert.equal(reported.length,0);assert.equal(watched[0].options.isCurrent(),true);watched[0].report();assert.equal(reported[0].data.amountMicros,1290000);
 f.panel.reset();assert.equal(watched[0].stopped,true);assert.equal(watched[0].options.isCurrent(),false);f.service.platform='web';f.service.items=[{id:'pack',price:null,milliseconds:300000}];await f.panel.load();assert.equal(watched.length,1);
 f.service.quote={owner:'owner',price:'₹129',amount:12900,currency:'INR',milliseconds:300000,productId:'time.small',configVersion:'original'};f.panel.render();assert.equal(watched.length,2);assert.equal(watched[1].element,f.get('purchaseQuoteDetails'));watched[1].report();assert.equal(reported[1].data.configVersion,'original');f.panel.cloud.userId='another';assert.equal(watched[1].options.isCurrent(),false);delete globalThis.document;
});
