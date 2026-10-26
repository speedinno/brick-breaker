-- Minimal transaction provenance survives account deletion. No receipt bodies,
-- payment instruments, email addresses or store credentials are stored here.
-- Only independently verified provider responses may call these primitives.
begin;
create table public.game_purchase_products (
 provider text not null check(provider in ('revenuecat','razorpay')),
 scope text not null check(length(scope) between 1 and 200),
 environment text not null check(environment in ('production','sandbox')),
 product_id text not null check(length(product_id) between 1 and 255),
 platform text not null check(platform in ('android','ios','web')),
 benefit_key text not null check(length(benefit_key) between 1 and 80),
 milliseconds bigint not null check(milliseconds between 1 and 9000000000),
 config_version text not null check(length(config_version) between 1 and 80),
 available boolean not null default false,
 primary key(provider,scope,environment,product_id)
);
create function public.game_immutable_purchase_product() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Published purchase products cannot be deleted';end if;
 if (to_jsonb(new)-'available') is distinct from (to_jsonb(old)-'available') then raise exception 'Published purchase benefit is immutable; create a new product ID';end if;
 return new;
end $$;
create trigger immutable_purchase_product before update on public.game_purchase_products for each row execute function public.game_immutable_purchase_product();
create trigger retain_purchase_product before delete on public.game_purchase_products for each row execute function public.game_immutable_purchase_product();

create table public.game_purchases (
 id uuid primary key default gen_random_uuid(),
 provider text not null,
 scope text not null,
 environment text not null,
 transaction_id text not null check(length(transaction_id) between 1 and 255),
 product_id text not null,
 owner_user_id uuid references auth.users(id) on delete set null,
 deleted_at timestamptz,
 quantity integer not null check(quantity between 1 and 100),
 milliseconds bigint not null check(milliseconds between 1 and 900000000000),
 platform text not null check(platform in ('android','ios','web')),
 config_version text not null,
 state text not null check(state in ('owned','refunded')),
 lot_id uuid references public.game_credit_lots(id) on delete set null,
 purchased_at timestamptz not null,
 checked_at timestamptz not null default now(),
 refunded_at timestamptz,
 unique(provider,scope,environment,transaction_id),
 foreign key(provider,scope,environment,product_id) references public.game_purchase_products(provider,scope,environment,product_id)
);
create index game_purchase_owner on public.game_purchases(owner_user_id,checked_at);
create function public.game_purchase_tombstone() returns trigger language plpgsql set search_path='' as $$
begin
 if old.owner_user_id is not null and new.owner_user_id is null then new.deleted_at:=coalesce(new.deleted_at,now());
 elsif new.owner_user_id is distinct from old.owner_user_id then raise exception 'Purchase ownership cannot transfer';end if;
 return new;
end $$;
create trigger purchase_tombstone before update on public.game_purchases for each row execute function public.game_purchase_tombstone();

-- Lock the identity before its wallet so auth deletion cannot interleave a
-- new grant with removal of its balance. Global receipt uniqueness also binds
-- sandbox/production and app scope; no account can replay another's purchase.
create function public.game_record_purchase(p_user uuid,p_provider text,p_scope text,p_environment text,p_transaction text,p_product text,p_quantity integer,p_state text,p_purchased_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare product public.game_purchase_products; receipt public.game_purchases; lot uuid; owner_id uuid:=p_user;
begin
 if p_provider is null or p_scope is null or p_environment is null or p_transaction is null or length(p_transaction) not between 1 and 255 or p_quantity is null or p_quantity not between 1 and 100 or p_state is null or p_state not in ('owned','refunded') or p_purchased_at is null or p_purchased_at>now()+interval '5 minutes' then raise exception 'Invalid verified purchase';end if;
 select * into product from public.game_purchase_products where provider=p_provider and scope=p_scope and environment=p_environment and product_id=p_product;
 if not found then raise exception 'Unknown purchase product';end if;
 if owner_id is null then select owner_user_id into owner_id from public.game_purchases where provider=p_provider and scope=p_scope and environment=p_environment and transaction_id=p_transaction;end if;
 if owner_id is not null then
  perform 1 from auth.users where id=owner_id for key share;
  if not found then owner_id:=null;
  else
   insert into public.game_wallets(user_id) values(owner_id) on conflict do nothing;
   perform 1 from public.game_wallets where user_id=owner_id for update;
  end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_provider||':'||p_scope||':'||p_environment||':'||p_transaction,0));
 select * into receipt from public.game_purchases where provider=p_provider and scope=p_scope and environment=p_environment and transaction_id=p_transaction for update;
 if found then
  if receipt.product_id<>p_product or receipt.quantity<>p_quantity or receipt.milliseconds<>product.milliseconds*p_quantity then raise exception 'Purchase identity conflict';end if;
  if receipt.owner_user_id is not null and p_user is not null and receipt.owner_user_id<>p_user then raise exception 'Purchase belongs to another game account';end if;
  if receipt.owner_user_id is null then
   -- Preserve a deletion tombstone even for late refund/restoration callbacks.
   if p_state='refunded' then update public.game_purchases set state='refunded',refunded_at=coalesce(refunded_at,now()),checked_at=now() where id=receipt.id;end if;
   return jsonb_build_object('id',receipt.id,'state','account-deleted','credited',false);
  end if;
 else
  if owner_id is null and p_user is null then raise exception 'Purchase owner is unavailable';end if;
  insert into public.game_purchases(provider,scope,environment,transaction_id,product_id,owner_user_id,deleted_at,quantity,milliseconds,platform,config_version,state,purchased_at,refunded_at)
  values(p_provider,p_scope,p_environment,p_transaction,p_product,owner_id,case when owner_id is null then now() end,p_quantity,product.milliseconds*p_quantity,product.platform,product.config_version,p_state,p_purchased_at,case when p_state='refunded' then now() end) returning * into receipt;
  if owner_id is null then return jsonb_build_object('id',receipt.id,'state','account-deleted','credited',false);end if;
 end if;
 -- Refunded is terminal. An older owned response or webhook cannot recreate it.
 if p_state='refunded' or receipt.state='refunded' then
  if receipt.lot_id is not null then perform public.game_reverse_credit(receipt.lot_id);end if;
  update public.game_purchases set state='refunded',refunded_at=coalesce(refunded_at,now()),checked_at=now() where id=receipt.id;
  return jsonb_build_object('id',receipt.id,'state','refunded','credited',false);
 end if;
 lot:=receipt.lot_id;
 if lot is null then
  lot:=public.game_credit_verified(owner_id,'purchase','purchase:'||receipt.id,receipt.milliseconds,receipt.platform,receipt.config_version);
  update public.game_purchases set lot_id=lot where id=receipt.id;
 end if;
 update public.game_purchases set checked_at=now() where id=receipt.id;
 return jsonb_build_object('id',receipt.id,'state','owned','credited',true,'milliseconds',receipt.milliseconds);
end $$;

alter table public.game_purchase_products enable row level security;
alter table public.game_purchases enable row level security;
revoke all on public.game_purchase_products,public.game_purchases from public,anon,authenticated;
grant all on public.game_purchase_products,public.game_purchases to service_role;
grant select on public.game_purchases to authenticated;
create policy own_purchases on public.game_purchases for select to authenticated using(owner_user_id=(select auth.uid()));
revoke all on function public.game_immutable_purchase_product(),public.game_purchase_tombstone(),public.game_record_purchase(uuid,text,text,text,text,text,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.game_record_purchase(uuid,text,text,text,text,text,integer,text,timestamptz) to service_role;
commit;
