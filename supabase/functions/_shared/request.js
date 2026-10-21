export class RequestError extends Error {
  constructor(message,status){super(message);this.status=status;}
}
// Enforce the byte budget while reading, before buffering/parsing attacker input.
export async function readLimitedJson(request,maxBytes=32768){
  const length=request.headers.get('Content-Length');
  if(length&&Number(length)>maxBytes)throw new RequestError('Request is too large',413);
  if(!request.body)throw new RequestError('Invalid JSON',400);
  const reader=request.body.getReader(),chunks=[];let total=0;
  try{
    for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel().catch(()=>{});throw new RequestError('Request is too large',413);}chunks.push(value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body;}catch{throw new RequestError('Invalid JSON object',400);}
}
