begin;
alter table public.game_players
  add column catalog_window timestamptz not null default now(),
  add column catalog_requests integer not null default 0 check(catalog_requests>=0);

-- An imported personal frontier is not permission to spend unlimited CPU on
-- unpublished catalog layouts. Existing shared stages do not consume budget.
create function public.game_prepare_level(p_level bigint) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p public.game_players;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into public.game_players(user_id) values(uid) on conflict do nothing;
  select * into p from public.game_players where user_id=uid for update;
  if p_level is null or p_level<1 or p_level>greatest(12,p.highest_unlocked) then raise exception 'Stage is locked'; end if;
  if exists(select 1 from public.game_catalog where version=3 and level=p_level) then return; end if;
  if p.catalog_window<now()-interval '10 minutes' then p.catalog_window:=now(); p.catalog_requests:=0; end if;
  if p.catalog_requests>=120 then raise exception 'Too many new stages. Try again later.'; end if;
  update public.game_players set catalog_window=p.catalog_window,catalog_requests=p.catalog_requests+1 where user_id=uid;
end $$;
revoke all on function public.game_prepare_level(bigint) from public,anon,authenticated;
grant execute on function public.game_prepare_level(bigint) to authenticated;
commit;
