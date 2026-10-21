import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
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
  const initial = await evaluate(`({native:window.Capacitor.isNativePlatform(),title:document.title,remaining:Number(document.getElementById('remaining').textContent),promptHidden:document.getElementById('prompt').hidden,canvas:Array.from(document.getElementById('game').getContext('2d').getImageData(50,50,1,1).data),url:location.href})`);
  assert.equal(initial.native, true);
  assert.equal(initial.title, 'Brick Breaker');
  assert.ok(initial.remaining > 1000, 'The dense field must load while Wi-Fi and data are off');
  assert.equal(initial.promptHidden, false);
  assert.ok(initial.canvas[0] > 80, 'The field must be painted, not an empty canvas');
  const journey=await evaluate(`document.getElementById('journeyButton').click();({cards:document.getElementById('patternGrid').children.length,locked:document.querySelector('#journeyGrid button').textContent,starter:document.getElementById('starterSummary').textContent})`);
  assert.equal(journey.cards,12);assert.match(journey.locked,/Locked/);assert.match(journey.starter,/0 of 12/);
  await evaluate(`document.querySelector('#journeyGrid button').click();true`);
  assert.match(await evaluate(`document.getElementById('lockMessage').textContent`),/Finish all 12 starter stages first/);
  await evaluate(`document.getElementById('lockDialog').close();document.getElementById('closeGallery').click();true`);
  await evaluate(`document.getElementById('watch').click(); true`);
  let shooting=false;
  for(let attempt=0;attempt<150&&!shooting;attempt++){
    shooting=await evaluate(`document.getElementById('activeEffect')?.textContent==='Paddle shooter active'&&document.getElementById('prompt').hidden`);
    if(!shooting)await wait(200);
  }
  assert(shooting,'The earned paddle shooter must activate during real native gameplay');
  const playing = await evaluate(`({hidden:document.getElementById('prompt').hidden,remaining:Number(document.getElementById('remaining').textContent),balls:Number(document.getElementById('balls').textContent),auto:document.getElementById('auto').getAttribute('aria-pressed')})`);
  assert.equal(playing.hidden, true, 'Watch must launch the native game');
  assert.equal(playing.auto, 'true');
  assert.ok(playing.balls >= 1);
  assert.ok(playing.remaining < initial.remaining, 'Native physics must break bricks');
  const screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile('native-evidence/Android-native-playing.png',Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.getElementById('pause').click(); true`);
  assert.equal(await evaluate(`document.getElementById('promptTitle').textContent`), 'Paused.');
  await evaluate(`document.getElementById('launch').click(); true`);
  assert.equal(await evaluate(`document.getElementById('prompt').hidden`), true);
  await evaluate(`document.getElementById('pause').click();true`);
  const saved=await evaluate(`JSON.parse(localStorage.getItem('brick-breaker-session-v3:guest'))`);
  assert(saved?.removed.length>0&&saved.balls.length>0,'Save real native gameplay before force stop');
  await writeFile('native-evidence/android-saved-state.json',JSON.stringify(saved,null,2));
  assert.deepEqual(errors, [], 'No uncaught WebView JavaScript errors');
  await writeFile('native-evidence/android-checks.json', JSON.stringify({initial, journey, playing, errors}, null, 2));
  console.log(JSON.stringify({offlineNativeLaunch: true,gameplay: true,pauseResume: true,initial,playing}));
  }
} finally {socket.close();}
