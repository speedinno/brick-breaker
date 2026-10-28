import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const relaunch=process.argv.includes('--relaunch');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let target;
for (let attempt = 0; attempt < 15 && !target; attempt++) {
  try {
    const pages = await (await fetch('http://127.0.0.1:9222/json')).json();
    target = pages.find(page => page.type === 'page' && page.url.includes('localhost'));
  } catch {}
  if (!target) await wait(1000);
}
assert.ok(target?.webSocketDebuggerUrl, 'Native WebView must expose its locally bundled page');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {socket.addEventListener('open', resolve, {once: true}); socket.addEventListener('error', reject, {once: true});});
const pending = new Map(), errors = [];
let sequence = 0;
socket.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails);
  if (data.id && pending.has(data.id)) {
    const task = pending.get(data.id); pending.delete(data.id); clearTimeout(task.timer);
    if (data.error) task.reject(Error(JSON.stringify(data.error))); else task.resolve(data.result);
  }
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {pending.delete(id); reject(Error('CDP timeout: ' + method));}, 10000);
    pending.set(id, {resolve, reject, timer}); socket.send(JSON.stringify({id, method, params}));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  assert.equal(result.exceptionDetails, undefined, 'JavaScript evaluation must succeed');
  return result.result.value;
}
try {
  await call('Runtime.enable');
  let ready=false;
  for(let attempt=0;attempt<60&&!ready;attempt++){
    ready=await evaluate(`Boolean(document.getElementById('remaining')&&Number(document.getElementById('remaining').textContent)>0&&!document.getElementById('prompt').classList.contains('loading'))`);
    if(!ready)await wait(1000);
  }
  assert(ready,'Native field must finish loading, including after a cold restart');
  assert.equal(await evaluate(`document.getElementById('home').hidden`),false,'Every cold launch opens the home menu');
  await evaluate(`document.getElementById('homePlay').click();if(document.getElementById('help').open)document.getElementById('helpDone').click();true`);
  assert.equal(await evaluate(`document.getElementById('home').hidden`),true,'Play enters the preserved stage');
  if(!relaunch)assert.match(await evaluate(`document.getElementById('promptText').textContent`),/free paddle shooter/,'First play must explain its forgiving opening volley');
  assert.equal(await evaluate(`document.getElementById('saveStatus').tagName`),'SPAN','Autosaving is a status, not a Save button');
  const layout=await evaluate(`(()=>{const app=document.querySelector('.app'),board=document.getElementById('game'),rect=app.getBoundingClientRect(),footer=document.querySelector('footer').getBoundingClientRect();return {width:innerWidth,height:innerHeight,app:rect.toJSON(),footer:footer.toJSON(),scrollHeight:document.documentElement.scrollHeight,canvas:{width:board.width,height:board.height,css:board.getBoundingClientRect().toJSON()},controls:[...document.querySelectorAll('header button,.journey-strip button,.play-tools button')].map(e=>({id:e.id,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))};})()`);
  assert(Math.abs(layout.app.width-layout.width)<2&&Math.abs(layout.app.height-layout.height)<2,'Native app must fill its entire viewport');
  assert(layout.app.y===0&&layout.app.x===0,'No centered webpage margins in the native app');
  assert(layout.scrollHeight<=layout.height+1,'Game surface must not scroll');
  assert(layout.footer.bottom<=layout.height+1,'Bottom controls must stay on screen');
  assert(layout.canvas.width>=layout.canvas.css.width&&layout.canvas.height>=layout.canvas.css.height,'Canvas must render at screen resolution');
  for(const control of layout.controls)assert(control.width>=43.9&&control.height>=43.9,control.id+' needs a 44pt touch target');
  await writeFile('native-evidence/android-layout'+(relaunch?'-restored':'')+'.json',JSON.stringify(layout,null,2));
  if(relaunch){
    const before=JSON.parse(await readFile('native-evidence/android-saved-state.json','utf8'));
    const after=await evaluate(`JSON.parse(localStorage.getItem('brick-breaker-session-v3:guest'))`);
    for(const key of ['level','removed','balls','drops','lives','time','stageTime','score','floorUntil','wideUntil','fireUntil','shootUntil','nextShot','shots'])assert.deepEqual(after[key],before[key],`Cold restart preserves ${key}`);
    assert.equal(await evaluate(`document.getElementById('prompt').hidden`),false,'Restored field waits for explicit resume');
    const restoredRemaining=await evaluate(`Number(document.getElementById('remaining').textContent)`);
    assert.equal(restoredRemaining,before.signature.replaceAll('w','').replaceAll('.','').length-before.removed.length);
    await evaluate(`document.getElementById('launch').click();true`);await wait(3000);
    assert.equal(await evaluate(`document.getElementById('prompt').hidden`),true);
    assert.deepEqual(errors,[]);
    await writeFile('native-evidence/android-relaunch-checks.json',JSON.stringify({fieldReady:true,exactSnapshotRestored:true,resumeWorks:true,remaining:restoredRemaining,errors},null,2));
    console.log('Cold restart restored the exact saved field, lives, balls, boosts and shots');
  }else{
  const initial = await evaluate(`({native:window.Capacitor.isNativePlatform(),title:document.title,remaining:Number(document.getElementById('remaining').textContent),promptHidden:document.getElementById('prompt').hidden,url:location.href})`);
  assert.equal(initial.native, true);
  assert.equal(await evaluate(`Boolean(window.BrickBreakerStorage&&JSON.parse(window.BrickBreakerStorage.snapshot()).initialized)`),true,'Android game storage must use committed native persistence');
  assert.equal(initial.title, 'Brick Breaker');
  assert.ok(initial.remaining > 1000, 'The dense field must load while Wi-Fi and data are off');
  assert.equal(initial.promptHidden, false);
  const painted=await evaluate(`(()=>{const c=document.getElementById('game'),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let colored=0;for(let i=0;i<pixels.length;i+=16){const high=Math.max(pixels[i],pixels[i+1],pixels[i+2]),low=Math.min(pixels[i],pixels[i+1],pixels[i+2]);if(high>100&&high-low>45)colored++;}return colored;})()`);
  assert(painted>1000,'The responsive dense field must be painted');
  const legal=await evaluate(`Array.from(document.querySelectorAll('a[href]')).filter(a=>/privacy\\.html|terms\\.html|delete-account\\.html/.test(a.href)).map(a=>a.href)`);
  assert(legal.length>=3);assert(legal.every(url=>url.startsWith('https://')&&!url.startsWith('https://localhost/')&&!url.startsWith('capacitor:')),'Native legal links must open the public site');
  const journey=await evaluate(`document.getElementById('journeyButton').click();({cards:document.getElementById('patternGrid').children.length,locked:document.querySelector('#journeyGrid button').textContent,starter:document.getElementById('starterSummary').textContent})`);
  assert.equal(journey.cards,12);assert.match(journey.locked,/Locked/);assert.match(journey.starter,/0 of 12/);
  await evaluate(`document.querySelector('#journeyGrid button').click();true`);
  assert.match(await evaluate(`document.getElementById('lockMessage').textContent`),/Finish all 12 starter stages first/);
  await evaluate(`document.getElementById('lockDialog').close();document.getElementById('closeGallery').click();true`);
  await evaluate(`document.getElementById('launch').click(); true`);
  for(let attempt=0;attempt<50;attempt++){if(await evaluate(`document.getElementById('prompt').hidden`))break;await wait(200);}
  assert.equal(await evaluate(`document.getElementById('prompt').hidden`),true,'Manual offline launch must start gameplay');
  await evaluate(`document.getElementById('pause').click();true`);
  assert.equal(await evaluate(`document.getElementById('promptTitle').textContent`),'Paused.','An active game must pause');
  await evaluate(`document.getElementById('launch').click();true`);
  assert.equal(await evaluate(`document.getElementById('prompt').hidden`),true,'A paused game must resume');
  const board=layout.canvas.css,x=board.x+board.width*.5,y=board.y+board.height*.83;
  const paddleBefore=await evaluate(`JSON.parse(localStorage.getItem('brick-breaker-session-v3:guest')).paddleX`);
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+Math.min(70,board.width*.18),y,id:1}]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await wait(2500);
  const paddleAfter=await evaluate(`JSON.parse(localStorage.getItem('brick-breaker-session-v3:guest')).paddleX`);
  assert(Math.abs(paddleAfter-paddleBefore)>5,'Real Android touch drag must move the paddle');
  let destroyed=false;for(let attempt=0;attempt<120&&!destroyed;attempt++){destroyed=await evaluate(`Number(document.getElementById('remaining').textContent)<${initial.remaining}`);if(!destroyed)await wait(500);}
  assert(destroyed,'Manual offline physics must break bricks after a real touch gesture');
  const playing = await evaluate(`({hidden:document.getElementById('prompt').hidden,remaining:Number(document.getElementById('remaining').textContent),balls:Number(document.getElementById('balls').textContent),auto:document.getElementById('auto').getAttribute('aria-pressed'),status:JSON.parse(localStorage.getItem('brick-breaker-session-v3:guest')).status,lives:JSON.parse(localStorage.getItem('brick-breaker-session-v3:guest')).lives})`);
  if(!playing.hidden){
    assert.equal(playing.status,'ready','A visible prompt after manual play should offer another shot');
    assert(playing.lives>0,'The first missed shot should leave a retry');
  }else assert.ok(playing.balls>=1,'An active manual field must have a ball');
  assert.equal(playing.auto, 'false');
  assert.ok(playing.remaining < initial.remaining, 'Native physics must break bricks');
  const screenshot=spawnSync('adb',['exec-out','screencap','-p'],{maxBuffer:8*1024*1024});
  assert.equal(screenshot.status,0,'Capture the displayed Android game surface');
  await writeFile('native-evidence/Android-native-playing.png',screenshot.stdout);
  if(await evaluate(`document.getElementById('prompt').hidden`))await evaluate(`document.getElementById('pause').click();true`);
  const saved=await evaluate(`JSON.parse(localStorage.getItem('brick-breaker-session-v3:guest'))`);
  // A real manual shot may have ended between the first broken brick and
  // pausing. A ready field has no active balls, but must retain its damage.
  assert(saved?.removed.length>0&&['ready','playing'].includes(saved.status)&&
    (saved.status==='ready'||saved.balls.length>0),
    `Save real native gameplay before force stop (status ${saved?.status}, removed ${saved?.removed?.length}, balls ${saved?.balls?.length})`);
  const committed=await evaluate(`JSON.parse(JSON.parse(window.BrickBreakerStorage.snapshot()).values['brick-breaker-session-v3:guest'])`);
  assert.deepEqual(committed,saved,'Native disk commit must match the paused field before force stop');
  await writeFile('native-evidence/android-saved-state.json',JSON.stringify(saved,null,2));
  assert.deepEqual(errors, [], 'No uncaught WebView JavaScript errors');
  await writeFile('native-evidence/android-checks.json', JSON.stringify({initial, legal, journey, playing, errors}, null, 2));
  console.log(JSON.stringify({offlineNativeLaunch: true,gameplay: true,pauseResume: true,initial,playing}));
  }
} finally {socket.close();}
