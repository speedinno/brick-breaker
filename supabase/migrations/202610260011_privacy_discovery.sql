-- Idempotent observations from a verified provider customer page. Replaying a
-- durable page after a lost acknowledgment must not keep invalidating workers.
begin;
create or replace function public.game_privacy_requeue_deleted(p_user uuid,p_project text,p_environment text) returns boolean language plpgsql security definer set search_path='' as $$
declare hashed text:=public.game_privacy_subject(p_user); processor public.game_privacy_processors;
begin
 if p_user is null or p_project is null or p_project !~ '^[A-Za-z0-9_-]{1,120}$' or p_environment is null or p_environment not in ('production','sandbox') then raise exception 'Invalid privacy processor';end if;
 if exists(select 1 from auth.users where id=p_user) or not exists(select 1 from public.game_privacy_deleted where subject_hash=hashed) then return false;end if;
 insert into public.game_privacy_processors(provider,scope,environment) values('revenuecat',p_project,p_environment) on conflict(provider,scope) do nothing;
 select * into processor from public.game_privacy_processors where provider='revenuecat' and scope=p_project;if processor.environment<>p_environment then raise exception 'Privacy environment mismatch';end if;
 insert into public.game_privacy_jobs(processor_id,subject_hash,subject,state,next_attempt_at)
 values(processor.id,hashed,p_user::text,'pending',now()+interval '2 minutes')
 on conflict(processor_id,subject_hash) do update set subject=excluded.subject,
 state=case when public.game_privacy_jobs.state='manual_review' or public.game_privacy_jobs.outcome='manual_retained' then 'manual_review' else 'pending' end,
 generation=public.game_privacy_jobs.generation+case when public.game_privacy_jobs.state in ('working','done') or public.game_privacy_jobs.absent_since is not null then 1 else 0 end,
 next_attempt_at=excluded.next_attempt_at,lease_token=null,lease_until=null,absent_since=null,finished_at=null,
 outcome=case when public.game_privacy_jobs.outcome='manual_retained' then 'manual_retained' else null end,last_code='late_provider_observation';
 return true;
end $$;
create or replace function public.game_retry_privacy_job(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.game_privacy_jobs j set state='pending',generation=generation+1,next_attempt_at=now(),lease_token=null,lease_until=null,absent_since=null,outcome=null,last_code='operator_retry'
 from public.game_privacy_processors p where j.id=p_id and j.processor_id=p.id and p.provider='revenuecat' and j.state='manual_review' and j.subject is not null;return found;
end $$;
create table public.game_privacy_observations(
 id uuid primary key,processor_id uuid not null references public.game_privacy_processors(id),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),matched_count integer not null check(matched_count between 0 and 20),
 observed_at timestamptz not null default now()
);
alter table public.game_privacy_observations enable row level security;
revoke all on public.game_privacy_observations from public,anon,authenticated;
grant all on public.game_privacy_observations to service_role;
create function public.game_discover_privacy_customers(p_id uuid,p_project text,p_environment text,p_customers uuid[]) returns integer language plpgsql security definer set search_path='' as $$
declare processor public.game_privacy_processors; observation public.game_privacy_observations; fingerprint text; customer uuid; matched integer:=0;
begin
 if p_id is null or p_project is null or p_project !~ '^[A-Za-z0-9_-]{1,120}$' or p_environment is null or p_environment not in ('production','sandbox') or p_customers is null or cardinality(p_customers)>20 or array_position(p_customers,null) is not null or cardinality(p_customers)<>(select count(distinct x) from unnest(p_customers) x) then raise exception 'Invalid privacy discovery';end if;
 select coalesce(array_agg(x order by x),'{}'::uuid[]) into p_customers from unnest(p_customers) x;
 fingerprint:=encode(sha256(convert_to(p_customers::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('privacy-discovery:'||p_id::text,0));
 insert into public.game_privacy_processors(provider,scope,environment) values('revenuecat',p_project,p_environment) on conflict(provider,scope) do nothing;
 select * into processor from public.game_privacy_processors where provider='revenuecat' and scope=p_project;
 if processor.environment<>p_environment then raise exception 'Privacy environment mismatch';end if;
 select * into observation from public.game_privacy_observations where id=p_id;
 if found then
  if observation.processor_id<>processor.id or observation.payload_hash<>fingerprint then raise exception 'Privacy observation identity conflict';end if;
  return observation.matched_count;
 end if;
 foreach customer in array p_customers loop
  if public.game_privacy_requeue_deleted(customer,p_project,p_environment) then matched:=matched+1;end if;
 end loop;
 insert into public.game_privacy_observations(id,processor_id,payload_hash,matched_count) values(p_id,processor.id,fingerprint,matched);
 return matched;
end $$;
revoke all on function public.game_discover_privacy_customers(uuid,text,text,uuid[]) from public,anon,authenticated;
grant execute on function public.game_discover_privacy_customers(uuid,text,text,uuid[]) to service_role;
commit;
