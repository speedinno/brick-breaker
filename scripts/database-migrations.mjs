import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';

export const baselineVersions=['202610210001','202610210002'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const literal=value=>"'"+value.replaceAll("'","''")+"'";
const dollar=value=>{let tag='$game_migration$';while(value.includes(tag))tag=tag.slice(0,-1)+'x$';return tag+value+tag;};
// Only repository migrations with an explicit outer transaction are accepted.
// A single DO statement makes both DDL and its checksum atomic, even when the
// HTTP caller loses the successful response and retries the same file.
export function migrationBody(source){
 const text=source.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
 const match=text.match(/^(?:\s|--[^\n]*\n)*begin\s*;([\s\S]*?)commit\s*;\s*$/i);
 if(!match)throw Error('Migration needs one explicit outer transaction.');
 // Files are trusted repository source; this also catches accidental nested
 // top-level transaction commands before any remote mutation.
 if(/^\s*(begin|commit|rollback|start\s+transaction)\s*;/im.test(match[1]))throw Error('Nested migration transaction is unsupported.');
 return match[1];
}
export async function loadMigrations(root=new URL('../supabase/migrations/',import.meta.url)){
 const names=(await readdir(root)).filter(name=>/^\d{12}_[a-z0-9_]+\.sql$/.test(name)).sort();
 const result=[];
 for(const name of names){const source=(await readFile(new URL(name,root),'utf8')).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');const version=name.slice(0,12);if(result.some(row=>row.version===version))throw Error('Duplicate migration version.');result.push({name,version,checksum:hash(source),body:migrationBody(source),source});}
 if(!result.length)throw Error('No repository migrations were found.');
 return result;
}
export const schemaQuery=`select jsonb_build_object(
 'tables',coalesce((select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,
  'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
  'constraints',(select jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid)) order by k.conname) from pg_constraint k where k.conrelid=c.oid and k.contype<>'n'),
  'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by pg_get_indexdef(i.indexrelid)) from pg_index i where i.indrelid=c.oid),
  'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),
  'policies',(select jsonb_agg(jsonb_build_array(p.policyname,p.permissive,p.roles,p.cmd,p.qual,p.with_check) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname),
  'access',(select jsonb_agg(jsonb_build_array(r,has_table_privilege(r,c.oid,'SELECT'),has_table_privilege(r,c.oid,'INSERT'),has_table_privilege(r,c.oid,'UPDATE'),has_table_privilege(r,c.oid,'DELETE')) order by r) from unnest(array['anon','authenticated','service_role'])r)
 ) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relname like 'game\\_%' escape '\\'),'[]'::jsonb),
 'functions',coalesce((select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),'source',p.prosrc,'language',(select lanname from pg_language where oid=p.prolang),'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile,'strict',p.proisstrict,
  'access',(select jsonb_agg(jsonb_build_array(r,has_function_privilege(r,p.oid,'EXECUTE')) order by r) from unnest(array['anon','authenticated','service_role'])r)
 ) order by p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'game\\_%' escape '\\'),'[]'::jsonb)
) as schema`;
export function fingerprint(value){
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):typeof value==='string'?value.replace(/\r\n/g,'\n'):value;
 return hash(JSON.stringify(canonical(value)));
}
export function migrationPlan(files,history){
 const known=new Map(files.map(row=>[row.version,row]));const seen=new Set();let pending=false;
 for(const row of history){if(!known.has(row.version)||seen.has(row.version)||known.get(row.version).checksum!==row.checksum)throw Error('Database migration history differs from repository checksums.');if(row.adopted&&!baselineVersions.includes(row.version))throw Error('Only the original baseline can be adopted.');seen.add(row.version);}
 if(history.some(row=>row.adopted)&&!baselineVersions.every(version=>history.some(row=>row.version===version&&row.adopted)))throw Error('Incomplete baseline adoption history.');
 return files.map(file=>{const applied=seen.has(file.version);if(pending&&applied)throw Error('Database migration history is not a contiguous prefix.');if(!applied)pending=true;return{...file,applied};});
}
const journalDDL=`create table if not exists public.game_schema_revisions(
 version text primary key check(version ~ '^[0-9]{12}$'),checksum text not null check(checksum ~ '^[a-f0-9]{64}$'),
 adopted boolean not null default false,baseline_fingerprint text check(baseline_fingerprint ~ '^[a-f0-9]{64}$'),applied_at timestamptz not null default now(),
 check((adopted and baseline_fingerprint is not null) or (not adopted and baseline_fingerprint is null)));
 alter table public.game_schema_revisions enable row level security;
 revoke all on public.game_schema_revisions from public,anon,authenticated,service_role;`;
export function migrationStatement(file,{predecessor=null}={}){
 if(!/^\d{12}$/.test(file.version)||!/^\w{64}$/.test(file.checksum)||!/^[a-f0-9]{64}$/.test(file.checksum))throw Error('Invalid migration identity.');
 if(predecessor&&!/^\d{12}$/.test(predecessor))throw Error('Invalid migration predecessor.');
 const body=`declare old_checksum text; begin
 perform set_config('lock_timeout','5s',true);
 perform pg_advisory_xact_lock(732014,270015);
 ${journalDDL}
 select checksum into old_checksum from public.game_schema_revisions where version=${literal(file.version)};
 if found then
  if old_checksum<>${literal(file.checksum)} then raise exception 'Migration checksum conflict'; end if;
 else
  ${predecessor?`if not exists(select 1 from public.game_schema_revisions where version=${literal(predecessor)}) then raise exception 'Migration predecessor missing'; end if;`:''}
  execute ${dollar(file.body)};
  insert into public.game_schema_revisions(version,checksum) values(${literal(file.version)},${literal(file.checksum)});
 end if;
 end`;
 return 'do '+dollar(body)+';';
}
export const baselineObservationQuery=`select schema,md5(schema::text) as digest from (${schemaQuery}) observed`;
export function baselineAdoptionStatement(files,{digest,baselineFingerprint}){
 if(!/^[a-f0-9]{32}$/.test(digest||'')||!/^[a-f0-9]{64}$/.test(baselineFingerprint||''))throw Error('Invalid baseline adoption proof.');
 const rows=baselineVersions.map(version=>{const file=files.find(row=>row.version===version);if(!file||!/^[a-f0-9]{64}$/.test(file.checksum))throw Error('Original baseline source missing.');return`(${literal(version)},${literal(file.checksum)},true,${literal(baselineFingerprint)})`;});
 return 'do '+dollar(`begin
 perform set_config('lock_timeout','5s',true);
 perform pg_advisory_xact_lock(732014,270015);
 if to_regclass('public.game_schema_revisions') is not null then raise exception 'Migration history changed before adoption; inspect and replan'; end if;
 if (select observed.digest from (${baselineObservationQuery}) observed)<>${literal(digest)} then raise exception 'Baseline changed before adoption'; end if;
 ${journalDDL}
 insert into public.game_schema_revisions(version,checksum,adopted,baseline_fingerprint) values ${rows.join(',')};
 end`)+';';
}
export function managementDatabase(settings,{request=fetch}={}){
 let url;try{url=new URL(settings('SUPABASE_URL'));}catch{throw Error('A Supabase project URL is required.');}
 const project=url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1],token=settings('SUPABASE_ACCESS_TOKEN');
 if(!project||url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||!token)throw Error('Supabase management configuration is incomplete.');
 return async(query,{readOnly=true}={})=>{
  let response;try{response=await request(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:readOnly}),signal:AbortSignal.timeout(60000)});}catch{throw Error('Database request did not return; inspect migration history before retrying.');}
  if(!response.ok)throw Error(`Database request failed (HTTP ${response.status}); private diagnostics withheld.`);
  let result;try{result=await response.json();}catch{throw Error('Database returned invalid JSON; inspect migration history before retrying.');}
  if(!Array.isArray(result))throw Error('Unexpected database response; inspect migration history before retrying.');return result;
 };
}
