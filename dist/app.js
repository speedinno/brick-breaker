import {PaddleInput,FixedSimulation,clampGain} from './controls.js';
import {bindPaddleEvents,isInteractive} from './control-events.js';
import {AssistanceSession} from './assistance.js';
import {AssistancePanel} from './assistance-ui.js';
import {PurchaseService} from './purchases.js';
import {WebPurchaseService} from './web-purchases.js';
import {PurchasePanel} from './purchases-ui.js';
import {RewardedService} from './rewarded.js';
import {RewardedPanel} from './rewarded-ui.js';
import {NativeRewardedAdapter,H5RewardedAdapter} from './rewarded-adapters.js';
import adRuntime from './ad-runtime.js';
import {GoogleAdConsent} from './ad-consent.js';
import {masteryCount,masteryLabel} from './mastery.js';
import config from './cloud-config.js';
import {fitViewport,dialogViewport} from './viewport.js';
import {playProfile,starterVolleySeconds} from './difficulty.js';
import {Game,W,H,ROWS,CELL,clamp} from './engine.js';
import {LevelCache,hydrateDefinition,definitionHash} from './catalog.js';
import {ProgressStore,cloudProgress,mergeProgress,isUnlocked,isCompleted,nextRequired,completedCount,unlinkedGuestCount} from './progress.js';
import {SoundEffects} from './audio.js';
import {snapshotGame,restoreGame} from './session.js';
import {durableStorage} from './storage.js';
import {AccountPrivacy} from './account-privacy.js';
import {PlayMetrics} from './play-metrics.js';
import {CloudAccount} from './cloud.js';
import {JourneyMap} from './journey-ui.js';
import {AccountPanel} from './account-ui.js';
import {Capacitor,App,Haptics,ImpactStyle} from './vendor/native.js';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false}),native=Capacitor.isNativePlatform(),PUBLIC_URL=config.publicGameUrl||'https://speedinno.github.io/brick-breaker/';
// A native localhost/capacitor URL cannot be opened by the external browser.
// Keep web/PWA legal pages relative for offline access; native links use the
// owner's public HTTPS site, including links inside the sign-in panel.
if(native)for(const link of document.querySelectorAll('a[href]'))if(link.getAttribute('href').startsWith('./'))link.href=new URL(link.getAttribute('href'),PUBLIC_URL).href;
document.documentElement.classList.toggle('native-app',native);
// Keep the close control in its own row while only the panel body scrolls.
for(const panel of document.querySelectorAll('dialog')){
  const close=panel.querySelector('.close'),title=panel.querySelector('h2');
  const header=document.createElement('div'),body=document.createElement('div');
  header.className='dialog-header';body.className='dialog-body';
  if(title)header.append(title);if(close)header.append(close);
  body.append(...panel.childNodes);panel.append(header,body);
}
// WKWebView can keep its layout viewport while the software keyboard covers it.
// Move dialogs above that occlusion; never resize or discard the saved game.
function updateKeyboardInset(){
  // Focus can leave the input before the keyboard disappears. Use the actual
  // viewport throughout dismissal so the tapped action does not jump away.
  const box=dialogViewport(innerHeight,window.visualViewport);
  const style=document.documentElement.style;
  style.setProperty('--keyboard-inset',(box?.bottom||0)+'px');
  style.setProperty('--visual-top',(box?.top||0)+'px');
  if(box)style.setProperty('--dialog-viewport-height',box.height+'px');
  else style.removeProperty('--dialog-viewport-height');
}
window.visualViewport?.addEventListener('resize',updateKeyboardInset);
window.visualViewport?.addEventListener('scroll',updateKeyboardInset);
document.addEventListener('focusin',updateKeyboardInset);
document.addEventListener('focusout',()=>requestAnimationFrame(updateKeyboardInset));
let viewport=fitViewport(416,660);
let storage;try{storage=durableStorage(localStorage,native?window.BrickBreakerStorage:null);}catch{storage={getItem:()=>null,setItem:()=>{throw Error('Storage unavailable');},removeItem:()=>{}};}
const privacy=new AccountPrivacy(storage);storage=privacy.storage;
const readJSON=key=>{try{return JSON.parse(storage.getItem(key)||'null');}catch{return null;}};
const options=readJSON('brick-breaker-options-v3')||{},store=new ProgressStore(storage),cache=new LevelCache();
let reduced=typeof options.reduced==='boolean'?options.reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,haptics=options.haptics===true,lastSound=0;
const effects=new SoundEffects({enabled:options.sound===true});
let game=null,definition=null,currentHash='',run=null,assisted=false,paused=false,loading=false,auto=false,speed=1,paintVersion='',lastSnapshot=0,toastTimer,installPrompt=null,booting=true,accountIdentity=null,authEpoch=0,loadEpoch=0,syncTask=null,wantedLevel=1,sessionStorageError=false;
let currentPromptKind='',coachExposureTimer=null;
const focusBefore=new Map(),background=document.createElement('canvas');background.width=W;background.height=H;const bg=background.getContext('2d');
let assistance=null;
const input=new PaddleInput({touchGain:options.touchGain??2,pointerGain:options.pointerGain??1,onManual:()=>{
  assistance?.stop('manual');
  auto=false;if(game)game.mode='play';$('auto').setAttribute('aria-pressed','false');
}});
const simulation=new FixedSimulation();let controlEvents=null;
function clearControls(reason='paused'){
  metrics.endSegment(reason);
  assistance?.stop(document.hidden?'background':'pause');
  controlEvents?.cancel();input.reset();simulation.reset(performance.now());
  if(auto){auto=false;if(game)game.mode='play';$('auto').setAttribute('aria-pressed','false');}
}
function gameplayInputEnabled(){return Boolean(game&&$('home').hidden&&!paused&&!loading&&!document.hidden&&!document.querySelector('dialog[open]'));}
function resizeBoard(){
  clearControls();
  const rect=canvas.getBoundingClientRect();
  viewport=fitViewport(rect.width,rect.height,window.devicePixelRatio);
  canvas.width=viewport.pixelsWide;canvas.height=viewport.pixelsHigh;
  const detail=viewport.scale*viewport.ratio;
  background.width=Math.ceil(W*detail);background.height=Math.ceil(H*detail);
  bg.setTransform(detail,0,0,detail,0,0);paintVersion='';
  const field=canvas.parentElement;
  field.style.setProperty('--scene-left',viewport.x+'px');
  field.style.setProperty('--scene-width',W*viewport.scale+'px');
  field.style.setProperty('--paddle-bottom',(viewport.height-viewport.y-570*viewport.scale)+'px');
}
new ResizeObserver(resizeBoard).observe(canvas);
window.addEventListener('resize',resizeBoard);
const boosts={add:{color:'#34c9df',label:'+3'},triple:{color:'#a4ce25',label:'×3'},wide:{color:'#6bb447',label:'↔'},floor:{color:'#f3a275',label:'—'},fire:{color:'#e876aa',label:'♨'},laser:{color:'#ce79e7',label:'↑'}};
const cloud=new CloudAccount(accountChanged,{storage,onStatus:()=>{if(assistance&&cloud.state?.wallet)assistance.wallet=cloud.state.wallet;updateStatus();account.render();}});
const journey=new JourneyMap({getProgress:()=>store.value,select:level=>start(level),open:openDialog,close:closeDialog});
const account=new AccountPanel({cloud,getProgress:()=>store.value,getGuest:()=>new ProgressStore(storage).value,open:openDialog,native,callbacks:{sync:syncPending,importGuest,deleteAccount}});
let deviceId;try{deviceId=storage.getItem('brick-breaker-device-v1');if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(deviceId||'')){deviceId=crypto.randomUUID();storage.setItem('brick-breaker-device-v1',deviceId);}}catch{deviceId=crypto.randomUUID();}
const metrics=new PlayMetrics({storage,account:()=>cloud.userId,api:(action,body)=>cloud.metrics(action,body),platform:native?Capacitor.getPlatform():'web',onChange:()=>renderMetrics()});
function renderMetrics(){
 const signed=Boolean(cloud.userId);$('metricsSwitch').setAttribute('aria-checked',String(metrics.choiceEnabled));$('metricsSwitch').disabled=!signed||metrics.busy||!metrics.ready&&!metrics.choiceEnabled||metrics.data?.available===false&&!metrics.choiceEnabled;$('metricsRefresh').hidden=!signed;$('metricsRefresh').disabled=metrics.busy;
 $('metricsFeedback').textContent=!signed?'Sign in to choose. Guest activity is not uploaded.':metrics.error||(!metrics.ready?'Checking your account choice…':metrics.data?.available===false?metrics.choiceEnabled?'Your saved choice is on, but collection is paused. Turn it off to delete optional activity.':'Optional analytics are not enabled in this edition.':metrics.enabled?'On for this account. Optional activity is shared across your signed-in devices.':'Off. Optional play analytics are not shared.');$('metricsFeedback').classList.toggle('error',Boolean(metrics.error));renderReadyCoaching();
}
function renderReadyCoaching(){
 clearTimeout(coachExposureTimer);coachExposureTimer=null;
 if(!game||game.level!==1||currentPromptKind!=='ready'||$('prompt').hidden||loading)return;
 $('promptText').textContent='Your first shots include a free paddle shooter. Silver tiles break too. '+metrics.coaching('Drag to aim, then catch boosts to grow the swarm.',game.level);
 const visible=()=>game?.level===1&&currentPromptKind==='ready'&&!loading&&!$('prompt').hidden&&$('home').hidden&&$('splash').hidden&&!document.hidden&&!document.querySelector('dialog[open]');
 if(visible()&&metrics.assignment){const epoch=loadEpoch,owner=cloud.userId,assignment=metrics.assignment;coachExposureTimer=setTimeout(()=>{coachExposureTimer=null;if(visible()&&epoch===loadEpoch&&owner===cloud.userId&&assignment.experiment===metrics.assignment?.experiment&&assignment.variant===metrics.assignment?.variant)metrics.exposeCoach(String(epoch),1);},250);}
}
$('metricsSwitch').onclick=()=>void metrics.toggle(!metrics.choiceEnabled);$('metricsRefresh').onclick=()=>void metrics.refresh();
setInterval(()=>void metrics.flush(),30000);
function createAssistance(){
 const bank=new AssistanceSession({storage,api:(action,body)=>cloud.time(action,body),account:()=>cloud.userId,deviceId,onStop:reason=>{
  if(assistance!==bank)return;
  auto=false;if(game)game.mode='play';$('auto').setAttribute('aria-pressed','false');
  if(reason!=='manual')input.reset();
  if(['expired','authorization','connection','revoked','reconciled'].includes(reason)&&game?.status==='playing'){
    paused=true;prompt('assistEnded');
  }
 }});return bank;
}
assistance=createAssistance();
const assistancePanel=new AssistancePanel({bank:assistance,cloud,open:openDialog,close:closeDialog,signIn:()=>account.show(),activate:beginAssistance});
const purchases=native?new PurchaseService({cloud,storage,platform:Capacitor.getPlatform()}):new WebPurchaseService({cloud,storage});
let ignoredAssistCloses=0;const externalContexts=new Set();
function externalStart(){
 const token={game,authEpoch,loadEpoch,homeHidden:$('home').hidden,mute:{}};
 externalContexts.add(token);effects.mute(token.mute);away();if($('assist').open){ignoredAssistCloses++;closeDialog('assist');}return token;
}
function externalEnd(token){
 if(!token)return;externalContexts.delete(token);effects.unmute(token.mute);
 if(token.game===game&&token.authEpoch===authEpoch&&token.loadEpoch===loadEpoch&&token.homeHidden===$('home').hidden&&paused&&!document.querySelector('dialog[open]'))openDialog('assist');
}
const monetizationBusy=()=>assistancePanel.busy||assistance.starting||assistance.active;
const adConfigured=()=>adRuntime.enabled&&adRuntime.audienceReviewed&&adRuntime.platforms?.includes(native?Capacitor.getPlatform():'web');
const webConsent=new GoogleAdConsent({settings:adRuntime.web});
const rewardedAdapter=native?new NativeRewardedAdapter({available:()=>adConfigured()&&Capacitor.isPluginAvailable('AdMob'),eligible:()=>$('adAdult').checked&&adRuntime.audienceReviewed,externalStart,externalEnd}):new H5RewardedAdapter({externalStart,externalEnd,sound:()=>effects.enabled,consent:()=>webConsent.request()});
if(!native){
 Object.defineProperty(rewardedAdapter,'privacyRequired',{get:()=>webConsent.euRequired});rewardedAdapter.privacyLabel='European ad consent choices';
 rewardedAdapter.privacy=async()=>{if(rewardedAdapter.busy)throw Error('Finish the current ad before changing privacy choices.');const token=externalStart();try{await webConsent.europeanChoices();}finally{externalEnd(token);}};
}
const rewarded=new RewardedService({cloud,storage,platform:native?Capacitor.getPlatform():'web',deviceId,adapter:rewardedAdapter,onObservation:(owner,type,data)=>owner===cloud.userId&&metrics.record(type,data),canPresent:()=>!document.hidden&&($('assist').open||[...externalContexts].some(token=>token.game===game&&token.authEpoch===authEpoch&&token.loadEpoch===loadEpoch&&token.homeHidden===$('home').hidden))});
const purchasePanel=new PurchasePanel({service:purchases,cloud,canStart:()=>!monetizationBusy()&&!rewarded.busy&&!rewarded.ready,onBusy:busy=>{assistancePanel.checkoutBusy=busy;assistancePanel.render();},onWallet:wallet=>{assistance.wallet=wallet;assistancePanel.render();},externalStart,externalEnd,onOffer:(owner,data)=>owner===cloud.userId&&metrics.record('purchase_offer',data)});
const adPanel=new RewardedPanel({service:rewarded,cloud,configured:adConfigured,canStart:()=>!monetizationBusy()&&!purchases.busy&&!purchasePanel.busy,onBusy:busy=>{assistancePanel.adBusy=busy;assistancePanel.render();},onWallet:wallet=>{assistance.wallet=wallet;assistancePanel.render();},externalStart,externalEnd});
assistancePanel.purchases=purchasePanel;
assistancePanel.ads=adPanel;
setInterval(()=>{if(assistance.active&&!assistance.flushing)void assistance.flush().catch(()=>{});},1000);
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2400);}
function persistOptions(){try{storage.setItem('brick-breaker-options-v3',JSON.stringify({reduced,haptics,sound:effects.enabled,touchGain:input.touchGain,pointerGain:input.pointerGain}));}catch{}}
function sessionKey(id=store.accountId){return `brick-breaker-session-v3:${id?'user:'+id:'guest'}`;}
function saveSession(){if(!game||loading)return;const snapshot=snapshotGame(game,{auto:false,speed,run,assisted});try{if(snapshot)storage.setItem(sessionKey(),JSON.stringify(snapshot));else storage.removeItem(sessionKey());sessionStorageError=false;}catch{sessionStorageError=true;}updateStatus();}
function clearSession(id=store.accountId){try{storage.removeItem(sessionKey(id));}catch{}}
function renderSound(){$('sound').setAttribute('aria-checked',String(effects.enabled));$('soundFeedback').textContent=!effects.enabled?'Sound disabled':effects.error?.message||'Sound enabled · use your phone’s media volume';$('soundFeedback').classList.toggle('error',Boolean(effects.enabled&&effects.error));}
function tone(freq=500,duration=.05){effects.play(freq,duration);if(effects.error)renderSound();}
function updateStatus(){
  const p=store.value,error=store.storageError||sessionStorageError;
  $('journeyStatus').textContent=p.starters.length<12?`${p.starters.length}/12 cleared`:`${completedCount(p).toLocaleString()} cleared · Stage ${p.journeyNext}`;
  const guestCount=cloud.signedIn?unlinkedGuestCount(p,new ProgressStore(storage).value):0;
  $('saveStatus').textContent=error?'Save failed':cloud.signedIn&&cloud.syncError?'Saved · cloud retry needed':syncTask?.id===cloud.userId?'Saved · syncing…':cloud.signedIn&&p.pending.length?'Saved · sync pending':guestCount?'Guest stages to link':cloud.signedIn&&cloud.state?'Saved · cloud synced':'Auto-saved';
  $('saveStatus').classList.toggle('pending',Boolean(error||p.pending.length||cloud.syncError||guestCount));
  $('homeSave').textContent=error?'Could not save on this phone. Check available storage.':guestCount?`${guestCount} guest stages are still on this phone. Open Account to link them.`:cloud.signedIn&&cloud.syncError?'Auto-saved on this phone · open Account to retry cloud sync.':cloud.signedIn?'Auto-save on · completed stages sync to your account.':'Auto-save on · no account needed to play.';
  $('homeCompleted').textContent=`${completedCount(p).toLocaleString()} STAGES CLEARED`;
  $('homeMastery').textContent=`★ ${masteryCount(p)} manual · ✦ ${masteryCount(p,'clean')} clean clears`;
  $('homeStage').textContent=`STAGE ${String(game?.level||p.selected).padStart(2,'0')}`;
  $('homePlay').textContent=booting?'Getting ready…':loading==='failed'?`Retry · Stage ${p.selected}`:`${game&&(game.status==='playing'||game.score>0)?'Continue':'Play'} · Stage ${game?.level||p.selected}`;
  $('homePlay').disabled=Boolean(booting||loading===true);
  if(game){$('completedIndicator').hidden=!isCompleted(p,game.level);$('completedIndicator').textContent=masteryLabel(p,game.level)?.[0]||'✓';$('completedIndicator').title=masteryLabel(p,game.level)||'Completed';}
}
function showHome(){away();$('home').hidden=false;$('gameScreen').inert=true;updateStatus();$('home').focus({preventScroll:true});}
let homeReturn=null;
function requestHome(){
  if(!$('home').hidden)return;
  if(game?.status==='playing'){
    if($('homeConfirm').open)return;
    homeReturn={game,resume:!paused};openDialog('homeConfirm');
    $('homeConfirmMessage').textContent=store.storageError||sessionStorageError?'Device saving is unavailable. Keep playing to avoid leaving an unsaved field.':'Your current field is saved automatically. You can continue this stage later.';
    $('keepPlaying').focus({preventScroll:true});
  }else showHome();
}
function enterGame(){if(booting||loading===true)return;$('home').hidden=true;$('gameScreen').inert=false;renderReadyCoaching();requestAnimationFrame(resizeBoard);}
function showHelp(){openDialog('help');}
function syncHUD(){
  if(!game)return;
  const autoLabel=auto?`Take control\n${Math.ceil(assistance.remainingMs()/1000)}s`:'AUTO';
  if($('auto').textContent!==autoLabel)$('auto').textContent=autoLabel;
  const autoDescription=auto?'Take control, '+Math.ceil(assistance.remainingMs()/1000)+' seconds remaining':'Autoplay time bank';
  if($('auto').getAttribute('aria-label')!==autoDescription)$('auto').setAttribute('aria-label',autoDescription);
  const balls=String(game.status==='ready'?1:game.balls.length),remaining=String(game.remaining),lives='♥ '.repeat(game.lives).trim();
  if($('balls').textContent!==balls)$('balls').textContent=balls;
  if($('remaining').textContent!==remaining||!$('remaining').hasAttribute('aria-label')){$('remaining').textContent=remaining;$('remaining').setAttribute('aria-label',remaining+' bricks remaining');}
  if($('lives').textContent!==lives||!$('lives').hasAttribute('aria-label')){$('lives').textContent=lives;$('lives').setAttribute('aria-label',`${game.lives} lives`);}
  const width=`${Math.round((1-game.remaining/game.total)*1e6)/1e4}%`;if($('progress').style.width!==width)$('progress').style.width=width;
  const percent=Math.floor((1-game.remaining/game.total)*100);
  if($('clearance').textContent!==percent+'%'){$('clearance').textContent=percent+'%';$('progress').parentElement.setAttribute('aria-valuenow',String(percent));}
}
function suggestedNext(level){if(store.value.starters.length<12){for(let n=level+1;n<=12;n++)if(!isCompleted(store.value,n))return n;}return nextRequired(store.value);}
function prompt(kind){
  if(!game)return;
  currentPromptKind=kind;
  clearTimeout(toastTimer);$('toast').classList.remove('show');
  const next=suggestedNext(game.level),remaining=12-store.value.starters.length,challenge=playProfile(game.level);
  const states={ready:[definition?.entrance==='left'?'Find the left entrance.':definition?.entrance==='right'?'Find the right entrance.':'Find the entrance.',game.level>12?(challenge.label+' · Chapter '+challenge.chapter+'. Catch boosts and discover the way through.'):starterVolleySeconds(game.level)?`A free ${starterVolleySeconds(game.level)}-second paddle shooter starts with each launch. Drag to aim and catch boosts.`:'Drag the paddle. Catch the boosts. Grow the swarm.','Launch'],resume:[`Stage ${game.level}. Ready when you are.`,game.status==='playing'?'Your field and swarm are right where you left them.':'Your saved stage is ready.','Continue'],paused:['Paused.','Your progress is safe on this device.','Resume'],lost:['One more shot.',`${game.lives} ${game.lives===1?'life':'lives'} left. Broken bricks stay broken.${starterVolleySeconds(game.level)?' The paddle shooter returns on launch.':''}`,'Launch'],won:[`Stage ${game.level} completed ✓`,remaining>0?`${remaining} starter ${remaining===1?'stage remains':'stages remain'} before the journey opens.`:`Stage ${next} is unlocked. A new discovery is ready.`,`Next · Stage ${next} ↗︎`],over:['Try another angle.',`Your completion ticks are safe. Retry stage ${game.level}.`,'Retry stage']};
  states.assistEnded=['Your paddle is yours.','Autoplay has stopped. Continue manually, or open your time bank to check the balance and reconcile pending time.','Continue manually'];
  const value=states[kind];$('promptTitle').textContent=value[0];$('promptText').textContent=value[1];$('launch').textContent=value[2];$('watch').hidden=['paused','won','over','assistEnded'].includes(kind);$('prompt').dataset.state=kind;$('prompt').hidden=false;$('prompt').classList.remove('loading');$('pause').setAttribute('aria-label',['paused','assistEnded'].includes(kind)?'Resume':'Pause');
  renderReadyCoaching();
}
function event(e){
  if(e.type==='launch')$('prompt').hidden=true;
  if((e.type==='break'||e.type==='hit')&&performance.now()-lastSound>55){lastSound=performance.now();tone(620+Math.min(100,game?.combo||0)*5);}
  if(e.type==='power'){toast({add:`+3 · ${e.before} → ${e.balls} BALLS`,triple:`×3 · ${e.before} → ${e.balls} BALLS`,wide:'WIDE PADDLE · SAME BALL COUNT',floor:'SAFETY FLOOR',fire:'FIREBALLS',laser:`PADDLE SHOOTER · ${Math.ceil(Math.max(0,game.shootUntil-game.time))}s`}[e.kind]);tone(840,.14);if(haptics){if(native)void Haptics.impact({style:ImpactStyle.Light}).catch(()=>{});else navigator.vibrate?.(12);}}
  if(e.type==='lost'){clearControls('lost');saveSession();prompt('lost');tone(140,.2);}
  if(e.type==='over'){clearControls('game_over');if(run?.runId)metrics.record('stage_end',{level:game.level,runId:run.runId,mode:assisted?'assisted':'manual',simulationMs:Math.min(86400000,Math.round(game.stageTime*1000)),losses:game.stageLosses,outcome:'game_over'});clearSession();prompt('over');tone(140,.2);}
  if(e.type==='won'){
    clearControls('cleared');
    if(run?.runId)metrics.record('stage_end',{level:game.level,runId:run.runId,mode:assisted?'assisted':'manual',simulationMs:Math.min(86400000,Math.round(game.stageTime*1000)),losses:game.stageLosses,outcome:'cleared'});
    const result={score:game.score,seconds:Math.round(game.stageTime*1000)/1000,peak:game.peakBalls,mode:assisted?'watch':'play',stageLosses:game.stageLosses};
    store.complete(game.level,result);
    if(cloud.signedIn&&run){const pending={...result,level:game.level,runId:run.runId,hash:currentHash,remote:run.remote===true};store.save({...store.value,pending:[...store.value.pending.filter(p=>p.runId!==run.runId),pending]});}
    clearSession();updateStatus();prompt('won');tone(1040,.25);if($('gallery').open)journey.render();if(cloud.signedIn)void syncPending().catch(()=>updateStatus());
    else {const next=nextRequired(store.value);if(next>12)void cache.load(next).catch(()=>{});}
  }
}
async function start(level=store.value.selected,{resume=false,enter=true,sync=true}={}){
  if(!isUnlocked(store.value,level)){toast('Finish earlier stages to unlock this stage.');return;}
  if(enter)enterGame();
  saveSession();wantedLevel=level;const epoch=++loadEpoch;loading=true;paused=false;clearControls();clearTimeout(toastTimer);$('toast').classList.remove('show');$('prompt').hidden=false;$('prompt').classList.add('loading');$('promptTitle').textContent='Getting your stage ready.';$('promptText').textContent='A new channel is waiting.';
  try{
    if(sync&&cloud.signedIn&&navigator.onLine!==false)await syncPending().catch(()=>{});
    const nextDefinition=await cache.load(level,cloud),hash=nextDefinition.hash||await definitionHash(nextDefinition);
    if(epoch!==loadEpoch)return;
    definition=nextDefinition;currentHash=hash;const pattern=hydrateDefinition(definition);let restored=null;
    const snapshot=resume?readJSON(sessionKey()):null;if(snapshot?.level===level)restored=restoreGame(snapshot,pattern,event);
    game=restored||new Game({level,seed:crypto.getRandomValues(new Uint32Array(1))[0],mode:auto?'watch':'play',patternFactory:()=>pattern,onEvent:event});
    run=restored?snapshot.run:null;auto=false;speed=restored&&[1,2,4].includes(snapshot.speed)?snapshot.speed:speed;assisted=Boolean(restored&&(snapshot.assisted||snapshot.auto));
    game.mode='play';paused=Boolean(restored&&game.status==='playing');paintVersion='';simulation.reset(performance.now());
    store.save({...store.value,selected:level,updatedAt:Date.now()});$('level').textContent=String(level).padStart(2,'0');$('name').textContent=game.name;$('name').title=game.name;$('auto').setAttribute('aria-pressed',String(auto));$('speed').textContent=speed+'×';
    const previouslyPlayed=restored&&(game.status==='playing'||snapshot.removed.length>0||snapshot.time>0);
    prompt(previouslyPlayed?'resume':'ready');syncHUD();updateStatus();
  }catch(error){if(epoch===loadEpoch){$('prompt').classList.remove('loading');$('promptTitle').textContent='Your stage is safe.';$('promptText').textContent=error.message||'Please try again.';$('launch').textContent='Try again';$('watch').hidden=true;loading='failed';toast(error.message||'Could not open this stage.');}}
  finally{if(epoch===loadEpoch){if(loading!=='failed'){loading=false;saveSession();}updateStatus();renderReadyCoaching();}}
}
async function ensureRun(){
  if(run?.level===game.level&&run.hash===currentHash)return;
  const activeGame=game,epoch=authEpoch,id=crypto.randomUUID(),hash=currentHash;run={runId:id,level:activeGame.level,hash,remote:false};
  if(cloud.signedIn&&navigator.onLine!==false){try{const result=await cloud.start(activeGame.level,id);if(epoch!==authEpoch||game!==activeGame)return;if(result.layout_hash!==hash)throw Error('This stage has an updated catalog entry. Reopen the stage.');run={...run,remote:true};}catch(error){if(epoch!==authEpoch||game!==activeGame)return;if(!error.network){run=null;throw error;}}}
}
async function action(){
  if(!$('home').hidden)return;
  if([...document.querySelectorAll('dialog')].some(d=>d.open))return;
  if(loading==='failed'){loading=false;await start(wantedLevel,{resume:true});return;}if(loading||!game)return;
  if(paused){clearControls();paused=false;$('prompt').hidden=true;$('pause').setAttribute('aria-label','Pause');return;}
  if(game.status==='won'){await start(suggestedNext(game.level));return;}
  if(game.status==='over'){await start(game.level);return;}
  if(game.status==='ready'){const activeGame=game,epoch=authEpoch;loading=true;try{await ensureRun();if(epoch!==authEpoch||game!==activeGame)return;game.paddle.x=clamp(game.target,game.paddle.w/2+2,W-game.paddle.w/2-2);game.launch();}catch(error){if(epoch===authEpoch&&game===activeGame){toast(error.message);prompt('ready');}}finally{if(epoch===authEpoch&&game===activeGame){loading=false;saveSession();}}}
  canvas.focus({preventScroll:true});
}
function pause(){if(!$('home').hidden||!game||loading)return;if(paused){clearControls();paused=false;$('prompt').hidden=true;$('pause').setAttribute('aria-label','Pause');canvas.focus({preventScroll:true});}else if(game.status==='playing'){paused=true;clearControls();prompt('paused');saveSession();}}
function away(){
 clearControls('background');metrics.persist();void metrics.flush();if(game?.status==='playing'&&!paused){paused=true;prompt('paused');}saveSession();
 // A prepared offer is never kept ready across background/navigation. The
 // journal returns its unopened slot on recovery. An external ad/consent form
 // intentionally blurs the WebView, so its owning context is exempt.
 if(!externalContexts.size&&(rewarded.ready||rewarded.busy)){rewarded.reset();adPanel.reset();assistancePanel.adBusy=false;}
}
function openDialog(id){focusBefore.set(id,document.activeElement);if(game?.status==='playing'&&!paused){paused=true;prompt('paused');}clearControls();saveSession();if(!$(id).open)$(id).showModal();if(id==='menu'&&cloud.userId)void metrics.refresh();if(id==='help')metrics.record('help_open',{surface:$('home').hidden?'game':'home'});}
function closeDialog(id){if($(id).open)$(id).close();}
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{
  if(dialog.id==='assist'){
    if(ignoredAssistCloses)ignoredAssistCloses--;
    else{rewarded.reset();adPanel.reset();assistancePanel.adBusy=false;}
  }
  if(dialog.id==='homeConfirm'){
    const pending=homeReturn;homeReturn=null;
    if(pending?.resume&&game===pending.game&&game.status==='playing'&&$('home').hidden&&!document.querySelector('dialog[open]')){paused=false;$('prompt').hidden=true;$('pause').setAttribute('aria-label','Pause');}
  }
  const prior=focusBefore.get(dialog.id);if(prior?.isConnected&&(!prior.closest('dialog')||prior.closest('dialog').open))prior.focus({preventScroll:true});
  renderReadyCoaching();
});
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>closeDialog(button.dataset.close);
function paintCells(context,cells,fill,level){for(const cell of cells){context.fillStyle=cell.type==='wall'?'#9a9a91':cell.type==='gate'?(level<=4?'#b7c5cd':'#e8d530'):cell.color||fill;const inset=cell.type==='wall'?0:.55;context.fillRect(cell.x+inset,cell.y+inset,cell.w-inset*2,cell.h-inset*2);}}
function draw(){
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#14171c';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(viewport.scale*viewport.ratio,0,0,viewport.scale*viewport.ratio,viewport.x*viewport.ratio,viewport.y*viewport.ratio);
  if(!game){ctx.fillStyle='#14171c';ctx.fillRect(0,0,W,H);return;}
  const version=`${game.level}:${game.remaining}`;if(paintVersion!==version){bg.fillStyle='#14171c';bg.fillRect(0,0,W,H);paintCells(bg,game.grid.values(),game.color,game.level);paintVersion=version;}ctx.drawImage(background,0,0,background.width,background.height,0,0,W,H);
  const p=game.paddle;if(game.time<game.floorUntil){ctx.fillStyle='#ff8251';ctx.fillRect(0,H-11,W,4);}const paddleFill=ctx.createLinearGradient(0,p.y,0,p.y+8);paddleFill.addColorStop(0,'#ffd2a4');paddleFill.addColorStop(1,'#ff8955');ctx.fillStyle=paddleFill;
  if(!reduced){ctx.shadowColor='#ff9b6c66';ctx.shadowBlur=12;}ctx.beginPath();
  ctx.arc(p.x+p.w/2-3.5,p.y+3.5,3.5,-Math.PI/2,Math.PI/2);
  ctx.arc(p.x-p.w/2+3.5,p.y+3.5,3.5,Math.PI/2,Math.PI*1.5);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle=game.time<game.fireUntil?'#ffd5c2':'#fff';ctx.beginPath();for(const b of game.balls){ctx.moveTo(b.x+b.r,b.y);ctx.arc(b.x,b.y,b.r,0,Math.PI*2);}ctx.fill();
  if(game.shots.length){ctx.fillStyle='#d98aef';if(!reduced){ctx.shadowColor='#b754d9';ctx.shadowBlur=5;}for(const shot of game.shots)ctx.fillRect(shot.x-1.4,shot.y-9,2.8,15);ctx.shadowBlur=0;}
  const shooting=game.status==='playing'&&game.time<game.shootUntil;
  if(shooting){ctx.fillStyle='#d98aef';ctx.fillRect(p.x-3,p.y-4,6,4);ctx.font='bold 9px Arial';ctx.textAlign='center';ctx.fillText('SHOOTING · '+Math.ceil(game.shootUntil-game.time)+'s',W/2,H-25);}
  if($('activeEffect').textContent!==(shooting?'Paddle shooter active':''))$('activeEffect').textContent=shooting?'Paddle shooter active':'';
  if(game.status==='ready'){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p.x,p.y-8,2.35,0,Math.PI*2);ctx.fill();const dx=game.pattern.entry.x-p.x,dy=game.pattern.entry.y+3-(p.y-8);for(let i=1;i<=11;i++){const t=i/11;ctx.fillStyle=`rgba(230,230,230,${.45*(1-t*.6)})`;ctx.beginPath();ctx.arc(p.x+dx*t,p.y-8+dy*t,1.15,0,Math.PI*2);ctx.fill();}}
  for(const drop of game.drops){const spec=boosts[drop.kind];if(!reduced){ctx.shadowColor=spec.color;ctx.shadowBlur=5;}ctx.fillStyle=spec.color;ctx.beginPath();ctx.arc(drop.x,drop.y,9,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.font='bold 9px Arial';ctx.textAlign='center';ctx.fillText(spec.label,drop.x,drop.y+3);}
  // Frame the entire arena, including the paddle area, as in the video reference.
  // This is presentation only: world boundaries and saved physics stay unchanged.
  ctx.strokeStyle='#414750';ctx.lineWidth=3;ctx.strokeRect(1.5,16.5,W-3,H-18);
}
function frame(t){
  if(gameplayInputEnabled()){
    simulation.frame(t,(dt,at)=>{
      if(!gameplayInputEnabled())return false;
      input.applyThrough(at,game.paddle);
      if(input.owner==='auto'&&!assistance.active){input.takeControl(game.paddle);return false;}
      game.target=input.desired(dt,game.paddle,()=>game.autoTarget());
      const activeAuto=input.owner==='auto';
      // The fixed simulation may run at 2x/4x. Bank seconds are real active
      // seconds, so playback speed never multiplies the debit.
      const physicsDt=activeAuto?assistance.consume(dt*1000/speed,game.status==='playing')*speed/1000:dt;
      if(physicsDt<=0)return false;
      if(activeAuto)assisted=true;
      if(game.status==='playing')metrics.accrue(physicsDt*1000/speed,game.level,run?.runId,activeAuto?'assisted':'manual');
      // Ready fields contain no ball. Active paddle motion always goes through
      // Game.step's swept trajectory, including fast input and AI takeover.
      if(game.status==='ready')game.paddle.x=game.target;
      game.step(physicsDt);
    },speed);
  }else simulation.reset(t);
  draw();syncHUD();if(t-lastSnapshot>2000){lastSnapshot=t;if(game?.status==='playing'&&!paused&&$('home').hidden)saveSession();}requestAnimationFrame(frame);
}
controlEvents=bindPaddleEvents({surface:$('gameScreen'),focusTarget:canvas,input,enabled:gameplayInputEnabled,scale:()=>viewport.scale});
document.addEventListener('keydown',e=>{
  if(!$('home').hidden||document.querySelector('dialog[open]')||isInteractive(e.target)||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
  const key=e.key.length===1?e.key.toLowerCase():e.key;
  if([' ','p','Escape'].includes(key)){e.preventDefault();if(e.repeat)return;if(key===' ')void action();else pause();}
});document.addEventListener('visibilitychange',()=>{if(document.hidden)away();else{renderReadyCoaching();if(cloud.signedIn)void metrics.refresh();}});window.addEventListener('blur',away);window.addEventListener('pagehide',away);
async function beginAssistance(milliseconds){
  const current=game,epoch=authEpoch,bank=assistance;
  if(!cloud.signedIn)throw Error('Sign in to use your shared time bank.');
  if(!current||!['ready','playing'].includes(current.status))throw Error('Open an unfinished stage before using autoplay.');
  if(navigator.onLine===false)throw Error('Connect to authorize autoplay. Manual play is available offline.');
  await ensureRun();
  if(game!==current||epoch!==authEpoch||!$('assist').open)throw Error('Activation cancelled. Reopen the time bank.');
  if(!run?.remote)throw Error('Could not authorize this stage. Reconnect and try again.');
  await bank.start(run.runId,milliseconds);
  if(game!==current||epoch!==authEpoch||!$('assist').open||document.hidden){bank.stop('cancelled');throw Error('Activation cancelled. Unused time will be reconciled.');}
  closeDialog('assist');paused=false;auto=true;game.mode='play';input.startAuto(game.paddle);
  $('auto').setAttribute('aria-pressed','true');$('pause').setAttribute('aria-label','Pause');
  $('prompt').hidden=true;if(game.status==='ready')game.launch();saveSession();canvas.focus({preventScroll:true});
}
function takeControl(){assistance.stop('manual');input.takeControl(game.paddle);auto=false;syncHUD();canvas.focus({preventScroll:true});}
$('auto').onclick=()=>{if(auto)takeControl();else assistancePanel.show();};$('watch').onclick=()=>assistancePanel.show();$('launch').onclick=()=>void action();$('pause').onclick=pause;$('speed').onclick=()=>{speed=speed===1?2:speed===2?4:1;$('speed').textContent=speed+'×';if(game?.status==='playing'&&!paused)canvas.focus({preventScroll:true});};
for(const [id,property] of [['touchSensitivity','touchGain'],['pointerSensitivity','pointerGain']]){
  $(id).value=String(input[property]);$(id+'Value').textContent=input[property].toFixed(1)+'×';
  $(id).oninput=()=>{input[property]=clampGain($(id).value);$(id+'Value').textContent=input[property].toFixed(1)+'×';};
  $(id).onchange=persistOptions;
}
$('sound').onclick=async()=>{effects.enabled=!effects.enabled;persistOptions();renderSound();if(effects.enabled){if(await effects.unlock())tone(620,.18);renderSound();}};
// Unlock again after an OS audio interruption, using a real touch/key gesture.
for(const kind of ['pointerdown','keydown'])document.addEventListener(kind,()=>{if(effects.enabled)void effects.unlock().then(renderSound);},{capture:true});
renderSound();
$('settings').onclick=()=>{$('reduced').checked=reduced;$('haptics').checked=haptics;$('record').textContent=`${completedCount(store.value)} stages completed · Best stage score ${store.value.best.toLocaleString()}`;openDialog('menu');};$('closeMenu').onclick=()=>closeDialog('menu');$('closeGallery').onclick=()=>closeDialog('gallery');
$('goHome').onclick=requestHome;
$('keepPlaying').onclick=()=>closeDialog('homeConfirm');
$('confirmHome').onclick=()=>{homeReturn=null;closeDialog('homeConfirm');showHome();};
$('homePlay').onclick=()=>{enterGame();if(readJSON('brick-breaker-help-seen-v1')!==true)showHelp();};
$('homeStages').onclick=()=>{if(!booting&&!loading)journey.show();};$('homeHelp').onclick=showHelp;$('quickHelp').onclick=showHelp;
$('homeAccount').onclick=()=>account.show();$('settingsHelp').onclick=()=>{closeDialog('menu');showHelp();};
$('helpDone').onclick=()=>{try{storage.setItem('brick-breaker-help-seen-v1','true');}catch{}closeDialog('help');};
$('reduced').onchange=e=>{reduced=e.target.checked;persistOptions();};$('haptics').onchange=e=>{haptics=e.target.checked;persistOptions();};$('restart').onclick=()=>{closeDialog('menu');clearSession();run=null;void start(game?.level||store.value.selected);};
$('patterns').onclick=() =>journey.show();$('journeyButton').onclick=()=>journey.show();$('accountButton').onclick=()=>account.show();$('openAccount').onclick=()=>{closeDialog('menu');account.show();};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});$('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else $('installHelp').hidden=false;};$('install').hidden=native;$('nativeOffline').hidden=!native;
$('share').onclick=async()=>{const data={title:'Brick Breaker',text:`Narrow channels. Huge swarms. Stage ${game?.level||1}.`,url:PUBLIC_URL};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(`${data.text} ${data.url}`);toast('LINK COPIED');}}catch(e){if(e.name!=='AbortError')toast('Game link: '+PUBLIC_URL);}};

async function accountChanged(){
  const id=cloud.userId;if(id===accountIdentity&&!booting){account.render();return;}
  void metrics.identify();
  assistance.stop('account');
  try{assistance.persist();}catch{}
  assistance=createAssistance();assistancePanel.bank=assistance;assistancePanel.epoch++;assistancePanel.busy=false;
  purchases.reset();purchasePanel.reset();rewarded.reset();adPanel.reset();assistancePanel.checkoutBusy=false;assistancePanel.adBusy=false;
  const epoch=++authEpoch;saveSession();accountIdentity=id;cloud.state=null;++loadEpoch;loading=true;game=null;run=null;store.switchAccount(id);updateStatus();
  if(id){try{await syncPending();}catch(error){if(epoch===authEpoch)account.message(error.message,true);}}
  if(epoch!==authEpoch)return;loading=false;account.render();updateStatus();if(!booting)await start(store.value.selected,{resume:true,enter:$('home').hidden,sync:false});
}
async function syncPending(){
  if(!cloud.signedIn)throw Error('Sign in to sync your completed stages.');
  if(navigator.onLine===false){cloud.syncError=Error('You are offline. Your device progress is safe. Reconnect, then tap Sync now.');updateStatus();account.render();throw cloud.syncError;}
  const id=cloud.userId;if(syncTask?.id===id)return syncTask.promise;
  const promise=(async()=>{
    if(store.accountId!==id)throw Error('Your account changed. Try syncing again.');
    const initial=await cloud.progress();if(store.accountId!==id)throw Error('Your account changed. Try syncing again.');store.save(mergeProgress(store.value,cloudProgress(initial)));
    const pending=store.value.pending.slice().sort((a,b)=>a.level-b.level);
    if(pending.some(p=>!p.remote)){
      const state=await cloud.importGuest(store.value);if(store.accountId!==id)throw Error('Your account changed. Try syncing again.');store.save({...mergeProgress(store.value,cloudProgress(state)),pending:store.value.pending.filter(p=>!pending.some(item=>item.runId===p.runId))});
    }else for(const item of pending){let state;try{
      if(assistance.journal?.runId===item.runId)await assistance.flush();
      state=await cloud.complete(item);
      if(state.earnedTimeMs>0)toast(`+${state.earnedTimeMs/1000}s AUTOPLAY · MANUAL CLEAR`);
    }catch(error){if(!/expired/i.test(error.message))throw error;state=await cloud.importGuest(store.value);}if(store.accountId!==id)throw Error('Your account changed. Try syncing again.');store.save({...mergeProgress(store.value,cloudProgress(state)),pending:store.value.pending.filter(p=>p.runId!==item.runId)});}
    if(store.accountId===id){updateStatus();account.render();}
  })();syncTask={id,promise};updateStatus();try{await promise;}finally{if(syncTask?.promise===promise)syncTask=null;updateStatus();account.render();}
}
async function importGuest(){if(!cloud.signedIn)throw Error('Sign in to link guest stages.');const id=cloud.userId,guest=new ProgressStore(storage).value,wasEmpty=completedCount(store.value)===0,state=await cloud.importGuest(guest);if(cloud.userId!==id||store.accountId!==id)throw Error('Your account changed. Reopen Account and try again.');store.save({...mergeProgress(store.value,cloudProgress(state)),...(wasEmpty?{selected:guest.selected}:{})});account.render();updateStatus();journey.render();if(wasEmpty)await start(store.value.selected,{resume:true,enter:$('home').hidden});}
async function deleteAccount(){
 const id=cloud.userId;if(!id)return;const intent=privacy.prepare(id),prepared=await cloud.api('delete-prepare',{requestId:intent.requestId});privacy.canonical(id,prepared.requestId);
 await cloud.deleteAccount(prepared.requestId,{onDeleted:async()=>{privacy.seal(id);metrics.forget(id);let sdkError;try{await purchases.retire?.(id);}catch{sdkError=Error('Your account is deleted. Restart the app to finish purchase-profile cleanup.');}privacy.purge(id);account.clearPrivateFields();if(sdkError)throw sdkError;}});account.render();updateStatus();
}
window.addEventListener('online',()=>{if(cloud.signedIn)void syncPending().catch(()=>toast('Your device saves will upload when the connection returns.'));});
window.addEventListener('offline',()=>{if(cloud.signedIn){cloud.syncError=Error('You are offline. Your device progress is safe. Reconnect, then tap Sync now.');updateStatus();account.render();}});
window.addEventListener('storage',e=>{if(e.key===store.key){store.save(mergeProgress(store.value,store.read()));updateStatus();if($('gallery').open)journey.render();}});
if(native){
  void App.addListener('appStateChange',({isActive})=>{if(!isActive){away();cloud.client?.auth.stopAutoRefresh();}else{cloud.client?.auth.startAutoRefresh();renderReadyCoaching();if(cloud.signedIn){void syncPending().catch(()=>{});void metrics.refresh();}}});
  if(Capacitor.getPlatform()==='android')void App.addListener('backButton',()=>{const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);if(dialog)dialog.close();else if($('home').hidden)requestHome();else{saveSession();void App.exitApp();}});
}else if('serviceWorker' in navigator){void navigator.serviceWorker.register('./sw.js').catch(()=>{});}
// Legacy scores are retained, but an old freely selected stage is not treated
// as proof that the preceding stages were completed.
if(!readJSON(store.key)){const legacy=readJSON('brick-breaker-channel-v2');if(Number.isSafeInteger(legacy?.best)&&legacy.best>=0&&legacy.best<=1e12)store.save({...store.value,best:legacy.best});}
requestAnimationFrame(frame);updateStatus();
setTimeout(()=>{$('splash').hidden=true;renderReadyCoaching();},reduced?150:650);
try{await privacy.recover(id=>cloud.deletionStatus(id));}catch{account.message('Account deletion recovery needs a connection or available device storage. Keep this app installed and retry.',true);}
try{await cloud.init();}catch{account.message('Cloud saving is offline. You can keep playing.',true);}
booting=false;loading=false;await start(store.value.selected,{resume:true,enter:false,sync:!cloud.signedIn});
const requested=new URLSearchParams(location.search).get('account');if(requested){account.show();if(requested==='delete'&&cloud.signedIn)$('requestDelete').click();if(requested==='export'&&cloud.signedIn)$('exportHistory').click();}
