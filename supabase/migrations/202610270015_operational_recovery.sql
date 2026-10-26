-- Private durable worker cursors survive ephemeral scheduled containers.
-- A lease generation fences old workers; no caller can use this as currency.
begin;
create table public.game_operation_jobs (
 job_key text primary key check(job_key ~ '^[a-z0-9_-]{1,100}$'),
 kind text not null check(kind in ('ad_reconcile','privacy_cleanup','privacy_discovery','web_disputes','metrics_prune')),
 identity jsonb not null,journal jsonb,
 generation bigint not null default 0 check(generation>=0),lease_token uuid,lease_until timestamptz,
 created_at timestamptz not null default now(),started_at timestamptz,finished_at timestamptz,last_success_at timestamptz,
 outcome text check(outcome in ('success','partial','review','error')),
 summary jsonb not null default '{}',
 check(journal is null or jsonb_typeof(journal)='object' and octet_length(journal::text)<=1048576)
);
create function public.game_operation_claim(p_key text,p_kind text,p_identity jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.game_operation_jobs;token uuid:=gen_random_uuid();
begin
 if p_key is null or p_key !~ '^[a-z0-9_-]{1,100}$' or p_kind is null or p_kind not in ('ad_reconcile','privacy_cleanup','privacy_discovery','web_disputes','metrics_prune') or jsonb_typeof(p_identity) is distinct from 'object' or octet_length(p_identity::text)>4096 then raise exception 'Invalid operation identity';end if;
 if exists(select 1 from jsonb_each(p_identity) f where f.key not in ('provider','environment','database','projectId','scope','merchantId') or jsonb_typeof(f.value)<>'string' or length(f.value#>>'{}')>500)
 or (p_identity->>'environment') is null or p_identity->>'environment' not in ('sandbox','production') or (p_identity->>'database') is null or p_identity->>'database' !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' then raise exception 'Invalid operation identity';end if;
 if p_kind='privacy_discovery' then
  if p_identity->>'provider' is distinct from 'revenuecat' or (p_identity->>'projectId') is null or p_identity->>'projectId' !~ '^[A-Za-z0-9_-]{1,120}$' then raise exception 'Invalid operation identity';end if;
 elsif p_kind='web_disputes' then
  if p_identity->>'provider' is distinct from 'razorpay' or (p_identity->>'scope') is null or p_identity->>'scope' !~ '^[A-Za-z0-9_.:-]{1,200}$' or (p_identity->>'merchantId') is null or p_identity->>'merchantId' !~ '^[A-Za-z0-9_-]{1,120}$' then raise exception 'Invalid operation identity';end if;
 elsif p_identity->>'provider' is distinct from 'internal' then raise exception 'Invalid operation identity';end if;
 insert into public.game_operation_jobs(job_key,kind,identity) values(p_key,p_kind,p_identity) on conflict do nothing;
 select * into job from public.game_operation_jobs where job_key=p_key for update;
 if job.kind<>p_kind or job.identity<>p_identity then raise exception 'Operation identity conflict';end if;
 if job.lease_until>now() then return jsonb_build_object('busy',true);end if;
 update public.game_operation_jobs set generation=generation+1,lease_token=token,lease_until=now()+interval '5 minutes',started_at=now() where job_key=p_key returning * into job;
 return jsonb_build_object('busy',false,'key',job.job_key,'generation',job.generation::text,'token',token,'journal',job.journal);
end $$;
create function public.game_operation_put(p_key text,p_generation bigint,p_token uuid,p_journal jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(p_journal) is distinct from 'object' or octet_length(p_journal::text)>1048576 then raise exception 'Invalid operation journal';end if;
 update public.game_operation_jobs set journal=p_journal,lease_until=now()+interval '5 minutes'
 where job_key=p_key and generation=p_generation and lease_token=p_token and lease_until>now();return found;
end $$;
create function public.game_operation_finish(p_key text,p_generation bigint,p_token uuid,p_outcome text,p_summary jsonb,p_clear boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
declare job public.game_operation_jobs;
begin
 if p_outcome is null or p_outcome not in ('success','partial','review','error') or p_clear is null or jsonb_typeof(p_summary) is distinct from 'object' or octet_length(p_summary::text)>4096 then raise exception 'Invalid operation summary';end if;
 if exists(select 1 from jsonb_each(p_summary) f where f.key not in ('processed','ignored','reviews','complete','pending','next','pages','examined','matched','claimed','acknowledged','stale','queued','absent','review','retry','events','streams','assignments','days','batchLimit','received','applied','skipped','failed','halted','exhausted') or case when jsonb_typeof(f.value)='number' then f.value::text !~ '^[0-9]{1,10}$' or f.value::text::numeric>1000000000 else jsonb_typeof(f.value)<>'boolean' end) then raise exception 'Invalid operation summary';end if;
 select * into job from public.game_operation_jobs where job_key=p_key and generation=p_generation and lease_token=p_token and lease_until>now() for update;
 if not found then return false;end if;
 if p_clear and job.journal is not null and job.journal->>'complete' is distinct from 'true' then raise exception 'Cannot discard a pending operation journal';end if;
 update public.game_operation_jobs set lease_token=null,lease_until=null,finished_at=now(),outcome=p_outcome,summary=p_summary,
 last_success_at=case when p_outcome='success' then now() else last_success_at end,journal=case when p_clear then null else journal end where job_key=p_key;
 return true;
end $$;

alter table public.game_ad_verifications add column retry_attempts integer not null default 0 check(retry_attempts between 0 and 8),add column last_retry_at timestamptz,add column next_retry_at timestamptz not null default now();
create function public.game_retry_admob_rewards(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt public.game_ad_verifications;result jsonb;processed integer:=0;applied integer:=0;reviews integer:=0;message text;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid ad recovery batch';end if;
 for receipt in select * from public.game_ad_verifications where state in ('received','review') and (review_reason is null or review_reason='Reward application needs review') and retry_attempts<8 and next_retry_at<=now() order by first_received_at for update skip locked limit p_limit loop
  processed:=processed+1;
  update public.game_ad_verifications set retry_attempts=retry_attempts+1,last_retry_at=now(),next_retry_at=now()+make_interval(secs=>least(21600,60*power(2,receipt.retry_attempts)::integer)) where transaction_id=receipt.transaction_id;
  begin
   result:=public.game_grant_ad(receipt.offer_id,'admob',receipt.transaction_id,receipt.unit,receipt.reward_amount,receipt.reward_item,receipt.earned_at,receipt.user_hint);
   update public.game_ad_verifications set state=case when (result->>'credited')::boolean then 'applied' when result->>'state'='cancelled' then 'review' else 'ignored' end,review_reason=case when result->>'state'='cancelled' then 'Verified reward for cancelled opportunity' end where transaction_id=receipt.transaction_id;
   if (result->>'credited')::boolean then applied:=applied+1;elsif result->>'state'='cancelled' then reviews:=reviews+1;end if;
  exception when others then
   get stacked diagnostics message=MESSAGE_TEXT;
   update public.game_ad_verifications set state='review',review_reason=case when message in ('Reward placement verification failed','Invalid reward timestamp','Reward transaction identity conflict') then message else 'Reward application needs review' end where transaction_id=receipt.transaction_id;reviews:=reviews+1;
  end;
 end loop;
 return jsonb_build_object('processed',processed,'applied',applied,'reviews',reviews,'exhausted',(select count(*) from public.game_ad_verifications where state='review' and retry_attempts>=8));
end $$;
create function public.game_operation_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare jobs jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('key',job_key,'kind',kind,'startedAt',started_at,'finishedAt',finished_at,'lastSuccessAt',last_success_at,'outcome',outcome,'summary',summary,'leaseActive',coalesce(lease_until>now(),false),'overdue',coalesce(finished_at,created_at)<now()-interval '20 minutes','hasPendingJournal',journal is not null) order by job_key),'[]') into jobs from public.game_operation_jobs;
 return jsonb_build_object('jobs',jobs,'adReviews',(select count(*) from public.game_ad_verifications where state='review'),'adRetryExhausted',(select count(*) from public.game_ad_verifications where state='review' and retry_attempts>=8),
 'privacyManualReview',(select count(*) from public.game_privacy_jobs where state='manual_review'),
 'privacyDue',(select count(*) from public.game_privacy_jobs where state in ('pending','verifying','working') and next_attempt_at<=now() and coalesce(lease_until,now())<=now()),
 'webPurchaseRecords',(select count(*) from public.game_purchases where provider='razorpay'),
 'expiredMetricRows',(select count(*) from public.game_metric_events where expires_at<=now()),'oldestExpiredMetricAt',(select min(expires_at) from public.game_metric_events where expires_at<=now()));
end $$;
alter table public.game_operation_jobs enable row level security;
revoke all on public.game_operation_jobs from public,anon,authenticated;grant all on public.game_operation_jobs to service_role;
revoke all on function public.game_operation_claim(text,text,jsonb),public.game_operation_put(text,bigint,uuid,jsonb),public.game_operation_finish(text,bigint,uuid,text,jsonb,boolean),public.game_retry_admob_rewards(integer),public.game_operation_status() from public,anon,authenticated;
grant execute on function public.game_operation_claim(text,text,jsonb),public.game_operation_put(text,bigint,uuid,jsonb),public.game_operation_finish(text,bigint,uuid,text,jsonb,boolean),public.game_retry_admob_rewards(integer),public.game_operation_status() to service_role;
commit;
