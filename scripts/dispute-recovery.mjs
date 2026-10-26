const validId=value=>typeof value==='string'&&/^disp_[A-Za-z0-9]{1,80}$/.test(value);
export async function recoverDisputeBatch({identity,read,write,page,reconcile,batch=20,restart=false,halt=()=>false}){
 if(!Number.isSafeInteger(batch)||batch<1||batch>200)throw Error('Batch must be between 1 and 200.');
 let state=await read();
 if(state){
  if(state.version!==1||JSON.stringify(state.identity)!==JSON.stringify(identity)||!Number.isSafeInteger(state.skip)||state.skip<0||state.skip>1000000||!Array.isArray(state.pending)||state.pending.length>100||state.pending.some(id=>!validId(id))||new Set(state.pending).size!==state.pending.length||typeof state.complete!=='boolean'||state.complete&&state.pending.length>0||state.next!==null&&!state.pending.length||!(state.next===null||Number.isSafeInteger(state.next)&&state.next===state.skip+100))throw Error('The recovery journal is invalid or belongs to a different provider/database. Preserve it and check the configuration.');
  if(restart&&!state.complete)throw Error('Finish the current scan before restarting it.');
 }
 if(!state||restart){state={version:1,identity,skip:0,pending:[],next:null,complete:false,previousPage:null};await write(state);}
 let processed=0,ignored=0,reviews=0;
 while(processed<batch&&!state.complete&&!halt()){
  if(!state.pending.length){
   const result=await page(state.skip),ids=result?.ids;
   if(!Array.isArray(ids)||ids.length>100||ids.some(id=>!validId(id))||new Set(ids).size!==ids.length||!(result.next===null||ids.length===100&&result.next===state.skip+100&&result.next<=1000000))throw Error('The provider dispute page is invalid. The recovery cursor was retained.');
   if(ids.length&&state.previousPage===JSON.stringify(ids))throw Error('The provider repeated a dispute page. The recovery cursor was retained.');
   state.pending=ids;state.next=result.next;state.previousPage=JSON.stringify(ids);
   if(!ids.length){state.complete=true;await write(state);break;}
   // Write the whole page before applying a single financial observation.
   await write(state);
  }
  const result=await reconcile(state.pending[0]);processed++;if(result?.ignored)ignored++;if(result?.disputeReview)reviews++;
  state.pending.shift();
  if(!state.pending.length){if(state.next===null)state.complete=true;else state.skip=state.next;state.next=null;}
  await write(state);
 }
 return{processed,ignored,reviews,complete:state.complete,pending:state.pending.length,next:state.skip};
}
