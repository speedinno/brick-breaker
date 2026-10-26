// Local QA observer only. server.mjs serves/injects this with QA_FIXTURES=1;
// it never enters dist, native packages or the Azure API container.
import {Game} from '/engine.js';
let observed=null,lastFrame=null,activeMs=0,peakBalls=0;
const intervals=[],callbacks=[],steps=[];
const percentile=(values,p)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)];};
const summary=values=>({samples:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:values.length?Math.max(...values):null});
const originalStep=Game.prototype.step;
Game.prototype.step=function(...args){observed=this;const active=this.status==='playing',start=performance.now();try{return originalStep.apply(this,args);}finally{if(active){peakBalls=Math.max(peakBalls,this.balls.length);if(steps.length<30000)steps.push(performance.now()-start);}}};
const rawRAF=window.requestAnimationFrame.bind(window);
window.requestAnimationFrame=callback=>rawRAF(time=>{
 if(callback.name!=='frame')return callback(time);
 const start=performance.now();callback(time);
 const active=observed?.status==='playing'&&document.getElementById('home')?.hidden&&!document.hidden&&!document.querySelector('dialog[open]')&&document.getElementById('prompt')?.hidden;
 if(active){if(lastFrame!==null&&time>lastFrame&&intervals.length<20000){intervals.push(time-lastFrame);activeMs+=time-lastFrame;}lastFrame=time;if(callbacks.length<20000)callbacks.push(performance.now()-start);}else lastFrame=null;
});
Object.defineProperty(window,'brickQAObservation',{value:Object.freeze({
 read:()=>observed?{status:observed.status,paddleX:observed.paddle.x,balls:observed.balls.length,bricks:observed.remaining,level:observed.level}:null,
 stats:()=>({activeMs,peakBalls,frameIntervalsMs:summary(intervals),appCallbackMs:summary(callbacks),simulationStepMs:summary(steps),over33ms:intervals.filter(value=>value>33.34).length,over50ms:intervals.filter(value=>value>50).length,over100ms:intervals.filter(value=>value>100).length,userAgent:navigator.userAgent,dpr:devicePixelRatio,viewport:{width:innerWidth,height:innerHeight},visibility:document.visibilityState,observerOverheadIncluded:true})
})});
