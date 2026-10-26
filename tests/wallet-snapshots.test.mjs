import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {WalletSnapshots} from '../dist/wallet-snapshots.js';import {migrateGame} from './db-migrations.mjs';
const owner=crypto.randomUUID(),other=crypto.randomUUID();
const snapshot=(version,availableMs=0,accountId=owner)=>({accountId,snapshotVersion:String(version),availableMs,reservedMs:0,pending:[]});
test('a late balance cannot replace a newer debit, refund, reservation or grant',()=>{
 const snapshots=new WalletSnapshots({account:()=>owner});assert.equal(snapshots.accept(snapshot(3,10000)),true);assert.equal(snapshots.accept({...snapshot(5,0),reservedMs:10000,pending:[{id:'held'}]}),true);
 assert.equal(snapshots.accept(snapshot(4,30000)),false);assert.equal(snapshots.value.availableMs,0);assert.equal(snapshots.value.pending[0].id,'held');
 assert.equal(snapshots.accept(snapshot(5,99999)),false);assert.equal(snapshots.accept(snapshot(6,5000)),true);assert.equal(snapshots.value.availableMs,5000);
});
test('snapshot versions retain exact ordering above the JavaScript safe integer limit',()=>{
 const snapshots=new WalletSnapshots({account:()=>owner});assert(snapshots.accept(snapshot('9007199254740993',3)));assert(!snapshots.accept(snapshot('9007199254740992',4)));assert(snapshots.accept(snapshot('9007199254740994',2)));assert.equal(snapshots.value.availableMs,2);
 for(const version of [0,-1,1.5,'01','1e8','9223372036854775808','x'.repeat(10000)])assert.equal(snapshots.accept(snapshot(version)),false);
});
test('the current owner cannot observe or accept another account snapshot',()=>{
 let current=owner;const snapshots=new WalletSnapshots({account:()=>current});snapshots.accept(snapshot(99,100));current=other;assert.equal(snapshots.value,null);assert.equal(snapshots.accept(snapshot(100,999)),false);assert.equal(snapshots.accept(snapshot(1,10,other)),true);assert.equal(snapshots.value.availableMs,10);current=null;assert.equal(snapshots.value,null);assert.equal(snapshots.accept(snapshot(2,99,other)),false);
});
test('legacy compatibility ends permanently for that account after its first versioned snapshot',()=>{
 const snapshots=new WalletSnapshots({account:()=>owner});assert(snapshots.accept({availableMs:10}));snapshots.accept(snapshot(2,5));assert.equal(snapshots.accept({availableMs:99}),false);assert.equal(snapshots.value.availableMs,5);
 const strict=new WalletSnapshots({account:()=>owner,allowLegacy:false});assert.equal(strict.accept({availableMs:10}),false);assert.equal(strict.accept({...snapshot(1),accountId:undefined}),false);assert.equal(strict.accept(snapshot(1,-1)),false);
});
let db;
before(async()=>{db=new PGlite();await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema auth,public to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);await migrateGame(db);await db.query('insert into auth.users values($1),($2)',[owner,other]);});
after(async()=>db?.close());
async function asOwner(id,fn){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');try{return await fn();}finally{await db.exec('reset role');}}
const state=()=>db.query('select public.game_time_state() as value').then(r=>r.rows[0].value);
test('real PostgreSQL snapshots carry an account-bound monotonically ordered exact string',async()=>{
 const first=await asOwner(owner,state),second=await asOwner(owner,state),separate=await asOwner(other,state);assert.equal(first.accountId,owner);assert.equal(typeof first.snapshotVersion,'string');assert(BigInt(second.snapshotVersion)>BigInt(first.snapshotVersion));assert.equal(separate.snapshotVersion,'1');
 await db.query("select public.game_credit_verified($1,'purchase','snapshot-fixture',30000,'server','fixture-v1')",[owner]);const credited=await asOwner(owner,state);assert.equal(credited.availableMs,30000);assert(BigInt(credited.snapshotVersion)>BigInt(second.snapshotVersion));
 const client=new WalletSnapshots({account:()=>owner});client.accept(credited);assert.equal(client.accept(first),false);assert.equal(client.value.availableMs,30000);
});
test('rolled-back snapshots do not change the committed counter, and clients cannot set versions',async()=>{
 const first=await asOwner(other,state);await db.exec('begin');const rolled=await asOwner(other,state);await db.exec('rollback');const next=await asOwner(other,state);assert.equal(next.snapshotVersion,rolled.snapshotVersion);assert.equal(BigInt(next.snapshotVersion),BigInt(first.snapshotVersion)+1n);
 await assert.rejects(()=>asOwner(owner,()=>db.query('update public.game_wallets set snapshot_version=999 where user_id=$1',[owner])),/permission denied/);
 await db.query('update public.game_wallets set snapshot_version=$2 where user_id=$1',[other,'9007199254740992']);assert.equal((await asOwner(other,state)).snapshotVersion,'9007199254740993');
});
