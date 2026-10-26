import {readFile,readdir} from 'node:fs/promises';
export async function migrateGame(db){
 const root=new URL('../supabase/migrations/',import.meta.url);
 for(const name of (await readdir(root)).filter(name=>/^\d+_.+\.sql$/.test(name)).sort())await db.exec(await readFile(new URL(name,root),'utf8'));
}
