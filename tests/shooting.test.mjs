import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,MAX_SHOTS,SHOOT_SECONDS,H} from '../dist/engine.js';
import {snapshotGame,restoreGame} from '../dist/session.js';

test('shooting is earned by catching its own pickup and leaves ordinary balls intact',()=>{
 const g=new Game();g.launch();const velocity={...g.balls[0]};
 assert.equal(g.shootUntil,0);g.spawnDrop(5,500,'laser');g.step(1/120);assert.equal(g.shootUntil,0);
 g.drops=[{x:g.paddle.x,y:g.paddle.y-5,kind:'laser'}];g.step(1/120);
 assert.equal(g.shootUntil,g.time+SHOOT_SECONDS);assert.equal(g.fireUntil,0);assert.equal(g.balls.length,1);assert.equal(g.balls[0].vx,velocity.vx);
});

test('shots pierce a full column at maximum dt without damaging gray walls',()=>{
 const g=new Game(),column=5,targets=g.bricks.filter(c=>c.c===column),walls=[...g.grid.values()].filter(c=>c.c===column&&c.type==='wall');
 assert(targets.length>30);g.status='playing';g.power('laser');g.paddle.x=column*8+4;g.target=g.paddle.x;
 // Isolate projectile motion from ball collisions and the life-loss path.
 for(let n=0;n<25;n++)g.stepShots(1/30);
 assert(targets.every(c=>c.hp===0));assert(walls.every(c=>c.hp===Infinity&&g.grid.has(c.id)));assert.equal(g.remaining,g.total-targets.length);
});

test('shot rate and count are bounded, expiry stops firing, and only active play advances effects',()=>{
 const g=new Game();g.launch();g.power('laser');g.spawnDrop=()=>false;
 for(let n=0;n<120*12&&g.status==='playing';n++){g.step(1/120);assert(g.shots.length<=MAX_SHOTS);}
 assert(g.time>=g.shootUntil||g.status!=='playing');
 const h=new Game();h.launch();h.power('laser');h.step(1/120);h.status='ready';const before=JSON.stringify({time:h.time,shots:h.shots,until:h.shootUntil});for(let n=0;n<500;n++)h.step(1/30);assert.equal(JSON.stringify({time:h.time,shots:h.shots,until:h.shootUntil}),before);
 h.status='playing';h.time=h.shootUntil+1;h.shots=[];h.stepShots(1/30);assert.equal(h.shots.length,0);
});

test('loss and win clear shooting state; destroyed targets never score twice',()=>{
 const g=new Game();g.launch();g.power('laser');g.shots=[{x:20,y:500}];g.balls=[{...g.ball(20,H+30),vy:320}];g.step(1/120);
 assert.equal(g.status,'ready');assert.equal(g.shootUntil,0);assert.deepEqual(g.shots,[]);
 const h=new Game();h.launch();h.power('laser');for(const c of h.bricks)h.damage(c);const score=h.score;h.stepShots(1/30);assert.equal(h.score,score);h.checkWin();assert.equal(h.status,'won');assert.deepEqual(h.shots,[]);assert.equal(h.shootUntil,0);
});

test('shooting snapshot restores remaining duration and in-flight shots and accepts older saves',()=>{
 const g=new Game();g.launch();g.power('laser');g.step(1/120);const saved=snapshotGame(g),copy=restoreGame(JSON.parse(JSON.stringify(saved)),g.pattern,()=>{});
 assert(copy);assert.deepEqual(copy.shots,g.shots);assert.equal(copy.shootUntil,g.shootUntil);assert.equal(copy.nextShot,g.nextShot);
 for(const key of ['shots','shootUntil','nextShot'])delete saved[key];assert(restoreGame(saved,g.pattern,()=>{}));
 assert.equal(restoreGame({...saved,shots:Array.from({length:MAX_SHOTS+1},()=>({x:10,y:10}))},g.pattern,()=>{}),null);
 assert.equal(restoreGame({...saved,shots:[{x:NaN,y:20}]},g.pattern,()=>{}),null);
 assert.equal(restoreGame({...saved,shootUntil:g.time+1000},g.pattern,()=>{}),null);
});
