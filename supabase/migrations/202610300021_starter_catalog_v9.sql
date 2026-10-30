-- Preserve immutable v3-v8 boards and in-flight runs; new starter runs use v9.
begin;
alter table public.game_catalog drop constraint game_catalog_version_check;
alter table public.game_catalog add constraint game_catalog_version_check check (version in (3,4,5,6,7,8,9) and (version not in (4,5,6,7,8,9) or level<=12));
create or replace function public.game_publish_level(p_level bigint,p_definition jsonb,p_canonical text,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.game_catalog;
begin
  perform pg_advisory_xact_lock(hashtextextended('brick-breaker-v3:'||p_level,0));
  select * into result from public.game_catalog where version=(case when p_level<=12 then 9 else 3 end) and level=p_level;
  if found then return jsonb_build_object('definition',result.definition,'layout_hash',result.layout_hash); end if;
  if (p_definition->>'version') is distinct from (case when p_level<=12 then '9' else '3' end) or (p_definition->>'level')::bigint is distinct from p_level or length(p_definition->>'layout') is distinct from 2704 or p_hash is distinct from encode(sha256(convert_to(p_canonical,'UTF8')),'hex') then raise exception 'Invalid catalog definition'; end if;
  insert into public.game_catalog(version,level,definition,canonical_layout,layout_hash) values((case when p_level<=12 then 9 else 3 end),p_level,p_definition,p_canonical,p_hash) returning * into result;
  return jsonb_build_object('definition',result.definition,'layout_hash',result.layout_hash);
end $$;
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
  select * into catalog from public.game_catalog where version=(case when p_level<=12 then 9 else 3 end) and level=p_level;
  if not found then raise exception 'Stage is not ready'; end if;
  insert into public.game_runs(id,user_id,version,level,layout_hash) values(p_request_id,uid,catalog.version,p_level,catalog.layout_hash);
  update public.game_players set selected_level=p_level where user_id=uid;
  return jsonb_build_object('runId',p_request_id,'layout_hash',catalog.layout_hash,'expires_at',now()+interval '7 days');
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
  if exists(select 1 from public.game_catalog where version=(case when p_level<=12 then 9 else 3 end) and level=p_level) then return; end if;
  if p.catalog_window<now()-interval '10 minutes' then p.catalog_window:=now(); p.catalog_requests:=0; end if;
  if p.catalog_requests>=120 then raise exception 'Too many new stages. Try again later.'; end if;
  update public.game_players set catalog_window=p.catalog_window,catalog_requests=p.catalog_requests+1 where user_id=uid;
end $$;
commit;
