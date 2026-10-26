# Account deletion and provider cleanup

Implementation checkpoint, 26 October 2026. This is operator guidance for the review branch, not evidence of deployed provider cleanup. No real customer or provider profile was deleted during verification.

## What commits together

Apply migrations `202610260010_privacy_outbox.sql` and `202610260011_privacy_discovery.sql` after migrations 001–009 in the matching deployment database. Native catalogs register the authenticated game UUID and RevenueCat project before exposing a public SDK key. Separate production and sandbox databases **and RevenueCat projects** are required: RevenueCat customer deletion applies to a project rather than one store environment.

The app saves a random deletion receipt before requesting preparation, then requires a fresh sign-in (15 minutes) to delete. Every device keeps its own receipt; repeated preparation of that receipt is idempotent. Official Supabase Auth deletion fires a `BEFORE DELETE` trigger. Its outbox jobs, receipt completion, auth removal and private-data cascades commit or roll back together. A lost delete response is recoverable with a POST to the API's `/privacy/deletion-status` suffix. The random receipt exposes only a boolean; it is not a public account-lookup endpoint. Keep receipts out of public logs and apply gateway request limits to preparation/status routes before release.

The requesting app blocks late writes to the retired account, removes known account-specific progress, field snapshots, assistance, purchase, web-checkout, rewarded-ad and recovery journals, and clears that account's auth cache. Guest saves, other accounts, shared levels, preferences and device identity remain. A failed local removal retains the receipt for startup recovery. A native purchase identity operation already in flight finishes before SDK logout, and a future account logs in without configuring the SDK twice. Other offline devices cannot be remotely wiped by this code.

## Run the provider worker

Add these **private** settings to ignored `.env.api` or the worker's secret environment. Never add the values to Git, public client configuration or a support message:

```text
SUPABASE_URL=<matching deployment database>
SUPABASE_SERVICE_ROLE_KEY=<server secret>
MONETIZATION_ENVIRONMENT=sandbox
PRIVACY_REVENUECAT_KEYS_JSON=[{"projectId":"proj_example","environment":"sandbox","apiKey":"<private v2 key>"}]
```

The key needs `project_configuration:projects:read` and `customer_information:customers:read_write`. Retain entries for retired RevenueCat projects as well as the active project. One invocation rejects mixed environments or duplicate project identities. Use different secret configuration for production.

```powershell
npm run recover:privacy -- --batch 10
```

Each job is claimed just before use with a two-minute lease; multiple workers cannot finalize the same current lease. An interrupted worker leaves the job recoverable after lease expiry. The command returns counts, without subjects, contact details or raw provider diagnostics. It has not been run against real credentials during development.

The adapter first proves the configured project is visible to its key. A missing/inaccessible project is a configuration review, not successful erasure. It reads the exact customer UUID before deleting. RevenueCat's DELETE 200 means **queued**, so the job stays in verification. Two subsequent customer-absence checks at least 24 hours apart are required before completion and removal of the clear subject. Rate limits, network errors and temporary server errors back off; permission, configuration and malformed-response errors require review. A late independently verified purchase for a deleted account requeues cleanup and invalidates an older worker's acknowledgment; it cannot issue new credit.

The command is not a scheduler. Deploy it as a bounded scheduled job with protected secrets, failure alerts and private database access. Monitor oldest unfinished job, manual-review count, failed runs and time since the last successful worker run. An unrun command does not satisfy account-erasure operations.

## Discover profiles recreated without a payment webhook

Run a separate customer scan for **each** current or retired project in the keyring. This makes only provider GET requests; it queues matches for the existing verified erasure worker rather than deleting profiles directly:

```powershell
npm run recover:privacy -- --scan-customers proj_example --batch 10
```

Here the batch counts provider pages (20 customers each), while the default worker batch counts jobs. Repeat until the command returns `complete:true`. On each page the adapter validates the project, customer objects and same-origin pagination. It ignores unrelated custom/anonymous SDK IDs. The service-only SQL observation matches canonical game UUIDs to the retired-subject hash registry and checks that no active Auth account exists. Active or unknown identities cannot be queued. An operator's retained-provider decision stays in manual review; discovery cannot override it with automatic erasure.

The private journal in `.openai/local/privacy-discovery-PROJECT-ENVIRONMENT.json` binds to the exact project, environment and database. It checkpoints a random observation ID and whole candidate page before applying it. A crash or lost acknowledgment replays that same observation idempotently, without repeatedly invalidating an existing worker. Provider page loops are detected across runs. The current cursor and candidate IDs are removed from the journal on completion; only cursor hashes are used for loop detection while a pass runs. A cursor can itself contain a provider's customer identifier, so protect this journal as private data and keep it on persistent storage between job executions. Do not copy it into logs or Git.

After finishing a pass, start the next periodic pass deliberately:

```powershell
npm run recover:privacy -- --scan-customers proj_example --batch 10 --restart-scan
```

Use one scanner per project with its durable directory mounted. Schedule a new full pass at least daily, resume unfinished passes more frequently, and alert on stale/incomplete scans. Do not blindly pass `--restart-scan` on every scheduled invocation: that would repeatedly scan the beginning. Restarting an acknowledged cursor is also available if the provider invalidates it after customer deletion; review that provider error first. A saved **unacknowledged page cannot be discarded by this flag**. Recover its database observation before restarting. Stale process locks require checking the named process before removal. Completed passes are observations of provider pages, not a promise that another device cannot recreate a profile afterwards.

## Review and resolve exceptions

Inspect job IDs and private subjects through the service-only database administration interface. Keep email addresses and UUID subjects out of shared tickets. The CLI deliberately returns only non-contact metadata:

```powershell
npm run recover:privacy -- --inspect <JOB_UUID>
npm run recover:privacy -- --retry <JOB_UUID>
```

Retry only after correcting the missing/retired key or other diagnosed configuration. A retry clears the previous absence checkpoint. Native SDK logout failure is surfaced to the player with a restart instruction; provider cleanup remains independently tracked.

Email delivery creates a manual review for the configured SMTP service. No general Resend log-erasure API is assumed. Review the actual sending account, delivery/security log retention, backups and lawful retention obligations. Record either confirmed erasure **or retained records**, accurately:

```powershell
npm run recover:privacy -- --resolve-manual <JOB_UUID> --outcome erased --reference privacy-ticket-100
npm run recover:privacy -- --resolve-manual <JOB_UUID> --outcome retained --reference retention-review-101
```

These are mutually exclusive outcomes for one job. `retained` never means erased. Resolve only after the action/review has occurred; the command redacts the clear subject and retains a minimal audit reference. References must not contain contact details. Store financial receipt/dispute tombstones separately; do not delete another payer's provider identity based on the game email.

## Retention and remaining release gates

The database retains a namespaced hash of the retired game UUID to prevent late provider records being treated as a new person. This is **pseudonymous**, not anonymous. Completed job metadata, receipt capabilities, that retired-subject guard and financial tombstones currently have no automatic expiry. The operator must approve and document retention, access and backup schedules before publication.

Verification so far uses disposable PostgreSQL, fake Auth and bounded HTTP provider fixtures. Real RevenueCat permissions, asynchronous timing, cursor behavior after deletions, retired-project access and physical-device SDK caches still need sandbox/device checks. Periodic customer discovery and its private idempotent observation registry are implemented; scheduled execution, persistent worker storage/alerts and real-provider end-to-end evidence remain release gates. Observation metadata has no automatic expiry yet. The privacy notice must describe enabled behavior, retained records and actual operator policies accurately.

Primary API references checked 26 October 2026: [RevenueCat customer deletion/read](https://www.revenuecat.com/docs/api-v2/customer), [project access/pagination](https://www.revenuecat.com/docs/api-v2/project). Provider responses are not proof of the operator's legal compliance.
