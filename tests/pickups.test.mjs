import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,MAX_BALLS} from '../dist/engine.js';
import {snapshotGame,restoreGame} from '../dist/session.js';

test('each caught pickup applies once and reports the exact before/after count',()=>{
  const events=[],g=new Game({level:13,onEvent:e=>events.push(e)});g.launch();
  g.balls=Array.from({length:4},()=>g.ball(g.paddle.x,520));
  g.drops=[{x:g.paddle.x,y:g.paddle.y-5,kind:'triple'},{x:g.paddle.x,y:g.paddle.y-5,kind:'add'}];
  g.step(1/120);
  assert.equal(g.balls.length,15);assert.equal(g.drops.length,0);
  assert.deepEqual(events.filter(e=>e.type==='power').map(({kind,before,balls,added})=>({kind,before,balls,added})),[{kind:'triple',before:4,balls:12,added:8},{kind:'add',before:12,balls:15,added:3}]);
  g.step(1/120);assert.equal(g.balls.length,15);assert.equal(events.filter(e=>e.type==='power').length,2);
  const count=g.balls.length;g.power('wide');assert.equal(g.balls.length,count);
});

test('add and multiply respect their labels at normal counts and the performance ceiling',()=>{
  for(const count of [1,4,17,MAX_BALLS-2,MAX_BALLS]){
    for(const kind of ['add','triple']){
      const g=new Game();g.balls=Array.from({length:count},()=>g.ball(200,520));g.power(kind);
      assert.equal(g.balls.length,Math.min(MAX_BALLS,kind==='add'?count+3:count*3));
    }
  }
});

test('multiplier drops cannot overlap or be generated faster by a burst of brick hits',()=>{
  const g=new Game();g.launch();g.time=8;
  assert.equal(g.spawnDrop(200,300,'triple'),true);
  g.time=30;assert.equal(g.spawnDrop(200,310,'triple'),false,'An existing airborne multiplier reserves the slot');
  g.drops=[];assert.equal(g.spawnDrop(200,300,'triple'),true);
  g.drops=[];g.time=41.99;assert.equal(g.spawnDrop(200,300,'triple'),false);
  g.time=42;assert.equal(g.spawnDrop(200,300,'triple'),true);
  assert.equal(g.spawnDrop(200,300,'add'),true,'Other pickups remain available');
});

test('the opening brick gives one additive pickup and multiplier pacing survives restart',()=>{
  const g=new Game();g.launch();g.damage(g.bricks[0]);
  assert.deepEqual(g.drops.map(d=>d.kind),['add']);
  g.time=8;g.spawnDrop(200,300,'triple');
  const saved=snapshotGame(g),restored=restoreGame(saved,g.pattern,()=>{});
  assert(restored);assert.equal(restored.multiplierReadyAt,20);
  restored.drops=[];assert.equal(restored.spawnDrop(200,300,'triple'),false);
  delete saved.multiplierReadyAt;const legacy=restoreGame(saved,g.pattern,()=>{});
  assert(legacy);assert.equal(legacy.multiplierReadyAt,saved.time+8);
});
