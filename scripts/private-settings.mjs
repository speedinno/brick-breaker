import {readFile} from 'node:fs/promises';
// Server/operator scripts only. The returned reader never prints the file or
// exposes a bag of all credentials to a caller's accidental JSON logging.
export async function privateSettings(path='.env.api',environment=process.env){
 const values={};try{for(const line of(await readFile(path,'utf8')).split(/\r?\n/)){const match=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(!match)continue;let value=match[2];if(value.length>=2&&['"',"'"].includes(value[0])&&value.at(-1)===value[0])value=value.slice(1,-1);values[match[1]]=value;}}catch(error){if(error.code!=='ENOENT')throw Error('The ignored server configuration could not be read.');}
 return name=>environment[name]??values[name];
}
