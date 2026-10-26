const validVersion=value=>typeof value==='string'&&/^[1-9]\d{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n;
// Display snapshots are never spending authority. Reservations still require
// the backend. This guard prevents late read/purchase/ad responses from making
// the UI forget a newer debit, refund, pending reservation or grant.
export class WalletSnapshots {
 constructor({account,allowLegacy=true}){this.account=account;this.allowLegacy=allowLegacy;this.current=null;this.owner=null;this.version=null;}
 get value(){return this.owner===this.account()?this.current:null;}
 accept(snapshot){
  const owner=this.account();if(!owner)return false;
  if(!snapshot||!Number.isSafeInteger(snapshot.availableMs)||snapshot.availableMs<0)return false;
  if(snapshot.accountId!==undefined&&snapshot.accountId!==owner)return false;
  if(this.owner!==owner){this.current=null;this.version=null;this.owner=owner;}
  if(snapshot.snapshotVersion===undefined){
   // Compatibility only until the first versioned response during migration.
   // A modern server snapshot can never be overwritten by legacy responses.
   if(!this.allowLegacy||this.version!==null)return false;
  }else{
   if(snapshot.accountId!==owner||!validVersion(snapshot.snapshotVersion))return false;
   const version=BigInt(snapshot.snapshotVersion);if(this.version!==null&&version<=this.version)return false;this.version=version;
  }
  this.current=snapshot;return true;
 }
 clear(){this.current=null;this.owner=null;this.version=null;}
}
