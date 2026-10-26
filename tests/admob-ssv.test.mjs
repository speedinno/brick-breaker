import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {AdMobVerifier,ecdsaDerToRaw} from '../supabase/functions/_shared/admob-ssv.js';
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),other=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),offer='11111111-1111-4111-8111-111111111111',now=1793000000000;
const signed=`ad_network=1953547073528090325&ad_unit=123456789&custom_data=${offer}&reward_amount=1&reward_item=autoplay%20time&timestamp=${now}&transaction_id=18fa792de1bca816048293fc71035638&user_id=${offer}`;
function url(content=signed,{key=pair.privateKey,kid=1}={}){return'https://game.example/webhooks/admob?'+content+'&signature='+sign('sha256',Buffer.from(content),key).toString('base64url')+'&key_id='+kid;}
function keyData(key=pair.publicKey,kid=1){return{keyId:kid,base64:key.export({type:'spki',format:'der'}).toString('base64')};}
function setup(){let clock=now,keys=[keyData()],fail=false,calls=0;const verifier=new AdMobVerifier({now:()=>clock,fetch:async(address,options)=>{calls++;assert.equal(address,'https://www.gstatic.com/admob/reward/verifier-keys.json');assert.equal(options.redirect,'error');if(fail)throw Error('private diagnostic');return Response.json({keys});}});return{verifier,get calls(){return calls;},set keys(value){keys=value;},set fail(value){fail=value;},advance:ms=>clock+=ms};}
test('Google-format raw query verifies against an independently generated OpenSSL ECDSA signature',async()=>{
 const t=setup(),result=await t.verifier.verify(url());assert.equal(result.offerId,offer);assert.equal(result.userHint,offer);assert.equal(result.unit,'123456789');assert.equal(result.item,'autoplay time');assert.equal(result.amount,1);assert.equal(result.earnedAt,new Date(now).toISOString());assert.equal(t.calls,1);
 await t.verifier.verify(url());assert.equal(t.calls,1);
});
test('payload editing, reordering or percent-encoding normalization invalidates the original signature',async()=>{
 const t=setup(),valid=url();for(const altered of [valid.replace('reward_amount=1','reward_amount=2'),valid.replace('autoplay%20time','autoplay+time'),valid.replace('ad_unit=123456789&custom_data='+offer,'custom_data='+offer+'&ad_unit=123456789')])await assert.rejects(()=>t.verifier.verify(altered),/Invalid reward/);
});
test('duplicate fields, unsigned suffixes, invalid percent encoding and malformed signatures are rejected',async()=>{
 const t=setup();for(const bad of [url(signed+'&custom_data='+offer),url()+'&extra=1',url().replace('signature=','signature=%ZZ'),url().replace('&key_id=1','&key_id=1&signature=x'),url().replace('reward_item=autoplay%20time','reward_item=%FF')])await assert.rejects(()=>t.verifier.verify(bad),/Invalid reward/);
});
test('a client-generated signature or a substituted public key cannot verify with Google-authorized keys',async()=>{
 await assert.rejects(()=>setup().verifier.verify(url(signed,{key:other.privateKey})),/Invalid reward/);
});
test('key rotation refreshes a new signing ID; no trusted key is cached longer than 24 hours',async()=>{
 const t=setup();await t.verifier.verify(url());t.advance(2000);t.keys=[keyData(other.publicKey,2)];await t.verifier.verify(url(signed,{key:other.privateKey,kid:2}));assert.equal(t.calls,2);
 t.advance(86400001);t.fail=true;await assert.rejects(()=>t.verifier.verify(url(signed,{key:other.privateKey,kid:2})),error=>error.status===503&&!error.message.includes('private'));
});
test('unknown key IDs and unavailable/malformed key responses never produce a grantable verification',async()=>{
 const t=setup();await assert.rejects(()=>t.verifier.verify(url(signed,{kid:99})),error=>error.status===503);assert.equal(t.calls,1);
 const malformed=setup();malformed.keys=[];await assert.rejects(()=>malformed.verifier.verify(url()),error=>error.status===503);
});
test('DER parsing rejects negative, nonminimal, oversized or trailing integers',()=>{
 for(const bytes of [[0x30,6,2,1,0x80,2,1,1],[0x30,7,2,2,0,1,2,1,1],[0x30,6,2,1,1,2,1,1,0],new Array(73).fill(0)])assert.throws(()=>ecdsaDerToRaw(Uint8Array.from(bytes)),/Invalid reward/);
});
test('a valid delayed callback retains its signed event time, but impossible future timestamps fail',async()=>{
 const t=setup();t.advance(10*86400000);assert.equal((await t.verifier.verify(url())).earnedAt,new Date(now).toISOString());
 await assert.rejects(()=>setup().verifier.verify(url(signed.replace('timestamp='+now,'timestamp='+(now+300001)))),/Invalid reward/);
});
