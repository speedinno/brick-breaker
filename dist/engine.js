export const W=420,H=590,COLS=42,ROWS=32,CELL=9.5,OX=10.5,OY=38;
export const FAMILIES=['Prism gate','Ripple rings','Twin helix','Diamond mine','Sound wave','Star tunnel','Hourglass','Circuit garden','Vortex','Skyline','Petal burst','Chevron cascade'];
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function rng(seed){let s=seed>>>0;return ()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export function makePattern(level,seed){
 const rand=rng((seed^Math.imul(level,0x9e3779b1))>>>0),family=(level-1)%FAMILIES.length;
 const phase=rand()*6.28,twist=.6+rand()*1.4, gap=.055+rand()*.025;
 const bricks=[];let signature='';
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
  const x=(c+.5-COLS/2)/(COLS/2),y=(r+.5-ROWS/2)/(ROWS/2),d=Math.hypot(x,y),a=Math.atan2(y,x);
  let channel=false;
  switch(family){
   case 0: channel=Math.abs(x-Math.sin(y*3+phase)*.23)<.075||Math.abs(y+.28)<.06&&Math.abs(x)<.6;break;
   case 1: channel=Math.abs(Math.sin(d*12+phase))<.22;break;
   case 2: channel=Math.abs(x-Math.sin(y*6+phase)*.5)<.07||Math.abs(x+Math.sin(y*6+phase)*.5)<.07;break;
   case 3: channel=Math.abs((Math.abs(x)+Math.abs(y))% .47-.23)<gap;break;
   case 4: channel=Math.abs(y-Math.sin(x*7+phase)*.48)<.085||Math.abs(x)<.05;break;
   case 5: channel=Math.abs(d-(.42+.16*Math.cos(a*5+phase)))<.08||d<.12;break;
   case 6: channel=Math.abs(Math.abs(x)-Math.abs(y)*twist*.55)<.075;break;
   case 7: channel=(c%10===Math.floor(rand()*2)+3&&r%12<10)||(r%11===4&&c%14<12);break;
   case 8: channel=Math.abs(Math.sin(a*3+d*10+phase))<.26||d<.11;break;
   case 9: channel=r>ROWS*(.25+(.5+.5*Math.sin(c*.49+phase))*.42)&&c%7<2;break;
   case 10: channel=Math.abs(d-(.55+.25*Math.cos(a*6+phase)))<.07;break;
   case 11: channel=Math.abs((y+Math.abs(x)*twist)% .55)<.09;break;
  }
  // An open central entry makes every field immediately playable.
  if(r>25&&Math.abs(x)<.11)channel=true;
  const alive=!channel&&rand()>.018;
  signature+=alive?'1':'0';
  if(alive)bricks.push({id:r*COLS+c,r,c,x:OX+c*CELL,y:OY+r*CELL,w:CELL-1.2,h:CELL-1.2,hp:1,type:rand()<.025?'bomb':rand()<.018?'core':'normal',hue:(185+family*27+r*2.6+c*.7)%360});
 }
 return {bricks,family,name:FAMILIES[family],signature};
}
export function circleRect(x,y,r,b){const nx=clamp(x,b.x,b.x+b.w),ny=clamp(y,b.y,b.y+b.h);return (x-nx)**2+(y-ny)**2<=r*r;}
export class Game{
 constructor({seed=1,level=1,mode='arcade',onEvent=()=>{}}={}){this.seed=seed>>>0;this.level=clamp(Math.floor(level)||1,1,1000000);this.mode=mode;this.emit=onEvent;this.random=rng(this.seed^0xABCD);this.score=0;this.lives=3;this.paddle={x:W/2,w:86,y:548};this.target=W/2;this.balls=[];this.drops=[];this.combo=0;this.maxCombo=0;this.energy=0;this.time=0;this.lastHit=-10;this.wideUntil=0;this.fireUntil=0;this.shield=0;this.status='ready';this.seen=new Set();this.stage();}
 stage(){
  let pattern=makePattern(this.level,this.seed),attempt=0;
  while(this.seen.has(pattern.signature)&&attempt<30)pattern=makePattern(this.level,(this.seed+ ++attempt)>>>0);
  this.seen.add(pattern.signature);if(this.seen.size>256)this.seen.delete(this.seen.values().next().value);
  this.bricks=pattern.bricks;this.name=pattern.name;this.grid=new Map(this.bricks.map(b=>[b.id,b]));this.remaining=this.bricks.length;this.total=this.remaining;this.combo=0;this.energy=Math.max(45,this.energy);this.balls=[];this.drops=[];this.status='ready';this.wideUntil=0;this.fireUntil=0;this.stageTime=0;this.lastHit=this.time;this.shield=0;this.paddle.w=86;this.milestone=0;this.emit({type:'stage',level:this.level,name:this.name});
 }
 speed(){return Math.min(400,260+this.level*7);}
 ball(x,y,angle=-Math.PI/2){const s=this.speed();return{x,y,vx:Math.cos(angle)*s,vy:Math.sin(angle)*s,r:3.4,trail:[]};}
 launch(){if(this.status!=='ready')return;this.balls=[this.ball(this.paddle.x,this.paddle.y-10,-Math.PI/2-.07)];this.status='playing';this.emit({type:'launch'});if(this.stageTime===0){this.fireUntil=this.time+3.8;this.emit({type:'power',kind:'fire'});}}
 next(){if(this.status!=='won')return;this.level++;this.lives=Math.min(5,this.lives+1);this.stage();}
 damage(brick,chain=true){
  if(!brick||brick.hp<=0)return;brick.hp=0;this.grid.delete(brick.id);this.remaining--;this.combo++;this.maxCombo=Math.max(this.maxCombo,this.combo);this.lastHit=this.time;const multiplier=1+Math.min(4,Math.floor(this.combo/20));this.score+=10*multiplier;this.energy=clamp(this.energy+.55,0,100);
  this.emit({type:'break',x:brick.x+brick.w/2,y:brick.y+brick.h/2,hue:brick.hue,combo:this.combo,bomb:brick.type==='bomb'});
  if(brick.type==='bomb'&&chain){for(let r=Math.max(0,brick.r-2);r<=Math.min(ROWS-1,brick.r+2);r++)for(let c=Math.max(0,brick.c-2);c<=Math.min(COLS-1,brick.c+2);c++)this.damage(this.grid.get(r*COLS+c),false);}
  if(brick.type==='core'||this.random()<.012){if(this.drops.length<14)this.drops.push({x:brick.x,y:brick.y,kind:['multi','wide','fire','shield'][Math.floor(this.random()*4)]});}
 }
 power(kind){
  if(kind==='multi'){const sources=this.balls.slice(0,3);for(const b of sources)for(const angle of [-.3,.3]){if(this.balls.length>=18)break;const a=Math.atan2(b.vy,b.vx)+angle;this.balls.push(this.ball(b.x,b.y,a));}}
  if(kind==='wide')this.wideUntil=this.time+16;
  if(kind==='fire')this.fireUntil=this.time+10;
  if(kind==='shield')this.shield=1;
  this.emit({type:'power',kind});
 }
 pulse(){if(this.energy<100||this.status!=='playing')return false;this.energy=0;const live=[...this.grid.values()].sort((a,b)=>b.y-a.y);for(const b of live.slice(0,100))this.damage(b);this.emit({type:'pulse'});this.checkWin();return true;}
 checkWin(){if(this.remaining===0&&this.status==='playing'){this.status='won';this.score+=1000+this.level*100;this.balls=[];this.drops=[];this.emit({type:'won'});}}
 step(dt){
  if(this.status!=='playing')return;dt=clamp(dt,0,1/30);this.time+=dt;this.stageTime+=dt;
  this.paddle.w=this.time<this.wideUntil?124:86;
  const dest=clamp(this.target,this.paddle.w/2+5,W-this.paddle.w/2-5);this.paddle.x+=clamp(dest-this.paddle.x,-1100*dt,1100*dt);
  if(this.time-this.lastHit>2.2)this.combo=0;
  this.energy=clamp(this.energy+dt*1.8,0,100);
  const milestone=Math.floor((this.total-this.remaining)/65);
  if(milestone>this.milestone){this.milestone=milestone;this.power(milestone%2?'multi':'fire');}
  // A soft rescue removes tedious late-stage hunting without a timer or paywall.
  if(this.remaining<35&&this.time-this.lastHit>3){const b=this.grid.values().next().value;for(const ball of this.balls){const dx=b.x-ball.x,dy=b.y-ball.y,len=Math.hypot(dx,dy)||1;ball.vx=dx/len*this.speed();ball.vy=dy/len*this.speed();}this.lastHit=this.time-1;}
  for(const ball of this.balls){
   ball.trail.unshift({x:ball.x,y:ball.y});ball.trail.length=Math.min(9,ball.trail.length);
   const steps=Math.ceil(this.speed()*dt/2.5),sub=dt/steps;
   for(let i=0;i<steps;i++){
    const oldX=ball.x,oldY=ball.y;ball.x+=ball.vx*sub;ball.y+=ball.vy*sub;
    if(ball.x<ball.r){ball.x=ball.r;ball.vx=Math.abs(ball.vx);}if(ball.x>W-ball.r){ball.x=W-ball.r;ball.vx=-Math.abs(ball.vx);}if(ball.y<ball.r){ball.y=ball.r;ball.vy=Math.abs(ball.vy);}
    const p=this.paddle;
    if(ball.vy>0&&oldY+ball.r<=p.y+5&&ball.y+ball.r>=p.y&&Math.abs(ball.x-p.x)<p.w/2+ball.r){const offset=clamp((ball.x-p.x)/(p.w/2),-.95,.95),angle=-Math.PI/2+offset*1.08;ball.vx=Math.cos(angle)*this.speed();ball.vy=Math.sin(angle)*this.speed();ball.y=p.y-ball.r;this.emit({type:'bounce'});}
    if(ball.y>H-12&&ball.vy>0&&(this.shield||this.mode==='zen')){ball.y=H-13;ball.vy=-Math.abs(ball.vy);if(this.mode!=='zen')this.shield=0;this.emit({type:'save'});}
    const minC=clamp(Math.floor((ball.x-ball.r-OX)/CELL),0,COLS-1),maxC=clamp(Math.floor((ball.x+ball.r-OX)/CELL),0,COLS-1),minR=clamp(Math.floor((ball.y-ball.r-OY)/CELL),0,ROWS-1),maxR=clamp(Math.floor((ball.y+ball.r-OY)/CELL),0,ROWS-1);
    let hit=null;for(let r=minR;r<=maxR&&!hit;r++)for(let c=minC;c<=maxC;c++){const b=this.grid.get(r*COLS+c);if(b&&circleRect(ball.x,ball.y,ball.r,b)){hit=b;break;}}
    if(hit){this.damage(hit);if(this.time>=this.fireUntil){if(oldX+ball.r<=hit.x||oldX-ball.r>=hit.x+hit.w){ball.vx=-ball.vx;ball.x=oldX;}else{ball.vy=-ball.vy;ball.y=oldY;}}}
    // Prevent near-horizontal loops.
    if(Math.abs(ball.vy)<65)ball.vy=(ball.vy<0?-1:1)*65;
   }
  }
  this.balls=this.balls.filter(b=>b.y<H+20);
  for(const drop of this.drops){drop.y+=105*dt;if(drop.y>this.paddle.y-12&&drop.y<this.paddle.y+15&&Math.abs(drop.x-this.paddle.x)<this.paddle.w/2+12){this.power(drop.kind);drop.y=H+50;}}
  this.drops=this.drops.filter(d=>d.y<H+20);
  this.checkWin();
  if(!this.balls.length&&this.status==='playing'){this.lives--;this.combo=0;if(this.lives<=0){this.status='over';this.emit({type:'over'});}else{this.status='ready';this.drops=[];this.emit({type:'lost'});}}
 }
}
