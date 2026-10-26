import test from 'node:test';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';
test('actual worker deployment stages real execution and scoped heartbeat verification before schedule activation',async()=>{
 const result=await promisify(execFile)('pwsh',['-NoProfile','-File',fileURLToPath(new URL('./deploy-operations.test.ps1',import.meta.url))],{timeout:30000});assert.match(result.stdout,/Worker deployment orchestration passed/);assert.equal(result.stderr,'');assert(!result.stdout.includes('worker-private-fixture'));
});
