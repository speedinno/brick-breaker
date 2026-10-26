-- Voluntary rewarded opportunities reserve their original promise/day before
-- loading. Native grants require independently verified Google SSV; browser H5
-- uses its documented client SDK callback with explicitly bounded trust.
begin;
create table public.game_ad_placements (
 id text primary key check(id ~ '^[a-z0-9_-]{1,80}$'),
 provider text not null check(provider in ('admob','h5')),
 platform text not null check(platform in ('android','ios','web')),
 environment text not null check(environment in ('production','sandbox')),
 request_unit text not null check(length(request_unit) between 1 and 200),
 verification_unit text,
 reward_amount bigint,
 reward_item text,
 active boolean not null default false,
 check(provider='h5' and platform='web' or provider='admob' and platform in ('android','ios')),
 check(provider='h5' or verification_unit is not null and reward_amount between 1 and 1000000 and length(reward_item) between 1 and 200)
);
create function public.game_keep_ad_placement() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Reward placement versions are retained';end if;
 if (to_jsonb(new)-'active') is distinct from (to_jsonb(old)-'active') then raise exception 'Create a new reward placement version';end if;
 return new;
end $$;
create trigger keep_ad_placement before update or delete on public.game_ad_placements for each row execute function public.game_keep_ad_placement();
create table public.game_ad_offers (
 id uuid primary key,
 owner_user_id uuid references auth.users(id) on delete set null,
 deleted_at timestamptz,
 device_id uuid,
 check(owner_user_id is null or device_id is not null),
 placement_id text not null references public.game_ad_placements(id),
 provider text not null,
 platform text not null,
 environment text not null,
 eligibility_day date not null,
 config_version text not null,
 promised_ms bigint not null check(promised_ms between 1 and 60000),
 daily_cap integer not null check(daily_cap between 0 and 10),
 state text not null default 'prepared' check(state in ('prepared','showing','awaiting','earned','cancelled')),
 created_at timestamptz not null default now(),
 prepare_until timestamptz not null default now()+interval '10 minutes',
 show_requested_at timestamptz,
 earned_at timestamptz,
 transaction_id text,
 lot_id uuid references public.game_credit_lots(id) on delete set null
);
create index game_ad_day on public.game_ad_offers(owner_user_id,eligibility_day,state);
create unique index game_one_showing_ad on public.game_ad_offers(owner_user_id) where state='showing' and owner_user_id is not null;
create trigger ad_offer_tombstone before update on public.game_ad_offers for each row execute function public.game_purchase_tombstone();
create function public.game_detach_ad_device() returns trigger language plpgsql set search_path='' as $$
begin
 if new.owner_user_id is null then new.device_id:=null;end if;return new;
end $$;
create trigger ad_offer_detach_device before update of owner_user_id on public.game_ad_offers for each row execute function public.game_detach_ad_device();
create table public.game_ad_transactions (
 provider text not null check(provider in ('admob','h5')),
 environment text not null check(environment in ('production','sandbox')),
 transaction_id text not null check(length(transaction_id) between 1 and 240),
 offer_id uuid not null unique references public.game_ad_offers(id),
 verification_basis text not null check(verification_basis in ('google_ecdsa','client_sdk')),
 earned_at timestamptz not null,
 received_at timestamptz not null default now(),
 primary key(provider,environment,transaction_id)
);
create function public.game_ad_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); cfg jsonb; day date:=(now() at time zone 'UTC')::date; used integer; pending jsonb;
begin
 if uid is null then raise exception 'Authentication required';end if;
 perform 1 from auth.users where id=uid for key share;if not found then raise exception 'Authentication required';end if;
 cfg:=public.game_current_economy();
 select count(*) into used from public.game_ad_offers where owner_user_id=uid and eligibility_day=day and state in ('earned','showing','awaiting','prepared') and (state<>'prepared' or prepare_until>now());
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'state',state,'platform',platform,'provider',provider,'milliseconds',promised_ms,'day',eligibility_day,'prepareUntil',prepare_until,'deviceId',device_id) order by created_at),'[]') into pending from public.game_ad_offers where owner_user_id=uid and state in ('prepared','showing','awaiting');
 return jsonb_build_object('remaining',greatest(0,(cfg->>'rewardedPerDay')::integer-used),'limit',(cfg->>'rewardedPerDay')::integer,'milliseconds',(cfg->>'rewardedMs')::bigint,'pending',pending,'nextReset',((day+1)::timestamp at time zone 'UTC'),'wallet',public.game_time_state());
end $$;
create function public.game_prepare_ad(p_id uuid,p_device uuid,p_placement text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); cfg jsonb; placement public.game_ad_placements; offer public.game_ad_offers; day date:=(now() at time zone 'UTC')::date; used integer;
begin
 if uid is null then raise exception 'Authentication required';end if;
 perform 1 from auth.users where id=uid for key share;if not found then raise exception 'Authentication required';end if;
 if p_id is null or p_device is null then raise exception 'Invalid reward opportunity';end if;
 insert into public.game_wallets(user_id) values(uid) on conflict do nothing;
 perform 1 from public.game_wallets where user_id=uid for update;
 select * into offer from public.game_ad_offers where id=p_id;
 if found then
  if offer.owner_user_id is distinct from uid or offer.device_id<>p_device or offer.placement_id<>p_placement then raise exception 'Reward opportunity identity conflict';end if;
  return jsonb_build_object('offer',to_jsonb(offer),'state',public.game_ad_state());
 end if;
 select * into placement from public.game_ad_placements where id=p_placement and active;
 if not found then raise exception 'Rewarded ads are unavailable';end if;
 cfg:=public.game_current_economy();
 update public.game_ad_offers set state='cancelled' where owner_user_id=uid and state='prepared' and prepare_until<=now();
 select count(*) into used from public.game_ad_offers where owner_user_id=uid and eligibility_day=day and state in ('prepared','showing','awaiting','earned');
 if used>=(cfg->>'rewardedPerDay')::integer then raise exception 'No rewarded opportunities remain today';end if;
 insert into public.game_ad_offers(id,owner_user_id,device_id,placement_id,provider,platform,environment,eligibility_day,config_version,promised_ms,daily_cap)
 values(p_id,uid,p_device,p_placement,placement.provider,placement.platform,placement.environment,day,cfg->>'version',(cfg->>'rewardedMs')::bigint,(cfg->>'rewardedPerDay')::integer) returning * into offer;
 return jsonb_build_object('offer',to_jsonb(offer),'state',public.game_ad_state());
end $$;
create function public.game_commit_ad(p_id uuid,p_device uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); offer public.game_ad_offers;
begin
 if uid is null then raise exception 'Authentication required';end if;
 perform 1 from auth.users where id=uid for key share;if not found then raise exception 'Authentication required';end if;
 perform 1 from public.game_wallets where user_id=uid for update;
 select * into offer from public.game_ad_offers where id=p_id and owner_user_id=uid for update;
 if not found or offer.device_id is distinct from p_device then raise exception 'Unknown reward opportunity';end if;
 if offer.state='showing' then return to_jsonb(offer);end if;
 if offer.state<>'prepared' or offer.prepare_until<=now() then raise exception 'This reward opportunity expired';end if;
 update public.game_ad_offers set state='awaiting' where owner_user_id=uid and state='showing' and show_requested_at<now()-interval '1 hour';
 if exists(select 1 from public.game_ad_offers where owner_user_id=uid and state='showing') then raise exception 'Another reward is still pending verification';end if;
 update public.game_ad_offers set state='showing',show_requested_at=now() where id=p_id returning * into offer;
 return to_jsonb(offer);
end $$;
create function public.game_cancel_ad(p_id uuid,p_device uuid,p_web_unearned boolean default false,p_never_presented boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); offer public.game_ad_offers;
begin
 if uid is null then raise exception 'Authentication required';end if;
 perform 1 from auth.users where id=uid for key share;if not found then raise exception 'Authentication required';end if;
 perform 1 from public.game_wallets where user_id=uid for update;
 select * into offer from public.game_ad_offers where id=p_id and owner_user_id=uid for update;
 if not found then raise exception 'Unknown reward opportunity';end if;
 if offer.device_id is distinct from p_device and (offer.state<>'prepared' or offer.prepare_until>now()) then raise exception 'Recover this reward on its original device';end if;
 if offer.state='prepared' or p_never_presented and offer.state in ('showing','awaiting') or offer.provider='h5' and offer.state in ('showing','awaiting') and p_web_unearned then update public.game_ad_offers set state='cancelled' where id=p_id;
 elsif offer.state='showing' then update public.game_ad_offers set state='awaiting' where id=p_id;
 end if;
 -- Native dismissal is uncertain: it cannot cancel a valid delayed SSV or
 -- free the same eligibility slot for another promised completion.
 return public.game_ad_state();
end $$;

create function public.game_grant_ad(p_id uuid,p_provider text,p_transaction text,p_unit text,p_amount bigint,p_item text,p_earned_at timestamptz,p_hint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare offer public.game_ad_offers; placement public.game_ad_placements; existing public.game_ad_transactions; uid uuid; lot uuid;
begin
 select owner_user_id into uid from public.game_ad_offers where id=p_id;
 if uid is not null then
  perform 1 from auth.users where id=uid for key share;
  if found then perform 1 from public.game_wallets where user_id=uid for update;end if;
 end if;
 select * into offer from public.game_ad_offers where id=p_id for update;
 if not found or p_provider is distinct from offer.provider or p_transaction is null or length(p_transaction) not between 1 and 240 then raise exception 'Invalid verified reward';end if;
 select * into placement from public.game_ad_placements where id=offer.placement_id;
 if offer.provider='admob' and (p_unit is distinct from placement.verification_unit or p_amount is distinct from placement.reward_amount or p_item is distinct from placement.reward_item or p_hint is distinct from offer.id::text) then raise exception 'Reward placement verification failed';end if;
 if p_earned_at is null or p_earned_at>now()+interval '5 minutes' or offer.show_requested_at is null or p_earned_at<offer.show_requested_at-interval '5 minutes' or p_earned_at>offer.show_requested_at+interval '1 hour' then raise exception 'Invalid reward timestamp';end if;
 select * into existing from public.game_ad_transactions where provider=p_provider and environment=offer.environment and transaction_id=p_transaction;
 if found and existing.offer_id<>p_id then raise exception 'Reward transaction identity conflict';end if;
 if offer.state='earned' then
  if offer.transaction_id<>p_transaction then raise exception 'Reward transaction identity conflict';end if;
  return jsonb_build_object('credited',offer.owner_user_id is not null,'milliseconds',offer.promised_ms);
 end if;
 if offer.state not in ('showing','awaiting') then return jsonb_build_object('credited',false,'state',offer.state);end if;
 insert into public.game_ad_transactions(provider,environment,transaction_id,offer_id,verification_basis,earned_at)
 values(p_provider,offer.environment,p_transaction,p_id,case when p_provider='admob' then 'google_ecdsa' else 'client_sdk' end,p_earned_at);
 if offer.owner_user_id is not null then lot:=public.game_credit_verified(offer.owner_user_id,'rewarded','ad:'||p_id,offer.promised_ms,offer.platform,offer.config_version);end if;
 update public.game_ad_offers set state='earned',earned_at=p_earned_at,transaction_id=p_transaction,lot_id=lot where id=p_id;
 return jsonb_build_object('credited',offer.owner_user_id is not null,'milliseconds',offer.promised_ms);
end $$;
create function public.game_claim_web_ad(p_id uuid,p_device uuid,p_earned_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); offer public.game_ad_offers;
begin
 if uid is null then raise exception 'Authentication required';end if;
 perform 1 from auth.users where id=uid for key share;if not found then raise exception 'Authentication required';end if;
 perform 1 from public.game_wallets where user_id=uid for update;
 select * into offer from public.game_ad_offers where id=p_id and owner_user_id=uid for update;
 if not found or offer.provider<>'h5' or offer.device_id is distinct from p_device then raise exception 'Unknown browser reward opportunity';end if;
 perform public.game_grant_ad(p_id,'h5','h5:'||p_id,null,null,null,coalesce(offer.earned_at,p_earned_at),null);
 return public.game_ad_state();
end $$;
alter table public.game_ad_placements enable row level security;
alter table public.game_ad_offers enable row level security;
alter table public.game_ad_transactions enable row level security;
revoke all on public.game_ad_placements,public.game_ad_offers,public.game_ad_transactions from public,anon,authenticated;
grant all on public.game_ad_placements,public.game_ad_offers,public.game_ad_transactions to service_role;
grant select on public.game_ad_offers to authenticated;
create policy own_ad_offers on public.game_ad_offers for select to authenticated using(owner_user_id=(select auth.uid()));
revoke all on function public.game_keep_ad_placement(),public.game_detach_ad_device(),public.game_ad_state(),public.game_prepare_ad(uuid,uuid,text),public.game_commit_ad(uuid,uuid),public.game_cancel_ad(uuid,uuid,boolean,boolean),public.game_grant_ad(uuid,text,text,text,bigint,text,timestamptz,text),public.game_claim_web_ad(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.game_ad_state(),public.game_prepare_ad(uuid,uuid,text),public.game_commit_ad(uuid,uuid),public.game_cancel_ad(uuid,uuid,boolean,boolean),public.game_claim_web_ad(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.game_grant_ad(uuid,text,text,text,bigint,text,timestamptz,text) to service_role;
commit;
