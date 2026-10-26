import test from 'node:test';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';
test('actual Azure deployment orchestration preserves subscription boundaries and keeps private values out of command arguments',async()=>{
 const result=await promisify(execFile)('pwsh',['-NoProfile','-File',fileURLToPath(new URL('./deploy-api.test.ps1',import.meta.url))],{timeout:30000});assert.match(result.stdout,/Deployment orchestration passed/);assert.equal(result.stderr,'');assert(!result.stdout.includes('server-test-key'));
});
