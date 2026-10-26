import {readFile} from 'node:fs/promises';
// Imported only behind QA_FIXTURES=1. The real app/service/adapter/UI run with
// fake publisher callbacks and the existing disposable PostgreSQL fixture.
export async function rewardedRoute(url,res){
 let source,type;
 if(url.pathname==='/__rewarded'){source=await readFile('tests/rewarded-feedback.html','utf8');type='text/html';}
 else if(url.pathname==='/__privacy'){source=await readFile('tests/privacy-feedback.html','utf8');type='text/html';}
 else if(url.pathname==='/__consent'){source=await readFile('tests/consent-feedback.html','utf8');type='text/html';}
 else if(url.pathname==='/__consent-game'){
  source=(await readFile('dist/index.html','utf8')).replace('<head>','<head><script src="/__time-mock.js"></script><script src="/__consent-sdk.js"></script>').replace('src="./app.js"','src="/__consent-app.js"');type='text/html';
 }else if(url.pathname==='/__consent-app.js'){
  source=(await readFile('dist/app.js','utf8')).replace("import adRuntime from './ad-runtime.js';","const adRuntime={enabled:true,audienceReviewed:true,platforms:['web'],web:{publisherId:'ca-pub-1234567890123456',cmpScriptUrl:'https://fundingchoicesmessages.google.com/i/pub-1234567890123456?ers=1',consentReviewed:true,origins:[location.origin]}};").replace('new H5RewardedAdapter({externalStart','new H5RewardedAdapter({load:globalThis.__qaH5Load,externalStart');type='text/javascript';
 }else if(url.pathname==='/__consent-sdk.js'){source=await readFile('tests/consent-sdk-mock.js','utf8')+'\n'+await readFile('tests/rewarded-sdk-mock.js','utf8');type='text/javascript';}
 else if(url.pathname==='/__rewarded-game'){
  source=(await readFile('dist/index.html','utf8')).replace('<head>','<head><script src="/__time-mock.js"></script><script src="/__rewarded-sdk.js"></script>').replace('src="./app.js"','src="/__rewarded-app.js"');type='text/html';
 }else if(url.pathname==='/__rewarded-app.js'){
  source=(await readFile('dist/app.js','utf8')).replace("import adRuntime from './ad-runtime.js';","const adRuntime={enabled:true,audienceReviewed:true,platforms:['web']};").replace('new H5RewardedAdapter({externalStart','new H5RewardedAdapter({load:globalThis.__qaH5Load,externalStart').replace('consent:()=>webConsent.request()','consent:async()=>true');type='text/javascript';
 }else if(url.pathname==='/__rewarded-sdk.js'){source=await readFile('tests/rewarded-sdk-mock.js','utf8');type='text/javascript';}
 else return false;
 res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'}).end(source);return true;
}
