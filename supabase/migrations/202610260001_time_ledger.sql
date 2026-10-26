-- Account-owned seconds. This migration does not enable ads or checkout.
-- Provider verification must precede service-role grants; players cannot mint.
begin;
create table public.game_wallets (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table public.game_credit_lots (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.game_wallets(user_id) on delete cascade,
 source text not null check(source in ('intro','manual','rewarded','purchase','migration')),
 source_key text not null check(length(source_key) between 1 and 240),
 platform text not null check(platform in ('android','ios','web','server')),
 config_version text not null check(length(config_version) between 1 and 80),
 granted_ms bigint not null check(granted_ms between 1 and 9000000000000),
 consumed_ms bigint not null default 0 check(consumed_ms>=0),
 held_ms bigint not null default 0 check(held_ms>=0),
 reversed_ms bigint not null default 0 check(reversed_ms>=0),
 refunded_at timestamptz,
 created_at timestamptz not null default now(),
 unique(source,source_key),
 check(consumed_ms+held_ms+reversed_ms<=granted_ms)
);
alter table public.game_runs add column assisted boolean not null default false;
create table public.game_time_reservations (
 id uuid primary key,
 user_id uuid not null references public.game_wallets(user_id) on delete cascade,
 device_id uuid not null,
 run_id uuid not null references public.game_runs(id) on delete cascade,
 reserved_ms bigint not null check(reserved_ms between 1 and 30000),
 consumed_ms bigint not null default 0 check(consumed_ms>=0),
 released_ms bigint not null default 0 check(released_ms>=0),
 config_version text not null,
 created_at timestamptz not null default now(),
 lease_until timestamptz not null,
 settled_at timestamptz,
 recovery boolean not null default false,
 check(consumed_ms+released_ms<=reserved_ms),
 check(settled_at is null or consumed_ms+released_ms=reserved_ms)
);
create unique index game_one_active_spender on public.game_time_reservations(user_id) where settled_at is null;
create table public.game_time_allocations (
 reservation_id uuid not null references public.game_time_reservations(id) on delete cascade,
 lot_id uuid not null references public.game_credit_lots(id) on delete cascade,
 ordinal integer not null,
 reserved_ms bigint not null check(reserved_ms>0),
 consumed_ms bigint not null default 0 check(consumed_ms>=0 and consumed_ms<=reserved_ms),
 primary key(reservation_id,lot_id), unique(reservation_id,ordinal)
);
create table public.game_time_ledger (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.game_wallets(user_id) on delete cascade,
 event_key text not null,
 kind text not null check(kind in ('grant','reserve','consume','release','refund')),
 amount_ms bigint not null check(amount_ms>=0),
 lot_id uuid references public.game_credit_lots(id) on delete cascade,
 reservation_id uuid references public.game_time_reservations(id) on delete cascade,
 metadata jsonb not null default '{}',
 created_at timestamptz not null default now(),
 unique(user_id,event_key)
);
create index game_credit_owner on public.game_credit_lots(user_id,created_at,id);
create index game_time_owner on public.game_time_ledger(user_id,id);

alter table public.game_wallets enable row level security;
alter table public.game_credit_lots enable row level security;
alter table public.game_time_reservations enable row level security;
alter table public.game_time_allocations enable row level security;
alter table public.game_time_ledger enable row level security;
revoke all on public.game_wallets,public.game_credit_lots,public.game_time_reservations,public.game_time_allocations,public.game_time_ledger from public,anon,authenticated;
grant select on public.game_wallets,public.game_credit_lots,public.game_time_reservations,public.game_time_ledger to authenticated;
grant all on public.game_wallets,public.game_credit_lots,public.game_time_reservations,public.game_time_allocations,public.game_time_ledger to service_role;
grant usage,select on sequence public.game_time_ledger_id_seq to service_role;
create policy own_wallet on public.game_wallets for select to authenticated using(user_id=(select auth.uid()));
create policy own_credit on public.game_credit_lots for select to authenticated using(user_id=(select auth.uid()));
create policy own_reservations on public.game_time_reservations for select to authenticated using(user_id=(select auth.uid()));
create policy own_ledger on public.game_time_ledger for select to authenticated using(user_id=(select auth.uid()));

create function public.game_time_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb; pending jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 insert into public.game_wallets(user_id) values(uid) on conflict do nothing;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'deviceId',device_id,'runId',run_id,'reservedMs',reserved_ms,'consumedMs',consumed_ms,'leaseUntil',lease_until,'createdAt',created_at)),'[]')
 into pending from public.game_time_reservations where user_id=uid and settled_at is null;
 select jsonb_build_object(
  'availableMs',coalesce(sum(granted_ms-consumed_ms-held_ms-reversed_ms),0),
  'reservedMs',coalesce(sum(held_ms),0),
  'refundedConsumedMs',coalesce(sum(consumed_ms) filter(where refunded_at is not null),0),
  'pending',pending,'serverNow',now()) into result
 from public.game_credit_lots where user_id=uid;
 return result;
end $$;

-- Private primitive. Its source_key must come from a verified transaction or
-- a bounded server reward rule, never a client-generated success callback.
create function public.game_credit_verified(p_user uuid,p_source text,p_key text,p_ms bigint,p_platform text,p_config text)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.game_credit_lots; result uuid;
begin
 insert into public.game_wallets(user_id) values(p_user) on conflict do nothing;
 perform 1 from public.game_wallets where user_id=p_user for update;
 select * into existing from public.game_credit_lots where source=p_source and source_key=p_key;
 if found then
  if existing.user_id<>p_user or existing.granted_ms<>p_ms or existing.platform<>p_platform or existing.config_version<>p_config then raise exception 'Credit identity conflict'; end if;
  return existing.id;
 end if;
 insert into public.game_credit_lots(user_id,source,source_key,granted_ms,platform,config_version)
 values(p_user,p_source,p_key,p_ms,p_platform,p_config) returning id into result;
 insert into public.game_time_ledger(user_id,event_key,kind,amount_ms,lot_id,metadata)
 values(p_user,'grant:'||result,'grant',p_ms,result,jsonb_build_object('source',p_source,'sourceKey',p_key,'platform',p_platform,'configVersion',p_config));
 return result;
end $$;

create function public.game_reserve_time(p_id uuid,p_device uuid,p_run uuid,p_ms bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.game_time_reservations; lot public.game_credit_lots; balance bigint; remaining bigint:=p_ms; portion bigint; n integer:=0;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_id is null or p_device is null or p_run is null or p_ms is null or p_ms<1 or p_ms>30000 then raise exception 'Invalid time reservation'; end if;
 insert into public.game_wallets(user_id) values(uid) on conflict do nothing;
 perform 1 from public.game_wallets where user_id=uid for update;
 select * into r from public.game_time_reservations where id=p_id;
 if found then
  if r.user_id<>uid or r.device_id<>p_device or r.run_id<>p_run or r.reserved_ms<>p_ms then raise exception 'Reservation identity conflict'; end if;
  return jsonb_build_object('reservation',to_jsonb(r),'wallet',public.game_time_state());
 end if;
 if exists(select 1 from public.game_time_reservations where user_id=uid and settled_at is null) then raise exception 'Recover or finish the existing activation first'; end if;
 -- The same run marker is sticky even if the client later claims manual mode.
 perform 1 from public.game_runs where id=p_run and user_id=uid and finished_at is null and expires_at>now() for update;
 if not found then raise exception 'Active run required'; end if;
 select coalesce(sum(granted_ms-consumed_ms-held_ms-reversed_ms),0) into balance from public.game_credit_lots where user_id=uid;
 if balance<p_ms then raise exception 'Not enough autoplay time'; end if;
 insert into public.game_time_reservations(id,user_id,device_id,run_id,reserved_ms,config_version,lease_until)
 values(p_id,uid,p_device,p_run,p_ms,'2026-10-v1',least(now()+interval '10 seconds',now()+p_ms*interval '1 millisecond'+interval '10 seconds')) returning * into r;
 for lot in select * from public.game_credit_lots where user_id=uid and refunded_at is null and granted_ms>consumed_ms+held_ms+reversed_ms order by created_at,id for update loop
  portion:=least(remaining,lot.granted_ms-lot.consumed_ms-lot.held_ms-lot.reversed_ms);n:=n+1;
  update public.game_credit_lots set held_ms=held_ms+portion where id=lot.id;
  insert into public.game_time_allocations(reservation_id,lot_id,ordinal,reserved_ms) values(p_id,lot.id,n,portion);
  remaining:=remaining-portion;exit when remaining=0;
 end loop;
 if remaining<>0 then raise exception 'Not enough autoplay time'; end if;
 update public.game_runs set assisted=true where id=p_run;
 insert into public.game_time_ledger(user_id,event_key,kind,amount_ms,reservation_id) values(uid,'reserve:'||p_id,'reserve',p_ms,p_id);
 return jsonb_build_object('reservation',to_jsonb(r),'wallet',public.game_time_state());
end $$;

-- Private settlement primitive called only by auth-bound public wrappers.
create function public.game_apply_time(p_id uuid,p_device uuid,p_consumed bigint,p_final boolean,p_recovery boolean default false)
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
create function public.game_checkpoint_time(p_id uuid,p_device uuid,p_consumed bigint) returns jsonb language sql security definer set search_path='' as $$select public.game_apply_time(p_id,p_device,p_consumed,false,false)$$;
create function public.game_settle_time(p_id uuid,p_device uuid,p_consumed bigint) returns jsonb language sql security definer set search_path='' as $$select public.game_apply_time(p_id,p_device,p_consumed,true,false)$$;
create function public.game_recover_time(p_id uuid) returns jsonb language sql security definer set search_path='' as $$select public.game_apply_time(p_id,null,0,true,true)$$;

-- Reversal consumes only this source's unused credit. Consumed refunded value
-- stays separately observable, never a negative balance or unrelated clawback.
create function public.game_reverse_credit(p_lot uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare lot public.game_credit_lots; amount bigint;
begin
 select * into lot from public.game_credit_lots where id=p_lot;
 if not found then raise exception 'Unknown credit'; end if;
 perform 1 from public.game_wallets where user_id=lot.user_id for update;
 select * into lot from public.game_credit_lots where id=p_lot for update;
 if lot.refunded_at is not null then return jsonb_build_object('reversedMs',lot.reversed_ms,'consumedRefundedMs',lot.consumed_ms); end if;
 amount:=lot.granted_ms-lot.consumed_ms-lot.held_ms-lot.reversed_ms;
 update public.game_credit_lots set reversed_ms=reversed_ms+amount,refunded_at=now() where id=p_lot;
 insert into public.game_time_ledger(user_id,event_key,kind,amount_ms,lot_id,metadata)
 values(lot.user_id,'refund:'||p_lot,'refund',amount,p_lot,jsonb_build_object('heldMs',lot.held_ms,'consumedRefundedMs',lot.consumed_ms));
 return jsonb_build_object('reversedMs',amount,'consumedRefundedMs',lot.consumed_ms);
end $$;

revoke all on function public.game_time_state(),public.game_credit_verified(uuid,text,text,bigint,text,text),public.game_reserve_time(uuid,uuid,uuid,bigint),public.game_apply_time(uuid,uuid,bigint,boolean,boolean),public.game_checkpoint_time(uuid,uuid,bigint),public.game_settle_time(uuid,uuid,bigint),public.game_recover_time(uuid),public.game_reverse_credit(uuid) from public,anon,authenticated;
grant execute on function public.game_time_state(),public.game_reserve_time(uuid,uuid,uuid,bigint),public.game_checkpoint_time(uuid,uuid,bigint),public.game_settle_time(uuid,uuid,bigint),public.game_recover_time(uuid) to authenticated;
grant execute on function public.game_credit_verified(uuid,text,text,bigint,text,text),public.game_reverse_credit(uuid) to service_role;
commit;
