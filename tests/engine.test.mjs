import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,makePattern,FAMILIES,W,H,COLS,CELL,circleRect} from '../dist/engine.js';
test('10,000 consecutive stages are distinct, bounded, and have an entry channel',()=>{
 const seen=new Set();
 for(let level=1;level<=10000;level++){
  const p=makePattern(level,8937);assert(!seen.has(p.signature),`repeat at ${level}`);seen.add(p.signature);
  assert(p.bricks.length>300&&p.bricks.length<1344);assert.equal(p.family,(level-1)%12);
  for(const b of p.bricks){assert(b.x>=0&&b.x+b.w<=W);assert(b.y>=0&&b.y+b.h<400);if(b.r>25)assert(Math.abs((b.c+.5-21)/21)>=.11);}
 }
 assert.equal(FAMILIES.length,12);
});
test('patterns reproduce exactly from seed and differ between runs',()=>{assert.deepEqual(makePattern(400,123),makePattern(400,123));assert.notEqual(makePattern(400,123).signature,makePattern(400,124).signature);});
test('circle / rectangle collision handles corners and edges',()=>{const b={x:10,y:10,w:10,h:10};assert(circleRect(8,15,2,b));assert(circleRect(11,11,1,b));assert(!circleRect(7,7,3,b));});
test('damage is idempotent; bombs do not wrap grid edges',()=>{const g=new Game({seed:6});const b=g.bricks.find(b=>b.c===0&&b.r>2);b.type='bomb';const distant=g.grid.get((b.r-1)*COLS+41);if(distant)distant.type='normal';const before=g.remaining;g.damage(b);const after=g.remaining;g.damage(b);assert.equal(g.remaining,after);assert(before>after);if(distant)assert.equal(distant.hp,1);assert.equal(g.grid.size,g.remaining);});
test('wall and paddle reflections preserve playable angles',()=>{
 const g=new Game();g.launch();g.balls=[{...g.ball(4,450),vx:-200,vy:-150}];g.step(1/120);assert(g.balls[0].vx>0);
 g.balls=[{...g.ball(g.paddle.x+30,g.paddle.y-4),vx:0,vy:260}];g.step(1/120);assert(g.balls[0].vy<0);assert(g.balls[0].vx>0);
});
test('high-speed balls cannot tunnel through a thin brick',()=>{const g=new Game({level:100});const b=g.bricks.find(b=>b.r===31);g.grid=new Map([[b.id,b]]);g.remaining=1;g.total=1;g.status='playing';g.balls=[{...g.ball(b.x+b.w/2,b.y+20),vy:-400,vx:0}];for(let i=0;i<20&&g.status==='playing';i++)g.step(1/120);assert.equal(b.hp,0);assert.equal(g.status,'won');});
test('losing balls costs exactly one life and keeps stage damage',()=>{const g=new Game();g.launch();g.damage(g.bricks[10]);const n=g.remaining;g.balls=[{...g.ball(200,H+40),vy:260}];g.step(1/120);assert.equal(g.status,'ready');assert.equal(g.lives,2);assert.equal(g.remaining,n);g.launch();assert.equal(g.status,'playing');});
test('game over fires once, and cannot continue to lose lives',()=>{const g=new Game();g.lives=1;g.launch();g.balls=[{...g.ball(200,H+40),vy:260}];g.step(1/120);for(let i=0;i<100;i++)g.step(1/120);assert.equal(g.lives,0);assert.equal(g.status,'over');});
test('zen safety floor and consumable shield reflect a miss',()=>{for(const mode of ['arcade','zen']){const g=new Game({mode});g.launch();g.shield=mode==='arcade'?1:0;g.balls=[{...g.ball(20,H-13),vx:10,vy:250}];g.step(1/120);assert(g.balls[0].vy<0);assert.equal(g.lives,3);assert.equal(g.shield,0);}});
test('powerups are bounded, pulse requires charge, and stages advance',()=>{const g=new Game();assert.equal(g.pulse(),false);g.launch();for(let i=0;i<50;i++)g.power('multi');assert.equal(g.balls.length,18);g.power('wide');g.step(1/120);assert.equal(g.paddle.w,124);g.energy=100;assert.equal(g.pulse(),true);assert(g.energy<100);const level=g.level;for(const b of [...g.grid.values()])g.damage(b);g.checkWin();assert.equal(g.status,'won');g.next();assert.equal(g.level,level+1);assert.equal(g.status,'ready');assert(g.remaining>300);});
test('30-minute simulation remains finite with bounded entities',()=>{const g=new Game({seed:100,mode:'zen'});g.launch();for(let t=0;t<30*60*120;t++){if(g.status==='won'){g.next();g.launch();}g.target=g.balls.filter(b=>b.vy>0).sort((a,b)=>b.y-a.y)[0]?.x??W/2;if(g.energy>=100)g.pulse();g.step(1/120);assert(g.balls.length<=18);assert(g.drops.length<=14);assert.equal(g.remaining,g.grid.size);for(const b of g.balls)assert(Number.isFinite(b.x+b.y+b.vx+b.vy));}assert(g.level>2,`only reached stage ${g.level}`);});
