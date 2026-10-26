-- Cumulative partial refunds revoke only their source lot. A refund during a
-- reservation revokes renewal, preserves the short issued lease, and reconciles
-- held time before exposing it again. Remaining valid purchased time is usable.
begin;
alter table public.game_credit_lots add column refund_target_ms bigint not null default 0 check(refund_target_ms>=0 and refund_target_ms<=granted_ms);
update public.game_credit_lots set refund_target_ms=granted_ms where refunded_at is not null;
alter table public.game_time_allocations add column refund_checkpoint_ms bigint not null default 0 check(refund_checkpoint_ms>=0);
create function public.game_reverse_credit_partial(p_lot uuid,p_target bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare lot public.game_credit_lots; amount bigint; target bigint;
begin
 select * into lot from public.game_credit_lots where id=p_lot;
 if not found then raise exception 'Unknown credit';end if;
 perform 1 from public.game_wallets where user_id=lot.user_id for update;
 select * into lot from public.game_credit_lots where id=p_lot for update;
 if p_target is null or p_target<0 or p_target>lot.granted_ms then raise exception 'Invalid refund quantity';end if;
 target:=greatest(p_target,lot.refund_target_ms);
 if target=lot.refund_target_ms then return jsonb_build_object('reversedMs',lot.reversed_ms,'consumedRefundedMs',greatest(target-lot.reversed_ms-lot.held_ms,0));end if;
 amount:=least(greatest(target-lot.reversed_ms,0),lot.granted_ms-lot.consumed_ms-lot.held_ms-lot.reversed_ms);
 update public.game_credit_lots set reversed_ms=reversed_ms+amount,refund_target_ms=target,refunded_at=coalesce(refunded_at,now()) where id=p_lot returning * into lot;
 insert into public.game_time_ledger(user_id,event_key,kind,amount_ms,lot_id,metadata)
 values(lot.user_id,'refund:'||p_lot||':'||target,'refund',amount,p_lot,jsonb_build_object('refundTargetMs',target,'heldMs',lot.held_ms,'consumedRefundedMs',greatest(target-lot.reversed_ms-lot.held_ms,0)));
 return jsonb_build_object('reversedMs',lot.reversed_ms,'consumedRefundedMs',greatest(target-lot.reversed_ms-lot.held_ms,0));
end $$;
create or replace function public.game_reverse_credit(p_lot uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare total bigint;
begin
 select granted_ms into total from public.game_credit_lots where id=p_lot;
 if total is null then raise exception 'Unknown credit';end if;
 return public.game_reverse_credit_partial(p_lot,total);
end $$;
revoke all on function public.game_reverse_credit_partial(uuid,bigint) from public,anon,authenticated;
grant execute on function public.game_reverse_credit_partial(uuid,bigint) to service_role;

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
  'refundedConsumedMs',coalesce(sum(greatest(refund_target_ms-reversed_ms-held_ms,0)),0),
  'pending',pending,'serverNow',now(),'config',cfg,
  'manualRewardsToday',claims,'manualRewardsRemaining',greatest(0,(cfg->>'manualPerDay')::integer-claims),
  'nextReset',((day+1)::timestamp at time zone 'UTC'),
  'introClaimed',exists(select 1 from public.game_intro_claims where user_id=uid)) into result
 from public.game_credit_lots where user_id=uid;
 return result;
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
 for lot in select * from public.game_credit_lots where user_id=uid and granted_ms>consumed_ms+held_ms+reversed_ms order by created_at,id for update loop
  portion:=least(remaining,lot.granted_ms-lot.consumed_ms-lot.held_ms-lot.reversed_ms);n:=n+1;
  update public.game_credit_lots set held_ms=held_ms+portion where id=lot.id;
  insert into public.game_time_allocations(reservation_id,lot_id,ordinal,reserved_ms,refund_checkpoint_ms) values(p_id,lot.id,n,portion,lot.refund_target_ms);
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
    update public.game_credit_lots set held_ms=held_ms-released,reversed_ms=reversed_ms+least(released,greatest(refund_target_ms-reversed_ms,0)) where id=a.lot_id;
    insert into public.game_time_ledger(user_id,event_key,kind,amount_ms,lot_id,reservation_id,metadata)
    values(uid,'release:'||p_id||':'||a.ordinal,'release',released,a.lot_id,p_id,jsonb_build_object('recovery',p_recovery));
   end if;
  end loop;
  update public.game_time_reservations set consumed_ms=target,released_ms=reserved_ms-target,settled_at=now(),recovery=p_recovery where id=p_id returning * into r;
 else
  select exists(select 1 from public.game_time_allocations alloc join public.game_credit_lots credit on credit.id=alloc.lot_id where alloc.reservation_id=p_id and credit.refund_target_ms>alloc.refund_checkpoint_ms) into invalid_credit;
  -- A refund revokes renewal. The already-issued short lease is not released
  -- onto another device while its old client could still be operating.
  update public.game_time_reservations set consumed_ms=target,lease_until=case when invalid_credit then lease_until else least(now()+interval '10 seconds',created_at+reserved_ms*interval '1 millisecond'+interval '10 seconds') end where id=p_id returning * into r;
 end if;
 return jsonb_build_object('reservation',to_jsonb(r),'wallet',public.game_time_state(),'authorizationValid',not coalesce(invalid_credit,false));
end $$;
commit;
