-- Apply through Supabase migrations. No credentials belong in this file.
begin;
create table public.game_catalog (
  version integer not null check (version=3),
  level bigint not null check (level between 1 and 9007199254740990),
  definition jsonb not null,
  canonical_layout text not null check (length(canonical_layout)=2704 and canonical_layout ~ '^[bwg.]+$'),
  layout_hash text not null check (layout_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key(version,level), unique(version,layout_hash)
);
create table public.game_players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  highest_unlocked bigint not null default 12 check (highest_unlocked between 12 and 9007199254740990),
  selected_level bigint not null default 1,
  starter_completed integer[] not null default '{}',
  imported_journey bigint not null default 13,
  created_at timestamptz not null default now()
);
create table public.game_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 3 check(version=3),
  level bigint not null check(level>0),
  best_score bigint not null check(best_score between 0 and 1000000000),
  best_seconds numeric not null check(best_seconds between 0 and 86400),
  peak_balls integer not null check(peak_balls between 1 and 768),
  play_mode text not null check(play_mode in ('play','watch')),
  clears integer not null default 1,
  source text not null default 'game' check(source in ('game','guest_import')),
  first_completed_at timestamptz not null default now(),
  last_completed_at timestamptz not null default now(),
  primary key(user_id,version,level)
);
create table public.game_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 3,
  level bigint not null,
  layout_hash text not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  finished_at timestamptz,
  foreign key(version,level) references public.game_catalog(version,level)
);
create index game_runs_user_started on public.game_runs(user_id,started_at desc);
create index game_completions_history on public.game_completions(user_id,version,level desc);
alter table public.game_catalog enable row level security;
alter table public.game_players enable row level security;
alter table public.game_completions enable row level security;
alter table public.game_runs enable row level security;
revoke all on public.game_catalog,public.game_players,public.game_completions,public.game_runs from anon,authenticated;
grant select on public.game_catalog,public.game_players,public.game_completions,public.game_runs to authenticated;
grant all on public.game_catalog,public.game_players,public.game_completions,public.game_runs to service_role;
create policy own_player on public.game_players for select to authenticated using(user_id=(select auth.uid()));
create policy own_completions on public.game_completions for select to authenticated using(user_id=(select auth.uid()));
create policy own_runs on public.game_runs for select to authenticated using(user_id=(select auth.uid()));
create policy available_catalog on public.game_catalog for select to authenticated using(level<=12 or level<=coalesce((select highest_unlocked from public.game_players where user_id=(select auth.uid())),12));

create function public.game_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p public.game_players; recent jsonb; total bigint;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into public.game_players(user_id) values(uid) on conflict do nothing;
  select * into p from public.game_players where user_id=uid;
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into recent from (select level,best_score,best_seconds,peak_balls,play_mode,clears,source,last_completed_at from public.game_completions where user_id=uid and version=3 order by level desc limit 128)t;
  select coalesce(max(best_score),0) into total from public.game_completions where user_id=uid and version=3;
  return jsonb_build_object('starter_completed',p.starter_completed,'highest_unlocked',p.highest_unlocked,'selected_level',p.selected_level,'best_score',total,'recent',recent);
end $$;

create function public.game_publish_level(p_level bigint,p_definition jsonb,p_canonical text,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.game_catalog;
begin
  perform pg_advisory_xact_lock(hashtextextended('brick-breaker-v3:'||p_level,0));
  select * into result from public.game_catalog where version=3 and level=p_level;
  if found then return jsonb_build_object('definition',result.definition,'layout_hash',result.layout_hash); end if;
  if (p_definition->>'version') is distinct from '3' or (p_definition->>'level')::bigint is distinct from p_level or length(p_definition->>'layout') is distinct from 2704 or p_hash is distinct from encode(sha256(convert_to(p_canonical,'UTF8')),'hex') then raise exception 'Invalid catalog definition'; end if;
  insert into public.game_catalog(version,level,definition,canonical_layout,layout_hash) values(3,p_level,p_definition,p_canonical,p_hash) returning * into result;
  return jsonb_build_object('definition',result.definition,'layout_hash',result.layout_hash);
end $$;

create function public.game_start(p_level bigint,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p public.game_players; catalog public.game_catalog; old public.game_runs;
begin
  if uid is null then raise exception 'Authentication required'; end if;
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

create function public.game_complete(p_run_id uuid,p_hash text,p_score bigint,p_seconds numeric,p_peak integer,p_mode text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.game_runs; p public.game_players; d public.game_catalog; starters integer[]; expected_score bigint; next_stage bigint;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into p from public.game_players where user_id=uid for update;
  select * into r from public.game_runs where id=p_run_id and user_id=uid for update;
  if not found then raise exception 'Unknown run'; end if;
  if r.finished_at is not null then return public.game_state(); end if;
  if r.expires_at<now() then raise exception 'This offline attempt expired. Replay the stage to save it online.'; end if;
  if r.layout_hash<>p_hash then raise exception 'Stage version differs. Reconnect and replay this stage.'; end if;
  if extract(epoch from now()-r.started_at)<1 then raise exception 'Attempt is too short'; end if;
  if r.level>greatest(12,p.highest_unlocked) then raise exception 'Stage is locked'; end if;
  if p_seconds is null or p_peak is null or p_score is null or p_mode is null or p_seconds<0 or p_seconds>86400 or p_seconds>extract(epoch from now()-r.started_at)*5+60 or p_peak<1 or p_peak>768 or p_mode not in ('play','watch') then raise exception 'Invalid completion statistics'; end if;
  select * into d from public.game_catalog where version=r.version and level=r.level;
  expected_score:=(length(d.definition->>'layout')-length(replace(replace(d.definition->>'layout','b',''),'g','')))*10+1000;
  if p_score<>expected_score then raise exception 'Invalid stage score'; end if;
  insert into public.game_completions(user_id,version,level,best_score,best_seconds,peak_balls,play_mode)
    values(uid,3,r.level,p_score,p_seconds,p_peak,p_mode)
    on conflict(user_id,version,level) do update set best_score=greatest(public.game_completions.best_score,excluded.best_score),best_seconds=least(public.game_completions.best_seconds,excluded.best_seconds),peak_balls=greatest(public.game_completions.peak_balls,excluded.peak_balls),clears=public.game_completions.clears+1,last_completed_at=now(),play_mode=excluded.play_mode,source='game';
  starters:=p.starter_completed;
  if r.level<=12 and not r.level::integer=any(starters) then starters:=array_append(starters,r.level::integer); end if;
  next_stage:=p.highest_unlocked;
  if cardinality(starters)=12 and next_stage=12 then next_stage:=13;
  elsif r.level>=13 and r.level=next_stage then next_stage:=next_stage+1; end if;
  update public.game_players set highest_unlocked=next_stage,starter_completed=starters,selected_level=case when cardinality(starters)=12 then next_stage else (select n from generate_series(1,12)n where not n=any(starters) order by n limit 1) end where user_id=uid;
  update public.game_runs set finished_at=now() where id=r.id;
  return public.game_state();
end $$;

-- Guest history is explicitly a private, client-reported import, not a verified
-- ranking. There are no leaderboards, rewards, currency or competitive claims.
create function public.game_import_progress(p_starters integer[],p_journey_next bigint,p_records jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p public.game_players; starters integer[]; item jsonb; lev bigint;
begin
  if uid is null then raise exception 'Authentication required'; end if;
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

revoke all on function public.game_state(),public.game_start(bigint,uuid),public.game_complete(uuid,text,bigint,numeric,integer,text),public.game_import_progress(integer[],bigint,jsonb),public.game_publish_level(bigint,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.game_state(),public.game_start(bigint,uuid),public.game_complete(uuid,text,bigint,numeric,integer,text),public.game_import_progress(integer[],bigint,jsonb) to authenticated;
grant execute on function public.game_publish_level(bigint,jsonb,text,text) to service_role;
commit;
