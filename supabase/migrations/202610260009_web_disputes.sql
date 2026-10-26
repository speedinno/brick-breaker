-- Dispute facts are independently read from Razorpay. Open/review cases do
-- not confiscate funds. Confirmed losses revoke only their original lot;
-- a later-phase win restores only its unspent remainder, never consumed time.
begin;
alter table public.game_credit_lots add column refund_base_ms bigint not null default 0 check(refund_base_ms>=0 and refund_base_ms<=granted_ms);
alter table public.game_credit_lots add column chargeback_target_ms bigint not null default 0 check(chargeback_target_ms>=0 and chargeback_target_ms<=granted_ms);
alter table public.game_credit_lots add column reversal_revision bigint not null default 0 check(reversal_revision>=0);
update public.game_credit_lots set refund_base_ms=refund_target_ms;
-- refund_target_ms remains the effective reversal target used by existing
-- reservations/lease invalidation. Its components are now kept separately.
alter table public.game_time_ledger drop constraint game_time_ledger_kind_check;
alter table public.game_time_ledger add constraint game_time_ledger_kind_check check(kind in ('grant','reserve','consume','release','refund','reversal_restore'));
create function public.game_adjust_credit_reversal(p_lot uuid,p_refund bigint,p_chargeback bigint,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare lot public.game_credit_lots; base bigint; target bigint; reversed bigint; delta bigint; restoring boolean;
begin
 select * into lot from public.game_credit_lots where id=p_lot;if not found then raise exception 'Unknown credit';end if;
 perform 1 from public.game_wallets where user_id=lot.user_id for update;
 select * into lot from public.game_credit_lots where id=p_lot for update;
 if p_refund is null or p_chargeback is null or p_refund<0 or p_refund>lot.granted_ms or p_chargeback<0 or p_chargeback>lot.granted_ms or p_reason is null or length(p_reason) not between 1 and 100 then raise exception 'Invalid reversal quantity';end if;
 base:=greatest(lot.refund_base_ms,p_refund);target:=least(lot.granted_ms,base+p_chargeback);
 reversed:=least(target,lot.granted_ms-lot.consumed_ms-lot.held_ms);delta:=reversed-lot.reversed_ms;
 restoring:=target<lot.refund_target_ms or delta<0;
 if base<>lot.refund_base_ms or p_chargeback<>lot.chargeback_target_ms or target<>lot.refund_target_ms or delta<>0 then
  update public.game_credit_lots set refund_base_ms=base,chargeback_target_ms=p_chargeback,refund_target_ms=target,reversed_ms=reversed,reversal_revision=reversal_revision+1,refunded_at=case when base>0 then coalesce(refunded_at,now()) else refunded_at end where id=p_lot returning * into lot;
  insert into public.game_time_ledger(user_id,event_key,kind,amount_ms,lot_id,metadata)
  values(lot.user_id,'reversal:'||p_lot||':'||lot.reversal_revision,case when restoring then 'reversal_restore' else 'refund' end,abs(delta),p_lot,jsonb_build_object('reason',p_reason,'refundBaseMs',base,'chargebackTargetMs',p_chargeback,'effectiveTargetMs',target,'consumedRevokedMs',greatest(target-reversed-lot.held_ms,0)));
 end if;
 return jsonb_build_object('reversedMs',lot.reversed_ms,'consumedRefundedMs',greatest(base-lot.reversed_ms-lot.held_ms,0),'consumedRevokedMs',greatest(target-lot.reversed_ms-lot.held_ms,0));
end $$;
create or replace function public.game_reverse_credit_partial(p_lot uuid,p_target bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare chargeback bigint; uid uuid;
begin
 select user_id into uid from public.game_credit_lots where id=p_lot;if not found then raise exception 'Unknown credit';end if;
 perform 1 from public.game_wallets where user_id=uid for update;
 select chargeback_target_ms into chargeback from public.game_credit_lots where id=p_lot for update;
 return public.game_adjust_credit_reversal(p_lot,p_target,chargeback,'verified-refund');
end $$;
alter table public.game_web_orders add column chargeback_amount bigint not null default 0 check(chargeback_amount>=0 and chargeback_amount<=amount);
alter table public.game_purchases drop constraint game_purchases_state_check;
alter table public.game_purchases add constraint game_purchases_state_check check(state in ('owned','partially_refunded','refunded','charged_back'));
create table public.game_web_disputes (
 scope text not null,environment text not null,dispute_id text not null check(dispute_id ~ '^disp_[A-Za-z0-9]{1,80}$'),
 order_id uuid not null references public.game_web_orders(id),payment_id text not null check(payment_id ~ '^pay_[A-Za-z0-9]{1,80}$'),
 amount bigint not null check(amount between 1 and 100000000),currency text not null check(currency='INR'),
 status text not null check(status in ('open','under_review','won','lost','closed')),
 phase text not null check(phase in ('fraud','retrieval','chargeback','pre_arbitration','arbitration')),
 amount_deducted bigint not null check(amount_deducted between 0 and amount),
 effective_deducted bigint not null default 0 check(effective_deducted between 0 and 100000000),
 needs_review boolean not null default false,review_phase integer,revision bigint not null default 0 check(revision>=0),created_at timestamptz not null,checked_at timestamptz not null default now(),
 primary key(scope,environment,dispute_id)
);
create index game_dispute_order on public.game_web_disputes(order_id);
create table public.game_web_dispute_checks (
 id bigint generated always as identity primary key,
 scope text not null,environment text not null,dispute_id text not null,
 phase text not null,status text not null,amount bigint not null,amount_deducted bigint not null,
 first_decision text not null check(first_decision in ('applied','stale','review')),
 last_decision text not null check(last_decision in ('applied','stale','review')),
 deliveries bigint not null default 1,first_checked_at timestamptz not null default now(),last_checked_at timestamptz not null default now(),
 reviewed boolean not null default false,
 foreign key(scope,environment,dispute_id) references public.game_web_disputes(scope,environment,dispute_id),
 constraint game_web_dispute_fact unique(scope,environment,dispute_id,phase,status,amount,amount_deducted)
);
create function public.game_reconcile_web_reversals(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.game_web_orders; receipt public.game_purchases; chargeback bigint; base bigint; target bigint;
begin
 select * into item from public.game_web_orders where id=p_id for update;if not found then raise exception 'Unknown checkout';end if;
 select least(item.amount,coalesce(sum(effective_deducted),0)) into chargeback from public.game_web_disputes where order_id=p_id;
 base:=floor(item.milliseconds::numeric*item.refunded_amount/item.amount)::bigint;
 target:=floor(item.milliseconds::numeric*least(item.amount,item.refunded_amount+chargeback)/item.amount)::bigint;
 select * into receipt from public.game_purchases where id=item.purchase_id for update;
 if found then
  if receipt.lot_id is not null then perform public.game_adjust_credit_reversal(receipt.lot_id,base,target-base,'verified-web-payment');end if;
  update public.game_purchases set state=case when item.refunded_amount=item.amount then 'refunded' when chargeback>0 then 'charged_back' when item.refunded_amount>0 then 'partially_refunded' else 'owned' end where id=receipt.id returning * into receipt;
 end if;
 update public.game_web_orders set chargeback_amount=chargeback where id=p_id;
 return jsonb_build_object('state',case when item.owner_user_id is null then 'account-deleted' when receipt.id is null then 'pending' else receipt.state end,'purchaseId',receipt.id,'milliseconds',item.milliseconds,'refundedMs',base,'chargebackMs',target-base,'revokedMs',target,'disputeReview',exists(select 1 from public.game_web_disputes where order_id=p_id and needs_review));
end $$;
-- The old capture verifier remains private. One RPC transaction applies the
-- payment and every already-known dispute before any balance becomes visible.
alter function public.game_apply_web_payment(uuid,text,text,bigint,text,bigint,timestamptz,bigint,bigint) rename to game_apply_web_payment_base;
revoke all on function public.game_apply_web_payment_base(uuid,text,text,bigint,text,bigint,timestamptz,bigint,bigint) from public,anon,authenticated,service_role;
create function public.game_apply_web_payment(p_id uuid,p_order text,p_payment text,p_amount bigint,p_currency text,p_refunded bigint,p_purchased_at timestamptz,p_fee bigint default null,p_tax bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.game_apply_web_payment_base(p_id,p_order,p_payment,p_amount,p_currency,p_refunded,p_purchased_at,p_fee,p_tax);
 return public.game_reconcile_web_reversals(p_id);
end $$;
create function public.game_record_web_dispute(p_id uuid,p_order text,p_dispute jsonb,p_payment jsonb,p_allow_correction boolean default false,p_expected_revision bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
<<verification>>
declare item public.game_web_orders; previous public.game_web_disputes; uid uuid; phase text; status text; did text; payment text; amount bigint; deducted bigint; created timestamptz; nr integer; old_rank integer; ns integer; old_status integer; decision text:='applied'; effective bigint; review boolean;
begin
 select owner_user_id into uid from public.game_web_orders where id=p_id;
 if uid is not null then perform 1 from auth.users where id=uid for key share;if found then perform 1 from public.game_wallets where user_id=uid for update;end if;end if;
 select * into item from public.game_web_orders where id=p_id for update;
 if not found or item.order_id is distinct from p_order or p_dispute is null or jsonb_typeof(p_dispute)<>'object' or p_payment is null or jsonb_typeof(p_payment)<>'object' then raise exception 'Invalid dispute verification';end if;
 did:=p_dispute->>'id';payment:=p_dispute->>'paymentId';phase:=p_dispute->>'phase';status:=p_dispute->>'status';amount:=(p_dispute->>'amount')::bigint;deducted:=(p_dispute->>'deducted')::bigint;created:=(p_dispute->>'createdAt')::timestamptz;
 nr:=array_position(array['fraud','retrieval','chargeback','pre_arbitration','arbitration'],phase);ns:=case status when 'open' then 0 when 'under_review' then 1 when 'won' then 2 when 'lost' then 2 when 'closed' then 2 end;
 if did is null or did !~ '^disp_[A-Za-z0-9]{1,80}$' or payment is null or payment !~ '^pay_[A-Za-z0-9]{1,80}$' or payment is distinct from p_payment->>'payment' or item.payment_id is not null and item.payment_id<>payment or amount is null or amount not between 1 and item.amount or p_dispute->>'currency' is distinct from item.currency or deducted is null or deducted not between 0 and amount or status<>'lost' and deducted<>0 or nr is null or ns is null or created is null or created<item.created_at-interval '5 minutes' or created>now()+interval '5 minutes' or (p_payment->>'amount')::bigint is distinct from item.amount or p_payment->>'currency' is distinct from item.currency or p_payment->>'state' is null or p_payment->>'state' not in ('captured','pending','failed') then raise exception 'Invalid dispute verification';end if;
 select * into previous from public.game_web_disputes where scope=item.scope and environment=item.environment and dispute_id=did for update;
 if coalesce(p_allow_correction,false) and (previous.dispute_id is null or p_expected_revision is null or previous.revision<>p_expected_revision) then raise exception 'Reviewed dispute changed; inspect again';end if;
 if not found then
  insert into public.game_web_disputes(scope,environment,dispute_id,order_id,payment_id,amount,currency,status,phase,amount_deducted,created_at)
  values(item.scope,item.environment,did,p_id,payment,amount,item.currency,status,phase,deducted,created) returning * into previous;
 elsif previous.order_id<>p_id or previous.payment_id<>payment or previous.currency<>item.currency or previous.created_at<>created then raise exception 'Dispute identity conflict';end if;
 old_rank:=array_position(array['fraud','retrieval','chargeback','pre_arbitration','arbitration'],previous.phase);old_status:=case previous.status when 'open' then 0 when 'under_review' then 1 else 2 end;
 if nr<old_rank or nr=old_rank and ns<old_status then decision:='stale';
 elsif nr=old_rank and old_status=2 and (status<>previous.status or deducted<previous.amount_deducted) and not coalesce(p_allow_correction,false) then
  decision:='review';update public.game_web_disputes set needs_review=true,review_phase=coalesce(review_phase,old_rank),revision=revision+case when needs_review then 0 else 1 end,checked_at=now() where scope=item.scope and environment=item.environment and dispute_id=did;
 else
  effective:=case when status='lost' then deducted when status in ('won','closed') then 0 else previous.effective_deducted end;
  review:=previous.needs_review and not(coalesce(p_allow_correction,false) or ns=2 and nr>coalesce(previous.review_phase,nr));
  update public.game_web_disputes set amount=verification.amount,status=verification.status,phase=verification.phase,amount_deducted=deducted,effective_deducted=effective,needs_review=review,review_phase=case when review then review_phase else null end,revision=revision+case when (previous.amount,previous.status,previous.phase,previous.amount_deducted,previous.effective_deducted,previous.needs_review) is distinct from (verification.amount,verification.status,verification.phase,deducted,effective,review) then 1 else 0 end,checked_at=now() where scope=item.scope and environment=item.environment and dispute_id=did;
 end if;
 insert into public.game_web_dispute_checks(scope,environment,dispute_id,phase,status,amount,amount_deducted,first_decision,last_decision,reviewed)
 values(item.scope,item.environment,did,phase,status,amount,deducted,decision,decision,coalesce(p_allow_correction,false))
 on conflict on constraint game_web_dispute_fact do update set deliveries=public.game_web_dispute_checks.deliveries+1,last_decision=excluded.last_decision,reviewed=public.game_web_dispute_checks.reviewed or excluded.reviewed,last_checked_at=now();
 if p_payment->>'state'='captured' then
  perform public.game_apply_web_payment(p_id,p_order,payment,item.amount,item.currency,(p_payment->>'refunded')::bigint,(p_payment->>'purchasedAt')::timestamptz,(p_payment->>'fee')::bigint,(p_payment->>'tax')::bigint);
 end if;
 return public.game_reconcile_web_reversals(p_id)||jsonb_build_object('decision',decision);
end $$;

-- Preserve the ordered snapshot and the cumulative refund calculation. The
-- new metrics distinguish actual refunded and chargeback-consumed value.
create or replace function public.game_time_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb; pending jsonb; cfg jsonb; day date:=(now() at time zone 'UTC')::date; claims integer; version bigint;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 insert into public.game_wallets(user_id) values(uid) on conflict do nothing;
 update public.game_wallets set snapshot_version=snapshot_version+1 where user_id=uid returning snapshot_version into version;
 if version is null then raise exception 'Wallet unavailable';end if;
 cfg:=public.game_current_economy();if cfg is null then raise exception 'Economy configuration unavailable';end if;
 select count(*) into claims from public.game_manual_claims where user_id=uid and eligibility_day=day;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'deviceId',device_id,'runId',run_id,'reservedMs',reserved_ms,'consumedMs',consumed_ms,'leaseUntil',lease_until,'createdAt',created_at)),'[]') into pending from public.game_time_reservations where user_id=uid and settled_at is null;
 select jsonb_build_object('accountId',uid,'snapshotVersion',version::text,
 'availableMs',coalesce(sum(granted_ms-consumed_ms-held_ms-reversed_ms),0),'reservedMs',coalesce(sum(held_ms),0),
 'refundedConsumedMs',coalesce(sum(greatest(refund_base_ms-reversed_ms-held_ms,0)),0),
 'chargebackConsumedMs',coalesce(sum(greatest(refund_target_ms-reversed_ms-held_ms,0)-greatest(refund_base_ms-reversed_ms-held_ms,0)),0),
 'revokedConsumedMs',coalesce(sum(greatest(refund_target_ms-reversed_ms-held_ms,0)),0),
 'pending',pending,'serverNow',now(),'config',cfg,'manualRewardsToday',claims,'manualRewardsRemaining',greatest(0,(cfg->>'manualPerDay')::integer-claims),'nextReset',((day+1)::timestamp at time zone 'UTC'),'introClaimed',exists(select 1 from public.game_intro_claims where user_id=uid)) into result from public.game_credit_lots where user_id=uid;
 return result;
end $$;
alter table public.game_web_disputes enable row level security;
alter table public.game_web_dispute_checks enable row level security;
revoke all on public.game_web_disputes,public.game_web_dispute_checks from public,anon,authenticated;
grant all on public.game_web_disputes,public.game_web_dispute_checks to service_role;
grant usage,select on sequence public.game_web_dispute_checks_id_seq to service_role;
revoke all on function public.game_adjust_credit_reversal(uuid,bigint,bigint,text),public.game_reconcile_web_reversals(uuid),public.game_record_web_dispute(uuid,text,jsonb,jsonb,boolean,bigint),public.game_apply_web_payment(uuid,text,text,bigint,text,bigint,timestamptz,bigint,bigint) from public,anon,authenticated;
-- Reconciliation is callable only through the wallet-locking outer functions.
revoke all on function public.game_reconcile_web_reversals(uuid) from service_role;
grant execute on function public.game_adjust_credit_reversal(uuid,bigint,bigint,text),public.game_record_web_dispute(uuid,text,jsonb,jsonb,boolean,bigint),public.game_apply_web_payment(uuid,text,text,bigint,text,bigint,timestamptz,bigint,bigint) to service_role;
commit;
