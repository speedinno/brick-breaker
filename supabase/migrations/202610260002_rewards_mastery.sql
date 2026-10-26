-- Versioned offers, bounded manual rewards and personal mastery. No provider
-- transaction is accepted by this migration; imports never mint time.
begin;
create function public.game_valid_economy_config(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare key text; item jsonb; value jsonb;
begin
 if jsonb_typeof(p) is distinct from 'object' then return false; end if;
 foreach key in array array['maxActivationMs','introMs','manualMs','manualPerDay','rewardedMs','rewardedPerDay'] loop
  if jsonb_typeof(p->key) is distinct from 'number' or (p->>key)!~'^[0-9]{1,9}$' then return false; end if;
 end loop;
 if jsonb_typeof(p->'activationMs') is distinct from 'array' or jsonb_array_length(p->'activationMs') not between 1 and 4 then return false; end if;
 for item in select * from jsonb_array_elements(p->'activationMs') loop
  if jsonb_typeof(item) is distinct from 'number' or item::text!~'^[0-9]{1,9}$' then return false; end if;
  if item::text::integer not between 1 and (p->>'maxActivationMs')::integer then return false; end if;
 end loop;
 if jsonb_typeof(p->'products') is distinct from 'object' or p->'products'='{}'::jsonb then return false; end if;
 for key,value in select * from jsonb_each(p->'products') loop
  if key!~'^[a-z0-9_]{1,64}$' or jsonb_typeof(value->'milliseconds') is distinct from 'number' or (value->>'milliseconds')!~'^[0-9]{1,13}$' then return false; end if;
  if (value->>'milliseconds')::bigint not between 1 and 9000000000000 then return false; end if;
 end loop;
 return true;
end $$;
create table public.game_economy_config (
 version text primary key check(length(version) between 1 and 80),
 current boolean not null default false,
 settings jsonb not null,
 created_at timestamptz not null default now(),
 check(public.game_valid_economy_config(settings)),
 check(settings ?& array['maxActivationMs','activationMs','introMs','manualMs','manualPerDay','rewardedMs','rewardedPerDay','products']),
 check(jsonb_typeof(settings->'activationMs')='array' and jsonb_array_length(settings->'activationMs') between 1 and 4),
 check((settings->>'maxActivationMs')::integer between 1 and 30000),
 check((settings->>'introMs')::integer between 1 and 60000),
 check((settings->>'manualMs')::integer between 1 and 60000),
 check((settings->>'manualPerDay')::integer between 0 and 20),
 check((settings->>'rewardedMs')::integer between 1 and 60000),
 check((settings->>'rewardedPerDay')::integer between 0 and 10),
 check(jsonb_typeof(settings->'products')='object')
);
create unique index game_current_economy_config on public.game_economy_config(current) where current;
insert into public.game_economy_config(version,current,settings) values('2026-10-v1',true,
 '{"maxActivationMs":30000,"activationMs":[15000,30000],"introMs":30000,"manualMs":15000,"manualPerDay":4,"rewardedMs":30000,"rewardedPerDay":3,"products":{"time_300":{"milliseconds":300000},"time_900":{"milliseconds":900000}}}');
create function public.game_keep_config_version() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'Configuration versions are retained'; end if;
 if new.version is distinct from old.version or new.settings is distinct from old.settings then raise exception 'Create a new configuration version'; end if;
 return new;
end $$;
create trigger game_keep_config_version before update or delete on public.game_economy_config for each row execute function public.game_keep_config_version();

create table public.game_mastery (
 user_id uuid not null references auth.users(id) on delete cascade,
 level bigint not null check(level between 1 and 9007199254740990),
 manual_clears bigint not null default 0 check(manual_clears>=0),
 clean_clears bigint not null default 0 check(clean_clears>=0 and clean_clears<=manual_clears),
 best_manual_seconds numeric check(best_manual_seconds>=0),
 best_clean_seconds numeric check(best_clean_seconds>=0),
 updated_at timestamptz not null default now(),
 primary key(user_id,level)
);
alter table public.game_players add column manual_imported int8multirange not null default '{}';
alter table public.game_players add column clean_imported int8multirange not null default '{}';
create table public.game_intro_claims (
 user_id uuid primary key references public.game_wallets(user_id) on delete cascade,
 run_id uuid not null references public.game_runs(id) on delete cascade,
 milliseconds bigint not null check(milliseconds>0),
 config_version text not null check(length(config_version) between 1 and 80),
 created_at timestamptz not null default now()
);
create table public.game_manual_claims (
 user_id uuid not null references public.game_wallets(user_id) on delete cascade,
 run_id uuid not null references public.game_runs(id) on delete cascade,
 eligibility_day date not null,
 level bigint not null,
 milliseconds bigint not null check(milliseconds>0),
 config_version text not null references public.game_economy_config(version),
 created_at timestamptz not null default now(),
 primary key(user_id,run_id),unique(user_id,eligibility_day,level)
);
alter table public.game_runs add column reported_mode text check(reported_mode in ('play','watch'));
alter table public.game_runs add column completion_seconds numeric;
alter table public.game_runs add column stage_losses integer check(stage_losses between 0 and 5);
alter table public.game_runs add column reward_evaluated_at timestamptz;
alter table public.game_runs add column reward_day date;
alter table public.game_runs add column reward_config_version text references public.game_economy_config(version);
alter table public.game_runs add column reward_ms bigint not null default 0 check(reward_ms>=0);

alter table public.game_economy_config enable row level security;
alter table public.game_mastery enable row level security;
alter table public.game_intro_claims enable row level security;
alter table public.game_manual_claims enable row level security;
revoke all on public.game_economy_config,public.game_mastery,public.game_intro_claims,public.game_manual_claims from public,anon,authenticated;
grant select on public.game_economy_config,public.game_mastery,public.game_intro_claims,public.game_manual_claims to authenticated;
grant all on public.game_economy_config,public.game_mastery,public.game_intro_claims,public.game_manual_claims to service_role;
create policy read_economy_config on public.game_economy_config for select to authenticated using(true);
create policy own_mastery on public.game_mastery for select to authenticated using(user_id=(select auth.uid()));
create policy own_intro_claims on public.game_intro_claims for select to authenticated using(user_id=(select auth.uid()));
create policy own_manual_claims on public.game_manual_claims for select to authenticated using(user_id=(select auth.uid()));

create function public.game_current_economy() returns jsonb language sql stable security definer set search_path='' as $$
 select settings||jsonb_build_object('version',version) from public.game_economy_config where current
$$;

-- Compact permanent stamp ranges; recent timings can remain bounded without
-- silently erasing mastery stamps for old completed stages.
create function public.game_mastery_ranges(p_user uuid,p_clean boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare imported int8multirange; observed int8multirange; result jsonb;
begin
 select case when p_clean then clean_imported else manual_imported end into imported from public.game_players where user_id=p_user;
 select coalesce(range_agg(int8range(level,level+1,'[)')),'{}') into observed from public.game_mastery
  where user_id=p_user and case when p_clean then clean_clears>0 else manual_clears>0 end;
 select coalesce(jsonb_agg(jsonb_build_array(lower(segment),upper(segment)-1) order by lower(segment)),'[]') into result
  from unnest(coalesce(imported,'{}'::int8multirange)+observed) segment;
 return result;
end
$$;

create function public.game_ranges_from_json(p jsonb) returns int8multirange language plpgsql immutable set search_path='' as $$
declare item jsonb; lo bigint; hi bigint; result int8multirange;
begin
 if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p)>4096 then raise exception 'Invalid mastery import'; end if;
 for item in select * from jsonb_array_elements(p) loop
  if jsonb_typeof(item) is distinct from 'array' or jsonb_array_length(item)<>2 or jsonb_typeof(item->0) is distinct from 'number' or jsonb_typeof(item->1) is distinct from 'number' then raise exception 'Invalid mastery import'; end if;
  if (item->>0)!~'^[0-9]{1,16}$' or (item->>1)!~'^[0-9]{1,16}$' then raise exception 'Invalid mastery import'; end if;
  lo:=(item->>0)::bigint;hi:=(item->>1)::bigint;
  if lo<1 or hi<lo or hi>9007199254740990 then raise exception 'Invalid mastery import'; end if;
 end loop;
 select coalesce(range_agg(int8range((value->>0)::bigint,(value->>1)::bigint+1,'[)')),'{}') into result from jsonb_array_elements(p);
 return result;
end $$;

create function public.game_link_progress(p_starters integer[],p_journey_next bigint,p_records jsonb,p_manual jsonb default '[]',p_clean jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p public.game_players; allowed int8multirange; manual int8multirange; clean int8multirange; item jsonb; lev bigint; manual_seconds numeric; clean_seconds numeric;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 insert into public.game_wallets(user_id) values(uid) on conflict do nothing;
 perform 1 from public.game_wallets where user_id=uid for update;
 manual:=public.game_ranges_from_json(p_manual);clean:=public.game_ranges_from_json(p_clean);
 perform public.game_import_progress(p_starters,p_journey_next,p_records);
 select * into p from public.game_players where user_id=uid for update;
 select coalesce(range_agg(int8range(n::bigint,n::bigint+1,'[)')),'{}') into allowed from unnest(p.starter_completed) n;
 if cardinality(p.starter_completed)=12 and p.highest_unlocked>13 then allowed:=allowed+int8multirange(int8range(13,p.highest_unlocked,'[)')); end if;
 manual:=p.manual_imported+(manual*allowed);
 clean:=p.clean_imported+(clean*manual*allowed);
 update public.game_players set manual_imported=manual,clean_imported=clean where user_id=uid;
 for item in select * from jsonb_array_elements(p_records) loop
  lev:=(item->>'level')::bigint;manual_seconds:=null;clean_seconds:=null;
  if item ? 'manualSeconds' and item->'manualSeconds'<>'null'::jsonb then
   if jsonb_typeof(item->'manualSeconds')<>'number' then raise exception 'Invalid mastery import'; end if;
   manual_seconds:=(item->>'manualSeconds')::numeric;
   if manual_seconds not between 0 and 86400 then raise exception 'Invalid mastery import'; end if;
  end if;
  if item ? 'cleanSeconds' and item->'cleanSeconds'<>'null'::jsonb then
   if jsonb_typeof(item->'cleanSeconds')<>'number' then raise exception 'Invalid mastery import'; end if;
   clean_seconds:=(item->>'cleanSeconds')::numeric;
   if clean_seconds not between 0 and 86400 then raise exception 'Invalid mastery import'; end if;
  end if;
  if not manual @> lev then manual_seconds:=null; end if;
  if not clean @> lev then clean_seconds:=null; end if;
  if manual_seconds is not null or clean_seconds is not null then
   insert into public.game_mastery(user_id,level,best_manual_seconds,best_clean_seconds) values(uid,lev,manual_seconds,clean_seconds)
   on conflict(user_id,level) do update set best_manual_seconds=least(public.game_mastery.best_manual_seconds,excluded.best_manual_seconds),best_clean_seconds=least(public.game_mastery.best_clean_seconds,excluded.best_clean_seconds);
  end if;
 end loop;
 -- Imports retain personal stamps only. No run or monetary/reward claim is
 -- manufactured, and replaying this union cannot duplicate an introduction.
 return public.game_state();
end $$;

create or replace function public.game_time_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb; pending jsonb; cfg jsonb; day date:=(now() at time zone 'UTC')::date; claims integer;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 insert into public.game_wallets(user_id) values(uid) on conflict do nothing;
 cfg:=public.game_current_economy();
 if cfg is null then raise exception 'Economy configuration unavailable'; end if;
 select count(*) into claims from public.game_manual_claims where user_id=uid and eligibility_day=day;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'deviceId',device_id,'runId',run_id,'reservedMs',reserved_ms,'consumedMs',consumed_ms,'leaseUntil',lease_until,'createdAt',created_at)),'[]')
 into pending from public.game_time_reservations where user_id=uid and settled_at is null;
 select jsonb_build_object(
  'availableMs',coalesce(sum(granted_ms-consumed_ms-held_ms-reversed_ms),0),
  'reservedMs',coalesce(sum(held_ms),0),
  'refundedConsumedMs',coalesce(sum(consumed_ms) filter(where refunded_at is not null),0),
  'pending',pending,'serverNow',now(),'config',cfg,
  'manualRewardsToday',claims,'manualRewardsRemaining',greatest(0,(cfg->>'manualPerDay')::integer-claims),
  'nextReset',((day+1)::timestamp at time zone 'UTC'),
  'introClaimed',exists(select 1 from public.game_intro_claims where user_id=uid)) into result
 from public.game_credit_lots where user_id=uid;
 return result;
end $$;

create or replace function public.game_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p public.game_players; recent jsonb; total bigint;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 insert into public.game_wallets(user_id) values(uid) on conflict do nothing;
 insert into public.game_players(user_id) values(uid) on conflict do nothing;
 select * into p from public.game_players where user_id=uid;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into recent from (
  select c.level,c.best_score,c.best_seconds,c.peak_balls,c.play_mode,c.clears,c.source,c.last_completed_at,
   m.manual_clears,m.clean_clears,m.best_manual_seconds,m.best_clean_seconds
  from public.game_completions c left join public.game_mastery m on m.user_id=c.user_id and m.level=c.level
  where c.user_id=uid and c.version=3 order by c.level desc limit 128
 ) t;
 select coalesce(max(best_score),0) into total from public.game_completions where user_id=uid and version=3;
 return jsonb_build_object('starter_completed',p.starter_completed,'highest_unlocked',p.highest_unlocked,'selected_level',p.selected_level,'best_score',total,'recent',recent,
  'mastery',jsonb_build_object('manual',public.game_mastery_ranges(uid,false),'clean',public.game_mastery_ranges(uid,true)),
  'wallet',public.game_time_state());
end $$;

-- Called within validated completion, under the same wallet lock. A run records
-- its eligibility decision even when capped, so tomorrow/config changes cannot
-- turn a previously ineligible callback into a new claim.
create function public.game_reward_manual_run(p_user uuid,p_run uuid) returns bigint language plpgsql security definer set search_path='' as $$
declare r public.game_runs; cfg jsonb; day date:=(now() at time zone 'UTC')::date; amount bigint:=0; quantity bigint; prior_intro public.game_credit_lots;
begin
 perform 1 from public.game_wallets where user_id=p_user for update;
 select * into r from public.game_runs where id=p_run and user_id=p_user for update;
 if not found or r.finished_at is null or r.reward_evaluated_at is not null then return 0; end if;
 cfg:=public.game_current_economy();if cfg is null then raise exception 'Economy configuration unavailable'; end if;
 update public.game_runs set reward_evaluated_at=now(),reward_day=day,reward_config_version=cfg->>'version' where id=p_run;
 if r.assisted or r.reported_mode is distinct from 'play' then return 0; end if;
 select * into prior_intro from public.game_credit_lots where user_id=p_user and source='intro' and source_key='intro:'||p_user;
 if found then
  insert into public.game_intro_claims(user_id,run_id,milliseconds,config_version) values(p_user,p_run,prior_intro.granted_ms,prior_intro.config_version) on conflict do nothing;
 else
  quantity:=(cfg->>'introMs')::bigint;
  insert into public.game_intro_claims(user_id,run_id,milliseconds,config_version) values(p_user,p_run,quantity,cfg->>'version') on conflict do nothing;
  if found then
   perform public.game_credit_verified(p_user,'intro','intro:'||p_user,quantity,'server',cfg->>'version');amount:=amount+quantity;
  end if;
 end if;
 if (select count(*) from public.game_manual_claims where user_id=p_user and eligibility_day=day)<(cfg->>'manualPerDay')::integer then
  quantity:=(cfg->>'manualMs')::bigint;
  insert into public.game_manual_claims(user_id,run_id,eligibility_day,level,milliseconds,config_version)
   values(p_user,p_run,day,r.level,quantity,cfg->>'version') on conflict do nothing;
  if found then
   perform public.game_credit_verified(p_user,'manual','manual:'||p_user||':'||day||':'||r.level,quantity,'server',cfg->>'version');amount:=amount+quantity;
  end if;
 end if;
 update public.game_runs set reward_ms=amount where id=p_run;
 return amount;
end $$;

-- Retain the old RPC argument contract through a defaulted new metadata field.
-- Wallet -> player -> run lock order agrees with reservations, avoiding the
-- run -> wallet inversion a completion/reward trigger would otherwise create.
drop function public.game_complete(uuid,text,bigint,numeric,integer,text);
create function public.game_complete(p_run_id uuid,p_hash text,p_score bigint,p_seconds numeric,p_peak integer,p_mode text,p_losses integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.game_runs; p public.game_players; d public.game_catalog; starters integer[]; expected_score bigint; next_stage bigint; mode text; earned bigint;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 insert into public.game_wallets(user_id) values(uid) on conflict do nothing;
 perform 1 from public.game_wallets where user_id=uid for update;
 select * into p from public.game_players where user_id=uid for update;
 select * into r from public.game_runs where id=p_run_id and user_id=uid for update;
 if not found then raise exception 'Unknown run'; end if;
 if r.finished_at is not null then return public.game_state(); end if;
 if exists(select 1 from public.game_time_reservations where run_id=r.id and settled_at is null) then raise exception 'Reconcile autoplay before completing this run'; end if;
 if r.expires_at<now() then raise exception 'This offline attempt expired. Replay the stage to save it online.'; end if;
 if r.layout_hash<>p_hash then raise exception 'Stage version differs. Reconnect and replay this stage.'; end if;
 if extract(epoch from now()-r.started_at)<1 then raise exception 'Attempt is too short'; end if;
 if r.level>greatest(12,p.highest_unlocked) then raise exception 'Stage is locked'; end if;
 if p_seconds is null or p_peak is null or p_score is null or p_mode is null or p_seconds<0 or p_seconds>86400 or p_seconds>extract(epoch from now()-r.started_at)*5+60 or p_peak<1 or p_peak>768 or p_mode not in ('play','watch') or p_losses<0 or p_losses>5 then raise exception 'Invalid completion statistics'; end if;
 mode:=case when r.assisted or p_mode='watch' then 'watch' else 'play' end;
 select * into d from public.game_catalog where version=r.version and level=r.level;
 expected_score:=(length(d.definition->>'layout')-length(replace(replace(d.definition->>'layout','b',''),'g','')))*10+1000;
 if p_score<>expected_score then raise exception 'Invalid stage score'; end if;
 insert into public.game_completions(user_id,version,level,best_score,best_seconds,peak_balls,play_mode)
  values(uid,3,r.level,p_score,p_seconds,p_peak,mode)
  on conflict(user_id,version,level) do update set best_score=greatest(public.game_completions.best_score,excluded.best_score),best_seconds=least(public.game_completions.best_seconds,excluded.best_seconds),peak_balls=greatest(public.game_completions.peak_balls,excluded.peak_balls),clears=public.game_completions.clears+1,last_completed_at=now(),play_mode=excluded.play_mode,source='game';
 if mode='play' then
  insert into public.game_mastery(user_id,level,manual_clears,clean_clears,best_manual_seconds,best_clean_seconds)
  values(uid,r.level,1,case when p_losses=0 then 1 else 0 end,p_seconds,case when p_losses=0 then p_seconds end)
  on conflict(user_id,level) do update set manual_clears=public.game_mastery.manual_clears+1,clean_clears=public.game_mastery.clean_clears+excluded.clean_clears,
   best_manual_seconds=least(public.game_mastery.best_manual_seconds,excluded.best_manual_seconds),best_clean_seconds=least(public.game_mastery.best_clean_seconds,excluded.best_clean_seconds),updated_at=now();
 end if;
 starters:=p.starter_completed;
 if r.level<=12 and not r.level::integer=any(starters) then starters:=array_append(starters,r.level::integer); end if;
 next_stage:=p.highest_unlocked;
 if cardinality(starters)=12 and next_stage=12 then next_stage:=13;
 elsif r.level>=13 and r.level=next_stage then next_stage:=next_stage+1; end if;
 update public.game_players set highest_unlocked=next_stage,starter_completed=starters,selected_level=case when cardinality(starters)=12 then next_stage else (select n from generate_series(1,12)n where not n=any(starters) order by n limit 1) end where user_id=uid;
 update public.game_runs set finished_at=now(),assisted=assisted or mode='watch',reported_mode=mode,completion_seconds=p_seconds,stage_losses=p_losses where id=r.id;
 earned:=public.game_reward_manual_run(uid,r.id);
 return public.game_state()||jsonb_build_object('earnedTimeMs',earned);
end $$;

revoke all on function public.game_current_economy(),public.game_mastery_ranges(uuid,boolean),public.game_ranges_from_json(jsonb),public.game_reward_manual_run(uuid,uuid),public.game_complete(uuid,text,bigint,numeric,integer,text,integer),public.game_link_progress(integer[],bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.game_current_economy(),public.game_complete(uuid,text,bigint,numeric,integer,text,integer),public.game_link_progress(integer[],bigint,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.game_reward_manual_run(uuid,uuid) to service_role;

-- Existing accounts and all progress mutators use the same wallet-first order.
insert into public.game_wallets(user_id) select user_id from public.game_players on conflict do nothing;
create or replace function public.game_start(p_level bigint,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p public.game_players; catalog public.game_catalog; old public.game_runs;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into public.game_wallets(user_id) values(uid) on conflict do nothing;
  perform 1 from public.game_wallets where user_id=uid for update;
  insert into public.game_players(user_id) values(uid) on conflict do nothing;
  select * into p from public.game_players where user_id=uid for update;
  if p_level<1 or p_level>greatest(12,p.highest_unlocked) then raise exception 'Stage is locked'; end if;
  select * into old from public.game_runs where id=p_request_id;
  if found then
    if old.user_id<>uid or old.level<>p_level then raise exception 'Run ID already used'; end if;
    return jsonb_build_object('runId',old.id,'layout_hash',old.layout_hash,'expires_at',old.expires_at);
  end if;
  if (select count(*) from public.game_runs where user_id=uid and started_at>now()-interval '10 minutes')>=60 then raise exception 'Too many attempts. Try again later.'; end if;
  select * into catalog from public.game_catalog where version=3 and level=p_level;
  if not found then raise exception 'Stage is not ready'; end if;
  insert into public.game_runs(id,user_id,version,level,layout_hash) values(p_request_id,uid,3,p_level,catalog.layout_hash);
  update public.game_players set selected_level=p_level where user_id=uid;
  return jsonb_build_object('runId',p_request_id,'layout_hash',catalog.layout_hash,'expires_at',now()+interval '7 days');
end $$;
create or replace function public.game_import_progress(p_starters integer[],p_journey_next bigint,p_records jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p public.game_players; starters integer[]; item jsonb; lev bigint;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into public.game_wallets(user_id) values(uid) on conflict do nothing;
  perform 1 from public.game_wallets where user_id=uid for update;
  if p_starters is null or cardinality(p_starters)>12 or exists(select 1 from unnest(p_starters)n where n<1 or n>12 or n is null) or p_journey_next is null or p_journey_next<13 or p_journey_next>1000000 or jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>128 then raise exception 'Invalid guest progress'; end if;
  if p_journey_next>13 and (select count(distinct n) from unnest(p_starters)n)<>12 then raise exception 'Complete all starter stages first'; end if;
  insert into public.game_players(user_id) values(uid) on conflict do nothing;
  select * into p from public.game_players where user_id=uid for update;
  select array_agg(distinct n order by n) into starters from unnest(p.starter_completed||p_starters)n;
  starters:=coalesce(starters,'{}');
  update public.game_players set starter_completed=starters,highest_unlocked=greatest(highest_unlocked,case when cardinality(starters)=12 then p_journey_next else 12 end),imported_journey=greatest(imported_journey,p_journey_next),selected_level=case when cardinality(starters)=12 then greatest(highest_unlocked,p_journey_next) else (select n from generate_series(1,12)n where not n=any(starters) order by n limit 1) end where user_id=uid;
  for item in select * from jsonb_array_elements(p_records) loop
    lev:=(item->>'level')::bigint;
    if lev is null or lev<1 or lev>=p_journey_next and lev>12 or lev<=12 and not lev::integer=any(p_starters) then continue; end if;
    if (item->>'score')::bigint not between 0 and 1000000000 or (item->>'seconds')::numeric not between 0 and 86400 or (item->>'peak')::integer not between 1 and 768 then raise exception 'Invalid history'; end if;
    insert into public.game_completions(user_id,version,level,best_score,best_seconds,peak_balls,play_mode,source)
      values(uid,3,lev,(item->>'score')::bigint,(item->>'seconds')::numeric,(item->>'peak')::integer,case when item->>'mode'='watch' then 'watch' else 'play' end,'guest_import') on conflict(user_id,version,level) do update set best_score=greatest(public.game_completions.best_score,excluded.best_score),best_seconds=least(public.game_completions.best_seconds,excluded.best_seconds),peak_balls=greatest(public.game_completions.peak_balls,excluded.peak_balls),last_completed_at=greatest(public.game_completions.last_completed_at,excluded.last_completed_at);
  end loop;
  return public.game_state();
end $$;
create or replace function public.game_prepare_level(p_level bigint) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p public.game_players;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into public.game_wallets(user_id) values(uid) on conflict do nothing;
  perform 1 from public.game_wallets where user_id=uid for update;
  insert into public.game_players(user_id) values(uid) on conflict do nothing;
  select * into p from public.game_players where user_id=uid for update;
  if p_level is null or p_level<1 or p_level>greatest(12,p.highest_unlocked) then raise exception 'Stage is locked'; end if;
  if exists(select 1 from public.game_catalog where version=3 and level=p_level) then return; end if;
  if p.catalog_window<now()-interval '10 minutes' then p.catalog_window:=now(); p.catalog_requests:=0; end if;
  if p.catalog_requests>=120 then raise exception 'Too many new stages. Try again later.'; end if;
  update public.game_players set catalog_window=p.catalog_window,catalog_requests=p.catalog_requests+1 where user_id=uid;
end $$;
create or replace function public.game_reserve_time(p_id uuid,p_device uuid,p_run uuid,p_ms bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.game_time_reservations; lot public.game_credit_lots; balance bigint; remaining bigint:=p_ms; portion bigint; n integer:=0; cfg jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 cfg:=public.game_current_economy();if cfg is null then raise exception 'Economy configuration unavailable'; end if;
 if p_id is null or p_device is null or p_run is null or p_ms is null or p_ms<1 or p_ms>(cfg->>'maxActivationMs')::bigint then raise exception 'Invalid time reservation'; end if;
 insert into public.game_wallets(user_id) values(uid) on conflict do nothing;
 perform 1 from public.game_wallets where user_id=uid for update;
 select * into r from public.game_time_reservations where id=p_id;
 if found then
  if r.user_id<>uid or r.device_id<>p_device or r.run_id<>p_run or r.reserved_ms<>p_ms then raise exception 'Reservation identity conflict'; end if;
  return jsonb_build_object('reservation',to_jsonb(r),'wallet',public.game_time_state());
 end if;
 if exists(select 1 from public.game_time_reservations where user_id=uid and settled_at is null) then raise exception 'Recover or finish the existing activation first'; end if;
 -- Reconciled positive usage marks assistance; cancelled authorization alone does not.
 perform 1 from public.game_runs where id=p_run and user_id=uid and finished_at is null and expires_at>now() for update;
 if not found then raise exception 'Active run required'; end if;
 select coalesce(sum(granted_ms-consumed_ms-held_ms-reversed_ms),0) into balance from public.game_credit_lots where user_id=uid;
 if balance<p_ms then raise exception 'Not enough autoplay time'; end if;
 insert into public.game_time_reservations(id,user_id,device_id,run_id,reserved_ms,config_version,lease_until)
 values(p_id,uid,p_device,p_run,p_ms,cfg->>'version',least(now()+interval '10 seconds',now()+p_ms*interval '1 millisecond'+interval '10 seconds')) returning * into r;
 for lot in select * from public.game_credit_lots where user_id=uid and refunded_at is null and granted_ms>consumed_ms+held_ms+reversed_ms order by created_at,id for update loop
  portion:=least(remaining,lot.granted_ms-lot.consumed_ms-lot.held_ms-lot.reversed_ms);n:=n+1;
  update public.game_credit_lots set held_ms=held_ms+portion where id=lot.id;
  insert into public.game_time_allocations(reservation_id,lot_id,ordinal,reserved_ms) values(p_id,lot.id,n,portion);
  remaining:=remaining-portion;exit when remaining=0;
 end loop;
 if remaining<>0 then raise exception 'Not enough autoplay time'; end if;
 insert into public.game_time_ledger(user_id,event_key,kind,amount_ms,reservation_id) values(uid,'reserve:'||p_id,'reserve',p_ms,p_id);
 return jsonb_build_object('reservation',to_jsonb(r),'wallet',public.game_time_state());
end $$;
create or replace function public.game_apply_time(p_id uuid,p_device uuid,p_consumed bigint,p_final boolean,p_recovery boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.game_time_reservations; a public.game_time_allocations; lot public.game_credit_lots;
 target bigint; delta bigint; portion bigint; released bigint; invalid_credit boolean;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 perform 1 from public.game_wallets where user_id=uid for update;
 select * into r from public.game_time_reservations where id=p_id and user_id=uid for update;
 if not found then raise exception 'Unknown time reservation'; end if;
 if p_recovery then
  if not p_final or r.lease_until>now() then raise exception 'Wait for the previous activation lease to end'; end if;
 elsif r.device_id is distinct from p_device then raise exception 'Wrong activation device'; end if;
 if r.settled_at is not null then return jsonb_build_object('reservation',to_jsonb(r),'wallet',public.game_time_state()); end if;
 if p_consumed is null or p_consumed<0 or p_consumed>r.reserved_ms then raise exception 'Invalid consumed time'; end if;
 -- Another device cannot invent a missing crash journal. It settles only the
 -- acknowledged checkpoint after the old authority's lease has expired.
 target:=case when p_recovery then r.consumed_ms else greatest(p_consumed,r.consumed_ms) end;
 if not p_final and r.lease_until<now() then raise exception 'Activation lease expired'; end if;
 delta:=target-r.consumed_ms;
 if target>0 then update public.game_runs set assisted=true where id=r.run_id; end if;
 for a in select * from public.game_time_allocations where reservation_id=p_id order by ordinal for update loop
  portion:=least(delta,a.reserved_ms-a.consumed_ms);
  if portion>0 then
   update public.game_time_allocations set consumed_ms=consumed_ms+portion where reservation_id=p_id and lot_id=a.lot_id;
   update public.game_credit_lots set held_ms=held_ms-portion,consumed_ms=consumed_ms+portion where id=a.lot_id;
   insert into public.game_time_ledger(user_id,event_key,kind,amount_ms,lot_id,reservation_id)
   values(uid,'consume:'||p_id||':'||target||':'||a.ordinal,'consume',portion,a.lot_id,p_id);
   delta:=delta-portion;
  end if;
 end loop;
 if p_final then
  for a in select * from public.game_time_allocations where reservation_id=p_id order by ordinal loop
   released:=a.reserved_ms-a.consumed_ms;
   if released>0 then
    update public.game_credit_lots set held_ms=held_ms-released,reversed_ms=reversed_ms+case when refunded_at is not null then released else 0 end where id=a.lot_id;
    insert into public.game_time_ledger(user_id,event_key,kind,amount_ms,lot_id,reservation_id,metadata)
    values(uid,'release:'||p_id||':'||a.ordinal,'release',released,a.lot_id,p_id,jsonb_build_object('recovery',p_recovery));
   end if;
  end loop;
  update public.game_time_reservations set consumed_ms=target,released_ms=reserved_ms-target,settled_at=now(),recovery=p_recovery where id=p_id returning * into r;
 else
  select exists(select 1 from public.game_time_allocations alloc join public.game_credit_lots credit on credit.id=alloc.lot_id where alloc.reservation_id=p_id and credit.refunded_at is not null) into invalid_credit;
  -- A refund revokes renewal. The already-issued short lease is not released
  -- onto another device while its old client could still be operating.
  update public.game_time_reservations set consumed_ms=target,lease_until=case when invalid_credit then lease_until else least(now()+interval '10 seconds',created_at+reserved_ms*interval '1 millisecond'+interval '10 seconds') end where id=p_id returning * into r;
 end if;
 return jsonb_build_object('reservation',to_jsonb(r),'wallet',public.game_time_state(),'authorizationValid',not coalesce(invalid_credit,false));
end $$;
commit;
