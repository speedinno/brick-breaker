import {advanceCircle,PADDLE_ANGLE} from './physics.js';
import {playProfile} from './difficulty.js';
import {generateDefinition,patternFromLayout} from './generated.js';
export const W=416,H=660,COLS=52,ROWS=52,CELL=8,OX=0,OY=18,MAX_BALLS=768;
export const MAX_SHOTS=24,SHOT_SPEED=900,SHOT_INTERVAL=.16,SHOOT_SECONDS=8;
export const FAMILIES=['T channel','Switchback','H chamber','M channel','Needle','W channel','Sword','Bent channel','Nested squares','Twin hearts','Step chamber','Fork'];
export const COLORS=['#e71840','#8fab18','#527d24','#a31973','#47a91b','#a6a11a','#c61724','#df8a27','#c215a7','#df2942','#9bbb36','#89a623'];
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function rng(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function segmentDistance(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);}
export function makePattern(level,seed=1){
 if(level>12)return patternFromLayout(generateDefinition(level));
 const family=(Math.max(1,level)-1)%12,random=rng((seed^Math.imul(level,0x9e3779b1))>>>0);let paths=[],entry=[26,52],gates=[],holes=[];
 const path=(points,gate=true)=>{paths.push(points);if(gate){const a=points.at(-2),b=points.at(-1),len=Math.hypot(b[0]-a[0],b[1]-a[1]);gates.push({x:b[0],y:b[1],dx:(b[0]-a[0])/len,dy:(b[1]-a[1])/len});}};
 switch(family){
  case 0:path([[26,52],[26,29],[34,29],[34,26],[22,26]]);break;
  case 1:path([[26,52],[26,13],[22,13],[22,34],[31,34]]);break;
  case 2:entry=[18,52];path([[18,52],[18,21]]);path([[34,51],[34,21]]);path([[18,35],[34,35]],false);gates.push({x:34,y:51,dx:0,dy:1});break;
  case 3:path([[26,52],[26,35],[16,24],[16,41]]);path([[26,35],[36,24],[36,41]]);break;
  case 4:path([[26,52],[26,39]]);break;
  case 5:path([[26,52],[26,28],[15,39],[15,21]]);path([[26,28],[37,39],[37,21]]);break;
  case 6:path([[26,52],[26,8]]);path([[17,40],[35,40]]);gates.push({x:17,y:40,dx:-1,dy:0});break;
  case 7:path([[26,52],[26,41],[20,35]]);break;
  case 8:path([[26,52],[26,49],[3,49],[3,3],[49,3],[49,45],[7,45],[7,7],[45,7],[45,41],[11,41],[11,11],[41,11],[41,37],[15,37],[15,15],[37,15]]);break;
  case 9:entry=[13,52];path([[13,52],[13,35],[18,35],[18,42],[8,42],[8,33],[13,29]]);path([[39,51],[39,30],[34,30],[34,42],[44,42]]);for(const cx of [13,39]){const h=[];for(let i=0;i<=40;i++){const t=i*Math.PI/20;h.push([cx+Math.sin(t)**3*7,18-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))*.45]);}holes.push(h);}gates.push({x:39,y:51,dx:0,dy:1});break;
  case 10:entry=[16,52];path([[16,52],[16,43],[22,43],[22,35],[17,35],[17,28],[37,28],[37,17]]);path([[37,17],[44,17],[44,34],[36,34]]);break;
  case 11:path([[26,52],[26,33],[15,22],[15,12]]);path([[26,33],[37,22],[37,12]]);break;
 }
 // Preserve the reference motifs first; later fields vary connected geometry.
 const segments=paths.flatMap(points=>points.slice(1).map((b,i)=>[points[i],b]));
 function insidePolygon(x,y,p){let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
 // The first chambers give a new player room to enter and recover. Later
 // starter motifs taper back to the original narrow channel geometry.
 const channelRadius=level<=4?2.6:level<=8?1.6:.86;
 const cells=[],bricks=[];let signature='';for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const x=c+.5,y=r+.5;let distance=Infinity;for(const[a,b]of segments)distance=Math.min(distance,segmentDistance(x,y,a,b));let type=distance<channelRadius?'empty':distance<channelRadius+1?'wall':'brick';if(holes.some(p=>insidePolygon(x,y,p)))type='empty';if(c===0||c===COLS-1||r===0||r===ROWS-1)type='wall';if(r>=49&&Math.abs(x-entry[0])<channelRadius)type='empty';for(const g of gates){const along=(x-g.x)*g.dx+(y-g.y)*g.dy,across=Math.abs((x-g.x)*g.dy-(y-g.y)*g.dx);if(along>=-.3&&along<1.8&&across<.88)type='gate';}const cell={id:r*COLS+c,r,c,x:OX+c*CELL,y:OY+r*CELL,w:CELL,h:CELL,type,hp:type==='gate'?1:type==='brick'?1:Infinity};signature+=type==='brick'?'b':type==='wall'?'w':type==='gate'?'g':'.';if(type!=='empty'){cells.push(cell);if(type!=='wall')bricks.push(cell);}}
 // A letter can enclose a colored island. Add the smallest number of gate
 // tiles needed to make every breakable region reachable from the entrance.
 const lookup=new Map(cells.map(c=>[c.id,c])),start=51*COLS+Math.floor(entry[0]);
 for(let attempt=0;attempt<30;attempt++){
  const seen=new Set([start]),queue=[start];for(let i=0;i<queue.length;i++){const id=queue[i],r=Math.floor(id/COLS),c=id%COLS;for(const v of[id-COLS,id+COLS,c>0?id-1:-1,c<COLS-1?id+1:-1]){if(v<0||v>=COLS*ROWS||seen.has(v)||lookup.get(v)?.type==='wall')continue;seen.add(v);queue.push(v);}}
  if(!bricks.some(b=>!seen.has(b.id)))break;
  const dist=new Int16Array(COLS*ROWS).fill(30000),parent=new Int32Array(COLS*ROWS).fill(-1),deque=new Int32Array(24000);let head=12000,tail=head,found=-1;for(const id of seen){dist[id]=0;deque[tail++]=id;}
  while(head<tail){const id=deque[head++],r=Math.floor(id/COLS),c=id%COLS,cell=lookup.get(id);if(!seen.has(id)&&cell&&cell.type!=='wall'){found=id;break;}for(const v of[id-COLS,id+COLS,c>0?id-1:-1,c<COLS-1?id+1:-1]){if(v<0||v>=COLS*ROWS)continue;const vr=Math.floor(v/COLS),vc=v%COLS,wall=lookup.get(v)?.type==='wall';if(wall&&(vr===0||vr===ROWS-1||vc===0||vc===COLS-1))continue;const cost=wall?1:0;if(dist[v]>dist[id]+cost){dist[v]=dist[id]+cost;parent[v]=id;if(cost)deque[tail++]=v;else deque[--head]=v;}}}
  if(found<0)break;for(let v=found;v>=0&&!seen.has(v);v=parent[v]){const cell=lookup.get(v);if(cell?.type==='wall'){cell.type='gate';cell.hp=1;bricks.push(cell);}}
 }
 signature=Array.from({length:COLS*ROWS},(_,id)=>{const t=lookup.get(id)?.type;return t==='brick'?'b':t==='wall'?'w':t==='gate'?'g':'.';}).join('');
 return{cells,bricks,signature,family,name:FAMILIES[family],color:COLORS[family],entry:{x:entry[0]*CELL,y:OY+52*CELL},paths};
}
export function circleRect(x,y,r,b){const nx=clamp(x,b.x,b.x+b.w),ny=clamp(y,b.y,b.y+b.h);return(x-nx)**2+(y-ny)**2<=r*r;}
export class Game{
 constructor({seed=1,level=1,mode='play',onEvent=()=>{},patternFactory=makePattern}={}){this.seed=seed>>>0;this.level=Number.isSafeInteger(level)&&level>0?level:1;this.patternFactory=patternFactory;this.random=rng(this.seed^7523);this.emit=onEvent;this.mode=mode;this.score=0;this.lives=3;this.time=0;this.paddle={x:W/2+20,y:584,w:82};this.target=this.paddle.x;this.balls=[];this.drops=[];this.seen=new Set();this.stage();}
 stage(){let p=this.patternFactory(this.level,this.seed);p={...p,cells:p.cells.map(c=>({...c}))};p.bricks=p.cells.filter(c=>c.type!=='wall');this.seen.add(p.signature);if(this.seen.size>512)this.seen.delete(this.seen.values().next().value);this.pattern=p;this.name=p.name;this.color=p.color;this.grid=new Map(p.cells.map(c=>[c.id,c]));this.bricks=p.bricks;this.total=p.bricks.length;this.remaining=this.total;this.balls=[];this.drops=[];this.status='ready';this.stageTime=0;this.stageLosses=0;this.destroyed=0;this.lastHit=this.time;this.floorUntil=0;this.wideUntil=0;this.fireUntil=0;this.shootUntil=0;this.nextShot=0;this.multiplierReadyAt=this.time+8;this.shots=[];this.peakBalls=1;this.combo=0;this.challenge=playProfile(this.level);this.basePaddleWidth=this.challenge.paddleWidth;this.paddle.w=this.basePaddleWidth;this.paddle.x=clamp(p.entry.x+20,48,W-48);this.target=this.paddle.x;this.emit({type:'stage'});}
 speed(){return this.challenge.speed;}
 ball(x,y,angle=-Math.PI/2){const speed=this.speed();return{x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:2.35};}
 launch(){if(this.status!=='ready')return;const y=this.paddle.y-8,dx=this.pattern.entry.x-this.paddle.x,dy=this.pattern.entry.y+3-y,angle=Math.atan2(dy,Math.abs(dx)<1?5:dx);this.balls=[this.ball(this.paddle.x,y,angle)];this.status='playing';this.emit({type:'launch'});if(this.level<=2)this.power('laser');}
 next(){if(this.status!=='won')return;this.level++;this.lives=Math.min(5,this.lives+1);this.stage();}
 spawnDrop(x,y,kind){
  if(this.drops.length>=30)return false;
  if(kind==='triple'){
    if(this.time<this.multiplierReadyAt||this.drops.some(drop=>drop.kind==='triple'))return false;
    this.multiplierReadyAt=this.time+12;
  }
  this.drops.push({x,y,kind});return true;
 }
 damage(cell){if(!cell||cell.type==='wall'||cell.hp<=0)return false;cell.hp--;if(cell.hp>0){this.emit({type:'hit',x:cell.x+4,y:cell.y+4});return false;}this.grid.delete(cell.id);this.remaining--;this.destroyed++;this.combo=this.time-this.lastHit<2?this.combo+1:1;this.lastHit=this.time;this.score+=10;this.emit({type:'break',x:cell.x+4,y:cell.y+4});const n=this.destroyed;if(n===1||n===18)this.spawnDrop(cell.x+4,cell.y+4,'add');else if(n===7)this.spawnDrop(cell.x+4,cell.y+4,'laser');else if(n===40)this.spawnDrop(cell.x+4,cell.y+4,'wide');else if(n===85)this.spawnDrop(cell.x+4,cell.y+4,'triple');else if(n===25)this.spawnDrop(cell.x+4,cell.y+4,'floor');else if(n%this.challenge.boostInterval===0)this.spawnDrop(cell.x+4,cell.y+4,this.random()<.25?'triple':this.random()<.65?'add':'wide');else if(this.random()<.006)this.spawnDrop(cell.x+4,cell.y+4,['triple','add','wide','floor','fire','laser'][Math.floor(this.random()*6)]);return true;}
 power(kind){const before=this.balls.length;if(kind==='triple'){const sources=this.balls.slice();for(const b of sources){for(const turn of[-.17,.17]){if(this.balls.length>=MAX_BALLS)break;this.balls.push(this.ball(b.x,b.y,Math.atan2(b.vy,b.vx)+turn));}if(this.balls.length>=MAX_BALLS)break;}}if(kind==='add'){for(let i=0;i<3&&this.balls.length<MAX_BALLS;i++)this.balls.push(this.ball(this.paddle.x+(i-1)*5,this.paddle.y-9,-Math.PI/2+(i-1)*.2));}if(kind==='wide')this.wideUntil=this.time+20-4*this.challenge.growth;if(kind==='floor')this.floorUntil=this.time+24-5*this.challenge.growth;if(kind==='fire')this.fireUntil=this.time+5;if(kind==='laser'){this.shootUntil=this.time+SHOOT_SECONDS;this.nextShot=this.time;}this.peakBalls=Math.max(this.peakBalls,this.balls.length);this.emit({type:'power',kind,before,balls:this.balls.length,added:this.balls.length-before});}
 checkWin(){if(!this.remaining&&this.status==='playing'){this.status='won';this.score+=1000;this.balls=[];this.drops=[];this.shots=[];this.shootUntil=0;this.emit({type:'won'});}}
 // Purple shots pierce colored targets and pass permanent gray framing intact.
 // Swept row traversal prevents skipped bricks at fast playback or low frame rates.
 stepShots(dt){
  if(this.time<this.shootUntil&&this.time>=this.nextShot){
   if(this.shots.length<MAX_SHOTS)this.shots.push({x:this.paddle.x,y:this.paddle.y-8});
   this.nextShot=this.time+SHOT_INTERVAL;
  }
  for(const shot of this.shots){const oldY=shot.y;shot.y-=SHOT_SPEED*dt;const col=clamp(Math.floor(shot.x/CELL),0,COLS-1),bottom=Math.min(ROWS-1,Math.floor((oldY-OY)/CELL)),top=Math.max(0,Math.floor((shot.y-OY)/CELL));for(let row=bottom;row>=top;row--){const cell=this.grid.get(row*COLS+col);if(cell&&cell.type!=='wall')this.damage(cell);}}
  this.shots=this.shots.filter(s=>s.y>-12);
 }
 autoTarget(){const p=this.paddle,candidates=this.balls.filter(b=>b.vy>30&&b.y<p.y),next=candidates.sort((a,b)=>(p.y-a.y)/a.vy-(p.y-b.y)/b.vy)[0];let dest=p.x,eta=Infinity;if(next){eta=(p.y-next.y)/next.vy;let x=next.x+next.vx*eta;const span=W-2*next.r;x=((x-next.r)%(2*span)+2*span)%(2*span);const landing=next.r+(x>span?2*span-x:x);const aim=this.pattern.entry.x+Math.sin(this.time*1.73)*2,angle=Math.atan2(aim-landing,p.y-this.pattern.entry.y);dest=landing-clamp(angle/PADDLE_ANGLE,-.85,.85)*p.w/2;}const drop=this.drops.filter(d=>d.y<p.y).sort((a,b)=>b.y-a.y)[0];if(drop){const catchEta=(p.y-drop.y)/96;if(catchEta<eta-.1||eta>.8)dest=drop.x;}return dest;}
 // Broad phase includes the entire residual sweep, not just its endpoint.
 colliders(ball,dt){
  const x2=ball.x+ball.vx*dt,y2=ball.y+ball.vy*dt;
  const left=Math.max(0,Math.floor((Math.min(ball.x,x2)-ball.r-OX)/CELL));
  const right=Math.min(COLS-1,Math.floor((Math.max(ball.x,x2)+ball.r-OX)/CELL));
  const top=Math.max(0,Math.floor((Math.min(ball.y,y2)-ball.r-OY)/CELL));
  const bottom=Math.min(ROWS-1,Math.floor((Math.max(ball.y,y2)+ball.r-OY)/CELL));
  const cells=[];
  for(let r=top;r<=bottom;r++)for(let c=left;c<=right;c++){
   const cell=this.grid.get(r*COLS+c);if(cell)cells.push(cell);
  }
  return cells;
 }
 step(dt){
  if(this.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;
  dt=clamp(dt,0,1/30);this.time+=dt;this.stageTime+=dt;
  if(this.mode==='watch')this.target=this.autoTarget();
  const p=this.paddle;
  p.w=this.time<this.wideUntil?this.basePaddleWidth*(118/82):this.basePaddleWidth;
  this.target=clamp(this.target,p.w/2+2,W-p.w/2-2);
  const distance=this.target-p.x,movement=clamp(distance,-1500*dt,1500*dt);
  const paddle={x:p.x,y:p.y,w:p.w,vx:Math.sign(movement)*1500,movingUntil:Math.abs(movement)/1500};
  this.stepShots(dt);
  const world={
   bounds:{width:W,floor:this.time<this.floorUntil?H-11:undefined},paddle,speed:this.speed(),
   colliders:(b,remaining)=>this.colliders(b,remaining),
   impact:cell=>{if(cell.type!=='wall')this.damage(cell);},
   pierce:cell=>this.time<this.fireUntil&&cell.type==='brick',
   bounce:()=>this.emit({type:'bounce'}),
   // Only a development harness can supply a trace callback. No public URL,
   // menu or completion shortcut enables it in the application.
   trace:this.physicsTrace,
   exhausted:detail=>{this.physicsExhaustions=(this.physicsExhaustions||0)+1;this.lastPhysicsExhaustion=detail;},
  };
  for(const b of this.balls){
   if(this.physicsTrace){
    if(!b.diagnosticId)b.diagnosticId=this.physicsNextBallId=(this.physicsNextBallId||0)+1;
    world.trace=event=>this.physicsTrace({...event,ballId:b.diagnosticId});
   }
   advanceCircle(b,dt,world);
  }
  p.x+=movement;
  this.balls=this.balls.filter(b=>b.y<H+12&&Number.isFinite(b.x+b.y+b.vx+b.vy));
  for(const d of this.drops){
   d.y+=96*dt;
   if(d.y>=p.y-11&&d.y<=p.y+10&&Math.abs(d.x-p.x)<p.w/2+10){this.power(d.kind);d.y=H+40;}
  }
  this.drops=this.drops.filter(d=>d.y<H+16);this.checkWin();
  if(!this.balls.length&&this.status==='playing'){
   this.lives--;if(Number.isInteger(this.stageLosses))this.stageLosses++;this.drops=[];this.shots=[];this.shootUntil=0;
   if(this.lives<=0){this.status='over';this.emit({type:'over'});}
   else{this.status='ready';this.emit({type:'lost'});}
  }
 }
}
