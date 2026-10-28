import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';

// This deliberately simple delayed controller follows a descending ball. It
// catches imperfectly and does not choose strategic angles or hunt pickups.
// It is a repeatable regression proxy, not a measurement of human win rate.
function delayedController(level,seed){
 const game=new Game({level,seed,mode:'play'});
 let nextDecision=0,firstHit=null,launches=0;
 while(game.stageTime<360&&game.status!=='won'&&game.status!=='over'){
  if(game.status==='ready'){game.launch();launches++;}
  if(game.time>=nextDecision){
   const balls=game.balls.filter(ball=>ball.vy>0&&ball.y<game.paddle.y).sort((a,b)=>(game.paddle.y-a.y)/a.vy-(game.paddle.y-b.y)/b.vy);
   const ball=balls[0];
   if(ball)game.target=ball.x+ball.vx*Math.min(.4,Math.max(0,(game.paddle.y-ball.y)/ball.vy-.16))+(game.time-nextDecision)*15;
   nextDecision+=.25;
  }
  game.step(1/60);
  if(firstHit===null&&game.destroyed>0)firstHit=game.stageTime;
 }
 return{won:game.status==='won',firstHit,launches,losses:game.stageLosses};
}

test('the first four rounds give delayed manual input a forgiving start',()=>{
 const seeds=[1,8937,1267,2026,5529],minimumWins=[5,4,4,3];
 for(let level=1;level<=4;level++){
  const results=seeds.map(seed=>delayedController(level,seed));
  assert(results.every(result=>result.firstHit!==null&&result.firstHit<3),`stage ${level} first visible progress`);
  assert(results.filter(result=>result.won).length>=minimumWins[level-1],`stage ${level} delayed-input clears`);
  if(level===1)assert(results.every(result=>result.losses===0), 'first stage must not exhaust the novice proxy');
 }
});
