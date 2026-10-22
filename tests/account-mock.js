// Local acceptance only. Every external fetch is intercepted; no real accounts,
// inboxes or cloud saves are touched by this fixture.
const originalFetch=window.fetch.bind(window);
const user={id:'11111111-1111-4111-8111-111111111111',email:'qa@example.test'};
const encode=value=>btoa(JSON.stringify(value)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})+'.local-test';
window.accountQA={fail:false,state:{starter_completed:[],highest_unlocked:13,recent:[],best_score:0},calls:[]};
window.fetch=async(input,init={})=>{
 const url=new URL(input instanceof Request?input.url:input,location.href),qa=window.accountQA;
 if(url.origin===location.origin)return originalFetch(input,init);
 if(url.pathname==='/auth/v1/otp')return Response.json({});
 if(url.pathname==='/auth/v1/verify')return Response.json({access_token:token,refresh_token:'local-test',expires_in:3600,token_type:'bearer',user});
 if(url.pathname==='/auth/v1/logout')return Response.json({});
 const body=JSON.parse(init.body||'{}');qa.calls.push(body.action);
 if(qa.fail)return Response.json({error:'Test cloud unavailable. Your device progress is safe.'},{status:503});
 if(body.action==='state')return Response.json(qa.state);
 if(body.action==='import'){qa.state={starter_completed:body.starters,highest_unlocked:body.journeyNext,best_score:700,selected_level:8,recent:body.records.map(r=>({level:r.level,best_score:r.score,best_seconds:r.seconds,peak_balls:r.peak,play_mode:r.mode,clears:r.clears,last_completed_at:new Date(r.completedAt).toISOString()}))};return Response.json(qa.state);}
 if(body.action==='level'){const {createDefinition,definitionHash}=await import('/catalog.js');const definition=createDefinition(body.level);return Response.json({definition,layout_hash:await definitionHash(definition)});}
 if(body.action==='history')return Response.json({history:qa.state.recent,nextBefore:null});
 throw Error('Blocked external request in local test: '+url.pathname);
};
