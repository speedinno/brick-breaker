import {readFile,stat} from 'node:fs/promises';import {resolve,dirname} from 'node:path';import {createHash} from 'node:crypto';import {contributionReport} from './contribution-model.mjs';
async function main(){
 if(process.argv.length!==4||process.argv[2]!=='--input')throw Error('Usage: --input <private reviewed contribution JSON>.');
 const path=resolve(process.argv[3]);if((await stat(path)).size>5*1024*1024)throw Error('Contribution input is too large.');const input=JSON.parse(await readFile(path,'utf8'));
 if(!Array.isArray(input.evidence)||input.evidence.length>100)throw Error('Contribution evidence is invalid.');const evidence=[];
 for(const item of input.evidence){
  if(!item||typeof item.path!=='string'||Object.keys(item).some(key=>!['id','kind','path','sha256'].includes(key))||typeof item.sha256!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('Contribution evidence needs an explicit file and expected SHA-256.');
  const file=resolve(dirname(path),item.path),size=(await stat(file)).size;if(size<1||size>20*1024*1024)throw Error('Contribution evidence has an invalid size.');
  const bytes=await readFile(file);if(bytes.length!==size||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Contribution evidence changed. Review the actual source again.');evidence.push({id:item.id,kind:item.kind,sha256:item.sha256,bytes:size});
 }
 const result=contributionReport({...input,evidence});if(result.asOf>new Date().toISOString().slice(0,10))throw Error('Contribution as-of date cannot be in the future.');console.log(JSON.stringify(result,null,2));
}
try{await main();}catch(error){console.error(error instanceof Error&&/^(Usage:|Contribution |Invalid reviewed)/.test(error.message)?error.message:'Contribution reporting failed. Check the private input and evidence files; no missing value is assumed zero.');process.exitCode=1;}
