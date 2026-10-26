import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {snapshotGame,restoreGame} from '../dist/session.js';
test('local resume restores broken bricks, balls, lives and temporary boosts',()=>{
 const game=new Game({seed:8937});game.launch();game.damage(game.bricks.find(c=>c.type==='brick'));game.power('triple');game.power('floor');game.step(1/120);
 const snapshot=JSON.parse(JSON.stringify(snapshotGame(game,{auto:true,speed:2}))),restored=restoreGame(snapshot,game.pattern,()=>{});
 assert(restored);assert.equal(restored.remaining,game.remaining);assert.equal(restored.score,game.score);assert.equal(restored.balls.length,game.balls.length);assert.equal(restored.floorUntil,game.floorUntil);assert.equal(restored.mode,'play');assert.equal(snapshot.auto,false);assert.equal(snapshot.assisted,true);
 assert.equal(restoreGame({...snapshot,auto:true},game.pattern,()=>{}).mode,'play');
});
test('corrupt resume data cannot delete a wall or inject invalid ball state',()=>{
 const g=new Game();g.launch();const data=snapshotGame(g),wall=g.pattern.cells.find(c=>c.type==='wall');
 assert.equal(restoreGame({...data,removed:[wall.id]},g.pattern,()=>{}),null);
 assert.equal(restoreGame({...data,balls:[{x:NaN,y:1,vx:2,vy:3,r:2.35}]},g.pattern,()=>{}),null);
 assert.equal(restoreGame({...data,signature:'different'},g.pattern,()=>{}),null);
});
