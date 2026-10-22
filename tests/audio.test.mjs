import test from 'node:test';import assert from 'node:assert/strict';
import {SoundEffects} from '../dist/audio.js';
test('sound waits for gesture resume and cleans up its audible envelope',async()=>{
 let finish,created=0,played=0,disconnected=0,peak=0,ended;
 const context={state:'suspended',currentTime:10,destination:{},resume(){return new Promise(resolve=>finish=()=>{this.state='running';resolve();});},createOscillator(){return{frequency:{setValueAtTime(){}},connect(){},disconnect(){disconnected++;},set onended(fn){ended=fn;},start(){played++;},stop(){}};},createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(value){peak=value;},exponentialRampToValueAtTime(){}},connect(){},disconnect(){disconnected++;}};}};
 const sound=new SoundEffects({enabled:true,createContext:()=>{created++;return context;}});
 const first=sound.unlock(),second=sound.unlock();assert.equal(sound.play(),false);assert.equal(created,1);finish();assert.equal(await first,true);assert.equal(await second,true);
 assert.equal(sound.play(620,.18),true);assert.equal(played,1);assert(peak>=.05&&peak<=.1);ended();assert.equal(disconnected,2);
 sound.enabled=false;assert.equal(sound.play(),false);assert.equal(await sound.unlock(),false);assert.equal(played,1);
});
test('audio resume failure is reported without silently switching the preference off',async()=>{
 const sound=new SoundEffects({enabled:true,createContext:()=>({state:'suspended',resume:async()=>{throw Error('blocked');}})});
 assert.equal(await sound.unlock(),false);assert.equal(sound.enabled,true);assert.match(sound.error.message,/could not start/);assert.equal(sound.play(),false);
});
