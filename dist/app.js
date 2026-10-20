import {Game,W,H,COLS,ROWS,CELL,OX,OY,clamp} from './engine.js';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false});
const STORE='prism-rush-v1';let saved={};try{saved=JSON.parse(localStorage.getItem(STORE)||'{}')||{};}catch{}
const validInt=(n,a,b,fallback)=>Number.isSafeInteger(n)&&n>=a&&n<=b?n:fallback;
let reduced=typeof saved.reduced==='boolean'?saved.reduced:matchMedia('(prefers-reduced-motion: reduce)').matches;
let sound=false,haptics=saved.haptics===true,audio=null,paused=false,mode='arcade',game,particles=[],rings=[],toastTimer,installPrompt=null,lastTime=0,accumulator=0,keys=new Set(),dragging=false,previousFocus=null;
let best={arcade:validInt(saved.best?.arcade,0,1e12,0),zen:validInt(saved.best?.zen,0,1e12,0)};
const progress={arcade:null,zen:null};
for(const m of ['arcade','zen']){const p=saved.progress?.[m];if(p&&Number.isSafeInteger(p.seed)&&Number.isSafeInteger(p.level)&&p.level>0&&p.level<=1000000)progress[m]={seed:p.seed>>>0,level:p.level,score:validInt(p.score,0,1e12,0),lives:validInt(p.lives,1,5,3)};}
function persist(){try{localStorage.setItem(STORE,JSON.stringify({best,progress,reduced,haptics}));}catch{}}
function checkpoint(){progress[mode]={seed:game.seed,level:game.level,score:game.score,lives:game.lives};persist();}
function tone(freq=500,duration=.06,type='sine',volume=.025){if(!sound)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type=type;oscillator.frequency.setValueAtTime(freq,audio.currentTime);oscillator.frequency.exponentialRampToValueAtTime(Math.max(80,freq*.55),audio.currentTime+duration);gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+duration);}catch{sound=false;}}
let lastTone=0;
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),1800);}
function event(e){
 if(e.type==='break'){
  if(!reduced&&particles.length<250){for(let i=0;i<(e.bomb?12:3);i++)particles.push({x:e.x,y:e.y,vx:(Math.random()-.5)*140,vy:(Math.random()-.5)*140,life:.45,hue:e.hue});}
  if(e.bomb&&!reduced)rings.push({x:e.x,y:e.y,r:5,life:.45});
  if(performance.now()-lastTone>45){tone(400+Math.min(e.combo,100)*12,.045,'sine',.016);lastTone=performance.now();}
  if(e.combo===20||e.combo===50||e.combo===100)toast(`${e.combo} HIT FLOW ✦`);
 }else if(e.type==='power'){const labels={multi:'MULTIBALL +2 ✦',wide:'WIDE PADDLE ↔',fire:'FIREBALLS ONLINE ✹',shield:'SAFETY SHIELD ⌒'};toast(labels[e.kind]);tone(800,.18,'triangle');if(haptics&&navigator.vibrate)navigator.vibrate(15);}
 else if(e.type==='bounce')tone(230,.045,'triangle',.02);
 else if(e.type==='pulse'){tone(110,.4,'sawtooth',.025);toast('PRISM PULSE ✦');if(!reduced)rings.push({x:W/2,y:330,r:20,life:.8});if(haptics&&navigator.vibrate)navigator.vibrate([20,30,20]);}
 else if(e.type==='won'){tone(1040,.3,'triangle');updateBest();progress[mode]={seed:game.seed,level:game.level+1,score:game.score,lives:Math.min(5,game.lives+1)};persist();showOverlay('won');}
 else if(e.type==='lost'){checkpoint();showOverlay('lost');tone(160,.2);}
 else if(e.type==='over'){updateBest();progress[mode]=null;persist();showOverlay('over');tone(120,.35);}
 else if(e.type==='launch'){hideOverlay();tone(600,.08);}
}
function updateBest(){best[mode]=Math.max(best[mode],game.score);$('best').textContent=String(best[mode]).padStart(6,'0');persist();}
function newGame(m=mode,fresh=false){mode=m;paused=false;keys.clear();particles=[];rings=[];const p=!fresh&&progress[m];const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);game=new Game({seed:p?p.seed:bytes[0],level:p?p.level:1,mode:m,onEvent:event});if(p){game.score=p.score;game.lives=p.lives;}checkpoint();$('arcade').classList.toggle('selected',m==='arcade');$('zen').classList.toggle('selected',m==='zen');$('arcade').setAttribute('aria-pressed',String(m==='arcade'));$('zen').setAttribute('aria-pressed',String(m==='zen'));$('best').textContent=String(best[m]).padStart(6,'0');$('patternName').textContent=game.name;$('stageLabel').textContent=`STAGE ${String(game.level).padStart(2,'0')}`;showOverlay(p?'resume':'start');sync();}
function showOverlay(kind){
 const states={start:['YOUR NEXT OBSESSION',"Let's break<br>some things.",'Drag to move. Tap launch.<br>Find the gap and watch it unravel.','Launch ball','↗'],resume:['WELCOME BACK',`Stage ${game.level}.<br>Fresh energy.`,'Your journey is right where you left it.','Continue stage','↗'],lost:['YOU HAVE ANOTHER SHOT','Shake it off.<br>Find your angle.',`${game.lives} ${game.lives===1?'life':'lives'} left. Your bricks stay broken.`,'Launch again','↗'],paused:['TAKE YOUR TIME','A little<br>breathing room.','Your next bounce can wait.','Keep playing','Ⅱ'],won:['PATTERN COMPLETE',`Beautiful<br>destruction.`,`${game.name} cleared. Next: a brand new pattern.`,'Next stage','✦'],over:['GOOD RUN',`${game.score.toLocaleString()}<br>points of chaos.`,`Reached stage ${game.level} · Best flow ${game.maxCombo}<br>Another angle. Another possibility.`,'Play again','↻']};
 const s=states[kind];$('overlayTag').textContent=s[0];$('overlayTitle').innerHTML=s[1];$('overlayText').innerHTML=s[2];$('primary').innerHTML=s[3]+' <span>↗</span>';$('overlayIcon').textContent=s[4];$('overlay').hidden=false;$('overlay').dataset.kind=kind;$('secondary').hidden=kind!=='resume';document.body.classList.remove('playing');$('pause').setAttribute('aria-label',kind==='paused'?'Resume game':'Pause game');
}
function hideOverlay(){$('overlay').hidden=true;document.body.classList.add('playing');$('pause').setAttribute('aria-label','Pause game');}
function action(){if($('help').open)return;if(paused){paused=false;hideOverlay();}else if(game.status==='won'){game.next();checkpoint();$('patternName').textContent=game.name;$('stageLabel').textContent=`STAGE ${String(game.level).padStart(2,'0')}`;showOverlay('resume');}else if(game.status==='over'){newGame(mode,true);}else game.launch();canvas.focus({preventScroll:true});}
function pause(){if($('help').open)return;if(paused){paused=false;hideOverlay();}else if(game.status==='playing'){paused=true;keys.clear();showOverlay('paused');}}
function sync(){
 $('score').textContent=String(game.score).padStart(6,'0');$('remaining').textContent=game.remaining;$('lives').textContent=mode==='zen'?'∞ ZEN':Array.from({length:game.lives},()=>'●').join(' ');$('lives').setAttribute('aria-label',mode==='zen'?'Unlimited lives':`${game.lives} lives`);$('energy').textContent=`${Math.floor(game.energy)}%`;$('energyBar').style.width=game.energy+'%';$('pulse').disabled=game.energy<100||game.status!=='playing'||paused;$('progress').style.width=(1-game.remaining/game.total)*100+'%';$('combo').textContent=game.combo>=5?`${game.combo} HIT FLOW · ×${1+Math.min(4,Math.floor(game.combo/20))}`:'FIND YOUR FLOW';$('ballCount').textContent=`${Math.max(1,game.balls.length)} ${game.balls.length>1?'BALLS':'BALL'}`;$('stageProgress').textContent=`${Math.round((1-game.remaining/game.total)*100)}% of the pattern unraveled`;
}
function rounded(x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
const dropColors={multi:'#74e8ff',wide:'#dcff84',fire:'#ff84bd',shield:'#c2a2ff'},dropLabels={multi:'+2',wide:'↔',fire:'✹',shield:'⌒'};
function draw(dt){
 ctx.fillStyle='#111119';ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#1e1d2b';for(let y=35;y<H-30;y+=19)for(let x=10;x<W;x+=19)ctx.fillRect(x,y,1,1);
 for(const b of game.grid.values()){
  const color=b.type==='bomb'?'#e4fb8f':b.type==='core'?'#fff5d2':`hsl(${b.hue} 64% 63%)`;
  rounded(b.x,b.y,b.w,b.h,1.1,color);
  ctx.fillStyle='#ffffff25';ctx.fillRect(b.x+.7,b.y+.5,b.w-1.4,1);
  if(b.type==='bomb'){ctx.fillStyle='#4b5625';ctx.fillRect(b.x+3,b.y+2,2,4);ctx.fillRect(b.x+2,b.y+3,4,2);}
  if(b.type==='core'){ctx.fillStyle='#7d6f29';ctx.fillRect(b.x+3,b.y+3,2,2);}
 }
 ctx.strokeStyle='#8e78c823';ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(12,522);ctx.lineTo(W-12,522);ctx.stroke();ctx.setLineDash([]);
 if(game.shield||mode==='zen'){ctx.strokeStyle='#cbb0ff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(7,H-12);ctx.lineTo(W-7,H-12);ctx.stroke();ctx.lineWidth=1;}
 for(const p of particles){if(!paused){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=170*dt;p.life-=dt;}ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=`hsl(${p.hue} 85% 75%)`;ctx.fillRect(p.x,p.y,2.5,2.5);}ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0);
 for(const r of rings){if(!paused){r.r+=300*dt;r.life-=dt;}ctx.strokeStyle=`rgba(220,255,146,${Math.max(0,r.life)})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,Math.PI*2);ctx.stroke();}ctx.lineWidth=1;rings=rings.filter(r=>r.life>0);
 for(const b of game.balls){if(!reduced){b.trail.forEach((p,i)=>{ctx.globalAlpha=(1-i/9)*.28;ctx.fillStyle=game.time<game.fireUntil?'#ff8dba':'#c9c0ff';ctx.beginPath();ctx.arc(p.x,p.y,b.r*(1-i/12),0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;}ctx.shadowBlur=reduced?0:12;ctx.shadowColor=game.time<game.fireUntil?'#ff87c3':'#c9b5ff';ctx.fillStyle=game.time<game.fireUntil?'#ffb5d4':'#fff';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
 const p=game.paddle;rounded(p.x-p.w/2,p.y,p.w,7,4,'#d9ff88');rounded(p.x-p.w/2+5,p.y+1,p.w-10,2,1,'#f4ffcf');
 if(game.status==='ready'){
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p.x,p.y-10,3.4,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#d9ff8833';ctx.setLineDash([3,8]);ctx.beginPath();ctx.moveTo(p.x,p.y-24);ctx.lineTo(p.x-24,p.y-148);ctx.stroke();ctx.setLineDash([]);
 }
 for(const d of game.drops){rounded(d.x-11,d.y-10,22,20,7,dropColors[d.kind]);ctx.fillStyle='#1c2430';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText(dropLabels[d.kind],d.x,d.y+4);}
}
function frame(t){const dt=Math.min(.05,(t-lastTime)/1000||0);lastTime=t;
 if(!paused&&!$('help').open){if(keys.has('ArrowLeft')||keys.has('a'))game.target-=420*dt;if(keys.has('ArrowRight')||keys.has('d'))game.target+=420*dt;game.target=clamp(game.target,0,W);if(game.status==='ready'){game.paddle.x=clamp(game.target,game.paddle.w/2+5,W-game.paddle.w/2-5);}accumulator+=dt;let loops=0;while(accumulator>=1/120&&loops++<8){game.step(1/120);accumulator-=1/120;}if(loops>=8)accumulator=0;}else accumulator=0;
 draw(dt);sync();requestAnimationFrame(frame);
}
function pointer(e){const rect=canvas.getBoundingClientRect();game.target=clamp((e.clientX-rect.left)*W/rect.width,0,W);}
canvas.addEventListener('pointerdown',e=>{dragging=true;canvas.setPointerCapture(e.pointerId);pointer(e);if(game.status==='ready'&&$('overlay').hidden)game.launch();});
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||dragging)pointer(e);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{dragging=false;});
document.addEventListener('keydown',e=>{if($('help').open)return;if(e.target.matches('button,input,a')&&[' ','Enter'].includes(e.key))return;const key=e.key.length===1?e.key.toLowerCase():e.key;if(['ArrowLeft','ArrowRight',' ','a','d','x','p','Escape'].includes(key)){e.preventDefault();if(e.repeat&&[' ','x','p','Escape'].includes(key))return;keys.add(key);if(key===' ')action();if(key==='x'&&!paused)game.pulse();if(key==='p'||key==='Escape')pause();}});
document.addEventListener('keyup',e=>keys.delete(e.key.length===1?e.key.toLowerCase():e.key));
function away(){keys.clear();dragging=false;if(game.status==='playing'&&!paused){paused=true;showOverlay('paused');}updateBest();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)away();});window.addEventListener('blur',away);window.addEventListener('pagehide',()=>{updateBest();});
$('primary').onclick=action;$('secondary').onclick=()=>newGame(mode,true);$('pause').onclick=pause;$('pulse').onclick=()=>{if(!paused)game.pulse();};
for(const m of ['arcade','zen'])$(m).onclick=()=>{if(mode===m)return;updateBest();newGame(m);};
$('sound').onclick=()=>{sound=!sound;$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'Mute sound':'Enable sound');$('sound').style.color=sound?'#daff7c':'';if(sound)tone(660,.13);};
$('settings').onclick=()=>{previousFocus=document.activeElement;if(game.status==='playing'&&!paused){paused=true;showOverlay('paused');}$('help').showModal();$('reduced').checked=reduced;$('haptics').checked=haptics;};
$('closeHelp').onclick=()=>$('help').close();$('help').addEventListener('close',()=>previousFocus?.focus());$('reduced').onchange=e=>{reduced=e.target.checked;if(reduced){particles=[];rings=[];}persist();};$('haptics').onchange=e=>{haptics=e.target.checked;persist();};$('restart').onclick=()=>{$('help').close();newGame(mode,true);};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
$('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else toast('Install: browser menu → Add to Home Screen');};
$('installMobile').onclick=()=>{$('help').close();$('install').click();};
$('share').onclick=async()=>{const data={title:'Prism Rush · Brick Breaker',text:`I reached stage ${game.level} in Prism Rush. Find your angle.`,url:location.href.split('?')[0]};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(`${data.text} ${data.url}`);toast('Game link copied ↗');}}catch(e){if(e.name!=='AbortError')toast('Copy the address above to share your run.');}};
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
newGame();requestAnimationFrame(frame);
