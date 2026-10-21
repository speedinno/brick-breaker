import test from 'node:test';import assert from 'node:assert/strict';
import {readLimitedJson} from '../supabase/functions/_shared/request.js';
const request=(bytes,headers={})=>new Request('https://example.test',{method:'POST',body:bytes,headers,duplex:'half'});
test('backend bounds declared and streamed body bytes before JSON parsing',async()=>{
 assert.deepEqual(await readLimitedJson(request('{"action":"state"}')),{action:'state'});
 await assert.rejects(()=>readLimitedJson(request('{}',{'Content-Length':'999999'})),e=>e.status===413);
 let cancelled=false;const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(20000));},cancel(){cancelled=true;}});
 await assert.rejects(()=>readLimitedJson(request(stream)),e=>e.status===413);assert(cancelled);
 await assert.rejects(()=>readLimitedJson(request(JSON.stringify({x:'☀'.repeat(11000)}))),e=>e.status===413);
});
test('backend rejects malformed UTF-8, scalar, null and array bodies',async()=>{
 for(const body of ['null','1','[]','{bad',new Uint8Array([0xff])])await assert.rejects(()=>readLimitedJson(request(body)),e=>e.status===400);
});
