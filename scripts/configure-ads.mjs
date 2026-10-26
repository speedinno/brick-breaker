import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateAdProfile,profileFiles} from './ad-profile.mjs';
const args=process.argv.slice(2),disable=args.length===1&&args[0]==='--disable';
if(!disable&&!(args.length===2&&args[0]==='--file'))throw Error('Usage: npm run configure:ads -- --file .env.ads.json | --disable');
// Only a public, explicitly scoped profile is accepted. No environment file is
// sourced as executable code, and input values are never echoed to logs.
const profile=disable?null:validateAdProfile(JSON.parse(await readFile(resolve(args[1]),'utf8')));
const paths={capacitor:'capacitor.config.json',manifest:'android/app/src/main/AndroidManifest.xml',plist:'ios/App/App/Info.plist',runtime:'dist/ad-runtime.js'};
const files=profileFiles({capacitor:JSON.parse(await readFile(paths.capacitor,'utf8')),manifest:await readFile(paths.manifest,'utf8'),plist:await readFile(paths.plist,'utf8')},profile);
// Configure identifiers before enabling plugin registration. A fresh native
// sync is still required; the Android pre-build guard rejects missing App IDs.
for(const key of ['manifest','plist','runtime','capacitor'])await writeFile(paths[key],files[key]);
console.log(disable?'Ads disabled. Run npm run mobile:sync before the next native build.':'Public ad profile prepared. Run npm run mobile:sync, then validate the actual native build and provider sandbox.');
