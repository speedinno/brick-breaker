import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,copyFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('release preflight follows the package version and rejects drift in either native configuration',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'brick-preflight-'));
  const directories=['scripts','dist','android','android/app','ios','ios/App','ios/App/App','ios/App/App.xcodeproj'];
  const files=['scripts/release-preflight.mjs','scripts/public-config.mjs','package.json','dist/cloud-config.js','android/app/build.gradle','ios/App/App.xcodeproj/project.pbxproj','ios/App/App/PrivacyInfo.xcprivacy'];
  try{
    for(const path of directories)await mkdir(join(dir,path));
    for(const name of ['release-preflight.mjs','public-config.mjs'])await copyFile(new URL('../scripts/'+name,import.meta.url),join(dir,'scripts',name));
    await writeFile(join(dir,'package.json'),JSON.stringify({type:'module',version:'7.4.2'}));
    await writeFile(join(dir,'dist/cloud-config.js'),`export default ${JSON.stringify({publicGameUrl:'https://example.test/',supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_public_fixture_key',supportEmail:'support@example.test',publisherName:'Fixture'})};`);
    await writeFile(join(dir,'ios/App/App/PrivacyInfo.xcprivacy'),'NSPrivacyCollectedDataTypeEmailAddress');
    const native=async(android='7.4.2',debug='7.4.2',release='7.4.2')=>{
      await writeFile(join(dir,'android/app/build.gradle'),`versionName "${android}"`);
      await writeFile(join(dir,'ios/App/App.xcodeproj/project.pbxproj'),`PrivacyInfo.xcprivacy in Resources\nMARKETING_VERSION = ${debug};\nMARKETING_VERSION = ${release};`);
    };
    const run=()=>spawnSync(process.execPath,['scripts/release-preflight.mjs','--production'],{cwd:dir,encoding:'utf8'});
    await native();const valid=run();assert.equal(valid.status,0,valid.stderr);assert.equal(JSON.parse(valid.stdout).productionConfigurationComplete,true);
    for(const versions of [['7.4.20','7.4.2','7.4.2'],['7.4.2','7.4.1','7.4.2'],['7.4.2','7.4.2','7.4.1']]){
      await native(...versions);const invalid=run();assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/Native\/web versions differ/);
    }
  }finally{
    for(const path of files)await unlink(join(dir,path)).catch(error=>{if(error.code!=='ENOENT')throw error;});
    for(const path of directories.reverse())await rmdir(join(dir,path)).catch(error=>{if(error.code!=='ENOENT')throw error;});
    await rmdir(dir);
  }
});
