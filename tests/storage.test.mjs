import test from 'node:test';
import assert from 'node:assert/strict';
import {durableStorage} from '../dist/storage.js';
function webStorage(initial={}) {
 const map=new Map(Object.entries(initial));
 return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
}
function nativeStore(){let initialized=false,values={},fail=false;return{
 snapshot:()=>JSON.stringify({initialized,values}),initialize:seed=>{if(fail)return false;values=JSON.parse(seed);initialized=true;return true;},
 write:(key,value)=>{if(fail)return false;values[key]=value;return true;},remove:key=>{if(fail)return false;delete values[key];return true;},
 fail:()=>{fail=true;}
};}
test('durable native saves migrate once and replace stale WebView data after process death',()=>{
 const bridge=nativeStore(),web=webStorage({'brick-breaker-session-v3:guest':'old',unrelated:'private'}),store=durableStorage(web,bridge);
 store.setItem('brick-breaker-session-v3:guest','damaged-field');store.setItem('brick-breaker-progress-v3:guest','completed');
 const restored=durableStorage(webStorage({'brick-breaker-session-v3:guest':'stale'}),bridge);
 assert.equal(restored.getItem('brick-breaker-session-v3:guest'),'damaged-field');assert.equal(restored.getItem('brick-breaker-progress-v3:guest'),'completed');
 store.removeItem('brick-breaker-session-v3:guest');
 const afterDeletion=webStorage({'brick-breaker-session-v3:guest':'stale'});
 assert.equal(durableStorage(afterDeletion,bridge).getItem('brick-breaker-session-v3:guest'),null);assert.equal(afterDeletion.getItem('brick-breaker-session-v3:guest'),null);
 assert.equal(JSON.parse(bridge.snapshot()).values.unrelated,undefined);assert.equal(web.getItem('unrelated'),'private');
 const blocked=webStorage();blocked.setItem=()=>{throw Error('WebView quota');};blocked.removeItem=()=>{throw Error('WebView denied');};
 const durable=durableStorage(blocked,bridge);durable.setItem('brick-breaker-test','native-only');assert.equal(durable.getItem('brick-breaker-test'),'native-only');durable.removeItem('brick-breaker-test');assert.equal(durable.getItem('brick-breaker-test'),null);
});
test('failed native writes surface errors and cannot claim a new durable save',()=>{
 const web=webStorage(),bridge=nativeStore(),store=durableStorage(web,bridge);store.setItem('brick-breaker-test','good');bridge.fail();
 assert.throws(()=>store.setItem('brick-breaker-test','lost'),/save failed/);assert.throws(()=>store.removeItem('brick-breaker-test'),/removal failed/);assert.equal(store.getItem('brick-breaker-test'),'good');
 assert.equal(durableStorage(web,null),web);
});
