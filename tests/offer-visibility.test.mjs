import test from 'node:test';import assert from 'node:assert/strict';
import {observeOffer,nativeOffer,webOffer} from '../dist/offer-visibility.js';
function fixture(){
 let callback,now=0,next=0,disconnected=0,visibility;const timers=new Map();
 const element={isConnected:true,getClientRects:()=>[{}],getBoundingClientRect:()=>({left:0,top:0,width:100,height:40}),contains:hit=>hit===element};
 const document={hidden:false,elementFromPoint:()=>element,addEventListener:(_,fn)=>visibility=fn,removeEventListener:()=>visibility=null};
 const scope={document,IntersectionObserver:class{constructor(fn){callback=fn;}observe(){}disconnect(){disconnected++;}},setTimeout(fn,ms){const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
 return{scope,element,document,intersect(ratio){callback([{target:element,isIntersecting:ratio>0,intersectionRatio:ratio}]);},advance(ms){now+=ms;for(const [id,timer]of timers)if(timer.at<=now){timers.delete(id);timer.fn();}},hide(hidden){document.hidden=hidden;visibility?.();},get disconnected(){return disconnected;}};
}
test('catalog creation/partial visibility are not exposures; foreground half-visible dwell records once',()=>{
 const f=fixture();let count=0;observeOffer(f.element,()=>{count++;return true;},{scope:f.scope});f.advance(1000);assert.equal(count,0);
 f.intersect(.49);f.advance(1000);assert.equal(count,0);f.intersect(.5);f.advance(249);assert.equal(count,0);f.advance(1);assert.equal(count,1);f.intersect(1);f.advance(1000);assert.equal(count,1);assert.equal(f.disconnected,1);
});
test('backgrounding, overlays, account change and cleanup prevent a queued price exposure',()=>{
 const f=fixture();let count=0,current=true;const stop=observeOffer(f.element,()=>{count++;return true;},{scope:f.scope,isCurrent:()=>current});f.intersect(1);f.advance(100);f.hide(true);f.advance(500);assert.equal(count,0);
 f.hide(false);f.document.elementFromPoint=()=>({});f.advance(250);assert.equal(count,0);f.document.elementFromPoint=()=>f.element;f.intersect(1);current=false;f.advance(250);assert.equal(count,0);current=true;f.intersect(1);stop();f.advance(1000);assert.equal(count,0);
});
test('unavailable observers do not invent exposure and rejected optional capture can retry after visibility changes',()=>{
 assert.doesNotThrow(()=>observeOffer({},()=>{throw Error('never');},{scope:{}})());const f=fixture();let enabled=false,count=0;observeOffer(f.element,()=>enabled&&(count++,true),{scope:f.scope});f.intersect(1);f.advance(250);assert.equal(count,0);enabled=true;f.hide(true);f.hide(false);f.advance(250);assert.equal(count,1);
});
test('price observations use actual SDK money and immutable quote benefit/configuration, never the draft catalog amount',()=>{
 assert.deepEqual(nativeOffer({storeId:'game.small',milliseconds:300000,version:'v2',product:{price:1.29,currencyCode:'USD'}},'ios'),{platform:'ios',sku:'game.small',currency:'USD',amountMicros:1290000,benefitMs:300000,configVersion:'v2'});
 assert.equal(nativeOffer({product:{price:Infinity}},'android'),null);assert.equal(nativeOffer({product:{price:1}},'web'),null);
 assert.deepEqual(webOffer({productId:'small',configVersion:'original-v1',currency:'INR',amount:12900,milliseconds:300000}),{platform:'web',sku:'small',currency:'INR',amountMicros:129000000,benefitMs:300000,configVersion:'original-v1'});
});
