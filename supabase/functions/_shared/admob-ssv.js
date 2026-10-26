const KEYS='https://www.gstatic.com/admob/reward/verifier-keys.json';
export class AdVerificationError extends Error {constructor(message='Invalid reward verification',status=400){super(message);this.status=status;}}
const invalid=()=>new AdVerificationError();
const unavailable=()=>new AdVerificationError('Reward verification keys are temporarily unavailable',503);
const decode=value=>{try{return decodeURIComponent(value.replaceAll('+','%20'));}catch{throw invalid();}};
function base64(value,url=false){
 if(typeof value!=='string'||!(url?/^[A-Za-z0-9_-]+={0,2}$/:/^[A-Za-z0-9+/]+={0,2}$/).test(value))throw invalid();
 try{const input=url?value.replaceAll('-','+').replaceAll('_','/'):value;return Uint8Array.from(atob(input+'='.repeat((4-input.length%4)%4)),c=>c.charCodeAt(0));}catch{throw invalid();}
}
// Google sends ASN.1 DER ECDSA; WebCrypto expects fixed-width IEEE P1363.
export function ecdsaDerToRaw(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<8||bytes.length>72||bytes[0]!==0x30||bytes[1]!==bytes.length-2)throw invalid();
 let offset=2;const result=new Uint8Array(64);
 for(let n=0;n<2;n++){
  if(bytes[offset++]!==0x02)throw invalid();let length=bytes[offset++];
  if(length<1||length>33||offset+length>bytes.length||bytes[offset]&0x80)throw invalid();
  if(length>1&&bytes[offset]===0){if(!(bytes[offset+1]&0x80))throw invalid();offset++;length--;}
  if(length>32)throw invalid();result.set(bytes.subarray(offset,offset+length),n*32+32-length);offset+=length;
 }
 if(offset!==bytes.length)throw invalid();return result;
}
export class AdMobVerifier {
 constructor({fetch:request=fetch,now=()=>Date.now()}={}){this.request=request;this.now=now;this.keys=new Map();this.checkedAt=-Infinity;this.loading=null;}
 async refresh(){
  if(this.loading)return this.loading;
  const loading=(async()=>{
   let response;try{response=await this.request(KEYS,{redirect:'error',signal:AbortSignal.timeout(5000)});}catch{throw unavailable();}
   if(!response.ok||!response.body)throw unavailable();const reader=response.body.getReader(),chunks=[];let total=0;
   try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>65536){await reader.cancel();throw unavailable();}chunks.push(value);}}finally{reader.releaseLock();}
   let next;
   try{
    const bytes=new Uint8Array(total);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
    const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!Array.isArray(body.keys)||!body.keys.length||body.keys.length>16)throw Error();next=new Map();
    for(const key of body.keys){if(!Number.isSafeInteger(key.keyId)||key.keyId<0||next.has(String(key.keyId)))throw Error();next.set(String(key.keyId),{spki:key.base64,key:await crypto.subtle.importKey('spki',base64(key.base64),{name:'ECDSA',namedCurve:'P-256'},false,['verify'])});}
   }catch{throw unavailable();}
   this.keys=next;this.checkedAt=this.now();
  })();this.loading=loading;try{await loading;}finally{if(this.loading===loading)this.loading=null;}
 }
 async verify(url){
  let parsed;try{parsed=new URL(url);}catch{throw invalid();}
  const query=parsed.search.slice(1);if(parsed.hash||!query||query.length>8192)throw invalid();
  const parts=query.split('&');if(parts.length<10||parts.length>20||!parts.at(-2).startsWith('signature=')||!parts.at(-1).startsWith('key_id='))throw invalid();
  const values=new Map();
  for(const part of parts){const at=part.indexOf('='),key=part.slice(0,at);if(at<1||!/^[a-z_]{1,64}$/.test(key)||values.has(key))throw invalid();values.set(key,decode(part.slice(at+1)));}
  const keyId=values.get('key_id'),signature=ecdsaDerToRaw(base64(values.get('signature'),true));
  if(!/^[0-9]{1,16}$/.test(keyId||''))throw invalid();
  const required=['ad_network','ad_unit','custom_data','reward_amount','reward_item','timestamp','transaction_id','user_id'];if(required.some(key=>!values.get(key)))throw invalid();
  if(!/^[0-9]{1,24}$/.test(values.get('ad_network'))||!/^\d{1,7}$/.test(values.get('reward_amount'))||!/^\d{10,16}$/.test(values.get('timestamp'))||!/^[-A-Za-z0-9_]{1,160}$/.test(values.get('transaction_id'))||values.get('ad_unit').length>200||values.get('reward_item').length>200)throw invalid();
  const timestamp=Number(values.get('timestamp')),amount=Number(values.get('reward_amount'));
  if(!Number.isSafeInteger(timestamp)||timestamp<946684800000||timestamp>this.now()+300000||amount<1||amount>1000000)throw invalid();
  let refreshed=false;
  if(this.now()-this.checkedAt>=86400000){await this.refresh();refreshed=true;}
  if(!this.keys.has(keyId)&&!refreshed&&this.now()-this.checkedAt>=1000)await this.refresh();
  const key=this.keys.get(keyId);if(!key)throw unavailable();
  const signed=parts.slice(0,-2).join('&');let valid=false;try{valid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key.key,signature,new TextEncoder().encode(signed));}catch{}
  if(!valid)throw invalid();
  return {offerId:values.get('custom_data'),userHint:values.get('user_id'),unit:values.get('ad_unit'),amount,item:values.get('reward_item'),earnedAt:new Date(timestamp).toISOString(),transaction:values.get('transaction_id'),network:values.get('ad_network'),proof:{signedQuery:signed,signature:values.get('signature'),keyId,publicKey:key.spki,verifiedAt:new Date(this.now()).toISOString()}};
 }
}
