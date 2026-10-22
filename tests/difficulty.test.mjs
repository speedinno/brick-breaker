import test from 'node:test';import assert from 'node:assert/strict';
import {difficultyProfile} from '../dist/difficulty.js';
import {architectureForLevel,ARCHITECTURES} from '../dist/generated.js';
import {Game} from '../dist/engine.js';
import {createDefinition} from '../dist/catalog.js';
test('difficulty grows gradually within safe control and physics limits',()=>{
 let prior=difficultyProfile(13);assert.equal(prior.label,'Easy');
 for(let n=14;n<3000;n++){const p=difficultyProfile(n);assert(p.speed>=prior.speed&&p.speed-prior.speed<.7);assert(p.paddleWidth<=prior.paddleWidth&&prior.paddleWidth-p.paddleWidth<.16);assert(p.siteTarget>=prior.siteTarget);assert(p.loopTarget>=prior.loopTarget);assert(p.channelRadius<=prior.channelRadius);assert(p.speed<=422&&p.paddleWidth>=66);prior=p;}
 assert.equal(difficultyProfile(1).speed,322);assert.equal(difficultyProfile(12).paddleWidth,82);
 let early=0,later=0;for(let n=0;n<ARCHITECTURES.length;n++){const a=createDefinition(13+n),b=createDefinition(413+n);early+=a.recipe.nodes+a.recipe.edges;later+=b.recipe.nodes+b.recipe.edges;}assert(later>early*1.5,'Later recipe graphs should become substantially more interwoven');
});
test('architecture bags contain all styles without adjacent repeats',()=>{
 assert.equal(ARCHITECTURES.length,22);let prior=-1;
 for(let block=0;block<40;block++){const bag=[];for(let n=0;n<ARCHITECTURES.length;n++){const kind=architectureForLevel(13+block*ARCHITECTURES.length+n);assert.notEqual(kind,prior);prior=kind;bag.push(kind);}assert.equal(new Set(bag).size,ARCHITECTURES.length);}
});
test('representative later difficulty bands remain clearable with the real simulation',()=>{
 for(const level of [36,60,100,180,350,750])for(const seed of [8937,1267]){const g=new Game({level,seed,mode:'watch'});g.launch();for(let t=0;t<120*900&&g.status!=='won'&&g.status!=='over';t++){if(g.status==='ready')g.launch();g.step(1/120);}assert.equal(g.status,'won',`stage ${level} seed ${seed}: ${g.remaining} remain`);assert(g.peakBalls>=4&&g.peakBalls<=768);}
});
