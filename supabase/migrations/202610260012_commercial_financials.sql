-- One verified receipt remains one sale, regardless of restoration or number
-- of monetary observations. API estimates are not settlement/profit evidence.
begin;
create table public.game_native_financial_observations(
 purchase_id uuid not null references public.game_purchases(id),fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 quality text not null check(quality in ('estimated','missing','invalid')),country text check(country ~ '^[A-Z]{2}$'),
 gross_micros bigint,commission_micros bigint,tax_micros bigint,proceeds_micros bigint,
 first_observed_at timestamptz not null default now(),primary key(purchase_id,fingerprint),
 check(quality<>'estimated' or gross_micros is not null and commission_micros is not null and tax_micros is not null and proceeds_micros is not null and gross_micros between 0 and 1000000000000000 and commission_micros between 0 and 1000000000000000 and tax_micros between 0 and 1000000000000000 and proceeds_micros between 0 and 1000000000000000 and abs(gross_micros-commission_micros-tax_micros-proceeds_micros)<=2),
 check(quality='estimated' or gross_micros is null and commission_micros is null and tax_micros is null and proceeds_micros is null)
);
alter table public.game_native_financial_observations enable row level security;
revoke all on public.game_native_financial_observations from public,anon,authenticated;
grant all on public.game_native_financial_observations to service_role;
create function public.game_keep_financial_observation() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Financial observations are immutable; append corrected evidence';end $$;
create trigger keep_financial_observation before update or delete on public.game_native_financial_observations for each row execute function public.game_keep_financial_observation();
revoke all on function public.game_keep_financial_observation() from public,anon,authenticated;
create function public.game_record_native_purchase(p_user uuid,p_provider text,p_scope text,p_environment text,p_transaction text,p_product text,p_quantity integer,p_state text,p_purchased_at timestamptz,p_financials jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt jsonb; quality text; country text; gross bigint; commission bigint; tax bigint; proceeds bigint; fact jsonb;
begin
 if p_provider is distinct from 'revenuecat' or p_financials is null or jsonb_typeof(p_financials)<>'object' then raise exception 'Invalid native financial receipt';end if;
 quality:=p_financials->>'quality';country:=p_financials->>'country';
 if quality is null or quality not in ('estimated','missing','invalid') or country is not null and country !~ '^[A-Z]{2}$' or exists(select 1 from jsonb_object_keys(p_financials) k where k not in ('quality','country','grossMicros','commissionMicros','taxMicros','proceedsMicros')) then raise exception 'Invalid native financial receipt';end if;
 if quality='estimated' then
  if (p_financials->>'grossMicros') !~ '^(0|[1-9][0-9]{0,15})$' or (p_financials->>'commissionMicros') !~ '^(0|[1-9][0-9]{0,15})$' or (p_financials->>'taxMicros') !~ '^(0|[1-9][0-9]{0,15})$' or (p_financials->>'proceedsMicros') !~ '^(0|[1-9][0-9]{0,15})$' then raise exception 'Invalid native financial receipt';end if;
  gross:=(p_financials->>'grossMicros')::bigint;commission:=(p_financials->>'commissionMicros')::bigint;tax:=(p_financials->>'taxMicros')::bigint;proceeds:=(p_financials->>'proceedsMicros')::bigint;
  if gross is null or commission is null or tax is null or proceeds is null then raise exception 'Invalid native financial receipt';end if;
 elsif exists(select 1 from jsonb_each(p_financials) f where f.key in ('grossMicros','commissionMicros','taxMicros','proceedsMicros') and f.value<>'null'::jsonb) then raise exception 'Invalid native financial receipt';
 end if;
 receipt:=public.game_record_purchase(p_user,p_provider,p_scope,p_environment,p_transaction,p_product,p_quantity,p_state,p_purchased_at);
 fact:=jsonb_build_object('quality',quality,'country',country,'grossMicros',gross,'commissionMicros',commission,'taxMicros',tax,'proceedsMicros',proceeds);
 insert into public.game_native_financial_observations(purchase_id,fingerprint,quality,country,gross_micros,commission_micros,tax_micros,proceeds_micros)
 values((receipt->>'id')::uuid,encode(sha256(convert_to(fact::text,'UTF8')),'hex'),quality,country,gross,commission,tax,proceeds) on conflict do nothing;
 return receipt;
end $$;
revoke all on function public.game_record_native_purchase(uuid,text,text,text,text,text,integer,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.game_record_native_purchase(uuid,text,text,text,text,text,integer,text,timestamptz,jsonb) to service_role;

create function public.game_commercial_financial_report(p_from date,p_to date,p_environment text) returns jsonb language plpgsql security definer set search_path='' as $$
declare purchases jsonb; coverage jsonb;
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 or p_environment is null or p_environment not in ('production','sandbox') then raise exception 'Invalid financial report window';end if;
 with native as (
  select p.id,p.provider,p.platform,p.product_id,p.state,p.purchased_at,p.quantity,
   case when count(distinct f.country)=1 then max(f.country) end as country,
   count(distinct (f.gross_micros,f.commission_micros,f.tax_micros,f.proceeds_micros)) filter(where f.quality='estimated') as versions,
   max(f.gross_micros) filter(where f.quality='estimated') as gross,max(f.proceeds_micros) filter(where f.quality='estimated') as proceeds
  from public.game_purchases p left join public.game_native_financial_observations f on f.purchase_id=p.id
  where p.provider='revenuecat' and p.environment=p_environment and (p.purchased_at at time zone 'UTC')::date between p_from and p_to
  group by p.id
 ), web as (
  select p.id,p.provider,p.platform,p.product_id,p.state,p.purchased_at,p.quantity,o.amount,o.refunded_amount,o.provider_fee,o.provider_tax,
   case when o.id is not null then coalesce(sum(d.effective_deducted),0) end as deducted,bool_or(d.needs_review) as review
  from public.game_purchases p left join public.game_web_orders o on o.purchase_id=p.id
  left join public.game_web_disputes d on d.order_id=o.id
  where p.provider='razorpay' and p.environment=p_environment and (p.purchased_at at time zone 'UTC')::date between p_from and p_to group by p.id,o.id
 ), facts as (
  select provider,platform,product_id,country,'USD'::text as currency,'revenuecat_api_estimate'::text as basis,state,quantity,
   case when versions=1 then gross end::numeric as gross,
   case when versions=1 and state='owned' then proceeds end::numeric as proceeds,
   null::numeric as refunded,null::numeric as deducted,null::numeric as fee_tax,
   versions>1 as conflict,versions<>1 or state<>'owned' as incomplete
  from native
  union all
  select provider,platform,product_id,null,'INR','razorpay_api_cash_before_merchant_tax_and_costs',state,quantity,
   amount::numeric*10000,
   case when provider_fee is not null then (amount-refunded_amount-deducted-provider_fee)::numeric*10000 end,
   refunded_amount::numeric*10000,deducted::numeric*10000,provider_tax::numeric*10000,
   coalesce(review,false),provider_fee is null or coalesce(review,false)
  from web
 ), groups as (
  select provider,platform,product_id,country,currency,basis,count(*) as receipts,sum(quantity) as units,count(*) filter(where state='refunded') as refunded_receipts,
   count(*) filter(where conflict) as reviews,count(*) filter(where incomplete) as incomplete_receipts,
   sum(gross)::text as known_gross,sum(proceeds)::text as known_proceeds,sum(refunded)::text as known_refunds,sum(deducted)::text as known_chargebacks,
   sum(fee_tax)::text as included_fee_tax
  from facts group by provider,platform,product_id,country,currency,basis
 ) select coalesce(jsonb_agg(jsonb_build_object('provider',provider,'platform',platform,'product',product_id,'country',country,'countrySource',case when provider='revenuecat' then 'provider_reported_unspecified' else 'unknown' end,'currency',currency,'basis',basis,'verifiedReceipts',receipts,'units',units,'refundedReceipts',refunded_receipts,'reviewReceipts',reviews,'incompleteReceipts',incomplete_receipts,'knownGrossMicros',known_gross,'knownProceedsMicros',known_proceeds,'knownRefundMicros',known_refunds,'knownChargebackMicros',known_chargebacks,'providerFeeTaxIncludedMicros',included_fee_tax,'completeProceedsMicros',case when incomplete_receipts=0 then known_proceeds end) order by provider,platform,product_id,country),'[]') into purchases from groups;
 select jsonb_build_object('verifiedReceipts',count(*),'nativeReceiptsWithoutObservation',count(*) filter(where p.provider='revenuecat' and not exists(select 1 from public.game_native_financial_observations f where f.purchase_id=p.id)),'webReceiptsWithoutOrder',count(*) filter(where p.provider='razorpay' and not exists(select 1 from public.game_web_orders o where o.purchase_id=p.id))) into coverage
 from public.game_purchases p where p.environment=p_environment and (p.purchased_at at time zone 'UTC')::date between p_from and p_to;
 return jsonb_build_object('from',p_from,'to',p_to,'environment',p_environment,'purchaseGroups',purchases,'coverage',coverage,'settlementReconciled',false,'netContribution',null,'limitations',jsonb_build_array('Provider API snapshots are not finalized settlement reports.','Unknown amounts remain null; known subtotals are not complete proceeds.','Currencies are separate; no assumed exchange rate.','Acquisition, merchant taxes, operating/support/content costs and ad proceeds are not yet included.'));
end $$;
revoke all on function public.game_commercial_financial_report(date,date,text) from public,anon,authenticated;
grant execute on function public.game_commercial_financial_report(date,date,text) to service_role;
commit;
