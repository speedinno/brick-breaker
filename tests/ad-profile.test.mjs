import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {validateAdProfile,profileFiles} from '../scripts/ad-profile.mjs';
const android='ca-app-pub-3940256099942544~3347511713',ios='ca-app-pub-3940256099942544~1458002511';
const input=()=>({version:1,environment:'sandbox',audienceReviewed:false,android:{appId:android,consentReviewed:false}});
const files={capacitor:{appId:'com.speedinno.brickbreaker',includePlugins:['@capacitor/app'],android:{backgroundColor:'#14171c'},ios:{contentInset:'never'}},manifest:'<manifest>\n <application>\n </application>\n</manifest>\n',plist:'<plist>\n<dict>\n<key>Existing</key><true/>\n</dict>\n</plist>\n'};
const parsed=result=>({...result,capacitor:JSON.parse(result.capacitor)});
test('Android-only configuration never registers the iOS plugin, and unreviewed sandbox stays disabled',()=>{
 const profile=validateAdProfile(input()),result=profileFiles(files,profile),config=JSON.parse(result.capacitor);
 assert.equal(profile.enabled,false);assert.deepEqual(config.android.includePlugins,['@capacitor/app','@capacitor-community/admob']);assert.equal(config.ios.includePlugins,undefined);assert(result.manifest.includes(android));assert(!result.plist.includes('GADApplicationIdentifier'));assert(result.manifest.includes('DELAY_APP_MEASUREMENT_INIT'));
});
test('reconfiguration is idempotent and disabling restores native identifiers/plugin lists without removing existing settings',()=>{
 const profile=validateAdProfile({...input(),ios:{appId:ios,consentReviewed:false,skAdNetworkIds:['cstr6suwn9.skadnetwork']}}),once=profileFiles(files,profile),twice=profileFiles(parsed(once),profile);
 assert.deepEqual(twice,once);assert(once.plist.includes(ios));assert(once.plist.includes('cstr6suwn9.skadnetwork'));assert(once.plist.includes('GADDelayAppMeasurementInit'));
 const disabled=profileFiles(parsed(once),null);assert.deepEqual(JSON.parse(disabled.capacitor),files.capacitor);assert.equal(disabled.manifest,files.manifest);assert.equal(disabled.plist,files.plist);assert(disabled.runtime.includes('"enabled": false'));
});
test('production requires audience/consent review and real App IDs, and never accepts ad units or private fields',()=>{
 assert.throws(()=>validateAdProfile({...input(),environment:'production'}),/demo/);
 assert.throws(()=>validateAdProfile({...input(),android:{appId:android.replace('~','/'),consentReviewed:false}}),/App ID/);
 assert.throws(()=>validateAdProfile({...input(),SUPABASE_SERVICE_ROLE_KEY:'never print'}),/private API keys/);
 const production={...input(),environment:'production',android:{appId:'ca-app-pub-1234567890123456~1234567890',consentReviewed:true}};
 assert.throws(()=>validateAdProfile(production),/Review/);production.audienceReviewed=true;assert.equal(validateAdProfile(production).enabled,true);
});
test('owned-web configuration permits only the exact publisher CMP tag and exact HTTPS origins',()=>{
 const web={publisherId:'ca-pub-1234567890123456',consentReviewed:true,cmpScriptUrl:'https://fundingchoicesmessages.google.com/i/pub-1234567890123456?ers=1',origins:['https://game.example.com']};
 const valid={version:1,environment:'production',audienceReviewed:true,web};assert.equal(validateAdProfile(valid).enabled,true);
 for(const change of [{cmpScriptUrl:'https://evil.example/i/pub-1234567890123456'},{cmpScriptUrl:web.cmpScriptUrl+'&key=secret'},{cmpScriptUrl:web.cmpScriptUrl.replace('1234567890123456','1234567890123457')},{origins:['https://game.example.com/path']},{origins:['http://game.example.com']}])assert.throws(()=>validateAdProfile({...valid,web:{...web,...change}}));
});
test('unmanaged or damaged native IDs fail before writing rather than clobbering owner configuration',()=>{
 const profile=validateAdProfile(input());assert.throws(()=>profileFiles({...files,manifest:files.manifest.replace('<application>','<application><meta-data android:name="com.google.android.gms.ads.APPLICATION_ID"/>')},profile),/unmanaged/i);
 assert.throws(()=>profileFiles({...files,plist:files.plist.replace('<key>Existing</key>','<key>SKAdNetworkItems</key>')},profile),/unmanaged/i);
 assert.throws(()=>profileFiles({...files,plist:'<!-- SpeedInno managed ads: start -->'},profile),/markers/);
});
test('the checked-in example is a non-requesting sandbox profile',async()=>{
 const profile=validateAdProfile(JSON.parse(await readFile(new URL('../.env.ads.example.json',import.meta.url),'utf8')));assert.equal(profile.environment,'sandbox');assert.equal(profile.enabled,false);assert.deepEqual(profile.platforms,['android','ios']);
});
