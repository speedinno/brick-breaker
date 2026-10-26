import {pathToFileURL} from 'node:url';
import {privateSettings} from './private-settings.mjs';
import {baselineVersions,loadMigrations,schemaQuery,baselineObservationQuery,baselineAdoptionStatement,fingerprint,migrationPlan,migrationStatement,managementDatabase} from './database-migrations.mjs';

export async function expectedBaseline(files){
 // This runs the actual original source in a disposable local PostgreSQL.
 // No second, hand-maintained copy of the baseline contract can drift.
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
  await db.exec("create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;alter default privileges in schema public grant execute on functions to service_role;create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;");
  for(const version of baselineVersions){const file=files.find(row=>row.version===version);if(!file)throw Error('Original baseline source missing.');await db.exec(file.source);}
  return (await db.query(schemaQuery)).rows[0].schema;
 }finally{await db.close();}
}
export async function migrateDatabase({query,files,apply=false,adoptBaseline=false,onProgress=()=>{}}){
 const metadata=(await query("select to_regclass('public.game_schema_revisions') is not null as has_history"))[0];
 if(typeof metadata?.has_history!=='boolean')throw Error('Invalid migration metadata response.');
 const history=metadata.has_history?await query('select version,checksum,adopted from public.game_schema_revisions order by version'):[];
 const plan=migrationPlan(files,history);let adopt=false,baselineFingerprint=null,digest=null;
 if(!history.length){
  const observation=(await query(baselineObservationQuery))[0],schema=observation?.schema;
  if(!schema||!Array.isArray(schema.tables)||!Array.isArray(schema.functions))throw Error('Invalid database schema response.');
  if(schema.tables.length||schema.functions.length){
   if(fingerprint(schema)!==fingerprint(await expectedBaseline(files)))throw Error('Untracked database differs from the original baseline. No migrations were applied.');
   adopt=true;baselineFingerprint=fingerprint(schema);digest=observation.digest;
   if(apply&&!adoptBaseline)throw Error('The original schema is present. Use --adopt-existing-baseline to record it without rerunning it.');
  }
 }
 const applied=[];let predecessor=null;
 if(adopt&&apply){
  // Both manually-installed files are recorded together. A lost ACK can
  // never leave one adopted file followed by an unrecorded baseline DDL.
  await query(baselineAdoptionStatement(files,{digest,baselineFingerprint}),{readOnly:false});
  const receipt=await query('select version,checksum,adopted from public.game_schema_revisions order by version');
  migrationPlan(files,receipt);
  if(!baselineVersions.every(version=>receipt.some(row=>row.version===version&&row.adopted)))throw Error('Baseline adoption receipt could not be verified.');
  for(const file of plan)if(baselineVersions.includes(file.version)){file.applied=true;applied.push(file.version);onProgress({version:file.version,state:'baseline-recorded'});}
 }
 for(const file of plan){
  if(!file.applied&&apply){
   await query(migrationStatement(file,{predecessor}),{readOnly:false});
   // A 2xx response alone is not a completion receipt.
   const receipt=await query(`select version,checksum,adopted from public.game_schema_revisions where version='${file.version}'`);
   if(receipt.length!==1||receipt[0].checksum!==file.checksum||receipt[0].adopted!==false)throw Error('Migration receipt could not be verified. Stop and inspect history.');
   file.applied=true;applied.push(file.version);onProgress({version:file.version,state:'applied'});
  }
  predecessor=file.version;
 }
 return {mode:apply?'apply':'plan',baselineRecognized:adopt,applied,files:plan.map(file=>({name:file.name,version:file.version,checksum:file.checksum,state:file.applied?'installed':adopt&&baselineVersions.includes(file.version)?'adopt-baseline':'pending'}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2);if(args.some(arg=>!['--apply','--adopt-existing-baseline'].includes(arg)))throw Error('Use [--apply] [--adopt-existing-baseline]. Default is a read-only plan.');
  const result=await migrateDatabase({query:managementDatabase(await privateSettings()),files:await loadMigrations(),apply:args.includes('--apply'),adoptBaseline:args.includes('--adopt-existing-baseline'),onProgress:row=>console.log(JSON.stringify(row))});
  console.log(JSON.stringify(result,null,2));
 }catch(error){console.error(['A Supabase project URL is required.','Supabase management configuration is incomplete.'].includes(error.message)?error.message:'Database migration stopped. '+(error.message.startsWith('Database request')||error.message.startsWith('Untracked database')||error.message.startsWith('The original schema')||error.message.startsWith('Use [')?error.message:'Inspect private schema/history and repository checksums; raw SQL and credentials were withheld.'));process.exitCode=1;}
}
