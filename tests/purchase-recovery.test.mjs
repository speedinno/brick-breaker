import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recoverPurchasePages} from '../dist/purchase-recovery.js';
function setup(){const saved=new Map();return{saved,storage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)}};}
test('large recovery resumes beyond a bounded batch after recreating the client',async()=>{
 const {saved,storage}=setup(),calls=[],cloud={userId:'a',api:async(action,{after})=>{calls.push(after);return after==='p2'?{next:null,wallet:{availableMs:3}}:{next:after?'p2':'p1',wallet:{availableMs:after?2:1}};}};
 const options={cloud,owner:'a',storage,key:'recovery:a',action:'purchase-sync',maxPages:2};
 const first=await recoverPurchasePages(options);assert.equal(first.complete,false);assert.equal(first.wallet.availableMs,2);assert(saved.has(options.key));
 const second=await recoverPurchasePages({...options});assert.equal(second.complete,true);assert.equal(second.wallet.availableMs,3);assert.deepEqual(calls,[null,'p1','p2']);assert(!saved.has(options.key));
});
test('a deleted-account receipt on an earlier page cannot be hidden by a later page',async()=>{
 const {storage}=setup(),cloud={userId:'a',api:async(action,{after})=>after?{next:null}:{next:'p1',deletedAccountPurchase:true}};
 assert.equal((await recoverPurchasePages({cloud,owner:'a',storage,key:'a',action:'purchase-sync'})).deletedAccountPurchase,true);
});
test('switching accounts while a page is pending cannot save another account cursor',async()=>{
 const {saved,storage}=setup();let finish;const cloud={userId:'a',api:()=>new Promise(resolve=>finish=resolve)};
 const task=recoverPurchasePages({cloud,owner:'a',storage,key:'a',action:'purchase-sync'}),rejected=assert.rejects(()=>task,/account changed/);cloud.userId='b';finish({next:'p1'});await rejected;assert.equal(saved.size,0);
});
