import {Game,W,H,ROWS,CELL,clamp} from './engine.js';
import {LevelCache,hydrateDefinition,definitionHash} from './catalog.js';
import {ProgressStore,cloudProgress,mergeProgress,isUnlocked,isCompleted,nextRequired,completedCount} from './progress.js';
import {snapshotGame,restoreGame} from './session.js';
import {CloudAccount} from './cloud.js';
import {JourneyMap} from './journey-ui.js';
import {AccountPanel} from './account-ui.js';
import {Capacitor,App,Haptics,ImpactStyle} from './vendor/native.js';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false}),native=Capacitor.isNativePlatform(),PUBLIC_URL='https://speedinno.github.io/brick-breaker/';
let storage;try{storage=localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error('Storage unavailable');},removeItem:()=>{}};}
const readJSON=key=>{try{return JSON.parse(storage.getItem(key)||'null');}catch{return null;}};
const options=readJSON('brick-breaker-options-v3')||{},store=new ProgressStore(storage),cache=new LevelCache();
let reduced=typeof options.reduced==='boolean'?options.reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,haptics=options.haptics===true,sound=false,audio=null,lastSound=0;
let game=null,definition=null,currentHash='',run=null,assisted=false,paused=false,loading=false,auto=false,speed=1,paintVersion='',lastTime=0,accumulator=0,lastSnapshot=0,drag=false,toastTimer,installPrompt=null,booting=true,accountIdentity=null,authEpoch=0,loadEpoch=0,syncTask=null,wantedLevel=1;
const keys=new Set(),focusBefore=new Map(),background=document.createElement('canvas');background.width=W;background.height=H;const bg=background.getContext('2d');
const boosts={add:{color:'#34c9df',label:'+3'},triple:{color:'#a4ce25',label:'×3'},wide:{color:'#6bb447',label:'↔'},floor:{color:'#f3a275',label:'—'},fire:{color:'#e876aa',label:'♨'}};
const cloud=new CloudAccount(accountChanged);
const journey=new JourneyMap({getProgress:()=>store.value,select:level=>start(level),open:openDialog,close:closeDialog});
const account=new AccountPanel({cloud,getProgress:()=>store.value,getGuest:()=>new ProgressStore(storage).value,open:openDialog,native,callbacks:{sync:syncPending,importGuest,deleteAccount}});
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2400);}
function persistOptions(){try{storage.setItem('brick-breaker-options-v3',JSON.stringify({reduced,haptics}));}catch{}}
function sessionKey(id=store.accountId){return `brick-breaker-session-v3:${id?'user:'+id:'guest'}`;}
function saveSession(){if(!game||loading)return;const snapshot=snapshotGame(game,{auto,speed,run,assisted});try{if(snapshot)storage.setItem(sessionKey(),JSON.stringify(snapshot));else storage.removeItem(sessionKey());}catch{store.storageError=true;updateStatus();}}
function clearSession(id=store.accountId){try{storage.removeItem(sessionKey(id));}catch{}}
function tone(freq=500,duration=.03){if(!sound)return;try{audio ||=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')void audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.frequency.setValueAtTime(freq,audio.currentTime);gain.gain.setValueAtTime(.012,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch{sound=false;}}
function updateStatus(){const p=store.value;$('journeyStatus').textContent=p.starters.length<12?`${p.starters.length}/12 starters completed`:`${completedCount(p).toLocaleString()} completed · Next ${p.journeyNext}`;$('saveStatus').textContent=store.storageError?'Storage full':cloud.signedIn?p.pending.length?`${p.pending.length} pending save${p.pending.length===1?'':'s'}`:cloud.state?'Cloud save':'Device save':'Device save';$('saveStatus').classList.toggle('pending',store.storageError||p.pending.length>0);if(game)$('completedIndicator').hidden=!isCompleted(p,game.level);}
function syncHUD(){if(!game)return;$('balls').textContent=game.status==='ready'?1:game.balls.length;$('remaining').textContent=game.remaining;$('lives').textContent='● '.repeat(game.lives).trim();$('lives').setAttribute('aria-label',`${game.lives} lives`);$('progress').style.width=`${(1-game.remaining/game.total)*100}%`;}
function suggestedNext(level){if(store.value.starters.length<12){for(let n=level+1;n<=12;n++)if(!isCompleted(store.value,n))return n;}return nextRequired(store.value);}
function prompt(kind){
  if(!game)return;
  const next=suggestedNext(game.level),remaining=12-store.value.starters.length;
  const states={ready:['Find the entrance.','Drag the paddle. Catch the boosts. Grow the swarm.','Launch ↗︎'],resume:[`Stage ${game.level}. Ready when you are.`,game.status==='playing'?'Your field and swarm are right where you left them.':'Your saved stage is ready.','Continue ↗︎'],paused:['Paused.','Your progress is safe on this device.','Resume ▷'],lost:['One more shot.',`${game.lives} ${game.lives===1?'life':'lives'} left. Broken bricks stay broken.`,'Launch ↗︎'],won:[`Stage ${game.level} completed ✓`,remaining>0?`${remaining} starter ${remaining===1?'stage remains':'stages remain'} before the journey opens.`:`Stage ${next} is unlocked. A new discovery is ready.`,`Next · Stage ${next} ↗︎`],over:['Try another angle.',`Your completion ticks are safe. Retry stage ${game.level}.`,'Retry this stage ↻']};
  const value=states[kind];$('promptTitle').textContent=value[0];$('promptText').textContent=value[1];$('launch').textContent=value[2];$('watch').hidden=['paused','won','over'].includes(kind);$('prompt').hidden=false;$('prompt').classList.remove('loading');$('pause').setAttribute('aria-label',kind==='paused'?'Resume':'Pause');
}
function event(e){
  if(e.type==='launch')$('prompt').hidden=true;
  if((e.type==='break'||e.type==='hit')&&performance.now()-lastSound>55){lastSound=performance.now();tone(620+Math.min(100,game?.combo||0)*5);}
  if(e.type==='power'){toast({add:'+3 BALLS',triple:`×3 · ${e.balls} BALLS`,wide:'WIDE PADDLE',floor:'SAFETY FLOOR',fire:'FIREBALLS'}[e.kind]);tone(840,.14);if(haptics){if(native)void Haptics.impact({style:ImpactStyle.Light}).catch(()=>{});else navigator.vibrate?.(12);}}
  if(e.type==='lost'){saveSession();prompt('lost');tone(140,.2);}
  if(e.type==='over'){clearSession();prompt('over');tone(140,.2);}
  if(e.type==='won'){
    const result={score:game.score,seconds:Math.round(game.stageTime*1000)/1000,peak:game.peakBalls,mode:assisted?'watch':'play'};
    store.complete(game.level,result);
    if(cloud.signedIn&&run){const pending={...result,level:game.level,runId:run.runId,hash:currentHash,remote:run.remote===true};store.save({...store.value,pending:[...store.value.pending.filter(p=>p.runId!==run.runId),pending]});}
    clearSession();updateStatus();prompt('won');tone(1040,.25);if($('gallery').open)journey.render();if(cloud.signedIn)void syncPending().catch(()=>updateStatus());
    else {const next=nextRequired(store.value);if(next>12)void cache.load(next).catch(()=>{});}
  }
}
async function start(level=store.value.selected,{resume=false}={}){
  if(!isUnlocked(store.value,level)){toast('Finish earlier stages to unlock this stage.');return;}
  saveSession();wantedLevel=level;const epoch=++loadEpoch;loading=true;paused=false;keys.clear();drag=false;$('prompt').hidden=false;$('prompt').classList.add('loading');$('promptTitle').textContent='Getting your stage ready.';$('promptText').textContent='A new channel is waiting.';
  try{
    if(cloud.signedIn&&navigator.onLine!==false)await syncPending().catch(()=>{});
    const nextDefinition=await cache.load(level,cloud),hash=nextDefinition.hash||await definitionHash(nextDefinition);
    if(epoch!==loadEpoch)return;
    definition=nextDefinition;currentHash=hash;const pattern=hydrateDefinition(definition);let restored=null;
    const snapshot=resume?readJSON(sessionKey()):null;if(snapshot?.level===level)restored=restoreGame(snapshot,pattern,event);
    game=restored||new Game({level,seed:crypto.getRandomValues(new Uint32Array(1))[0],mode:auto?'watch':'play',patternFactory:()=>pattern,onEvent:event});
    run=restored?snapshot.run:null;auto=restored?Boolean(snapshot.auto):auto;speed=restored&&[1,2,4].includes(snapshot.speed)?snapshot.speed:speed;assisted=Boolean(restored&&snapshot.assisted||auto);
    game.mode=auto?'watch':'play';paused=Boolean(restored&&game.status==='playing');paintVersion='';accumulator=0;
    store.save({...store.value,selected:level,updatedAt:Date.now()});$('level').textContent=String(level).padStart(2,'0');$('name').textContent=game.name;$('auto').setAttribute('aria-pressed',String(auto));$('speed').textContent=speed+'×';
    prompt(restored?'resume':'ready');syncHUD();updateStatus();
  }catch(error){if(epoch===loadEpoch){$('prompt').classList.remove('loading');$('promptTitle').textContent='Your stage is safe.';$('promptText').textContent=error.message||'Please try again.';$('launch').textContent='Try again';$('watch').hidden=true;loading='failed';toast(error.message||'Could not open this stage.');}}
  finally{if(epoch===loadEpoch&&loading!=='failed'){loading=false;saveSession();}}
}
async function ensureRun(){
  if(run?.level===game.level&&run.hash===currentHash)return;
  const activeGame=game,epoch=authEpoch,id=crypto.randomUUID(),hash=currentHash;run={runId:id,level:activeGame.level,hash,remote:false};
  if(cloud.signedIn&&navigator.onLine!==false){try{const result=await cloud.start(activeGame.level,id);if(epoch!==authEpoch||game!==activeGame)return;if(result.layout_hash!==hash)throw Error('This stage has an updated catalog entry. Reopen the stage.');run={...run,remote:true};}catch(error){if(epoch!==authEpoch||game!==activeGame)return;if(!error.network){run=null;throw error;}}}
}
async function action(){
  if([...document.querySelectorAll('dialog')].some(d=>d.open))return;
  if(loading==='failed'){loading=false;await start(wantedLevel,{resume:true});return;}if(loading||!game)return;
  if(paused){paused=false;$('prompt').hidden=true;$('pause').setAttribute('aria-label','Pause');return;}
  if(game.status==='won'){await start(suggestedNext(game.level));return;}
  if(game.status==='over'){await start(game.level);return;}
  if(game.status==='ready'){const activeGame=game,epoch=authEpoch;loading=true;try{await ensureRun();if(epoch!==authEpoch||game!==activeGame)return;game.paddle.x=clamp(game.target,game.paddle.w/2+2,W-game.paddle.w/2-2);game.launch();}catch(error){if(epoch===authEpoch&&game===activeGame){toast(error.message);prompt('ready');}}finally{if(epoch===authEpoch&&game===activeGame){loading=false;saveSession();}}}
  canvas.focus({preventScroll:true});
}
function pause(){if(!game||loading)return;if(paused){paused=false;$('prompt').hidden=true;$('pause').setAttribute('aria-label','Pause');}else if(game.status==='playing'){paused=true;keys.clear();prompt('paused');saveSession();}}
function away(){keys.clear();drag=false;if(game?.status==='playing'&&!paused){paused=true;prompt('paused');}saveSession();}
function openDialog(id){focusBefore.set(id,document.activeElement);if(game?.status==='playing'&&!paused){paused=true;prompt('paused');}keys.clear();drag=false;saveSession();if(!$(id).open)$(id).showModal();}
function closeDialog(id){if($(id).open)$(id).close();}
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{const prior=focusBefore.get(dialog.id);if(prior?.isConnected&&(!prior.closest('dialog')||prior.closest('dialog').open))prior.focus();});
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>closeDialog(button.dataset.close);
function paintCells(context,cells,fill){for(const cell of cells){context.fillStyle=cell.type==='wall'?'#9a9a91':cell.type==='gate'?'#e8d530':cell.color||fill;context.fillRect(cell.x+.55,cell.y+.55,cell.w-1.1,cell.h-1.1);}}
function draw(){
  if(!game){ctx.fillStyle='#191919';ctx.fillRect(0,0,W,H);return;}
  const version=`${game.level}:${game.remaining}`;if(paintVersion!==version){bg.fillStyle='#191919';bg.fillRect(0,0,W,H);paintCells(bg,game.grid.values(),game.color);paintVersion=version;}ctx.drawImage(background,0,0);
  const p=game.paddle;if(game.time<game.floorUntil){ctx.fillStyle='#ff8251';ctx.fillRect(0,H-11,W,4);}ctx.fillStyle='#ff8050';ctx.fillRect(p.x-p.w/2,p.y,p.w,7);ctx.fillStyle='#ff9b6c';ctx.fillRect(p.x-p.w/2,p.y,p.w,1);ctx.fillStyle=game.time<game.fireUntil?'#ffd5c2':'#fff';ctx.beginPath();for(const b of game.balls){ctx.moveTo(b.x+b.r,b.y);ctx.arc(b.x,b.y,b.r,0,Math.PI*2);}ctx.fill();
  if(game.status==='ready'){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p.x,p.y-8,2.35,0,Math.PI*2);ctx.fill();const dx=game.pattern.entry.x-p.x,dy=game.pattern.entry.y+3-(p.y-8);for(let i=1;i<=11;i++){const t=i/11;ctx.fillStyle=`rgba(230,230,230,${.45*(1-t*.6)})`;ctx.beginPath();ctx.arc(p.x+dx*t,p.y-8+dy*t,1.15,0,Math.PI*2);ctx.fill();}}
  for(const drop of game.drops){const spec=boosts[drop.kind];if(!reduced){ctx.shadowColor=spec.color;ctx.shadowBlur=5;}ctx.fillStyle=spec.color;ctx.beginPath();ctx.arc(drop.x,drop.y,9,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.font='bold 9px Arial';ctx.textAlign='center';ctx.fillText(spec.label,drop.x,drop.y+3);}
}
function frame(t){
  const dt=Math.min(.05,(t-lastTime)/1000||0);lastTime=t;
  if(game&&!paused&&!loading&&![...document.querySelectorAll('dialog')].some(d=>d.open)){
    if(keys.has('ArrowLeft')||keys.has('a'))game.target-=420*dt;if(keys.has('ArrowRight')||keys.has('d'))game.target+=420*dt;game.target=clamp(game.target,0,W);
    if(game.status==='ready')game.paddle.x=clamp(game.target,game.paddle.w/2+2,W-game.paddle.w/2-2);
    accumulator+=dt*speed;let steps=0;while(accumulator>=1/120&&steps++<28){game.step(1/120);accumulator-=1/120;}if(steps>=28)accumulator=0;
  }else accumulator=0;
  draw();syncHUD();if(t-lastSnapshot>10000){lastSnapshot=t;saveSession();}requestAnimationFrame(frame);
}
function pointer(e){if(!game||loading)return;const rect=canvas.getBoundingClientRect();game.target=clamp((e.clientX-rect.left)*W/rect.width,0,W);}
canvas.addEventListener('pointerdown',e=>{if(!game)return;drag=true;canvas.setPointerCapture(e.pointerId);if(auto)setAuto(false);pointer(e);});canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&!auto||drag)pointer(e);});for(const kind of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(kind,()=>drag=false);
document.addEventListener('keydown',e=>{if([...document.querySelectorAll('dialog')].some(d=>d.open))return;if(e.target.matches('button,input,a')&&[' ','Enter'].includes(e.key))return;const key=e.key.length===1?e.key.toLowerCase():e.key;if(['ArrowLeft','ArrowRight','a','d',' ','p','Escape'].includes(key)){e.preventDefault();if(e.repeat&&[' ','p','Escape'].includes(key))return;keys.add(key);if(key===' ')void action();if(key==='p'||key==='Escape')pause();}});document.addEventListener('keyup',e=>keys.delete(e.key.length===1?e.key.toLowerCase():e.key));
document.addEventListener('visibilitychange',()=>{if(document.hidden)away();});window.addEventListener('blur',away);window.addEventListener('pagehide',saveSession);
function setAuto(value){auto=value;if(game)game.mode=auto?'watch':'play';if(auto)assisted=true;$('auto').setAttribute('aria-pressed',String(auto));}
$('auto').onclick=()=>setAuto(!auto);$('watch').onclick=()=>{setAuto(true);if(speed===1){speed=2;$('speed').textContent='2×';}void action();};$('launch').onclick=()=>void action();$('pause').onclick=pause;$('speed').onclick=()=>{speed=speed===1?2:speed===2?4:1;$('speed').textContent=speed+'×';};
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'On':'Off';$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'Mute sound':'Enable sound');if(sound)tone(620,.15);};
$('settings').onclick=()=>{$('reduced').checked=reduced;$('haptics').checked=haptics;$('record').textContent=`${completedCount(store.value)} stages completed · Best stage score ${store.value.best.toLocaleString()}`;openDialog('menu');};$('closeMenu').onclick=()=>closeDialog('menu');$('closeGallery').onclick=()=>closeDialog('gallery');
$('reduced').onchange=e=>{reduced=e.target.checked;persistOptions();};$('haptics').onchange=e=>{haptics=e.target.checked;persistOptions();};$('restart').onclick=()=>{closeDialog('menu');clearSession();run=null;void start(game?.level||store.value.selected);};
$('patterns').onclick=() =>journey.show();$('journeyButton').onclick=()=>journey.show();$('accountButton').onclick=()=>account.show();$('openAccount').onclick=()=>{closeDialog('menu');account.show();};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});$('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else $('installHelp').hidden=false;};$('install').hidden=native;$('nativeOffline').hidden=!native;
$('share').onclick=async()=>{const data={title:'Brick Breaker',text:`Narrow channels. Huge swarms. Stage ${game?.level||1}.`,url:PUBLIC_URL};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(`${data.text} ${data.url}`);toast('LINK COPIED');}}catch(e){if(e.name!=='AbortError')toast('Share the game at speedinno.github.io/brick-breaker/.');}};

async function accountChanged(){
  const id=cloud.userId;if(id===accountIdentity&&!booting){account.render();return;}
  const epoch=++authEpoch;saveSession();accountIdentity=id;cloud.state=null;++loadEpoch;loading=true;game=null;run=null;store.switchAccount(id);updateStatus();
  if(id&&navigator.onLine!==false){try{const state=await cloud.progress();if(epoch!==authEpoch)return;store.save(mergeProgress(store.value,cloudProgress(state)));await syncPending();}catch{account.message('Cloud saving is offline. Your device progress is safe.',true);}}
  if(epoch!==authEpoch)return;loading=false;account.render();updateStatus();if(!booting)await start(store.value.selected,{resume:true});
}
async function syncPending(){
  if(!cloud.signedIn||navigator.onLine===false)return;
  const id=cloud.userId;if(syncTask?.id===id)return syncTask.promise;
  const promise=(async()=>{
    if(store.accountId!==id)return;
    const initial=await cloud.progress();if(store.accountId!==id)return;store.save(mergeProgress(store.value,cloudProgress(initial)));
    const pending=store.value.pending.slice().sort((a,b)=>a.level-b.level);
    if(pending.some(p=>!p.remote)){
      const state=await cloud.importGuest(store.value);if(store.accountId!==id)return;store.save({...mergeProgress(store.value,cloudProgress(state)),pending:store.value.pending.filter(p=>!pending.some(item=>item.runId===p.runId))});
    }else for(const item of pending){let state;try{state=await cloud.complete(item);}catch(error){if(!/expired/i.test(error.message))throw error;state=await cloud.importGuest(store.value);}if(store.accountId!==id)return;store.save({...mergeProgress(store.value,cloudProgress(state)),pending:store.value.pending.filter(p=>p.runId!==item.runId)});}
    if(store.accountId===id){updateStatus();account.render();}
  })();syncTask={id,promise};try{await promise;}finally{if(syncTask?.promise===promise)syncTask=null;updateStatus();}
}
async function importGuest(){if(!cloud.signedIn)return;const id=cloud.userId,state=await cloud.importGuest(new ProgressStore(storage).value);if(cloud.userId!==id||store.accountId!==id)return;store.save(mergeProgress(store.value,cloudProgress(state)));account.render();updateStatus();journey.render();}
async function deleteAccount(){const id=cloud.userId;if(!id)return;await cloud.deleteAccount();new ProgressStore(storage,id).clear();clearSession(id);account.render();updateStatus();}
window.addEventListener('online',()=>{if(cloud.signedIn)void syncPending().catch(()=>toast('Your device saves will upload when the connection returns.'));});
window.addEventListener('storage',e=>{if(e.key===store.key){store.save(mergeProgress(store.value,store.read()));updateStatus();if($('gallery').open)journey.render();}});
if(native){
  void App.addListener('appStateChange',({isActive})=>{if(!isActive){away();cloud.client?.auth.stopAutoRefresh();}else{cloud.client?.auth.startAutoRefresh();if(cloud.signedIn)void syncPending().catch(()=>{});}});
  if(Capacitor.getPlatform()==='android')void App.addListener('backButton',()=>{const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);if(dialog)dialog.close();else if(game?.status==='playing'&&!paused)pause();else{saveSession();void App.exitApp();}});
}else if('serviceWorker' in navigator){void navigator.serviceWorker.register('./sw.js').catch(()=>{});}
// Legacy scores are retained, but an old freely selected stage is not treated
// as proof that the preceding stages were completed.
if(!readJSON(store.key)){const legacy=readJSON('brick-breaker-channel-v2');if(Number.isSafeInteger(legacy?.best)&&legacy.best>=0&&legacy.best<=1e12)store.save({...store.value,best:legacy.best});}
requestAnimationFrame(frame);updateStatus();
try{await cloud.init();}catch{account.message('Cloud saving is offline. You can keep playing.',true);}
booting=false;loading=false;await start(store.value.selected,{resume:true});
const requested=new URLSearchParams(location.search).get('account');if(requested){account.show();if(requested==='delete'&&cloud.signedIn)$('requestDelete').click();if(requested==='export'&&cloud.signedIn)$('exportHistory').click();}
