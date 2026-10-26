# Commercial measurement

Implementation checkpoint, 26 October 2026. The current command reports verified purchase facts and the limits of their monetary coverage. It does **not** establish profit, finalized settlements, ad earnings, acquisition cost, retention or a winning experiment. Those parts of the wider measurement work remain unfinished.

## Read a purchase report

Apply migration `202610260012_commercial_financials.sql` after the preceding migrations before deploying the API that calls `game_record_native_purchase`. That service-only wrapper records the verified receipt, any currency grant and its normalized financial observation in the same transaction. An invalid private observation cannot leave a partially committed grant. Missing or malformed provider monetary fields become an explicit unknown observation; they do not invalidate an otherwise verified store purchase.

Use the existing ignored `.env.api` or a private process environment with the matching `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and explicit `MONETIZATION_ENVIRONMENT` (`sandbox` or `production`). No provider secret is needed merely to read already-recorded facts. The report command is read-only:

```powershell
npm run report:commercial -- --from 2026-10-01 --to 2026-10-31
```

The inclusive window uses **UTC purchase dates**, limited to 367 dates. Refunds and disputes are the currently known state of those purchases; this is not a cash-flow statement grouped by refund posting date. Keep its output private; it contains business revenue information. No account UUID, email, store transaction ID, card or contact payload is returned.

Each group identifies provider, platform, product, reported country, currency and calculation basis. `verifiedReceipts` counts one store/provider transaction once, including its refunded state; `units` sums its verified quantity. Restore, retry and synchronization never add another sale. Known amounts are decimal **strings of millionths of that row's currency**, preserving integer precision. USD and INR are never added together or converted with an invented exchange rate.

`knownProceedsMicros` is a subtotal of rows with usable observations. `completeProceedsMicros` is null if any receipt in that group is missing/ambiguous for that basis. Null is not zero. Report coverage also exposes legacy native receipts without observations and web receipts without captured orders. Those receipts remain counted with unknown money rather than disappearing.

## Native provider observations

The verifier reads `revenue_in_usd` only from RevenueCat's independently fetched purchase object after checking store/app/product/owner/environment. The raw contact payload is discarded. USD gross, commission, tax and proceeds are rounded once to integer micros, with a two-micro consistency allowance for separately rounded components. The SDK's current localized price is not used as historical revenue. Provider monetary fields are transaction totals and are not multiplied again by receipt quantity.

The report uses the provider's proceeds value once; it does not subtract the store commission or tax a second time. These values are labelled `revenuecat_api_estimate`, **not finalized store payouts**. RevenueCat describes tax and commission as estimates. `country` is labelled `provider_reported_unspecified`; the v2 field does not establish whether that row is a verified storefront country or an estimate. Unknown/contradictory country observations remain unassigned. No IP geolocation or device-locale guess is added.

Financial observations are immutable and deduplicated by a normalized fingerprint. Differing usable monetary snapshots for one receipt produce a review/incomplete group instead of choosing the higher amount. A later valid observation can fill an earlier missing value. A refunded native receipt's net proceeds remain unknown until evidence covers retained fees/adjustments; the code does not assume a cost-free refund or let a stale owned response resurrect that sale's ownership. Deleting a game account removes its owner reference, while the minimal financial tombstone and observations remain under the disclosed retention policy.

## Owned-web cash observations

The report uses the already-verified Razorpay payment, immutable quote, cumulative refunds and confirmed dispute deductions. The payment entity's fee **includes GST**. Its separate tax field is shown as included fee tax and is not subtracted a second time. The basis is:

```text
captured amount − cumulative refunded amount − confirmed dispute deductions − inclusive provider fee
```

Dispute deductions are not capped using the game-time reversal cap: actual cash can be negative after a full refund, retained processing fee and an additional confirmed deduction. The wallet still follows its separate nonnegative available-credit rules. Missing fees and conflicting disputes mark the report incomplete. The result is labelled `razorpay_api_cash_before_merchant_tax_and_costs`; it does not include merchant sales-tax liabilities, additional dispute/settlement fees, operating costs or finalized bank reconciliation. No country is inferred from INR, phone number, billing contact or game locale.

## Next measurement work and release gates

Selected direction **D-MEA-01**: first-party product/experiment events joined to verified provider facts, with explicit consent/retention controls for optional player analytics. Alternatives were provider dashboards alone (cannot explain control/assistance/return-play changes) and a default Firebase revenue objective (useful combined purchase/ad comparisons, but does not itself compute this game's net contribution). The purchase-fact foundation, optional account ingestion/assignment, actual viewable prices, distinct ad lifecycle/native SDK value callbacks and read-only account cohort/experiment report are implemented. See [optional play analytics](OPTIONAL-PLAY-METRICS.md) for **D-MEA-02**, `report:play`, consent/revision/retention controls, the paused coaching study and the sample's selection bias. Client SDK value is not publisher proceeds. Publisher-report reconciliation and actual acquisition/cost contribution inputs remain unfinished.

The business decision metric is observed net contribution per newly acquired player over explicit D7/D30 windows, with cohort maturity and identity coverage disclosed. The private [reviewed contribution tool](CONTRIBUTION-REPORT.md) now calculates it from actual reviewed aggregate publisher/payment/acquisition/cost evidence, retaining source hashes and separating unknowns, estimates, allocations and denominators. It includes publisher ad proceeds, net purchase proceeds, acquisition spend, variable hosting/support/content costs and only additional merchant tax not already deducted. It never silently substitutes signing-in accounts/install events for unique acquired players, infers anonymous cross-device identity, combines currencies with an invented rate, treats estimated earnings as settled cash or treats unavailable costs as zero. Retention, manual return play, assistance supply/use, stability and purchase trust remain guardrails. No real source reports or cohort inputs have been supplied; live reconciliation/results and a winning variant remain unverified.

Real provider accounts, localized prices, native monetary field coverage, settlement/export access and physical-device validation remain pending. The migration, worker/report code and fixture tests are not a production or provider-sandbox verification claim. No production database/API or real financial report was changed/read during this checkpoint.

Primary references checked 26 October 2026: [RevenueCat purchase fields](https://www.revenuecat.com/docs/api-v2/purchase), [RevenueCat tax/commission estimates](https://www.revenuecat.com/docs/dashboard-and-metrics/taxes-and-commissions), [scheduled transaction exports](https://www.revenuecat.com/docs/integrations/scheduled-data-exports), [Razorpay payment fee/tax definitions](https://razorpay.com/docs/api/payments/entity/), [Google impression-level revenue precision](https://support.google.com/admob/answer/11322405?hl=en). A financial report's classification must follow the actual source; these references are not accounting or legal certification.
