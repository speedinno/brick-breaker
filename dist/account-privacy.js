// Remove only this account's data. Guest saves, other accounts, device identity,
// levels and accessibility preferences must survive account deletion.
const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
const journalKey='brick-breaker-deletions-v1',authKey='brick-breaker-auth-v3';
export function accountStorageKeys(owner){
 if(!uuid(owner))throw Error('Invalid account cleanup identity');
 return['brick-breaker-v3:user:'+owner,'brick-breaker-session-v3:user:'+owner,...['assistance','purchase-pending','web-checkout','rewarded'].map(name=>'brick-breaker-'+name+'-v1:'+owner),...['native','web'].flatMap(platform=>['production','sandbox'].flatMap(environment=>{const key='brick-breaker-'+platform+'-recovery-v1:'+owner+':'+environment;return[key,key+':repair'];}))];
}
export class AccountPrivacy {
 constructor(raw){
  this.raw=raw;this.retired=new Set();
  this.storage={getItem:key=>{const value=this.raw.getItem(key);return this.blocked(key,value)?null:value;},removeItem:key=>this.raw.removeItem(key),setItem:(key,value)=>{if(this.blocked(key,value))throw Error('This account was deleted. Its local data cannot be saved again.');return this.raw.setItem(key,value);}};
  try{for(const row of this.pending())if(row.state==='deleted')this.retired.add(row.owner);}catch{ /* Recovery reports the error; ordinary play still loads. */ }
 }
 pending(){
  let rows;try{rows=JSON.parse(this.raw.getItem(journalKey)||'[]');}catch{throw Error('Account deletion recovery needs device storage. Keep this app installed and retry.');}
  if(!Array.isArray(rows)||rows.length>16||rows.some(row=>!uuid(row?.owner)||!uuid(row?.requestId)||!['prepared','deleted'].includes(row.state))||new Set(rows.map(row=>row.owner)).size!==rows.length)throw Error('Account deletion recovery needs review. Keep this app installed.');return rows;
 }
 write(rows){if(rows.length)this.raw.setItem(journalKey,JSON.stringify(rows));else this.raw.removeItem(journalKey);}
 blocked(key,value){
  for(const owner of this.retired)if(accountStorageKeys(owner).includes(key))return true;
  if(key===authKey){try{return this.retired.has(JSON.parse(value)?.user?.id);}catch{return false;}}
  return false;
 }
 prepare(owner){
  if(!uuid(owner)||this.retired.has(owner))throw Error('This account is unavailable.');
  const rows=this.pending(),saved=rows.find(row=>row.owner===owner);if(saved)return saved;
  if(rows.length>=16)throw Error('Recover pending account deletions before starting another.');
  const row={owner,requestId:crypto.randomUUID(),state:'prepared'};this.write([...rows,row]);return row;
 }
 canonical(owner,requestId){
  if(!uuid(requestId))throw Error('Invalid account deletion receipt');const rows=this.pending(),row=rows.find(row=>row.owner===owner);if(!row)throw Error('Account deletion receipt was not saved.');row.requestId=requestId;this.write(rows);return row;
 }
 seal(owner){
  this.retired.add(owner);const rows=this.pending(),row=rows.find(row=>row.owner===owner);if(!row)throw Error('Account deletion receipt was not saved.');row.state='deleted';try{if(JSON.parse(this.raw.getItem(authKey)||'null')?.user?.id===owner)row.clearAuth=true;}catch{}this.write(rows);
 }
 purge(owner){
  this.retired.add(owner);const failures=[];
  for(const key of accountStorageKeys(owner))try{this.raw.removeItem(key);}catch{failures.push(key);}
  // Auth storage can already belong to another account when an old deletion
  // receipt is recovered. Never sign that account out or erase its session.
  try{const auth=JSON.parse(this.raw.getItem(authKey)||'null'),row=this.pending().find(row=>row.owner===owner);if(auth?.user?.id===owner||!auth&&row?.clearAuth){this.raw.removeItem(authKey);this.raw.removeItem(authKey+'-code-verifier');}}catch{failures.push(authKey);}
  if(failures.length)throw Error('Your account is deleted. Device cleanup needs a retry; keep this app installed.');
  this.write(this.pending().filter(row=>row.owner!==owner));
 }
 async recover(status){
  const summary={cleared:0,pending:0};
  for(const row of this.pending()){
   const deleted=row.state==='deleted'||(await status(row.requestId)).deleted===true;
   if(!deleted){summary.pending++;continue;}this.seal(row.owner);this.purge(row.owner);summary.cleared++;
  }
  return summary;
 }
}
