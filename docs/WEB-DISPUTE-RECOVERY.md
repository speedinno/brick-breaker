# Web dispute recovery (operator implementation reference)

This is not the final provider-account setup guide. Provider accounts, real webhook/sandbox validation and deployment are still pending. No production database or payment account was changed by this implementation.

## Financial policy

Razorpay exposes dispute status, phase and `amount_deducted`; its documented deducted amount is nonzero only for a lost case. The game independently fetches those facts instead of trusting webhook amounts. [Dispute entity reference](https://razorpay.com/docs/api/disputes/entity), [webhook reference](https://razorpay.com/docs/webhooks/disputes).

Open and under-review cases do not confiscate credit. A confirmed loss reverses the proportional original purchased time using the original immutable price/duration. Refund cash plus confirmed chargeback cash is capped at the original payment before converting with exact SQL numeric arithmetic; it cannot reach unrelated lots. Already-consumed value is recorded separately from spendable balance. An issued reservation remains held until settlement, and a larger reversal revokes lease renewal.

A later-phase verified win/closure can release the original unspent reversed quantity. It does not insert another grant or refill consumed time. The cumulative real-refund component cannot decrease. Earlier phases/nonterminal statuses cannot overwrite a later confirmed outcome. A pending new appeal retains the last confirmed loss until a final outcome. Contradictory terminal outcomes in the same phase, or a smaller loss within that same terminal phase, remain marked for explicit review; the game does not guess which callback is newer. Increasing independently confirmed lost deductions can be applied normally. The contested amount can change in a later appeal while the payment/order/currency identity stays bound.

## Webhook and database path

Migration `202610260009_web_disputes.sql` must be applied with the preceding migrations before this API/client release. Enable the six `payment.dispute.*` webhook types handled in `game-api/index.ts`, alongside the existing payment/refund events. Raw-body HMAC, configured merchant identity, environment and owned order notes remain mandatory. A signed event is a freshness hint: if the canonical provider has not yet reached that state/deduction, the endpoint asks for a retry. Conflicts retained for review are durably acknowledged, rather than endlessly replayed without an audit record.

Capture ingestion and all already-known dispute reversals occur in one database transaction before its balance is visible. The unwrapped capture primitive is private. Dispute facts, observations and reviewed-correction flags are private to service operations. Only minimal IDs, dates, amounts, phase/status and decisions are retained; raw contact payloads and evidence documents are excluded. Deleting the game account detaches its owner and removes its balance, while minimal financial tombstones remain non-granting for a replacement account.

## Recover missed webhooks

The ignored `.env.api` (or process environment) needs the existing server-side Supabase configuration, the Razorpay configuration/keys/webhook secrets and an explicit matching `MONETIZATION_ENVIRONMENT`. Do not put private keys in browser/mobile build settings.

```powershell
npm run recover:disputes -- --batch 20
```

Repeat until `complete` is true. The command discovers provider dispute IDs, then independently refetches each dispute/payment/order before applying a verified observation. It performs no provider refund, dispute acceptance or contest action. Its private local journal is `.openai/local/web-dispute-recovery.json`, bound to the provider merchant, scope, environment and database. A whole page is persisted before processing, and the exact head is retained on failure. A lost response/write may replay an observation; it cannot replay the original purchase grant. SIGINT/SIGTERM finish/checkpoint the current observation before stopping. Review counts are observations of existing cases, not new sales or credits.

After a completed scan, begin a new discovery sweep with:

```powershell
npm run recover:disputes -- --batch 20 --restart-scan
```

A scan cannot be restarted halfway through. Malformed/looping pages, another environment's journal and unavailable storage stop rather than silently skipping evidence. Concurrent local commands are excluded by `.openai/local/web-dispute-recovery.json.lock`. After an abnormal process crash, inspect its recorded PID and confirm that process is gone before removing only that lock file; preserve the recovery journal. No recurring job or paid Azure resource was deployed. A production operator still needs to configure reliable webhook ingestion, recurring recovery and review monitoring.

## Review a conflicting terminal outcome

First inspect the current independently verified financial facts:

```powershell
npm run recover:disputes -- --inspect disp_REPLACE_WITH_REAL_ID
```

Inspection does not grant time, attach an order or alter a dispute. It displays the exact original product/duration, canonical payment/dispute facts and their SHA-256 fingerprint. Compare them with the provider dashboard and the saved dispute history. If the current terminal correction is legitimate, explicitly apply that reviewed fingerprint:

```powershell
npm run recover:disputes -- --resolve-terminal disp_REPLACE_WITH_REAL_ID --expected-sha256 REPLACE_WITH_THE_64_CHARACTER_FINGERPRINT
```

The command re-reads the provider and the saved dispute revision. Changed facts require another inspection; no stale review authorizes a different outcome. The SQL transaction also compares the expected revision under the wallet/dispute locks, so a new observation arriving after the last read cannot be overwritten by a late correction. Duplicate observations do not invalidate an otherwise unchanged review. A higher-phase final outcome clears an older conflict even when an intermediate appeal was open first. Players cannot invoke the correction RPC or read private dispute evidence. A reviewed marker remains in the observation history. This is an operator recovery path for ambiguity, not a generic client grant endpoint.

## Verification so far

The full suite passed 301 tests. The sixteen PostgreSQL/provider-orchestration dispute cases include duplicate/lost/delayed delivery, old/new phases, explicit review, cumulative refunds, active reservations, later wins, deleted owners, a controlled observation/correction race and an independent twenty-case rounding/reversal/loss model. Recovery tests cover restart beyond page one, checkpoint/write failure, interruption, malformed pages, environment isolation and the actual unconfigured CLI failing before any journal/network operation. The actual app's six grouped browser checkout checks include chargeback recovery explaining the balance change without opening checkout. Provider/authentication SDKs and provider API responses in these tests are mocks; the ledger and production orchestration are real. No actual Razorpay chargeback, sandbox account or live webhook is claimed.

The browser recovery notice is carried across pages and client restarts. A confirmed chargeback in history is described as history, rather than pretending every recovery incurred a fresh loss. Existing deleted-account receipt warnings also survive a mid-scan restart. Source-level verification does not replace real provider cases or store/device release checks.
