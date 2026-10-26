import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRanges,intersectRanges,differenceRanges,isMastered,masteryCount} from '../dist/mastery.js';
import {emptyProgress,markCompleted,mergeProgress,normalizeProgress,cloudProgress,unlinkedGuestCount} from '../dist/progress.js';
import {Game} from '../dist/engine.js';
import {snapshotGame,restoreGame} from '../dist/session.js';
const result={score:24000,seconds:120,peak:12,mode:'play',stageLosses:0};

test('mastery intervals coalesce adjacent/overlapping stamps and reject malformed bounds',()=>{
 assert.deepEqual(mergeRanges([[8,10],[1,3],[4,7],[2,5],[100,100],[0,2],[2,1],['1',3]]),[[1,10],[100,100]]);
 assert.deepEqual(intersectRanges([[1,20],[30,40]],[[3,5],[10,35]]),[[3,5],[10,20],[30,35]]);
});
test('range union/intersection match ordinary sets on reproducible generated cases',()=>{
 const flatten=ranges=>new Set(ranges.flatMap(([a,b])=>Array.from({length:b-a+1},(_,i)=>a+i)));
 for(let seed=1;seed<=100;seed++){
  const left=[],right=[];
  for(let i=0;i<12;i++){const a=(seed*17+i*7)%80+1,b=a+(seed+i)%12; (i%2?left:right).push([a,b]);}
  const a=flatten(left),b=flatten(right);
  assert.deepEqual([...flatten(mergeRanges(left,right))].sort((a,b)=>a-b),[...new Set([...a,...b])].sort((a,b)=>a-b));
  assert.deepEqual([...flatten(intersectRanges(left,right))].sort((a,b)=>a-b),[...a].filter(n=>b.has(n)).sort((a,b)=>a-b));
  assert.deepEqual([...flatten(differenceRanges(left,right))].sort((a,b)=>a-b),[...a].filter(n=>!b.has(n)).sort((a,b)=>a-b));
 }
});
test('guest linking remains discoverable when only a new mastery stamp is missing',()=>{
 const account=markCompleted(emptyProgress(),1,{...result,mode:'watch'}),guest=markCompleted(emptyProgress(),1,result);
 assert.equal(unlinkedGuestCount(account,guest),1);
 const merged=mergeProgress(account,guest);assert.equal(unlinkedGuestCount(merged,guest),0);
 const extra=markCompleted(guest,2,result);assert.equal(unlinkedGuestCount(account,extra),2);
});
test('manual/clean stamps survive later assisted replays and keep separate best times',()=>{
 let p=markCompleted(emptyProgress(),1,result);assert(isMastered(p,1));assert(isMastered(p,1,'clean'));
 p=markCompleted(p,1,{...result,mode:'watch',seconds:10});assert(isMastered(p,1,'clean'));assert.equal(p.records[1].seconds,10);assert.equal(p.records[1].manualSeconds,120);assert.equal(p.records[1].cleanSeconds,120);
 p=markCompleted(p,1,{...result,stageLosses:1,seconds:100});assert.equal(p.records[1].manualSeconds,100);assert.equal(p.records[1].cleanSeconds,120);
});
test('assisted clears retain campaign ticks but never manufacture manual mastery',()=>{
 const p=markCompleted(emptyProgress(),1,{...result,mode:'watch'});assert.deepEqual(p.starters,[1]);assert.equal(masteryCount(p),0);assert.equal(p.records[1].manualSeconds,null);assert.equal(p.records[1].cleanSeconds,null);
 const old=normalizeProgress({...p,records:{1:{...result,level:1,mode:'play'}}});assert.equal(masteryCount(old),0);assert.equal(old.records[1].cleanSeconds,null);
});
test('mastery remains compact and permanent beyond the recent-history limit',()=>{
 let p=emptyProgress();for(let n=1;n<=12;n++)p=markCompleted(p,n,result);
 for(let n=13;n<=240;n++)p=markCompleted(p,n,result);
 assert(Object.keys(p.records).length<=140);assert(!p.records[13]);assert(isMastered(p,13,'clean'));assert.equal(masteryCount(p),240);assert.deepEqual(p.mastery.clean,[[1,240]]);
});
test('cloud/local merges union stamps idempotently and cannot add stamps on locked fields',()=>{
 let a=markCompleted(emptyProgress(),1,result),b=markCompleted(emptyProgress(),2,{...result,stageLosses:1});
 const m=mergeProgress(a,b);assert.equal(masteryCount(m),2);assert.equal(masteryCount(m,'clean'),1);assert.deepEqual(mergeProgress(m,m).mastery,m.mastery);
 const invalid=normalizeProgress({...m,mastery:{manual:[[1,999]],clean:[[1,999]]}});assert.deepEqual(invalid.mastery.manual,[[1,2]]);
 const remote=cloudProgress({starter_completed:[1],highest_unlocked:12,mastery:{manual:[[1,1]],clean:[[1,1]]},recent:[{level:1,best_score:24000,best_seconds:100,peak_balls:12,play_mode:'play',clears:1,best_manual_seconds:100,best_clean_seconds:100}]});
 assert(isMastered(remote,1,'clean'));assert.equal(remote.records[1].manualSeconds,100);
});
test('stage-loss metadata survives new saves; unknown legacy history cannot become a clean clear',()=>{
 const g=new Game();g.launch();const s=snapshotGame(g),restored=restoreGame(s,g.pattern,()=>{});assert.equal(restored.stageLosses,0);
 const legacy={...s};delete legacy.stageLosses;const old=restoreGame(legacy,g.pattern,()=>{});assert.equal(old.stageLosses,null);
 old.balls=[{...old.ball(30,690),vy:300}];old.step(1/120);assert.equal(old.stageLosses,null);
 g.balls=[{...g.ball(30,690),vy:300}];g.step(1/120);assert.equal(g.stageLosses,1);
 const p=markCompleted(emptyProgress(),1,{...result,stageLosses:old.stageLosses});assert(isMastered(p,1));assert(!isMastered(p,1,'clean'));
});
