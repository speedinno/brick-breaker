import {RequestError} from './request.js';
const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
export async function deletionStatus(admin,requestId){
 if(!uuid(requestId))throw new RequestError('Invalid deletion receipt',400);
 const result=await admin.from('game_deletion_requests').select('deleted_at').eq('id',requestId).maybeSingle();
 if(result.error)throw Error('Deletion status is temporarily unavailable. Keep the receipt and retry.');
 // The random receipt is a capability. It exposes no identity, profile or
 // provider job details, and works after the auth token has been revoked.
 return{deleted:Boolean(result.data?.deleted_at)};
}
export async function prepareAccountDeletion(admin,user,requestId,now=Date.now()){
 if(!uuid(requestId)||!uuid(user?.id))throw new RequestError('Invalid deletion receipt',400);
 const signedAt=Date.parse(user.last_sign_in_at||'');
 if(!Number.isFinite(signedAt)||signedAt>now+60000||now-signedAt>15*60*1000)throw new RequestError('Sign out, sign in again, then delete your account within 15 minutes.',409);
 const result=await admin.rpc('game_prepare_account_deletion',{p_user:user.id,p_request:requestId});
 if(result.error||!uuid(result.data?.requestId))throw Error('Could not prepare account deletion. Please try again.');
 return{requestId:result.data.requestId};
}
export async function deletePreparedAccount(admin,user,requestId,now=Date.now()){
 const receipt=await prepareAccountDeletion(admin,user,requestId,now);
 // Official GoTrue deletion handles auth cleanup. The SQL BEFORE DELETE
 // trigger and every cascade commit together; a failure queues no erasure.
 const result=await admin.auth.admin.deleteUser(user.id);
 if(result.error)throw Error('Could not delete the account. Keep the receipt and retry.');
 return{...receipt,deleted:true,providerCleanup:'queued'};
}
