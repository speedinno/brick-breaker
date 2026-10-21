import {Game,MAX_BALLS} from './engine.js';
const finite=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
export function snapshotGame(game,{auto=false,speed=1,run=null,assisted=auto}={}){
  if(!game||!['ready','playing'].includes(game.status))return null;
  return {version:3,level:game.level,seed:game.seed,signature:game.pattern.signature,status:game.status,removed:game.bricks.filter(c=>c.hp===0).map(c=>c.id),balls:game.balls.map(b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy,r:b.r})),drops:game.drops.map(d=>({...d})),lives:game.lives,time:game.time,stageTime:game.stageTime,score:game.score,paddleX:game.paddle.x,peak:game.peakBalls,floorUntil:game.floorUntil,wideUntil:game.wideUntil,fireUntil:game.fireUntil,auto,speed,run,assisted};
}
export function restoreGame(snapshot,definitionPattern,onEvent){
  if(!snapshot||snapshot.version!==3||snapshot.signature!==definitionPattern.signature||!['ready','playing'].includes(snapshot.status)||!Number.isSafeInteger(snapshot.level)||snapshot.level<1||!Number.isInteger(snapshot.seed)||!finite(snapshot.lives,1,5)||!finite(snapshot.time,0,86400)||!finite(snapshot.stageTime,0,86400)||!Array.isArray(snapshot.removed)||snapshot.removed.length>2704||!Array.isArray(snapshot.balls)||snapshot.balls.length>MAX_BALLS||!Array.isArray(snapshot.drops)||snapshot.drops.length>30)return null;
  const game=new Game({level:snapshot.level,seed:snapshot.seed,patternFactory:()=>definitionPattern,onEvent});
  const removed=new Set(snapshot.removed);
  if(removed.size!==snapshot.removed.length||[...removed].some(id=>!Number.isInteger(id)||!game.bricks.some(c=>c.id===id)))return null;
  for(const cell of game.bricks)if(removed.has(cell.id)){cell.hp=0;game.grid.delete(cell.id);}
  game.remaining=game.total-removed.size;game.destroyed=removed.size;
  if(!game.remaining||snapshot.score!==removed.size*10)return null;
  if(snapshot.balls.some(b=>!b||!finite(b.x,-3,419)||!finite(b.y,-3,675)||!finite(b.vx,-431,431)||!finite(b.vy,-431,431)||Math.hypot(b.vx,b.vy)<250||Math.hypot(b.vx,b.vy)>431||b.r!==2.35))return null;
  if(snapshot.status==='playing'&&!snapshot.balls.length)return null;
  if(snapshot.drops.some(d=>!d||!finite(d.x,0,416)||!finite(d.y,0,690)||!['add','triple','wide','floor','fire'].includes(d.kind)))return null;
  game.balls=snapshot.balls.map(b=>({...b}));game.drops=snapshot.drops.map(d=>({...d}));game.status=snapshot.status;game.lives=snapshot.lives;game.time=snapshot.time;game.stageTime=snapshot.stageTime;game.score=snapshot.score;game.lastHit=snapshot.time;
  game.paddle.x=finite(snapshot.paddleX,0,416)?snapshot.paddleX:game.paddle.x;game.target=game.paddle.x;
  for(const key of ['floorUntil','wideUntil','fireUntil'])game[key]=finite(snapshot[key],0,86460)?snapshot[key]:0;
  game.peakBalls=finite(snapshot.peak,1,768)?Math.max(snapshot.peak,game.balls.length):Math.max(1,game.balls.length);
  game.mode=snapshot.auto?'watch':'play';return game;
}
