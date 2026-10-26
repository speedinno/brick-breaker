-- Read-only optional-account analysis. First observation is not acquisition,
-- client ad value is not publisher proceeds, and removed accounts stay removed.
begin;
create function public.game_play_metrics_report(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cohorts jsonb;offers jsonb;ads jsonb;values_report jsonb;experiments jsonb;quality jsonb;today date:=(now() at time zone 'UTC')::date;
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>89 or p_to>today then raise exception 'Choose at most 90 inclusive UTC dates through today';end if;
 with accounts as (
  select user_id,first_observed_day as day from public.game_metric_preferences where enabled and first_observed_day between p_from and p_to
 ), windows as (
  select a.*,w.days from accounts a cross join (values(7),(30)) w(days)
 ), activity as (
  select a.user_id,a.day,a.days,
   coalesce(sum((e.data->>'activeMs')::bigint) filter(where e.type='play_segment' and e.data->>'mode'='manual'),0) as manual_ms,
   coalesce(sum((e.data->>'activeMs')::bigint) filter(where e.type='play_segment' and e.data->>'mode'='assisted'),0) as assisted_ms,
   count(*) filter(where e.type='stage_end' and e.data->>'outcome'='cleared' and e.data->>'mode'='manual') as manual_clears,
   count(*) filter(where e.type='stage_end' and e.data->>'outcome'='cleared' and e.data->>'mode'='assisted') as assisted_clears,
   count(*) filter(where e.type='help_open') as help_opens
  from windows a left join public.game_metric_events e on e.user_id=a.user_id and e.expires_at>now()
   and (e.received_at at time zone 'UTC')::date>=a.day and (e.received_at at time zone 'UTC')::date<a.day+a.days
  group by a.user_id,a.day,a.days
 ), grouped as (
  select day,days,count(*) as accounts,count(*) filter(where manual_ms+assisted_ms>0) as active,
   sum(manual_ms)::text as manual_ms,sum(assisted_ms)::text as assisted_ms,
   sum(manual_clears)::text as manual_clears,sum(assisted_clears)::text as assisted_clears,sum(help_opens)::text as help_opens
  from activity group by day,days
 ) select coalesce(jsonb_agg(jsonb_build_object('firstObservedDay',g.day,'windowDays',g.days,'windowMature',today>=g.day+g.days,
  'rawWindowFullyRetained',g.day>=today-89,'currentlyConsentingAccounts',g.accounts,'observedActiveAccounts',g.active,
  'manualActiveMs',g.manual_ms,'assistedActiveMs',g.assisted_ms,'manualClears',g.manual_clears,'assistedClears',g.assisted_clears,'helpOpens',g.help_opens,
  'returnDay',g.days,'returnDayMature',today>g.day+g.days,
  'observedReturnAccounts',(select count(*) from public.game_metric_preferences p where p.enabled and p.first_observed_day=g.day and exists(select 1 from public.game_metric_events e where e.user_id=p.user_id and e.expires_at>now() and e.type='play_segment' and (e.received_at at time zone 'UTC')::date=g.day+g.days))) order by g.day,g.days),'[]') into cohorts from grouped g;

 with grouped as (
  select data->>'platform' as platform,data->>'sku' as sku,data->>'currency' as currency,data->>'amountMicros' as price,data->>'benefitMs' as benefit,data->>'configVersion' as version,count(*) as exposures,count(distinct user_id) as accounts
  from public.game_metric_events where expires_at>now() and type='purchase_offer' and (received_at at time zone 'UTC')::date between p_from and p_to
  group by data->>'platform',data->>'sku',data->>'currency',data->>'amountMicros',data->>'benefitMs',data->>'configVersion'
 ) select coalesce(jsonb_agg(jsonb_build_object('platform',platform,'sku',sku,'currency',currency,'priceMicros',price,'benefitMs',benefit,'configVersion',version,'clientReportedExposures',exposures,'distinctAccounts',accounts) order by platform,sku,currency,price,version),'[]') into offers from grouped;

 with first_phase as (
  select data->>'provider' as provider,data->>'platform' as platform,data->>'phase' as phase,data->>'opportunityId' as opportunity,min(received_at) as first_at
  from public.game_metric_events where expires_at>now() and type='ad_event'
  group by data->>'provider',data->>'platform',data->>'phase',data->>'opportunityId'
 ), grouped as (
  select provider,platform,phase,count(*) as opportunities from first_phase where (first_at at time zone 'UTC')::date between p_from and p_to group by provider,platform,phase
 ) select coalesce(jsonb_agg(jsonb_build_object('provider',provider,'platform',platform,'phase',phase,'clientReportedOpportunities',opportunities) order by provider,platform,phase),'[]') into ads from grouped;

 -- One opportunity may have repeated or contradictory paid callbacks. Never
 -- sum duplicates or choose the larger conflicting amount. No H5 estimate.
 with per_opportunity as (
  select data->>'opportunityId' as opportunity,data->>'platform' as platform,
   count(distinct (data->>'currency',data->>'valueMicros',data->>'precision')) as versions,
   min(data->>'currency') as currency,min((data->>'precision')::integer) as precision,min((data->>'valueMicros')::bigint) as value,min(received_at) as first_at
  from public.game_metric_events where expires_at>now() and type='ad_value'
  group by data->>'opportunityId',data->>'platform'
 ), grouped as (
  select platform,case when versions=1 then currency end as currency,case when versions=1 then precision end as precision,
   count(*) as opportunities,count(*) filter(where versions>1) as conflicts,sum(value) filter(where versions=1)::text as observed_value
  from per_opportunity where (first_at at time zone 'UTC')::date between p_from and p_to group by platform,case when versions=1 then currency end,case when versions=1 then precision end
 ) select coalesce(jsonb_agg(jsonb_build_object('platform',platform,'currency',currency,'precision',precision,'opportunities',opportunities,'conflictingOpportunities',conflicts,'clientReportedSdkValueMicros',observed_value,'publisherProceedsMicros',null) order by platform,currency,precision),'[]') into values_report from grouped;

 with assigned as (
  select a.* from public.game_metric_assignments a join public.game_metric_preferences p on p.user_id=a.user_id and p.enabled and p.revision=a.revision
  where (a.issued_at at time zone 'UTC')::date between p_from and p_to
 ), observed as (
  select a.*,x.received_at as exposed_at,x.sequence as exposed_sequence from assigned a left join lateral (
   select e.received_at,e.sequence from public.game_metric_events e where e.user_id=a.user_id and e.revision=a.revision and e.expires_at>now() and e.type='coach_exposure' and e.data->>'experiment'=a.experiment_id and e.data->>'variant'=a.variant and e.received_at>=a.issued_at order by e.sequence limit 1
  ) x on true
 ), grouped as (
  select experiment_id,variant,count(*) as assigned,count(*) filter(where exposed_at is not null) as exposed,
   count(*) filter(where exposed_at<=now()-interval '7 days') as mature_exposed,
   count(*) filter(where exposed_at is not null and exists(select 1 from public.game_metric_events e where e.user_id=a.user_id and e.revision=a.revision and e.expires_at>now() and e.type='stage_end' and e.data->>'level'='1' and e.data->>'outcome'='cleared' and e.data->>'mode'='manual' and e.sequence>a.exposed_sequence and e.received_at>=a.exposed_at and e.received_at<a.exposed_at+interval '7 days')) as manual_stage_one_clears,
   count(*) filter(where exposed_at<=now()-interval '7 days' and exists(select 1 from public.game_metric_events e where e.user_id=a.user_id and e.revision=a.revision and e.expires_at>now() and e.type='stage_end' and e.data->>'level'='1' and e.data->>'outcome'='cleared' and e.data->>'mode'='manual' and e.sequence>a.exposed_sequence and e.received_at>=a.exposed_at and e.received_at<a.exposed_at+interval '7 days')) as mature_manual_stage_one_clears
  from observed a group by experiment_id,variant
 ) select coalesce(jsonb_agg(jsonb_build_object('experiment',experiment_id,'variant',variant,'currentlyConsentingAssigned',assigned,'clientReportedExposed',exposed,'sevenDayMatureExposed',mature_exposed,'observedManualStageOneClearedWithinSevenDaysOfExposure',manual_stage_one_clears,'manualStageOneClearedInMatureSevenDayWindow',mature_manual_stage_one_clears) order by experiment_id,variant),'[]') into experiments from grouped;

 select jsonb_build_object('acceptedEvents',coalesce(sum(accepted),0)::text,'quotaDropAttempts',coalesce(sum(quota_drop_attempts),0)::text) into quality from public.game_metric_daily where day between p_from and p_to;
 quality:=quality||jsonb_build_object('retainedStreamClientDrops',(select coalesce(sum(client_dropped),0)::text from public.game_metric_streams),'expiredRawRowsAwaitingPrune',(select count(*) from public.game_metric_events where expires_at<=now()));
 return jsonb_build_object('from',p_from,'to',p_to,'asOf',now(),'source','optional_client_reported_account_activity',
  'cohortBasis','first_accepted_optional_observation_utc_day','cohorts',cohorts,'priceExposures',offers,'adLifecycle',ads,'sdkAdValues',values_report,'coaching',experiments,'quality',quality,
  'netContribution',null,'winningVariant',null,'limitations',jsonb_build_array(
   'Currently consenting surviving accounts only. Opt-outs/deletions are absent; selection and survivorship bias remain.',
   'First optional observation is not installation or acquisition. Guest and anonymous cross-device identity are unknown.',
   'Windows use server receipt UTC dates; offline arrival and missing/quota-limited client reports can shift or omit activity.',
   'Window days are end-exclusive; return day is a separate exact UTC date with its own maturity flag.',
   'Expired raw events are excluded. Local stream-drop totals cover retained streams, not the requested date window; quota attempts can include retries.',
   'SDK ad values are unverified client observations by precision/currency, not publisher proceeds or finalized revenue.',
   'No purchase conversion, financial attribution, statistical winner, acquisition cost or net contribution is inferred.'));
end $$;
revoke all on function public.game_play_metrics_report(date,date) from public,anon,authenticated;
grant execute on function public.game_play_metrics_report(date,date) to service_role;
commit;
