# Optional play analytics

Implementation checkpoint, 27 October 2026. This is source and local integration evidence. Collection is **disabled by default**, and no production migration, collection job or player experiment has been deployed.

## Decision and scope

**D-MEA-02 — opt-in account analytics.** Keep ordinary guest play available without an analytics identifier or guest activity upload. A signed-in player may explicitly enable first-party play analytics in Settings. The choice applies to that account across official editions. No external analytics SDK is added. This minimizes invisible tracking and gives linked accounts a coherent choice and experiment assignment. The tradeoff is selection bias: these observations describe **consenting signed-in accounts**, not every installer, acquired player or anonymous guest. Never use this sample as the all-player acquisition denominator.

The typed event catalog contains session/platform/build, help surface, manual/assisted active-play segments, terminal stage outcome, coaching exposure, actual price exposure, ad lifecycle and native paid-value observations. These are client reports, not proof of a human clear, verified purchase, settled advertising proceeds or entitlement. They cannot grant game currency. Purchase facts and ad reward authorization have independent server verification.

Activity uses bounded integer-millisecond segments, excluding pause/background/payment/ad display. A briefly assisted run keeps its assisted outcome classification, while separate segments distinguish later manual return play. Segments are queued at boundaries or at most once per active minute; there are no network requests or disk writes in each physics step. A bounded 256-event journal survives reload/lost acknowledgments; batches have stable IDs, server deduplication and a 1,000 accepted-event/account/UTC-day ceiling. Local drops, rejected bodies and quota attempts are distinct from accepted observations. Missing activity is never interpreted as zero play.

## Choice, deletion and export

Preferences have an exact bigint revision returned as a string. Opt-out immediately stops local capture, clears the queue, and requests deletion of optional server events, assignments, streams and daily counters. Revision fencing rejects stale devices. An offline opt-out retries with its original revision; it cannot silently overwrite a newer choice made on another device. If choices conflict, that device stays locally suppressed until the player reviews the setting. Network/storage failures affect optional analytics feedback only.

Known account journals are removed by the existing account-deletion flow. PostgreSQL Auth deletion cascades through these optional account rows. Account export includes paginated optional activity and preference metadata. If the optional export fails, the existing history export is still available and the optional section is clearly marked incomplete. No email, IP, exact location, payment credentials or free-form event text is accepted. Account IDs still make this personal/account-linked data; it is not described as anonymous.

Raw events expire after 90 days and are excluded from export after expiry. A bounded private cleanup operation removes expired raw events and old stream/daily/assignment records. An enabled account retains its first observed date so that pruning cannot misclassify a long-standing account as newly acquired; opting out clears it. This date means first accepted optional observation, **not installation or acquisition**. Backups and retained essential financial/security records have separate retention policies.

## Curated coaching experiment

The seeded `aim-coaching-2026-10-v1` experiment is paused. Its immutable ID/salt/weight deterministically assign each consenting account to the existing stage-one copy or a short explanation of centre/edge aiming. Only wording changes; physics, prices, rewards and progression do not. Creating an assignment is not an exposure. The app reports exposure only after stage-one ready copy remains visible for at least 250ms, without a home screen, splash, loading state or open dialog. This establishes a viewable client-reported presentation, not proof that the player read it.

Before activation, document the primary outcome (stage-one manual clear among exposed consenting accounts), guardrails (manual active play, losses, return play, stability and help usage), attribution window, sample plan and stop/review rule. Keep configuration immutable; changes require a new experiment ID. Analyse assigned and exposed populations separately and report missing/quota-limited observations. Do not infer a winner from this fixture, deterministic split, or a fixed number of days alone. The read-only report below exposes counts and maturity; a real study/sample plan and live conclusions remain pending.

## Read the private account report

After migration `202610270014_play_metrics_report.sql`, use matching private database/service configuration and explicit `MONETIZATION_ENVIRONMENT`:

```powershell
npm run report:play -- --from 2026-10-01 --to 2026-10-27
```

The window is at most 90 inclusive UTC receipt dates through today. No player identity is returned. The report is service-only; the app cannot inspect aggregate business data. The environment in CLI output is an **operator configuration label**, not a filter on activity rows. Keep sandbox and production collection in separate projects. Do not mix test traffic into a production sample and assume a label separates it.

`cohorts` group currently consenting, surviving accounts by first accepted optional observation day. Each has a seven- and thirty-day **end-exclusive** window: day 0 through day 6 or day 29. Active milliseconds, manual/assisted clears, active accounts and help counts are observed client reports within that window. `windowMature` requires the final window day to have closed. Exact day-7/day-30 return play is separate and has its own, one-day-later `returnDayMature` flag. Retention is not session launch: a return requires a reported play segment. `rawWindowFullyRetained=false` warns that expiry may have removed an older window. Missing reports, offline delivery and UTC receipt-date attribution limit interpretation.

Price exposures retain platform, actual price/currency, benefit and original configuration. Ad phases count an opportunity once at its first retained occurrence. SDK monetary callbacks group an opportunity globally within retained raw data before filtering its first receipt date, so a duplicate on another day does not count another value and a late conflicting callback marks the original observation unknown. Currency/precision groups remain separate; `publisherProceedsMicros` stays null. Never sum conflicting snapshots or combine currencies.

Coaching rows distinguish assigned accounts, actual reported exposure and seven-day mature exposures. An outcome must follow the exposure in server sequence and receipt time, concern a manual stage-one clear, and fall within seven days. An earlier clear in the same ingested batch or an assisted clear cannot count as an exposed manual success. Mature-window successes have their own denominator; partial observed successes are separately labelled. These counts do not calculate significance, choose a winner, establish purchase conversion or attribute money to a variant.

All counts are subject to selection and survivorship bias: opt-outs/deletions disappear instead of leaving a hidden tracking denominator. Daily accepted/quota-attempt quality counters refer to the requested dates. Retained local stream-drop totals cover their streams, not those dates; retries may increase quota attempt counts. These are coverage warnings, not a reconstructed count of missing players. `netContribution` and `winningVariant` remain null. Acquisition and financial attribution need independent evidence.

## Actual prices and ad callbacks

The actual priced native button or web quote must remain at least half intersecting for 250ms in a foreground document, with its centre unobscured. Loading a catalog or creating a server order does not log a price exposure. The observer checks account and panel generation again before capture; closing/resetting/reloading the panel cancels it. Missing browser observation support produces missing data, never an invented view. Native money comes from the current SDK product's numeric price/currency; web money and original product/configuration come from the verified immutable order quote. Neither uses the draft price hypothesis.

Native ad requests, `Showed`, `Rewarded`, dismissal and failure callbacks are separate. H5 request, `beforeAd`, `adViewed` and closure are separate; its final placement callback may occur without an ad, so no-fill cannot fabricate a display. Local preflight/SDK failures count as failed opportunities, not impressions. Duplicate callbacks are suppressed per opportunity. Account changes reject late observations without changing reward recovery.

Pinned AdMob 8.2.1 exposes the rewarded `AdImpression` paid-value event. Only matching-unit, nonnegative integer micros, ISO currency and precision 0–3 are retained; network names and impression identifiers are discarded. Identical callbacks deduplicate; up to four conflicting normalized snapshots are retained as conflicting observations for later review. Do not add their values together or select the largest. A paid-value callback is labelled **client-reported SDK impression value**, not a verified publisher payout; unknown precision and missing/late callbacks remain explicit limitations. H5 supplies no equivalent monetary callback here. No revenue is inferred from an ad request, reward signal, SSV reward or a successful time-bank grant. Publisher-report reconciliation remains unfinished.

Primary sources checked 27 October 2026: [Google H5 callback semantics](https://developers.google.com/ad-placement/apis/adbreak), [Google AdMob impression-level value and precision](https://developers.google.com/admob/android/impression-level-ad-revenue), and installed `@capacitor-community/admob@8.2.1` rewarded/revenue TypeScript declarations. Local mocks exercise those callback boundaries; they do not prove real SDK delivery.

## Operator activation and retention

1. Apply migration `202610260013_play_metrics.sql` after its predecessors in the matching environment. Direct table access remains revoked for public/anon/authenticated roles; authenticated RPCs are account-scoped. The retention RPC is service-only.
2. Configure and monitor a recurring private cleanup job with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and explicit `MONETIZATION_ENVIRONMENT` in its private environment. The command reads the ignored `.env.api` only from its working directory and never logs a key. Use the correct separate sandbox/production configuration.

   ```powershell
   npm run prune:metrics -- --batch 1000
   ```

   Each invocation removes at most the batch size from each eligible category. Schedule enough batches to clear the expected backlog; alert on failures and expired-row backlog. This command has **not** been run against real credentials or deployed as a job.
3. Review the actual privacy notice, store disclosures, retention/backup policy and consent UX. Then explicitly set server `PLAY_METRICS_ENABLED=true` in the intended edition. The default `false` blocks collection and new opt-ins, suppresses assignment through the API, and still permits existing opt-out/export requests. Client collection respects this availability gate after refresh/restart.
4. Leave experiments paused until the study is ready. An operator may change only `active` on a published experiment; a new configuration requires a new ID. Never use experiment analytics for ledger grants.

## Verification

Real disposable PostgreSQL covers default-off and account isolation, typed payloads/PII rejection, duplicate/lost acknowledgments, revision conflicts, immutable assignment, run-end deduplication, quota/stream caps, timestamp limits, paginated export, expiry/pruning, permissions and Auth cascade. Client tests cover guest inactivity, bounded durable queues, account/deletion races (including account change before transport invocation), offline opt-out, storage failure, paused deployment and active-time segmentation.

The actual app in a 393×852 browser iframe with fixture authentication and real disposable PostgreSQL passed five grouped checks: guest inactivity; explicit opt-in; assignment versus actual visible exposure/help; real simulation/pause segments; and opt-out deletion/no further uploads. Evidence is `.openai/local/product-redesign/play-metrics-settings.png` and `play-metrics-integration-pass.png`. This is neither a physical-device test nor a real-player study. Native purchase-panel tests additionally verify explicit pause/save/mute context before buy/restore, cancellation/failure cleanup and fresh web confirmation. No provider sandbox or real purchase was used.

The full checkout and rewarded app fixtures each passed seven grouped checks with optional analytics enabled. The checkout uses the production verifier/orchestrator and actual immutable PostgreSQL quote with a mock payment provider; it observed INR 129/configuration `fixture-v1`, then verified capture, partial assistance consumption, restoration and chargeback recovery. The rewarded fixture observed actual adapter request/display/reward/closure callbacks, preserved single credit and produced no H5 money. Screenshots are `quote-exposure-integration-pass.png` and `ad-observation-integration-pass.png` in the same private evidence directory. The updated full suite passed 394/394 (48.55s).

Nine real-PostgreSQL/operator report cases cover window/return boundaries and maturity, immutable price groups, repeat/late/conflicting SDK values, assignment versus exposure, same-batch ordering, expiry, account erasure, privileges, unknown financial output and safe CLI failures. This is fixture analysis, not measured player retention or an experiment result.
