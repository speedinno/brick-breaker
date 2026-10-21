import {readFile,readdir,writeFile} from 'node:fs/promises';
export async function generateNotices(){
  const root=JSON.parse(await readFile('package.json','utf8')),seen=new Set(),sections=[];
  async function collect(name){
    if(seen.has(name))return;seen.add(name);const dir='node_modules/'+name;
    const pkg=JSON.parse(await readFile(dir+'/package.json','utf8'));
    const names=(await readdir(dir)).filter(n=>/^(licen[cs]e|copying|copyright|notice)(\.|$)/i.test(n)).sort();
    if(!names.length)throw Error('Missing dependency license: '+name);
    const texts=await Promise.all(names.map(async n=>n+'\n'+await readFile(dir+'/'+n,'utf8')));
    sections.push(`${name}@${pkg.version}\n${'='.repeat(60)}\n${texts.join('\n\n')}`);
    for(const dep of Object.keys(pkg.dependencies||{}).sort())await collect(dep);
  }
  for(const name of Object.keys(root.dependencies).sort())await collect(name);
  sections.push('AndroidX native dependencies\nCopyright The Android Open Source Project.\nLicensed under Apache License 2.0.\nhttps://android.googlesource.com/platform/frameworks/support/\n\n'+await readFile('licenses/Apache-2.0.txt','utf8'));
  await writeFile('dist/THIRD-PARTY-NOTICES.txt','Brick Breaker — bundled third-party notices\n\n'+sections.join('\n\n'+'-'.repeat(72)+'\n\n')+'\n');
}
