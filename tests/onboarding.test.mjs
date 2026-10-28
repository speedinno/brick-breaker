import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';

// This deliberately simple delayed controller follows a descending ball. It
// catches imperfectly and does not choose strategic angles or hunt pickups.
// It is a repeatable regression proxy, not a measurement of human win rate.
function delayedController(level,seed,{interval=.25,predict=true}={}){
 const game=new Game({level,seed,mode:'play'});
 let nextDecision=0,firstHit=null,launches=0;
 while(game.stageTime<360&&game.status!=='won'&&game.status!=='over'){
  if(game.status==='ready'){game.launch();launches++;}
  if(game.time>=nextDecision){
   const balls=game.balls.filter(ball=>ball.vy>0&&ball.y<game.paddle.y).sort((a,b)=>(game.paddle.y-a.y)/a.vy-(game.paddle.y-b.y)/b.vy);
   const ball=balls[0];
   if(ball)game.target=predict?ball.x+ball.vx*Math.min(.4,Math.max(0,(game.paddle.y-ball.y)/ball.vy-.16))+(game.time-nextDecision)*15:ball.x;
   nextDecision+=interval;
  }
  game.step(1/60);
  if(firstHit===null&&game.destroyed>0)firstHit=game.stageTime;
 }
 return{won:game.status==='won',firstHit,launches,losses:game.stageLosses,seconds:game.stageTime};
}

test('the first four rounds give delayed manual input a forgiving start',()=>{
 const seeds=Array.from({length:20},(_,i)=>101+i*1907);
 for(let level=1;level<=4;level++){
  const results=seeds.map(seed=>delayedController(level,seed));
  assert(results.every(result=>result.firstHit!==null&&result.firstHit<3),`stage ${level} first visible progress`);
  assert(results.every(result=>result.won&&result.losses===0),`stage ${level} delayed-input clears without retries`);
  if(level===1)assert(results.every(result=>result.seconds<90),'first stage should clear quickly with delayed input');
 }
});

test('a slow reactive paddle can finish the opening four rounds without prediction',()=>{
 const seeds=Array.from({length:20},(_,i)=>101+i*1907);
 for(let level=1;level<=4;level++){
  const results=seeds.map(seed=>delayedController(level,seed,{interval:1,predict:false}));
  assert(results.every(result=>result.won&&result.losses===0),`stage ${level} one-second reactive clears`);
  assert(results.every(result=>result.seconds<120),`stage ${level} one-second reactive clear time`);
 }
});
