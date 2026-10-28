import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';

function firstBreak(level,seed,x,degrees,seconds=5){
 const game=new Game({level,seed});game.paddle.x=x;game.target=x;game.setLaunchAngle(degrees);game.launch();
 for(let tick=0;tick<seconds*120&&game.status==='playing';tick++){
  game.step(1/120);
  if(game.destroyed)return {seconds:game.stageTime,game};
 }
 return null;
}

test('the player can place and aim a first shot into each opening motif',()=>{
 for(let level=1;level<=12;level++){
  const probe=new Game({level}),entry=probe.pattern.entry.x;
  let reachable=false;
  for(const offset of [-48,-32,-16,0,16,32,48]){
   for(const degrees of [-25,-20,-15,-10,-5,0,5,10,15,20,25]){
    const x=Math.max(probe.paddle.w/2+2,Math.min(416-probe.paddle.w/2-2,entry+offset));
    if(firstBreak(level,101,x,degrees,5)){reachable=true;break;}
   }
   if(reachable)break;
  }
  assert(reachable,`stage ${level} needs an achievable deliberate first shot`);
 }
});

test('a launch never aims itself or grants a free ability',()=>{
 for(const level of [1,2,8,12]){
  const game=new Game({level});const x=game.paddle.x;
  game.setLaunchAngle(-18);game.launch();
  assert.equal(game.paddle.x,x);assert.equal(game.balls.length,1);assert.equal(game.shootUntil,0);
  assert(game.balls[0].vx<0&&game.balls[0].vy<0);
  assert(Math.abs(Math.atan2(game.balls[0].vy,game.balls[0].vx)-(-Math.PI/2-18*Math.PI/180))<1e-9);
  assert.equal(game.peakBalls,1);
 }
});

test('an untended opening shot cannot finish stage one',()=>{
 const game=new Game({level:1});game.launch();
 for(let tick=0;tick<30*120&&game.status==='playing';tick++)game.step(1/120);
 assert.notEqual(game.status,'won');assert(game.remaining>game.total*.9);
});
