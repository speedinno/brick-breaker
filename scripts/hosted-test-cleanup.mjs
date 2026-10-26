const fixtureEmail=value=>typeof value==='string'&&/^brick-launch-[ab]-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}@example\.test$/.test(value);
// Only the explicitly owned synthetic test inboxes are eligible. Admin-created
// email_confirm accounts and password login request no sign-in email. This is
// a reviewed test-record retention outcome, never a provider erasure claim.
export async function resolveHostedTestMailReviews(admin,emails){
 if(!Array.isArray(emails)||emails.length>20||emails.some(value=>!fixtureEmail(value))||new Set(emails).size!==emails.length)throw Error('Invalid hosted test cleanup identities.');
 if(!emails.length)return 0;
 const result=await admin.from('game_privacy_jobs').select('id,subject,processor:game_privacy_processors!inner(provider,scope,environment)').in('subject',emails).eq('state','manual_review').eq('last_code','delivery_retention_review');
 if(result.error||!Array.isArray(result.data))throw Error('Hosted test privacy review lookup failed.');
 if(result.data.some(row=>!emails.includes(row.subject)||row.processor?.provider!=='mail_delivery'||row.processor?.scope!=='configured-auth-smtp'||row.processor?.environment!=='database'))throw Error('Unexpected hosted test privacy processor; no review was resolved.');
 let resolved=0;for(const row of result.data){const ack=await admin.rpc('game_resolve_manual_privacy',{p_id:row.id,p_outcome:'manual_retained',p_reference:'hosted-acceptance-no-mail-request'});if(ack.error||ack.data!==true)throw Error('Hosted test privacy review acknowledgement failed.');resolved++;}return resolved;
}
