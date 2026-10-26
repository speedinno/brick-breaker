-- Serialize reads with the same per-account wallet lock used by writers.
-- A monotonic snapshot counter orders responses; request timestamps cannot,
-- because an earlier transaction may wait behind a later wallet mutation.
begin;
alter table public.game_wallets add column snapshot_version bigint not null default 0 check(snapshot_version>=0);
create or replace function public.game_time_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb; pending jsonb; cfg jsonb; day date:=(now() at time zone 'UTC')::date; claims integer; version bigint;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 insert into public.game_wallets(user_id) values(uid) on conflict do nothing;
 update public.game_wallets set snapshot_version=snapshot_version+1 where user_id=uid returning snapshot_version into version;
 if version is null then raise exception 'Wallet unavailable';end if;
 cfg:=public.game_current_economy();
 if cfg is null then raise exception 'Economy configuration unavailable'; end if;
 select count(*) into claims from public.game_manual_claims where user_id=uid and eligibility_day=day;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'deviceId',device_id,'runId',run_id,'reservedMs',reserved_ms,'consumedMs',consumed_ms,'leaseUntil',lease_until,'createdAt',created_at)),'[]')
 into pending from public.game_time_reservations where user_id=uid and settled_at is null;
 select jsonb_build_object(
  'accountId',uid,'snapshotVersion',version::text,
  'availableMs',coalesce(sum(granted_ms-consumed_ms-held_ms-reversed_ms),0),
  'reservedMs',coalesce(sum(held_ms),0),
  'refundedConsumedMs',coalesce(sum(greatest(refund_target_ms-reversed_ms-held_ms,0)),0),
  'pending',pending,'serverNow',now(),'config',cfg,
  'manualRewardsToday',claims,'manualRewardsRemaining',greatest(0,(cfg->>'manualPerDay')::integer-claims),
  'nextReset',((day+1)::timestamp at time zone 'UTC'),
  'introClaimed',exists(select 1 from public.game_intro_claims where user_id=uid)) into result
 from public.game_credit_lots where user_id=uid;
 return result;
end $$;
commit;
