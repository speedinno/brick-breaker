import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
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
  const initial = await evaluate(`({native:window.Capacitor.isNativePlatform(),title:document.title,remaining:Number(document.getElementById('remaining').textContent),promptHidden:document.getElementById('prompt').hidden,canvas:Array.from(document.getElementById('game').getContext('2d').getImageData(50,50,1,1).data),url:location.href})`);
  assert.equal(initial.native, true);
  assert.equal(initial.title, 'Brick Breaker');
  assert.ok(initial.remaining > 1000, 'The dense field must load while Wi-Fi and data are off');
  assert.equal(initial.promptHidden, false);
  assert.ok(initial.canvas[0] > 80, 'The field must be painted, not an empty canvas');
  await evaluate(`document.getElementById('watch').click(); true`);
  await wait(20000);
  const playing = await evaluate(`({hidden:document.getElementById('prompt').hidden,remaining:Number(document.getElementById('remaining').textContent),balls:Number(document.getElementById('balls').textContent),auto:document.getElementById('auto').getAttribute('aria-pressed')})`);
  assert.equal(playing.hidden, true, 'Watch must launch the native game');
  assert.equal(playing.auto, 'true');
  assert.ok(playing.balls >= 1);
  assert.ok(playing.remaining < initial.remaining, 'Native physics must break bricks');
  await evaluate(`document.getElementById('pause').click(); true`);
  assert.equal(await evaluate(`document.getElementById('promptTitle').textContent`), 'Paused.');
  await evaluate(`document.getElementById('launch').click(); true`);
  assert.equal(await evaluate(`document.getElementById('prompt').hidden`), true);
  assert.deepEqual(errors, [], 'No uncaught WebView JavaScript errors');
  await writeFile('native-evidence/android-checks.json', JSON.stringify({initial, playing, errors}, null, 2));
  console.log(JSON.stringify({offlineNativeLaunch: true,gameplay: true,pauseResume: true,initial,playing}));
} finally {socket.close();}
