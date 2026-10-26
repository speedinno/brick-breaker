# Durable recovery operations

Source/local verification checkpoint, 27 October 2026. Migration 015, the dedicated callback function and worker are implemented. **No new production migration, edge deployment, Azure schedule or alert rule has been installed by this checkpoint.** Existing Azure API deployment/configuration still needs updating before activation. Real Google/provider latency, delivery and sandbox behavior remain unverified.

## Chosen architecture

**D-OPS-01:** keep the game API in the selected SpeedInno Org Azure environment, use a small dedicated Supabase Edge Function for Google's native rewarded callback, and run bounded private recovery in scheduled containers with PostgreSQL journals. An always-warm Azure replica would also avoid the observed scale-to-zero path, but adds continuous compute and still needs delivery validation. A workstation-only scheduler/local cursor depends on that PC remaining available; an ephemeral container/local cursor loses progress on restart. The existing Supabase database already owns receipt deduplication and private account cleanup, so it is the durable cursor/lease authority. This does not establish an unmeasured availability SLA or promise free hosting.

### Callback ingress

`supabase/functions/reward-callback/index.ts` is a small dedicated entry point, excluding the catalog/game API import path. Set the native AdMob SSV callback to the exact HTTPS URL after the function is deployed:

```text
https://PROJECT_REF.supabase.co/functions/v1/reward-callback
```

It uses no Supabase bearer JWT because Google sends an ECDSA-signed query. `verify_jwt=false` exposes this route publicly; the handler independently verifies the exact raw query with Google's keys **before** calling the service-only inbox RPC. It acknowledges only a committed SQL result, including a durable review record when a verified promise cannot yet apply. Method/signature/key/database failures do not manufacture an earned reward. Replies contain no balance, proof, account or transaction details. The old Azure `/webhooks/admob` path uses the same handler and remains compatible with old valid promises.

The edge wrapper bounds key requests to 2s and database requests to 3.5s. These are separate request bounds, not a promised combined callback latency. Key caching/rotation and SQL idempotency are shared with the existing verifier. Measure cold/warm delivery and test the actual Google endpoint before production activation. `/functions/v1/reward-callback/healthz` is process health only, not a database/Google delivery proof. Neither a successful health request nor a test ad proves SSV delivery.

### Stored reward retries

`game_retry_admob_rewards(limit)` reuses already verified inbox fields and the real grant function. It retries only generic application failures, with exponential backoff and at most eight automatic attempts. It does not fetch a receipt from the client or generate a signature. Provider deliveries and automatic retry counts remain separate. A successful retry grants once; deleted-owner and already-applied handling remain authoritative.

Unit/reward/time/transaction conflicts and cancelled opportunities remain manual review. An exhausted transient failure also remains visible for review; the worker never changes signed facts or auto-approves a mismatch. A later authentic Google delivery can still fulfill an owed valid promise once, even after automatic retries were exhausted. Operator review can replay an unchanged stored receipt through the existing service-only receiving function after resolving the real database fault; inspect the original proof, offer and immutable placement first. Never edit the promised amount, fabricate a completion, discard the review row or grant a second reward to hide an unresolved mismatch. There is no public repair/grant endpoint.

## Private worker

After applying all migrations through `202610270015_operational_recovery.sql`, a local operator can use the matching ignored `.env.api` or private process environment:

```powershell
npm run recover:operations -- --batch 20
```

The worker always attempts bounded ad retry and expired optional-metrics cleanup. It runs provider cleanup/discovery when a valid `PRIVACY_REVENUECAT_KEYS_JSON` keyring exists, and dispute discovery when matching Razorpay configuration exists. Missing new provider accounts do not invent successful reconciliation. Invalid configured providers are errors without suppressing unrelated maintenance. Keep sandbox and production in separate databases/projects and explicitly set `MONETIZATION_ENVIRONMENT`.

For a cloud container set `OPERATIONS_ENV_ONLY=true`; the worker then reads managed environment variables only and never needs an uploaded `.env` file. The API image caches the same pinned Deno runtime's worker graph. Override its default API command with:

```text
deno run --cached-only --frozen --allow-env --allow-net --config supabase/functions/deno.json scripts/run-operations.mjs --batch 20
```

This source supports a scheduled job; it does not by itself create one. A proposed starting schedule is every five UTC minutes, one replica, a 240-second platform timeout and bounded retries. The worker stops taking new work after 150s, finishes/checkpoints the current observation where possible, and never tries to make a platform timeout into a completed scan. Each provider task also checks a 30s budget between external observations. A single bounded provider/SQL call may finish after that budget; this is not preemption or an exact runtime guarantee. Size the job/interval for actual project count, provider rate limits and backlog.

Ad/prune maintenance runs first. Provider tasks prefer older completion timestamps, so a slow early project cannot permanently starve later configured projects. Deferred tasks are visible in output and retain their durable position. A completed scan clears its cursor/pending subjects and starts fresh on a later invocation; an unfinished page cannot be discarded. Provider callbacks, client recovery and this worker all use the same idempotent receipt/ledger primitives.

### Journals and concurrency

`game_operation_jobs` is private with RLS and no anon/authenticated access. Its identity binds provider, environment, database and project/merchant. A five-minute lease, random token and exact bigint generation fence older workers. Checkpoint writes renew that lease; stale writes/finish acknowledgments cannot overwrite a newer worker. Provider pages and observation IDs are persisted before application. Applied-but-lost replies replay the same private observation, not another cleanup generation or sale.

Journal payloads may temporarily contain provider cursors and candidate IDs. They stay in the private database, never in ordinary job logs/status. Completed journals are cleared; status contains only hashed job keys, kinds, safe counts, flags and timestamps. Durable cursors avoid a new file-storage dependency. Backup/retention policy for operational metadata still needs the same business review as other retained private records.

SQL summaries accept only whitelisted bounded numbers/booleans. No raw SQL/provider error text, token, email or cursor is logged. Legacy workstation CLI recovery remains available, including its local lock/journal safeguards. The dispute identity comparison now treats reordered JSON keys as the same identity while still rejecting changed fields; PostgreSQL JSONB ordering cannot prevent a legitimate resume.

## Monitoring and unresolved activation work

The service-only `game_operation_status()` returns heartbeat/lease status, manual ad/privacy review counts, exhausted retries, due privacy work, retained web receipt count and expired-metrics backlog. The worker exits nonzero for an error or an actionable review/missing-configuration/overdue condition. A manual email-provider retention review is intentionally actionable rather than falsely reported as automated erasure. Counts and health are not automatic approval to erase retained records.

Register the actual Azure scheduled job and monitoring rules, verify executions/heartbeat and configure the intended action group before enabling commerce/analytics. The current proposed overdue thresholds are 20 minutes since a registered task finished, and 24 hours for physically unpruned expired analytics. Export/analysis already excludes raw activity at its 90-day expiry. Alerts are not installed or delivered merely because the worker has a failure exit code. This checkpoint sends no operator email or other message.

The health report warns if due provider cleanup has no keyring, or existing web receipts have no web configuration. It cannot reconcile an inaccessible provider or make a mixed database environment safe. Existing payment webhooks/client recovery still cover capture/refund/purchase synchronization; this worker currently adds **dispute** scans, not an invented universal provider settlement/refund export. Keep webhook health, purchase recovery and actual provider reconciliation in the activation checklist.

## Executed evidence

- 427/427 full automated tests passed (46.00s) before the additional focused fairness case; focused worker tests cover mutual exclusion/expiry, stale-token fencing, private status/roles, malformed responses, configuration isolation and applied-but-lost discovery replay with real disposable PostgreSQL and the production provider adapter using local HTTP fixtures.
- Shared callback tests wait for actual SQL acknowledgement. The composed case verifies an independent OpenSSL ECDSA query through the production public handler and real PostgreSQL, then proves retry/tamper handling cannot duplicate credit. No real Google signature/account is claimed.
- Real PostgreSQL trigger-induced grant failures recover after the trigger is removed. Eight repeated failures back off and exhaust, while mapping conflicts remain manual and a later valid delivery remains idempotent.
- Pinned Deno 2.9.6 typechecks both API/edge entry points and starts the environment-only worker without filesystem access, failing closed with no configuration. Docker image execution/build has not yet been run for this checkpoint.
- The **installed Azure CLI 2.70 ACR packer** produced a local archive of 24 files/127,218 bytes: API/shared function sources plus the five exact worker modules. The manifest excluded environment files, signing material, local recovery data, other scripts and Git history. No archive was uploaded or build charged.

Primary references checked 27 October 2026: [Supabase routing/cold starts](https://supabase.com/docs/guides/functions/routing), [Azure Container Apps jobs](https://learn.microsoft.com/en-us/azure/container-apps/jobs), [Azure CLI container apps](https://learn.microsoft.com/en-us/cli/azure/containerapp). Local evidence does not prove real scheduler timing, external provider throughput or production notification delivery.
