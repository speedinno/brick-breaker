-- Owned-site one-time checkout. Price versions and promised benefits are
-- immutable; provider orders/payments are independently verified by the API.
begin;
alter table public.game_purchases drop constraint game_purchases_state_check;
alter table public.game_purchases add constraint game_purchases_state_check check(state in ('owned','partially_refunded','refunded'));
create table public.game_web_prices (
 id uuid primary key default gen_random_uuid(),
 provider text not null default 'razorpay' check(provider='razorpay'),
 scope text not null,
 environment text not null,
 product_id text not null,
 amount bigint not null check(amount between 100 and 100000000),
 currency text not null check(currency='INR'),
 current boolean not null default false,
 created_at timestamptz not null default now(),
 foreign key(provider,scope,environment,product_id) references public.game_purchase_products(provider,scope,environment,product_id)
);
create unique index game_one_current_web_price on public.game_web_prices(scope,environment,product_id) where current;
create function public.game_immutable_web_price() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Published checkout prices cannot be deleted';end if;
 if (to_jsonb(new)-'current') is distinct from (to_jsonb(old)-'current') then raise exception 'Published checkout price is immutable; create a new price version';end if;
 return new;
end $$;
create trigger immutable_web_price before update or delete on public.game_web_prices for each row execute function public.game_immutable_web_price();
create table public.game_web_orders (
 id uuid primary key,
 owner_user_id uuid references auth.users(id) on delete set null,
 deleted_at timestamptz,
 price_id uuid not null references public.game_web_prices(id),
 scope text not null,
 environment text not null,
 product_id text not null,
 milliseconds bigint not null check(milliseconds>0),
 config_version text not null,
 amount bigint not null check(amount between 100 and 100000000),
 currency text not null check(currency='INR'),
 order_id text unique check(order_id is null or order_id ~ '^order_[A-Za-z0-9]{1,80}$'),
 payment_id text unique check(payment_id is null or payment_id ~ '^pay_[A-Za-z0-9]{1,80}$'),
 purchase_id uuid references public.game_purchases(id),
 refunded_amount bigint not null default 0 check(refunded_amount between 0 and amount),
 provider_fee bigint check(provider_fee is null or provider_fee>=0),
 provider_tax bigint check(provider_tax is null or provider_tax>=0),
 purchased_at timestamptz,
 created_at timestamptz not null default now(),
 quote_until timestamptz not null default now()+interval '30 minutes',
 checked_at timestamptz
);
create index game_web_orders_owner on public.game_web_orders(owner_user_id,created_at,id);
create trigger web_order_tombstone before update on public.game_web_orders for each row execute function public.game_purchase_tombstone();

create function public.game_prepare_web_order(p_user uuid,p_id uuid,p_scope text,p_environment text,p_price uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare price public.game_web_prices; product public.game_purchase_products; item public.game_web_orders;
begin
 if p_user is null or p_id is null or p_price is null then raise exception 'Invalid checkout request';end if;
 perform 1 from auth.users where id=p_user for key share;if not found then raise exception 'Purchase owner is unavailable';end if;
 insert into public.game_wallets(user_id) values(p_user) on conflict do nothing;
 perform 1 from public.game_wallets where user_id=p_user for update;
 perform pg_advisory_xact_lock(hashtextextended('web-order:'||p_id,0));
 select * into item from public.game_web_orders where id=p_id;
 if found then
  if item.owner_user_id is distinct from p_user or item.price_id<>p_price or item.scope<>p_scope or item.environment<>p_environment then raise exception 'Checkout identity conflict';end if;
  return jsonb_build_object('order',to_jsonb(item),'create',false);
 end if;
 select * into price from public.game_web_prices where id=p_price and scope=p_scope and environment=p_environment and current;
 if not found then raise exception 'Refresh the available time packs';end if;
 select * into product from public.game_purchase_products where provider='razorpay' and scope=p_scope and environment=p_environment and product_id=price.product_id and platform='web' and available;
 if not found then raise exception 'This time pack is no longer available';end if;
 if (select count(*) from public.game_web_orders where owner_user_id=p_user and created_at>now()-interval '1 hour')>=20 then raise exception 'Too many checkout requests. Try again later.';end if;
 insert into public.game_web_orders(id,owner_user_id,price_id,scope,environment,product_id,milliseconds,config_version,amount,currency)
 values(p_id,p_user,p_price,p_scope,p_environment,price.product_id,product.milliseconds,product.config_version,price.amount,price.currency) returning * into item;
 -- This flag is returned only once. After an uncertain create response, look
 -- up the unique receipt at the provider; never blindly repeat POST /orders.
 return jsonb_build_object('order',to_jsonb(item),'create',true);
end $$;

create function public.game_attach_web_order(p_id uuid,p_order text,p_amount bigint,p_currency text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.game_web_orders;
begin
 select * into item from public.game_web_orders where id=p_id for update;
 if not found or p_order is null or p_order !~ '^order_[A-Za-z0-9]{1,80}$' or p_amount is distinct from item.amount or p_currency is distinct from item.currency then raise exception 'Checkout order verification failed';end if;
 if item.order_id is not null and item.order_id<>p_order then raise exception 'Checkout order identity conflict';end if;
 update public.game_web_orders set order_id=p_order,checked_at=now() where id=p_id returning * into item;
 return to_jsonb(item);
end $$;

create function public.game_apply_web_payment(p_id uuid,p_order text,p_payment text,p_amount bigint,p_currency text,p_refunded bigint,p_purchased_at timestamptz,p_fee bigint default null,p_tax bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.game_web_orders; owner_id uuid; receipt public.game_purchases; target bigint; refunds bigint;
begin
 select owner_user_id into owner_id from public.game_web_orders where id=p_id;
 if owner_id is not null then
  perform 1 from auth.users where id=owner_id for key share;
  if found then
   insert into public.game_wallets(user_id) values(owner_id) on conflict do nothing;
   perform 1 from public.game_wallets where user_id=owner_id for update;
  end if;
 end if;
 select * into item from public.game_web_orders where id=p_id for update;
 if not found or p_order is null or item.order_id is distinct from p_order or p_payment is null or p_payment !~ '^pay_[A-Za-z0-9]{1,80}$' or p_amount is distinct from item.amount or p_currency is distinct from item.currency or p_refunded is null or p_refunded<0 or p_refunded>item.amount or p_purchased_at is null or p_purchased_at>now()+interval '5 minutes' or p_purchased_at<item.created_at-interval '5 minutes' or p_fee<0 or p_tax<0 then raise exception 'Payment verification failed';end if;
 if item.payment_id is not null and item.payment_id<>p_payment then raise exception 'Multiple payments require support review';end if;
 refunds:=greatest(item.refunded_amount,p_refunded);
 target:=floor(item.milliseconds::numeric*refunds/item.amount)::bigint;
 perform pg_advisory_xact_lock(hashtextextended('razorpay:'||item.scope||':'||item.environment||':'||p_payment,0));
 select * into receipt from public.game_purchases where provider='razorpay' and scope=item.scope and environment=item.environment and transaction_id=p_payment for update;
 if not found then
  if item.owner_user_id is null then
   -- An order with a deleted owner is authoritative proof for a non-granting
   -- tombstone; a client cannot create this path or supply a replacement owner.
   insert into public.game_purchases(provider,scope,environment,transaction_id,product_id,owner_user_id,deleted_at,quantity,milliseconds,platform,config_version,state,purchased_at)
   values('razorpay',item.scope,item.environment,p_payment,item.product_id,null,now(),1,item.milliseconds,'web',item.config_version,'owned',p_purchased_at) returning * into receipt;
  else
   perform public.game_record_purchase(item.owner_user_id,'razorpay',item.scope,item.environment,p_payment,item.product_id,1,'owned',p_purchased_at);
   select * into receipt from public.game_purchases where provider='razorpay' and scope=item.scope and environment=item.environment and transaction_id=p_payment for update;
  end if;
 end if;
 if receipt.owner_user_id is distinct from item.owner_user_id or receipt.product_id<>item.product_id or receipt.milliseconds<>item.milliseconds then raise exception 'Purchase identity conflict';end if;
 if receipt.lot_id is not null and target>0 then perform public.game_reverse_credit_partial(receipt.lot_id,target);end if;
 update public.game_purchases set state=case when refunds=item.amount then 'refunded' when refunds>0 then 'partially_refunded' else state end,refunded_at=case when refunds>0 then coalesce(refunded_at,now()) else refunded_at end,checked_at=now() where id=receipt.id returning * into receipt;
 update public.game_web_orders set payment_id=p_payment,purchase_id=receipt.id,refunded_amount=refunds,provider_fee=coalesce(p_fee,provider_fee),provider_tax=coalesce(p_tax,provider_tax),purchased_at=coalesce(purchased_at,p_purchased_at),checked_at=now() where id=p_id;
 return jsonb_build_object('state',case when item.owner_user_id is null then 'account-deleted' else receipt.state end,'purchaseId',receipt.id,'milliseconds',item.milliseconds,'refundedMs',target);
end $$;

alter table public.game_web_prices enable row level security;
alter table public.game_web_orders enable row level security;
revoke all on public.game_web_prices,public.game_web_orders from public,anon,authenticated;
grant all on public.game_web_prices,public.game_web_orders to service_role;
grant select on public.game_web_orders to authenticated;
create policy own_web_orders on public.game_web_orders for select to authenticated using(owner_user_id=(select auth.uid()));
revoke all on function public.game_immutable_web_price(),public.game_prepare_web_order(uuid,uuid,text,text,uuid),public.game_attach_web_order(uuid,text,bigint,text),public.game_apply_web_payment(uuid,text,text,bigint,text,bigint,timestamptz,bigint,bigint) from public,anon,authenticated;
grant execute on function public.game_prepare_web_order(uuid,uuid,text,text,uuid),public.game_attach_web_order(uuid,text,bigint,text),public.game_apply_web_payment(uuid,text,text,bigint,text,bigint,timestamptz,bigint,bigint) to service_role;
commit;
