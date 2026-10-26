import test from 'node:test';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';
test('actual PowerShell Azure payload builders preserve existing resources and isolate private provider configuration',async()=>{
 const result=await promisify(execFile)('pwsh',['-NoProfile','-File',fileURLToPath(new URL('./azure-profile.test.ps1',import.meta.url))],{timeout:30000});assert.match(result.stdout,/Azure payload checks passed/);assert.equal(result.stderr,'');assert(!result.stdout.includes('private-fixture'));assert(!result.stdout.includes('private-cleanup-key'));
});
