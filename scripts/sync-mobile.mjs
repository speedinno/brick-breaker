import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
await import('./build-web.mjs');
const args=process.argv.slice(2);
if(args.length>1||args.some(value=>!['android','ios'].includes(value)))throw Error('Usage: npm run mobile:sync -- [android|ios]');
const result=spawnSync(process.execPath,['node_modules/@capacitor/cli/bin/capacitor','sync',...args],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
if(!args.length||args.includes('ios')){
 const path='ios/App/CapApp-SPM/Package.swift',source=await readFile(path,'utf8');
 // Capacitor on Windows writes backslashes into Swift string literals. Swift
 // package paths must remain portable when this checkout reaches a Mac.
 const normalized=source.replace(/path: "([^"\r\n]+)"/g,(_,value)=>'path: "'+value.replaceAll('\\','/')+'"');
 if(source!==normalized)await writeFile(path,normalized);
}
