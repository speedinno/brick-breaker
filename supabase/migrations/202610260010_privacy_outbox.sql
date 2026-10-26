-- Provider erasure is durable even if the account-deletion HTTP response is
-- lost. Jobs are inserted in the auth deletion transaction, before cascades.
begin;
create function public.game_privacy_subject(p_user uuid) returns text language sql immutable strict set search_path='' as $$select encode(sha256(convert_to('brick-breaker-retired-account-v1:'||p_user::text,'UTF8')),'hex')$$;
create table public.game_privacy_deleted (
 subject_hash text primary key check(subject_hash ~ '^[a-f0-9]{64}$'),deleted_at timestamptz not null default now()
);
create table public.game_privacy_processors (
 id uuid primary key default gen_random_uuid(),provider text not null check(provider in ('revenuecat','mail_delivery')),
 scope text not null check(length(scope) between 1 and 120),environment text not null check(environment in ('production','sandbox','database')),
 created_at timestamptz not null default now(),unique(provider,scope)
);
insert into public.game_privacy_processors(provider,scope,environment) values('mail_delivery','configured-auth-smtp','database');
create function public.game_keep_privacy_processor() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Privacy processor identities are immutable';end $$;
create trigger keep_privacy_processor before update or delete on public.game_privacy_processors for each row execute function public.game_keep_privacy_processor();
create table public.game_privacy_accounts (
 user_id uuid not null references auth.users(id) on delete cascade,
 processor_id uuid not null references public.game_privacy_processors(id),primary key(user_id,processor_id)
);
create table public.game_deletion_requests (
 id uuid primary key,user_id uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),deleted_at timestamptz
);
create index game_pending_deletion_requests on public.game_deletion_requests(user_id) where user_id is not null;
create table public.game_privacy_jobs (
 id uuid primary key default gen_random_uuid(),processor_id uuid not null references public.game_privacy_processors(id),
 subject_hash text not null references public.game_privacy_deleted(subject_hash),subject text check(subject is null or length(subject) between 1 and 320),
 state text not null check(state in ('pending','working','verifying','manual_review','done')),
 generation bigint not null default 1,attempts integer not null default 0,next_attempt_at timestamptz not null default now(),
 lease_token uuid,lease_until timestamptz,absent_since timestamptz,last_code text,
 outcome text check(outcome in ('provider_absent','manual_erased','manual_retained')),resolution_reference text,
 created_at timestamptz not null default now(),finished_at timestamptz,
 unique(processor_id,subject_hash),check(state<>'done' or subject is null)
);
create index game_privacy_due on public.game_privacy_jobs(next_attempt_at,id) where state in ('pending','working','verifying');
create function public.game_privacy_note_account(p_user uuid,p_project text,p_environment text) returns void language plpgsql security definer set search_path='' as $$
declare processor public.game_privacy_processors;
begin
 if p_user is null or p_project is null or p_project !~ '^[A-Za-z0-9_-]{1,120}$' or p_environment is null or p_environment not in ('production','sandbox') then raise exception 'Invalid privacy processor';end if;
 perform 1 from auth.users where id=p_user for key share;if not found then raise exception 'Account unavailable';end if;
 insert into public.game_privacy_processors(provider,scope,environment) values('revenuecat',p_project,p_environment) on conflict(provider,scope) do nothing;
 select * into processor from public.game_privacy_processors where provider='revenuecat' and scope=p_project;
 if processor.environment<>p_environment then raise exception 'Use a separate RevenueCat project for each environment';end if;
 insert into public.game_privacy_accounts(user_id,processor_id) values(p_user,processor.id) on conflict do nothing;
end $$;
create function public.game_prepare_account_deletion(p_user uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.game_deletion_requests;
begin
 if p_user is null or p_request is null then raise exception 'Invalid deletion request';end if;
 perform 1 from auth.users where id=p_user for update;if not found then raise exception 'Account unavailable';end if;
 select * into existing from public.game_deletion_requests where id=p_request;
 if found then
  if existing.user_id=p_user then return jsonb_build_object('requestId',p_request);end if;
  raise exception 'Deletion request identity conflict';
 end if;
 -- Keep each device's receipt. Replacing it with another device's canonical
 -- nonce would strand the first device if that prepare response was lost.
 insert into public.game_deletion_requests(id,user_id) values(p_request,p_user);return jsonb_build_object('requestId',p_request);
end $$;
create function public.game_queue_account_privacy() returns trigger language plpgsql security definer set search_path='' as $$
declare hashed text:=public.game_privacy_subject(old.id); email text:=to_jsonb(old)->>'email';
begin
 insert into public.game_privacy_deleted(subject_hash) values(hashed) on conflict do nothing;
 insert into public.game_privacy_jobs(processor_id,subject_hash,subject,state,next_attempt_at)
 select processor_id,hashed,old.id::text,'pending',now()+interval '2 minutes' from public.game_privacy_accounts where user_id=old.id on conflict do nothing;
 if email is not null and length(email) between 1 and 320 then
  insert into public.game_privacy_jobs(processor_id,subject_hash,subject,state,last_code)
  select id,hashed,email,'manual_review','delivery_retention_review' from public.game_privacy_processors where provider='mail_delivery' on conflict do nothing;
 end if;
 update public.game_deletion_requests set deleted_at=now(),user_id=null where user_id=old.id;
 return old;
end $$;
create trigger queue_account_privacy before delete on auth.users for each row execute function public.game_queue_account_privacy();
create function public.game_privacy_requeue_deleted(p_user uuid,p_project text,p_environment text) returns boolean language plpgsql security definer set search_path='' as $$
declare hashed text:=public.game_privacy_subject(p_user); processor public.game_privacy_processors;
begin
 if p_user is null or p_project is null or p_project !~ '^[A-Za-z0-9_-]{1,120}$' or p_environment is null or p_environment not in ('production','sandbox') then raise exception 'Invalid privacy processor';end if;
 if exists(select 1 from auth.users where id=p_user) or not exists(select 1 from public.game_privacy_deleted where subject_hash=hashed) then return false;end if;
 insert into public.game_privacy_processors(provider,scope,environment) values('revenuecat',p_project,p_environment) on conflict(provider,scope) do nothing;
 select * into processor from public.game_privacy_processors where provider='revenuecat' and scope=p_project;if processor.environment<>p_environment then raise exception 'Privacy environment mismatch';end if;
 insert into public.game_privacy_jobs(processor_id,subject_hash,subject,state,next_attempt_at)
 values(processor.id,hashed,p_user::text,'pending',now()+interval '2 minutes')
 on conflict(processor_id,subject_hash) do update set subject=excluded.subject,state=case when public.game_privacy_jobs.state='manual_review' then 'manual_review' else 'pending' end,
 generation=public.game_privacy_jobs.generation+case when public.game_privacy_jobs.state in ('working','done') or public.game_privacy_jobs.absent_since is not null then 1 else 0 end,
 next_attempt_at=excluded.next_attempt_at,lease_token=null,lease_until=null,absent_since=null,finished_at=null,outcome=null,last_code='late_provider_observation';
 return true;
end $$;
create function public.game_claim_privacy_jobs(p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.game_privacy_jobs; result jsonb:='[]';processor public.game_privacy_processors;
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid privacy batch';end if;
 for job in select * from public.game_privacy_jobs where subject is not null and next_attempt_at<=now() and (state in ('pending','verifying') or state='working' and lease_until<now()) order by next_attempt_at,id for update skip locked limit p_limit loop
  select * into processor from public.game_privacy_processors where id=job.processor_id;
  if processor.provider<>'revenuecat' then update public.game_privacy_jobs set state='manual_review',last_code='unsupported_processor' where id=job.id;continue;end if;
  if exists(select 1 from auth.users where id=job.subject::uuid) then update public.game_privacy_jobs set state='manual_review',last_code='identity_active' where id=job.id;continue;end if;
  update public.game_privacy_jobs set state='working',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id=job.id returning * into job;
  result:=result||jsonb_build_array(jsonb_build_object('id',job.id,'generation',job.generation,'leaseToken',job.lease_token,'subject',job.subject,'provider',processor.provider,'scope',processor.scope,'environment',processor.environment));
 end loop;
 return result;
end $$;
create function public.game_finish_privacy_job(p_id uuid,p_generation bigint,p_lease uuid,p_result text) returns boolean language plpgsql security definer set search_path='' as $$
declare job public.game_privacy_jobs;
begin
 select * into job from public.game_privacy_jobs where id=p_id and generation=p_generation and lease_token=p_lease and state='working' and lease_until>now() for update;if not found then return false;end if;
 if p_result is null or p_result not in ('absent','queued','rate_limited','network','upstream_error','permission_denied','config_missing','invalid_response') then raise exception 'Invalid privacy result';end if;
 if p_result='absent' and job.absent_since is not null and job.absent_since<=now()-interval '24 hours' then
  update public.game_privacy_jobs set state='done',subject=null,finished_at=now(),outcome='provider_absent',last_code='absence_confirmed',lease_token=null,lease_until=null where id=p_id;
 elsif p_result in ('permission_denied','config_missing','invalid_response') then
  update public.game_privacy_jobs set state='manual_review',last_code=p_result,lease_token=null,lease_until=null where id=p_id;
 else
  update public.game_privacy_jobs set state=case when p_result in ('absent','queued') then 'verifying' else 'pending' end,
  absent_since=case when p_result='absent' then coalesce(absent_since,now()) when p_result='queued' then null else absent_since end,
  next_attempt_at=now()+case when p_result='absent' then interval '24 hours' when p_result='queued' then interval '1 minute' else least(3600,60*power(2,least(job.attempts-1,6)))::integer*interval '1 second' end,
  last_code=p_result,lease_token=null,lease_until=null where id=p_id;
 end if;
 return true;
end $$;
create function public.game_retry_privacy_job(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.game_privacy_jobs j set state='pending',generation=generation+1,next_attempt_at=now(),lease_token=null,lease_until=null,absent_since=null,last_code='operator_retry'
 from public.game_privacy_processors p where j.id=p_id and j.processor_id=p.id and p.provider='revenuecat' and j.state='manual_review' and j.subject is not null;return found;
end $$;
create function public.game_resolve_manual_privacy(p_id uuid,p_outcome text,p_reference text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_outcome is null or p_outcome not in ('manual_erased','manual_retained') or p_reference is null or p_reference !~ '^[A-Za-z0-9._:/# -]{3,160}$' then raise exception 'A minimal non-contact resolution reference is required';end if;
 update public.game_privacy_jobs set state='done',generation=generation+1,subject=null,outcome=p_outcome,resolution_reference=p_reference,finished_at=now(),lease_token=null,lease_until=null,last_code='operator_resolved' where id=p_id and state='manual_review';return found;
end $$;
alter table public.game_privacy_deleted enable row level security;alter table public.game_privacy_processors enable row level security;alter table public.game_privacy_accounts enable row level security;alter table public.game_deletion_requests enable row level security;alter table public.game_privacy_jobs enable row level security;
revoke all on public.game_privacy_deleted,public.game_privacy_processors,public.game_privacy_accounts,public.game_deletion_requests,public.game_privacy_jobs from public,anon,authenticated;
grant all on public.game_privacy_deleted,public.game_privacy_processors,public.game_privacy_accounts,public.game_deletion_requests,public.game_privacy_jobs to service_role;
revoke all on function public.game_privacy_subject(uuid),public.game_keep_privacy_processor(),public.game_privacy_note_account(uuid,text,text),public.game_prepare_account_deletion(uuid,uuid),public.game_queue_account_privacy(),public.game_privacy_requeue_deleted(uuid,text,text),public.game_claim_privacy_jobs(integer),public.game_finish_privacy_job(uuid,bigint,uuid,text),public.game_retry_privacy_job(uuid),public.game_resolve_manual_privacy(uuid,text,text) from public,anon,authenticated;
grant execute on function public.game_privacy_note_account(uuid,text,text),public.game_prepare_account_deletion(uuid,uuid),public.game_privacy_requeue_deleted(uuid,text,text),public.game_claim_privacy_jobs(integer),public.game_finish_privacy_job(uuid,bigint,uuid,text),public.game_retry_privacy_job(uuid),public.game_resolve_manual_privacy(uuid,text,text) to service_role;
commit;
