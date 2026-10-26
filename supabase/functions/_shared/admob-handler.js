import {AdVerificationError} from './admob-ssv.js';
const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
// This public endpoint accepts only independently verified Google callbacks.
// A 200 acknowledges the SQL commit (including a durable review record), never
// a client completion hint or an uncommitted in-memory queue.
export function admobCallback({admin,verifier}){
 return async request=>{
  const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
  if(request.method!=='GET')return reply({error:'GET required'},405);
  try{
   const receipt=await verifier.verify(request.url);if(!uuid(receipt.offerId))return reply({ignored:true});
   const result=await admin.rpc('game_receive_admob_reward',{p_offer:receipt.offerId,p_transaction:receipt.transaction,p_unit:receipt.unit,p_amount:receipt.amount,p_item:receipt.item,p_earned_at:receipt.earnedAt,p_hint:receipt.userHint,p_proof:receipt.proof});
   if(result.error)return reply({error:'Reward reconciliation is temporarily unavailable'},503);
   return reply({received:true});
  }catch(error){return reply({error:error instanceof AdVerificationError?error.message:'Reward verification is temporarily unavailable'},error instanceof AdVerificationError?error.status:503);}
 };
}
