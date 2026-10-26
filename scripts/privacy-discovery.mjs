import {createHash} from 'node:crypto';
const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/.test(value);
const cursor=value=>value===null||typeof value==='string'&&value.length>0&&value.length<=1500&&value.isWellFormed()&&!/[\u0000-\u001f\u007f]/.test(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
export async function discoverPrivacyBatch({identity,read,write,page,observe,batch=5,restart=false,halt=()=>false}){
 if(!identity||identity.provider!=='revenuecat'||!/^https:\/\//.test(identity.database)||!/^[A-Za-z0-9_-]{1,120}$/.test(identity.projectId)||!['production','sandbox'].includes(identity.environment)||!Number.isSafeInteger(batch)||batch<1||batch>50)throw Error('Privacy discovery configuration is invalid.');
 let state=await read();
 const same=value=>value?.provider===identity.provider&&value?.projectId===identity.projectId&&value?.environment===identity.environment&&value?.database===identity.database;
 if(state&&(state.version!==1||!same(state.identity)||!cursor(state.cursor)||typeof state.complete!=='boolean'||!Array.isArray(state.seen)||state.seen.length>10000||state.seen.some(value=>typeof value!=='string'||!/^[a-f\d]{64}$/.test(value))||new Set(state.seen).size!==state.seen.length||state.complete&&(state.pending!==null||state.cursor!==null||state.seen.length)||state.pending!==null&&(!uuid(state.pending?.id)||!Array.isArray(state.pending.customers)||state.pending.customers.length>20||state.pending.customers.some(id=>!uuid(id))||new Set(state.pending.customers).size!==state.pending.customers.length||!cursor(state.pending.next)||!Number.isSafeInteger(state.pending.count)||state.pending.count<state.pending.customers.length||state.pending.count>20)))throw Error('Privacy discovery journal is invalid or belongs to another provider/database. Preserve it for review.');
 if(state?.pending?.next!==null&&state?.pending&&(state.pending.next===state.cursor||state.seen.includes(hash(state.pending.next))||!state.pending.count))throw Error('Privacy discovery journal has a repeated pending cursor. Preserve it for review.');
 if(restart&&state?.pending)throw Error('Privacy discovery has an unacknowledged page. Recover it before restarting.');
 if(!state||restart){state={version:1,identity,cursor:null,pending:null,complete:false,seen:[]};await write(state);}
 let pages=0,examined=0,matched=0;
 while(pages<batch&&!state.complete&&!halt()){
  if(!state.pending){
   const result=await page(state.cursor);
   if(!result||!Array.isArray(result.customers)||result.customers.length>20||result.customers.some(id=>!uuid(id))||new Set(result.customers).size!==result.customers.length||!cursor(result.next)||!Number.isSafeInteger(result.count)||result.count<result.customers.length||result.count>20||result.next!==null&&(!result.count||result.next===state.cursor||state.seen.includes(hash(result.next)))||state.seen.length>=10000)throw Error('Privacy discovery provider page repeated or is invalid. The durable cursor is retained.');
   state.pending={id:crypto.randomUUID(),customers:result.customers,next:result.next,count:result.count};
   // Preserve the observation identity and full candidate page before touching
   // SQL. A lost result replays exactly once, rather than reopening cleanup.
   await write(state);
  }
  const result=await observe(state.pending.id,state.pending.customers);
  if(!Number.isSafeInteger(result)||result<0||result>state.pending.customers.length)throw Error('Privacy discovery acknowledgment is invalid. The page is retained.');
  matched+=result;examined+=state.pending.count;pages++;state.cursor=state.pending.next;state.complete=state.cursor===null;state.pending=null;
  if(state.complete)state.seen=[];else state.seen.push(hash(state.cursor));
  await write(state);
 }
 return{pages,examined,matched,complete:state.complete,pending:state.pending!==null};
}
