-- Optional first-party account analytics. Telemetry never grants currency or
-- proves a human/verified clear. A consent revision fences stale devices.
begin;
create table public.game_metric_preferences(user_id uuid primary key references auth.users(id) on delete cascade,enabled boolean not null default false,revision bigint not null default 0 check(revision>=0),updated_at timestamptz not null default now(),first_observed_day date);
create table public.game_metric_experiments(id text primary key check(id ~ '^[a-z0-9_-]{1,80}$'),kind text not null check(kind='aim_coaching'),salt text not null check(length(salt) between 16 and 128),hint_weight integer not null check(hint_weight between 1000 and 9000),active boolean not null default false,created_at timestamptz not null default now());
create unique index game_one_aim_experiment on public.game_metric_experiments(kind) where active;
create function public.game_keep_metric_experiment() returns trigger language plpgsql set search_path='' as $$begin if tg_op='DELETE' or (to_jsonb(new)-'active') is distinct from (to_jsonb(old)-'active') then raise exception 'Published experiment versions are immutable';end if;return new;end $$;
create trigger keep_metric_experiment before update or delete on public.game_metric_experiments for each row execute function public.game_keep_metric_experiment();
insert into public.game_metric_experiments(id,kind,salt,hint_weight) values('aim-coaching-2026-10-v1','aim_coaching','brick-breaker-aim-coaching-v1',5000);
create table public.game_metric_assignments(user_id uuid not null references auth.users(id) on delete cascade,experiment_id text not null references public.game_metric_experiments(id),variant text not null check(variant in ('standard','aim_hint')),revision bigint not null,issued_at timestamptz not null default now(),primary key(user_id,experiment_id));
create table public.game_metric_events(sequence bigint generated always as identity unique,user_id uuid not null references auth.users(id) on delete cascade,id uuid not null,revision bigint not null,type text not null,session_id uuid not null,run_id uuid,client_at timestamptz,data jsonb not null,fingerprint text not null,received_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '90 days',primary key(user_id,id));
create index game_metric_owner_page on public.game_metric_events(user_id,sequence desc);
create unique index game_metric_one_run_end on public.game_metric_events(user_id,run_id) where type='stage_end';
create table public.game_metric_streams(user_id uuid not null references auth.users(id) on delete cascade,id uuid not null,revision bigint not null,client_dropped bigint not null default 0 check(client_dropped between 0 and 1000000000),last_seen_at timestamptz not null default now(),primary key(user_id,id));
create table public.game_metric_daily(user_id uuid not null references auth.users(id) on delete cascade,day date not null,accepted integer not null default 0,quota_drop_attempts integer not null default 0,primary key(user_id,day));

create function public.game_metric_int(p jsonb,p_min numeric,p_max numeric) returns boolean language plpgsql immutable set search_path='' as $$begin if jsonb_typeof(p) is distinct from 'number' or p::text !~ '^[0-9]{1,16}$' then return false;end if;return p::text::numeric between p_min and p_max;end $$;
create function public.game_valid_metric_event(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare d jsonb; allowed text[]; kind text;
begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>2048 then return false;end if;
 if exists(select 1 from jsonb_object_keys(p) k where k not in ('id','type','sessionId','clientAt','data')) or (p->>'id') is null or (p->>'id') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or (p->>'sessionId') is null or (p->>'sessionId') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or not public.game_metric_int(p->'clientAt',0,9007199254740991) then return false;end if;
 d:=p->'data';kind:=p->>'type';if jsonb_typeof(d) is distinct from 'object' then return false;end if;
 case kind
 when 'session_start' then
  allowed:=array['platform','build'];if (d->>'platform') is null or (d->>'platform') not in ('android','ios','web') or (d->>'build') is null or (d->>'build') !~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' then return false;end if;
 when 'help_open' then
  allowed:=array['surface'];if (d->>'surface') is null or (d->>'surface') not in ('home','game','settings') then return false;end if;
 when 'play_segment','stage_end' then
  if not public.game_metric_int(d->'level',1,9007199254740990) or (d->>'mode') is null or (d->>'mode') not in ('manual','assisted') or (d->>'runId') is null or (d->>'runId') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return false;end if;
  if kind='play_segment' then
   allowed:=array['level','mode','runId','activeMs','reason'];if not public.game_metric_int(d->'activeMs',1,60000) or (d->>'reason') is null or (d->>'reason') not in ('periodic','paused','background','cleared','game_over','lost','takeover','home','account') then return false;end if;
  else
   allowed:=array['level','mode','runId','simulationMs','losses','outcome'];if not public.game_metric_int(d->'simulationMs',0,86400000) or not public.game_metric_int(d->'losses',0,5) or (d->>'outcome') is null or (d->>'outcome') not in ('cleared','game_over') then return false;end if;
  end if;
 when 'coach_exposure' then
  allowed:=array['experiment','variant'];if (d->>'experiment') is null or (d->>'experiment') !~ '^[a-z0-9_-]{1,80}$' or (d->>'variant') is null or (d->>'variant') not in ('standard','aim_hint') then return false;end if;
 when 'purchase_offer' then
  allowed:=array['platform','sku','currency','amountMicros','benefitMs','configVersion'];if (d->>'platform') is null or (d->>'platform') not in ('android','ios','web') or (d->>'sku') is null or (d->>'sku') !~ '^[A-Za-z0-9_.:-]{1,200}$' or (d->>'currency') is null or (d->>'currency') !~ '^[A-Z]{3}$' or not public.game_metric_int(d->'amountMicros',0,1000000000000000) or not public.game_metric_int(d->'benefitMs',1,9000000000) or (d->>'configVersion') is null or (d->>'configVersion') !~ '^[A-Za-z0-9_.:-]{1,80}$' then return false;end if;
 when 'ad_value' then
  allowed:=array['opportunityId','provider','platform','valueMicros','currency','precision'];if (d->>'opportunityId') is null or (d->>'opportunityId') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or (d->>'provider') is distinct from 'admob' or (d->>'platform') is null or (d->>'platform') not in ('android','ios') or (d->>'currency') is null or (d->>'currency') !~ '^[A-Z]{3}$' or not public.game_metric_int(d->'valueMicros',0,1000000000000000) or not public.game_metric_int(d->'precision',0,3) then return false;end if;
 when 'ad_event' then
  allowed:=array['opportunityId','provider','platform','phase'];if (d->>'opportunityId') is null or (d->>'opportunityId') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or (d->>'provider') is null or (d->>'provider') not in ('admob','h5') or (d->>'platform') is null or (d->>'platform') not in ('android','ios','web') or (d->>'phase') is null or (d->>'phase') not in ('request','display','reward_signal','closed','failed') then return false;end if;
 else return false;
 end case;
 return not exists(select 1 from jsonb_each(d) f where not(f.key=any(allowed)) or f.key not in ('level','activeMs','simulationMs','losses','amountMicros','benefitMs','valueMicros','precision') and jsonb_typeof(f.value)<>'string');
end $$;

create function public.game_metrics_state(p_allow_assignment boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();pref public.game_metric_preferences;exp public.game_metric_experiments;assignment public.game_metric_assignments;variant text;result jsonb:=null;
begin
 if uid is null then raise exception 'Authentication required';end if;
 perform 1 from auth.users where id=uid for key share;if not found then raise exception 'Authentication required';end if;
 insert into public.game_metric_preferences(user_id) values(uid) on conflict do nothing;
 select * into pref from public.game_metric_preferences where user_id=uid for update;
 if pref.enabled and p_allow_assignment then
  select * into exp from public.game_metric_experiments where active;
  if found then
   variant:=case when (('x'||substr(encode(sha256(convert_to(uid::text||':'||exp.id||':'||exp.salt,'UTF8')),'hex'),1,8))::bit(32)::bigint%10000)<exp.hint_weight then 'aim_hint' else 'standard' end;
   insert into public.game_metric_assignments(user_id,experiment_id,variant,revision) values(uid,exp.id,variant,pref.revision) on conflict do nothing;
   select * into assignment from public.game_metric_assignments where user_id=uid and experiment_id=exp.id;
   result:=jsonb_build_object('experiment',exp.id,'kind',exp.kind,'variant',assignment.variant);
  end if;
 end if;
 return jsonb_build_object('enabled',pref.enabled,'revision',pref.revision::text,'assignment',result,'scope','consenting_signed_in_accounts','serverNow',now());
end $$;
create function public.game_metrics_set(p_enabled boolean,p_expected bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();pref public.game_metric_preferences;
begin
 if uid is null then raise exception 'Authentication required';end if;
 if p_enabled is null or p_expected is null or p_expected<0 then raise exception 'Invalid analytics preference';end if;
 perform 1 from auth.users where id=uid for key share;if not found then raise exception 'Authentication required';end if;
 insert into public.game_metric_preferences(user_id) values(uid) on conflict do nothing;
 select * into pref from public.game_metric_preferences where user_id=uid for update;
 if pref.revision<>p_expected then return public.game_metrics_state()||jsonb_build_object('applied',false);end if;
 if pref.enabled<>p_enabled then
  update public.game_metric_preferences set enabled=p_enabled,revision=revision+1,updated_at=now(),first_observed_day=null where user_id=uid;
  delete from public.game_metric_events where user_id=uid;delete from public.game_metric_assignments where user_id=uid;delete from public.game_metric_streams where user_id=uid;delete from public.game_metric_daily where user_id=uid;
 end if;
 return public.game_metrics_state()||jsonb_build_object('applied',true);
end $$;

create function public.game_metrics_collect(p_revision bigint,p_stream uuid,p_dropped bigint,p_events jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();pref public.game_metric_preferences;raw jsonb;old public.game_metric_events;fingerprint text;v_day date:=(now() at time zone 'UTC')::date;used integer;added integer:=0;duplicates integer:=0;rejected integer:=0;quota integer:=0;event_id uuid;sid uuid;rid uuid;kind text;client_time timestamptz;ack jsonb:='[]';
begin
 if uid is null then raise exception 'Authentication required';end if;
 if p_revision is null or p_revision<0 or p_stream is null or p_dropped is null or p_dropped not between 0 and 1000000000 or jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>40 then raise exception 'Invalid analytics batch';end if;
 perform 1 from auth.users where id=uid for key share;if not found then raise exception 'Authentication required';end if;
 insert into public.game_metric_preferences(user_id) values(uid) on conflict do nothing;
 select * into pref from public.game_metric_preferences where user_id=uid for update;
 if not pref.enabled or pref.revision<>p_revision then return public.game_metrics_state()||jsonb_build_object('accepted',false);end if;
 for raw in select * from jsonb_array_elements(p_events) loop if not public.game_valid_metric_event(raw) then raise exception 'Invalid analytics event';end if;end loop;
 if not exists(select 1 from public.game_metric_streams where user_id=uid and id=p_stream) and (select count(*) from public.game_metric_streams where user_id=uid)>=32 then raise exception 'Too many analytics streams';end if;
 insert into public.game_metric_streams(user_id,id,revision,client_dropped) values(uid,p_stream,p_revision,p_dropped) on conflict(user_id,id) do update set client_dropped=greatest(public.game_metric_streams.client_dropped,excluded.client_dropped),last_seen_at=now() where public.game_metric_streams.revision=p_revision;
 if not found then raise exception 'Analytics stream revision conflict';end if;
 insert into public.game_metric_daily(user_id,day) values(uid,v_day) on conflict do nothing;
 select accepted into used from public.game_metric_daily where user_id=uid and game_metric_daily.day=v_day for update;
 for raw in select * from jsonb_array_elements(p_events) loop
  event_id:=(raw->>'id')::uuid;sid:=(raw->>'sessionId')::uuid;kind:=raw->>'type';rid:=(raw->'data'->>'runId')::uuid;fingerprint:=encode(sha256(convert_to(raw::text,'UTF8')),'hex');ack:=ack||jsonb_build_array(event_id);
  select * into old from public.game_metric_events where user_id=uid and id=event_id;
  if found then if old.fingerprint=fingerprint then duplicates:=duplicates+1;else rejected:=rejected+1;end if;continue;end if;
  if kind='stage_end' and exists(select 1 from public.game_metric_events where user_id=uid and type='stage_end' and run_id=rid) then duplicates:=duplicates+1;continue;end if;
  if kind='coach_exposure' and not exists(select 1 from public.game_metric_assignments where user_id=uid and experiment_id=raw->'data'->>'experiment' and variant=raw->'data'->>'variant' and revision=p_revision) then rejected:=rejected+1;continue;end if;
  if kind in ('ad_event','ad_value') and not exists(select 1 from public.game_ad_offers where owner_user_id=uid and id=(raw->'data'->>'opportunityId')::uuid and provider=raw->'data'->>'provider' and platform=raw->'data'->>'platform') then rejected:=rejected+1;continue;end if;
  if used+added>=1000 then quota:=quota+1;continue;end if;
  client_time:=null;if (raw->>'clientAt')::numeric between extract(epoch from now()-interval '30 days')*1000 and extract(epoch from now()+interval '5 minutes')*1000 then client_time:=to_timestamp((raw->>'clientAt')::double precision/1000);end if;
  insert into public.game_metric_events(user_id,id,revision,type,session_id,run_id,client_at,data,fingerprint) values(uid,event_id,p_revision,kind,sid,rid,client_time,raw->'data',fingerprint);added:=added+1;
 end loop;
 update public.game_metric_daily set accepted=accepted+added,quota_drop_attempts=quota_drop_attempts+quota where user_id=uid and game_metric_daily.day=v_day;
 if added>0 then update public.game_metric_preferences set first_observed_day=coalesce(first_observed_day,v_day) where user_id=uid;end if;
 return public.game_metrics_state()||jsonb_build_object('accepted',true,'ack',ack,'inserted',added,'duplicates',duplicates,'rejected',rejected,'quotaDropAttempts',quota);
end $$;

create function public.game_metrics_export(p_before bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();rows jsonb;last_id bigint;n integer;preference jsonb;
begin
 if uid is null then raise exception 'Authentication required';end if;if p_before is not null and p_before<1 then raise exception 'Invalid analytics cursor';end if;
 with page as(select * from public.game_metric_events where user_id=uid and expires_at>now() and (p_before is null or sequence<p_before) order by sequence desc limit 100)
 select coalesce(jsonb_agg(jsonb_build_object('sequence',sequence::text,'id',id,'type',type,'sessionId',session_id,'clientAt',client_at,'data',data,'receivedAt',received_at,'source','client_reported') order by sequence desc),'[]'),count(*),min(sequence) into rows,n,last_id from page;
 select jsonb_build_object('enabled',enabled,'revision',revision::text,'updatedAt',updated_at) into preference from public.game_metric_preferences where user_id=uid;
 return jsonb_build_object('events',rows,'preference',preference,'nextBefore',case when n=100 then last_id::text end);
end $$;
create function public.game_prune_play_metrics(p_limit integer default 1000) returns jsonb language plpgsql security definer set search_path='' as $$
declare events integer;streams integer;assignments integer;days integer;
begin
 if p_limit is null or p_limit not between 1 and 5000 then raise exception 'Invalid analytics retention batch';end if;
 with targets as(select sequence from public.game_metric_events where expires_at<=now() order by sequence for update skip locked limit p_limit),removed as(delete from public.game_metric_events e using targets t where e.sequence=t.sequence returning 1) select count(*) into events from removed;
 with targets as(select ctid from public.game_metric_streams where last_seen_at<now()-interval '90 days' for update skip locked limit p_limit),removed as(delete from public.game_metric_streams e using targets t where e.ctid=t.ctid returning 1) select count(*) into streams from removed;
 with targets as(select a.ctid from public.game_metric_assignments a where issued_at<now()-interval '90 days' and not exists(select 1 from public.game_metric_events e where e.user_id=a.user_id and e.type='coach_exposure' and e.data->>'experiment'=a.experiment_id and e.expires_at>now()) for update skip locked limit p_limit),removed as(delete from public.game_metric_assignments e using targets t where e.ctid=t.ctid returning 1) select count(*) into assignments from removed;
 with targets as(select ctid from public.game_metric_daily where day<(now() at time zone 'UTC')::date-90 for update skip locked limit p_limit),removed as(delete from public.game_metric_daily e using targets t where e.ctid=t.ctid returning 1) select count(*) into days from removed;
 return jsonb_build_object('events',events,'streams',streams,'assignments',assignments,'days',days,'batchLimit',p_limit);
end $$;
revoke all on function public.game_prune_play_metrics(integer) from public,anon,authenticated;
grant execute on function public.game_prune_play_metrics(integer) to service_role;
do $$declare tab text;begin foreach tab in array array['game_metric_preferences','game_metric_experiments','game_metric_assignments','game_metric_events','game_metric_streams','game_metric_daily'] loop execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from public,anon,authenticated',tab);execute format('grant all on public.%I to service_role',tab);end loop;end $$;
revoke all on function public.game_keep_metric_experiment(),public.game_metric_int(jsonb,numeric,numeric),public.game_valid_metric_event(jsonb),public.game_metrics_state(boolean),public.game_metrics_set(boolean,bigint),public.game_metrics_collect(bigint,uuid,bigint,jsonb),public.game_metrics_export(bigint) from public,anon,authenticated;
grant execute on function public.game_metrics_state(boolean),public.game_metrics_set(boolean,bigint),public.game_metrics_collect(bigint,uuid,bigint,jsonb),public.game_metrics_export(bigint) to authenticated;
commit;
