# Optional play analytics

Implementation checkpoint, 27 October 2026. This is source and local integration evidence. Collection is **disabled by default**, and no production migration, collection job or player experiment has been deployed.

## Decision and scope

**D-MEA-02 — opt-in account analytics.** Keep ordinary guest play available without an analytics identifier or guest activity upload. A signed-in player may explicitly enable first-party play analytics in Settings. The choice applies to that account across official editions. No external analytics SDK is added. This minimizes invisible tracking and gives linked accounts a coherent choice and experiment assignment. The tradeoff is selection bias: these observations describe **consenting signed-in accounts**, not every installer, acquired player or anonymous guest. Never use this sample as the all-player acquisition denominator.

The typed event catalog contains session/platform/build, help surface, manual/assisted active-play segments, terminal stage outcome, coaching exposure, actual price exposure and ad lifecycle observations. Current app wiring covers the first five. Purchase-offer/ad-event ingestion is prepared but actual UI/provider callback wiring is still pending. These are client reports, not proof of a human clear, paid impression, verified purchase or entitlement. They cannot grant game currency. Purchase facts and ad reward authorization have independent server verification.

Activity uses bounded integer-millisecond segments, excluding pause/background/payment/ad display. A briefly assisted run keeps its assisted outcome classification, while separate segments distinguish later manual return play. Segments are queued at boundaries or at most once per active minute; there are no network requests or disk writes in each physics step. A bounded 256-event journal survives reload/lost acknowledgments; batches have stable IDs, server deduplication and a 1,000 accepted-event/account/UTC-day ceiling. Local drops, rejected bodies and quota attempts are distinct from accepted observations. Missing activity is never interpreted as zero play.

## Choice, deletion and export

Preferences have an exact bigint revision returned as a string. Opt-out immediately stops local capture, clears the queue, and requests deletion of optional server events, assignments, streams and daily counters. Revision fencing rejects stale devices. An offline opt-out retries with its original revision; it cannot silently overwrite a newer choice made on another device. If choices conflict, that device stays locally suppressed until the player reviews the setting. Network/storage failures affect optional analytics feedback only.

Known account journals are removed by the existing account-deletion flow. PostgreSQL Auth deletion cascades through these optional account rows. Account export includes paginated optional activity and preference metadata. If the optional export fails, the existing history export is still available and the optional section is clearly marked incomplete. No email, IP, exact location, payment credentials or free-form event text is accepted. Account IDs still make this personal/account-linked data; it is not described as anonymous.

Raw events expire after 90 days and are excluded from export after expiry. A bounded private cleanup operation removes expired raw events and old stream/daily/assignment records. An enabled account retains its first observed date so that pruning cannot misclassify a long-standing account as newly acquired; opting out clears it. This date means first accepted optional observation, **not installation or acquisition**. Backups and retained essential financial/security records have separate retention policies.

## Curated coaching experiment

The seeded `aim-coaching-2026-10-v1` experiment is paused. Its immutable ID/salt/weight deterministically assign each consenting account to the existing stage-one copy or a short explanation of centre/edge aiming. Only wording changes; physics, prices, rewards and progression do not. Creating an assignment is not an exposure. The app reports exposure only after stage-one ready copy remains visible for at least 250ms, without a home screen, splash, loading state or open dialog. This establishes a viewable client-reported presentation, not proof that the player read it.

Before activation, document the primary outcome (stage-one manual clear among exposed consenting accounts), guardrails (manual active play, losses, return play, stability and help usage), attribution window, sample plan and stop/review rule. Keep configuration immutable; changes require a new experiment ID. Analyse assigned and exposed populations separately and report missing/quota-limited observations. Do not infer a winner from this fixture, deterministic split, or a fixed number of days alone. Reports and live experimental analysis are still pending.

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
