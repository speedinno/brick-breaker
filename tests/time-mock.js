// Local auth only; time-bank operations use real PostgreSQL via /__time-api.
const originalFetch=window.fetch.bind(window);
const user={id:'11111111-1111-4111-8111-111111111111',email:'time-test@example.test'};
const encode=value=>btoa(JSON.stringify(value)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})+'.local-fixture';
window.timeQA={calls:[],fail:false,reserveDelay:0};
window.fetch=async(input,init={})=>{
  const url=new URL(input instanceof Request?input.url:input,location.href);
  if(url.origin===location.origin)return originalFetch(input,init);
  if(url.pathname==='/auth/v1/otp'||url.pathname==='/auth/v1/logout')return Response.json({});
  if(url.pathname==='/auth/v1/verify'||url.pathname==='/auth/v1/token')return Response.json({access_token:token,refresh_token:'local-fixture',expires_in:3600,token_type:'bearer',user});
  const body=JSON.parse(init.body||'{}');window.timeQA.calls.push(body);
  if(window.timeQA.fail)return Response.json({error:'Local test network interruption'},{status:503});
  const response=await originalFetch('/__time-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(body.action==='time-reserve'&&window.timeQA.reserveDelay)await new Promise(resolve=>setTimeout(resolve,window.timeQA.reserveDelay));
  return response;
};
