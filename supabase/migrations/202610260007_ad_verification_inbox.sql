-- A cryptographically verified native callback is retained before applying it.
-- Mapping/account errors become reviewable records, not lost reward evidence.
begin;
create table public.game_ad_verifications (
 transaction_id text primary key check(length(transaction_id) between 1 and 240),
 offer_id uuid not null references public.game_ad_offers(id),
 unit text not null,
 reward_amount bigint not null,
 reward_item text not null,
 earned_at timestamptz not null,
 user_hint text not null,
 proof jsonb not null check(jsonb_typeof(proof)='object' and octet_length(proof::text)<=12000),
 state text not null default 'received' check(state in ('received','applied','review','ignored')),
 review_reason text,
 first_received_at timestamptz not null default now(),
 last_received_at timestamptz not null default now(),
 deliveries integer not null default 1 check(deliveries>=1)
);
create function public.game_receive_admob_reward(p_offer uuid,p_transaction text,p_unit text,p_amount bigint,p_item text,p_earned_at timestamptz,p_hint text,p_proof jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.game_ad_verifications; result jsonb; message text;
begin
 if not exists(select 1 from public.game_ad_offers where id=p_offer) then return jsonb_build_object('ignored',true);end if;
 if p_transaction is null or length(p_transaction) not between 1 and 240 or p_unit is null or length(p_unit)>200 or p_amount is null or p_item is null or length(p_item)>200 or p_earned_at is null or p_hint is null or jsonb_typeof(p_proof) is distinct from 'object' or octet_length(p_proof::text)>12000 or not(p_proof ?& array['signedQuery','signature','keyId','publicKey','verifiedAt']) then raise exception 'Invalid verified reward receipt';end if;
 insert into public.game_ad_verifications(transaction_id,offer_id,unit,reward_amount,reward_item,earned_at,user_hint,proof)
 values(p_transaction,p_offer,p_unit,p_amount,p_item,p_earned_at,p_hint,p_proof) on conflict(transaction_id) do update set deliveries=public.game_ad_verifications.deliveries+1,last_received_at=now();
 select * into receipt from public.game_ad_verifications where transaction_id=p_transaction for update;
 if receipt.offer_id<>p_offer or receipt.unit<>p_unit or receipt.reward_amount<>p_amount or receipt.reward_item<>p_item or receipt.earned_at<>p_earned_at or receipt.user_hint<>p_hint then raise exception 'Reward receipt identity conflict';end if;
 if receipt.state='applied' then return jsonb_build_object('applied',true);end if;
 begin
  result:=public.game_grant_ad(p_offer,'admob',p_transaction,p_unit,p_amount,p_item,p_earned_at,p_hint);
  update public.game_ad_verifications set state=case when (result->>'credited')::boolean then 'applied' when result->>'state'='cancelled' then 'review' else 'ignored' end,review_reason=case when result->>'state'='cancelled' then 'Verified reward for cancelled opportunity' end,last_received_at=now() where transaction_id=p_transaction;
  return result;
 exception when others then
  get stacked diagnostics message=MESSAGE_TEXT;
  -- Never persist raw SQL/provider diagnostics in a player-facing record.
  update public.game_ad_verifications set state='review',review_reason=case when message in ('Reward placement verification failed','Invalid reward timestamp','Reward transaction identity conflict') then message else 'Reward application needs review' end,last_received_at=now() where transaction_id=p_transaction;
  return jsonb_build_object('review',true,'credited',false);
 end;
end $$;
alter table public.game_ad_verifications enable row level security;
revoke all on public.game_ad_verifications from public,anon,authenticated;
grant all on public.game_ad_verifications to service_role;
revoke all on function public.game_receive_admob_reward(uuid,text,text,bigint,text,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.game_receive_admob_reward(uuid,text,text,bigint,text,timestamptz,text,jsonb) to service_role;
commit;
