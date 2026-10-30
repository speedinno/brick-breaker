import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,copyFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('release preflight follows the package version and rejects drift in either native configuration',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'brick-preflight-'));
  const directories=['scripts','dist','android','android/app','ios','ios/App','ios/App/App','ios/App/App.xcodeproj'];
  const files=['scripts/release-preflight.mjs','scripts/public-config.mjs','package.json','dist/cloud-config.js','dist/index.html','dist/play-metrics.js','android/app/build.gradle','ios/App/App.xcodeproj/project.pbxproj','ios/App/App/PrivacyInfo.xcprivacy'];
  try{
    for(const path of directories)await mkdir(join(dir,path));
    for(const name of ['release-preflight.mjs','public-config.mjs'])await copyFile(new URL('../scripts/'+name,import.meta.url),join(dir,'scripts',name));
    await writeFile(join(dir,'package.json'),JSON.stringify({type:'module',version:'7.4.2'}));
    await writeFile(join(dir,'dist/cloud-config.js'),`export default ${JSON.stringify({publicGameUrl:'https://example.test/',supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_public_fixture_key',supportEmail:'support@example.test',publisherName:'Fixture'})};`);
    await writeFile(join(dir,'ios/App/App/PrivacyInfo.xcprivacy'),'NSPrivacyCollectedDataTypeEmailAddress NSPrivacyCollectedDataTypePurchaseHistory NSPrivacyCollectedDataTypePurposeAnalytics');
    await writeFile(join(dir,'dist/index.html'),'Version 7.4.2 · Build 81');await writeFile(join(dir,'dist/play-metrics.js'),"const read=({build='7.4.2'}={})=>build;");
    const native=async(android='7.4.2',debug='7.4.2',release='7.4.2',androidBuild=81,iosBuild=81)=>{
      await writeFile(join(dir,'android/app/build.gradle'),`versionName "${android}"\nversionCode ${androidBuild}`);
      await writeFile(join(dir,'ios/App/App.xcodeproj/project.pbxproj'),`PrivacyInfo.xcprivacy in Resources\nMARKETING_VERSION = ${debug};\nMARKETING_VERSION = ${release};\nCURRENT_PROJECT_VERSION = ${iosBuild};\nCURRENT_PROJECT_VERSION = ${iosBuild};`);
    };
    const run=(...flags)=>spawnSync(process.execPath,['scripts/release-preflight.mjs',...flags],{cwd:dir,encoding:'utf8'});
    await native();const valid=run('--production');assert.equal(valid.status,0,valid.stderr);const report=JSON.parse(valid.stdout);assert.equal(report.publicCloudConfigurationComplete,true);assert.equal(report.productionConfigurationComplete,undefined);assert.equal(report.version,'7.4.2');assert.equal(report.build,81);assert.match(report.scope,/production readiness is not assessed/);
    for(const versions of [['7.4.20','7.4.2','7.4.2'],['7.4.2','7.4.1','7.4.2'],['7.4.2','7.4.2','7.4.1']]){
      await native(...versions);const invalid=run('--production');assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/Native\/web versions differ/);
    }
    await native('7.4.2','7.4.2','7.4.2',81,80);let invalid=run('--production');assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/Native build numbers differ/);
    await native('7.4.2','7.4.1','7.4.1',81,80);assert.equal(run('--android-only').status,0);assert.match(run().stderr,/Native\/web versions differ/);assert.match(run('--production').stderr,/Native\/web versions differ/);assert.match(run('--production','--android-only').stderr,/Production preflight requires both native platforms/);
    await native();await writeFile(join(dir,'dist/index.html'),'Version 7.4.2 · Build 80');invalid=run('--production');assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/Visible version/);
    await writeFile(join(dir,'dist/index.html'),'Version 7.4.2 · Build 81');await writeFile(join(dir,'ios/App/App/PrivacyInfo.xcprivacy'),'NSPrivacyCollectedDataTypeEmailAddress');invalid=run('--production');assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/collection-purpose categories/);
  }finally{
    for(const path of files)await unlink(join(dir,path)).catch(error=>{if(error.code!=='ENOENT')throw error;});
    for(const path of directories.reverse())await rmdir(join(dir,path)).catch(error=>{if(error.code!=='ENOENT')throw error;});
    await rmdir(dir);
  }
});
