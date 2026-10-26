# Product implementation and evidence — 26 October 2026

Status: **in progress** on `codex/product-controls-economy`, starting at
`db30b6235405f8869050232e478a318f05548386`. This record follows the owner's
version 1.1 execution brief. It is not a release or a claim of completed scope.

## Starting point and reproduced defects

The game uses shared ES modules and a custom circle/grid simulation, Capacitor
8.5.3 for Android/iPhone, Supabase authentication/PostgreSQL, and an Azure
Container Apps API. Version 3.2.0/build 20 has no installed commerce/ad SDK.
The existing full test baseline passed 77 tests; local output is retained in
`.openai/local/product-redesign/baseline-tests.log`. Native store signing,
payment/ad approval, Apple tooling and physical-device validation are distinct
from code checks and remain to be established.

Executed against the original engine (Node, 26 October):

* Empty court, ball `(200,470)`, radius 2.35, velocity `(0,-300)`, step 1/120:
  velocity becomes `(18,-321.4965007585619)` without any collision. Universal
  per-substep angle clamps modify both direction and speed in free flight.
* Brick `[160,168] × [258,266]`, ball at its centre `(164,262)`, velocity
  `(100,100)`: the first step destroys the brick and awards 10 points. Initial
  penetration correction is incorrectly treated as a new impact.
* Inspection also found a final-position paddle collision test, first-grid-cell
  collision selection, random wall angle nudges, and unconsumed sweep remainder.
  These are risks to test individually, not proof of every reported device issue.

## Decisions and alternatives

| ID | Decision | Alternatives and evidence | Choice / confidence / outstanding check |
|---|---|---|---|
| D-PHY-01 | Keep the shared engine; repair its collision path | Retaining overlap substeps cannot satisfy analytical residual-motion fixtures. Replacing the whole engine adds migration and bundle costs without addressing this small static-grid game's identity. | Swept circles against exact faces/rounded corners, deterministic contact constraints and bounded recovery. High confidence in analytical correctness; stage clearance and performance require regression checks. |
| D-PHY-02 | Keep deliberate paddle aiming, centralize its law | Original 1.12-radian steering is approximately 64.2°; physical flat reflection alone offers little aiming agency. The brief's symmetric 60° law is slightly less shallow and has simple mirrored fixtures. | Prototype 60° top aiming with zero motion influence. Rounded upper caps reflect relative to paddle motion; underside is one-way. No claim of player preference before playtesting. |
| D-PHY-03 | Ordinary reflections must remain exact | Random wall nudges and universal minimum components hide stagnation and alter unrelated movement. Removing them may expose periodic paths in narrow channels. | Remove both corrections; evaluate a separate deterministic, diagnosed stagnation rescue only if reproducible stage tests require it. Do not relax stage-clear tests to hide a regression. |
| D-CTL-01 | Relative, no-jump pickup on touch and desktop | Old absolute placement can demand a large initial move. Pickup-based absolute control avoids that jump but requires reaching the current paddle's screen coordinate, obstructed by a finger or a trackpad's finite travel. Relative control allows clutching anywhere. | Touch gain 2, desktop gain 1, independently adjustable 0.5–4; no filtering. Net 3 CSS-pixel desktop takeover threshold applies only at pickup. Software traces verify predictability, not comfort; compare with pickup-absolute in physical playtests. |
| D-CTL-02 | Held-key set, both directions neutral | Last-key priority changes direction when another key is pressed; neutral makes simultaneous holds explicit and symmetrical. Existing frame-side key motion changes its relationship to physics with render timing. | Full legal travel / 0.65 seconds; keys and pointer intent enter the same 120 Hz simulation. No modifier/text-field capture. High confidence in software consistency; precision tuning needs hardware feedback. |
| D-PROD-01 | Manual arcade mastery with optional short assistance | Baseline: existing free stages and unlimited AUTO removes reason to learn control and conflicts with owner direction. Idle progression with heavy ad supply risks automation farming/content exhaustion. Premium authored puzzles need a proven content value and audience this project does not yet have. | Preserve immediate free guest/manual/offline play and the distinctive channel-to-swarm loop; add manual mastery records and short finite assistance. Keep content progression available to assisted players. No fabricated demand or revenue advantage. |
| D-COM-01 | Voluntary rewarded ads and two consumable packs; no automatic ads | Automatic interstitials plus removal product could yield broader impressions but interrupt play and need a paid escape. Pure premium entry increases trial friction; cosmetics/subscriptions lack demonstrated willingness to pay or a continuing content promise. | Reject forced ads and obsolete ad-removal/bonus settings entirely. Select 300s and 900s packs; draft India ₹79/₹199 and US $0.99/$2.49 remain merchant price hypotheses, never UI-authoritative prices. The ad/purchase conversion tradeoff remains unmeasured. |
| D-COM-02 | Recoverable account owns all time | Guest checkout reduces initial friction but creates store-account/game-account transfer and overlapping gift ambiguity across three platforms. Local-only money balances cannot prevent double spending. | Guest manual play needs no login; time earning, spending and purchasing use an optional verified game account and a shared server ledger. No local guest currency is introduced, so linking guest stage progress cannot duplicate a gift or spend. Disclose the sign-in requirement before offering a timed benefit. Measure its friction. |
| D-COM-03 | Online, one active reservation; explicit 15s/30s or remainder | Cached offline shared balances allow concurrent spending. Device-bound offline reservations are feasible but extend uncertain recovery authority and support cost. | Server reserves at most 30s, consumes actual active milliseconds, releases unused time idempotently. No new offline activation. Pause, manual input, loss, stage completion, ads and suspension end the activation. No automatic restart or next-stage activation. Lease/checkpoint recovery remains to implement and verify. |
| D-COM-04 | Bounded manual/rewarded supply | Unlimited achievement conversions could replenish assistance indefinitely; local-day resets are clock-tamperable. Rolling windows avoid reset bursts but are harder to explain. | After a server-recorded manual clear, introduction 30s once; 15s per distinct manually cleared stage per UTC day, at most four; voluntary rewarded 30s, at most three pending/earned offers per UTC day. Assisted runs never earn time. Account identity/manual telemetry is not proof of a human. No reward for importing old progress. |

| D-MEA-01 | First-party product learning joined to verified financial facts | Provider dashboards alone cannot explain control/assistance/return-play outcomes. A default Firebase revenue objective can compare ad/purchase revenue but does not itself compute net contribution after acquisition/variable costs. | Implement private receipt/monetary facts first; add privacy-controlled engagement, stable linked-account assignment and provider ad/settlement reconciliation. Keep estimates, unknown costs and anonymous identity coverage explicit. Purchase facts are implemented; the remaining measurement pipeline is unfinished. |
| D-MEA-02 | Default-off optional account play analytics; no guest tracking ID | Anonymous tracking broadens funnel coverage but adds identity/consent complexity; dashboards alone miss gameplay effects. Account opt-in gives a coherent cross-device choice with less invisible collection. | Explicit choice/revision fencing, bounded queue, 90-day raw expiry and deletion/export controls. This is a consenting-account sample with selection/survivorship bias, never all acquired players. Global collection and the coaching study remain paused until operations/disclosures are ready. |
| D-OPS-01 | Dedicated edge reward ingress; bounded scheduled recovery with database journals | Always-warm Azure avoids its observed cold path at continuous compute cost; workstation-only/file-based recovery depends on a PC or persistent volume. | Keep the game API in Azure, use existing Supabase for small verified callback ingress and fenced private cursors. Verify actual deployment/latency/scheduler/alerts before activation; source/mocks are not an availability SLA. |

The selected mastery improvement is a separate, persistent manual-clear record,
including clean clears without losing a life. Replaying an already completed
stage can improve that record without inventing additional campaign progress.
This gives assisted players a legible reason to return manually. It is a product
hypothesis to implement and assess, not evidence of increased retention.

## Research used so far

Accessed 26 October 2026. Product observations are not market-size or revenue
evidence. Player reviews are qualitative and date-specific.

* [Bricks Breaker Quest, Google Play](https://play.google.com/store/apps/details?hl=en&id=com.mobirix.swipebrick2): aimed-shot play, stages, ads and purchases. Diana B's 19 August 2026 review objects to ad burden and difficulty. This supports testing interruption/frustration, not a population-level conclusion.
* [Quest, App Store reviews](https://apps.apple.com/us/app/bricks-breaker-quest/id1288430163?see-all=reviews): Ilm910's 3 November 2018 review describes accidental currency spending from confusing continuation controls; Lrd_Vadr's 16 January 2022 review prefers a fixed ad-free purchase. Old observations cannot establish current prevalence.
* [holedown, official developer](https://grapefrukt.itch.io/holedown): finite-shot aiming, six planets, upgrades and an endless mode illustrate a premium/content-led alternative. Desktop price is not an appropriate direct mobile price benchmark; this does not prove demand for our game.
* [W3C Pointer Events 3](https://www.w3.org/TR/pointerevents3/): capture, cancellation and gesture lifecycle are relevant to unified touch/pointer routing. They do not establish a preferred sensitivity or physical trackpad comfort.
* [Box2D simulation documentation](https://box2d.org/documentation/md_simulation.html): fixed stepping and continuous collision concepts inform the analysis. Box2D is not installed and its API is not being introduced.
* [Breakout: Recharged, Atari](https://atari.com/products/breakout-recharged): arcade play, 50 challenges, power-ups and leaderboards illustrate challenge-led replay. Our channel layouts differ, but swarms/power-ups alone are easy-to-copy differentiation; mastering clear aiming needs to carry the experience.
* [Apple review guidelines, 3.1.1 and 3.1.3(b)](https://developer.apple.com/app-store/review/guidelines/): native digital purchases use IAP; purchased credits cannot expire. Multiplatform game consumables may be accessed across platforms when also available through IAP. We will not steer native users to browser checkout; regional exceptions are not presumed enrolled.
* [Google Play payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en): additional playtime is digital goods; native Play billing is the default, with separately conditioned alternatives. Show the actual charged price; currency remains within this game.
* [Google rewarded-ad policy](https://support.google.com/admob/answer/7313578?hl=en): affirmative opt-in, clear benefit disclosure, dismissibility, no interference with ordinary use, and delivery of the earned benefit guide the selected voluntary placement.

## Foundation verification (executed)

* `node --test tests/physics.test.mjs tests/engine.test.mjs`: 32/32 passed,
  including existing 12 starter/22 generated-family clear tests (29.72s).
* `node --test tests/controls.test.mjs`: 8/8 passed. The same timestamped trace
  through the actual engine produces matching paddle/ball state, score and lives
  at 30/60/90/120/144 Hz and irregular render delivery. Assertion tolerance is
  1e-7 world units, tighter than the provisional 0.416-unit endpoint bound.
* `npm test`: 102/102 passed (35.52s), including database/RLS, difficulty bands,
  pickup counts, cloud/save regression checks and the added foundation checks.
  Diagnostic metadata was subsequently enriched; the focused checks must be
  repeated for that final file state.
* Local `/__controls` fixture: 5 grouped checks passed against the real app in a
  393×852 iframe in the Codex Chromium browser. These are **synthetic DOM events**:
  HUD routing, no jump/vertical drift, second-pointer exclusion, edge reversal,
  crossed-button suppression, pause/reset and modifier/UI preservation. Native
  pointer capture and physical gesture comfort are not proved by this fixture.
* Browser accessibility inspection exposes both sensitivity sliders and updates
  their numeric output on a keyboard adjustment. No screenshot is claimed as
  evidence of physical latency or frame time.
* CPU-only T-stage sample: seed 8937 clears in 132.367 simulated seconds,
  peak 120 balls, zero solver exhaustion; 15,884 ticks took approximately
  540ms in Node on this host. This is not a phone FPS/battery result.

Numerical policy: positions 1e-7 world units, approach velocity 1e-9 world
units/s, simultaneous TOI 1e-10s, maximum 16 contacts per ball per tick. Ordinary
static contacts conserve speed. Parallel seam normals coalesce; independent
approaching constraints invert the incoming vector once. The upper flat paddle
steers at up to ±60°; its upper rounded caps reflect in the paddle frame then
normalize to the configured arcade ball speed. Underside/already-passed balls
are ignored. Exhaustion freezes remaining motion with a diagnostic record.

The independent review pass caught iteration-order-dependent pickup placement
at a brick seam even when the reflected velocity agreed. Simultaneous contacts
now process stable collider IDs before damage/reward RNG. Initial overlap is
corrected without points; tests cover a separating ball and centre penetration.
No random rescue was needed by the existing stage-clear suites.

## Time ledger foundation (implemented; not deployed or player-integrated)

`supabase/migrations/202610260001_time_ledger.sql` adds owner-isolated credit
lots, FIFO reservation allocations and an auditable event ledger. It locks an
account wallet before reserving or settling and enforces one active spender.
The API exposes auth-bound state/reserve/checkpoint/settle/recover operations;
the grant and source-refund primitives are service-only. No client success flag
can mint credit. Native/browser purchase verification adapters and bounded reward
rules still need to call those private primitives after actual verification.

Each allocation preserves provenance. Settlement conserves reservation = consumed
+ released; retries and late checkpoints cannot rewind acknowledged consumption.
Refunds reverse that lot's unused time and keep already consumed refunded value
separate. A refunded active allocation prevents lease renewal; its held value is
not simultaneously made available elsewhere. Crash recovery waits for the old
10-second lease to expire, then settles acknowledged consumption and releases the
rest. The client consumption journal and final product UI remain to implement.
No currency tables/migration have been applied to the live project yet.

`node --test tests/time-ledger.test.mjs`: 10/10 passed using real PostgreSQL in
PGlite, including permissions, duplicate grants, device/account binding,
reservation conflicts, partial settlement, crash recovery, smaller remainders,
and refunds that preserve unrelated value. PGlite is a single connection; its
concurrent submissions do not prove multi-connection hosted lock contention.

After the ledger/API changes, `npm run build:web`, `npm run check`, and the full
`npm test` passed: **112/112**, 56.09s. A subsequent focused run of physics,
controls and cloud checks passed **34/34** after adding moving-top analytical,
same-ball repeated-hit, destroyed-brick return-path and error-channel checks.
Time-bank errors do not invalidate a successfully synced stage-save indicator.

Still required before shipping: real provider transaction ownership/tombstones
across account deletion, versioned trusted reward/configuration, a durable client
time journal, finite UI replacing every legacy AUTO path, real ad/IAP/web
adapters, mastery/progression improvements, metrics and native/device verification.
At foundation commit `0698376`, the public development app **still had its old AUTO buttons**;
COM-01 is not passed. Do not publish this intermediate branch as the finished
commercial build.

## Finite assistance player flow (subsequent checkpoint)

`dist/assistance.js` now requires a server-issued, account/device/run-bound
reservation. `dist/assistance-ui.js` opens a time bank from both existing AUTO
entry points. There is no normal UI path to unlimited assistance. The application
sets its automated controller only after successful authorization. Legacy saved
AUTO flags retain assisted history but cannot reactivate AI or spending authority.
The underlying `Game` watch controller remains usable by engine regression
tests; it is not a player-facing free-completion mode.

The client keeps a durable request/consumption journal, carries fractional
milliseconds across checkpoints, checkpoints outside input/physics work, and
settles partial use. Final settlement may discard less than one millisecond of
fractional use; no per-tick truncation occurs. At 2×/4× playback, each physics
tick consumes its actual real-time share. A final partial tick ends exactly at
the remaining authorization boundary, then pauses for manual handover. Tests
cover this through the actual engine at multiple render/playback rates.

Touch/key/pointer takeover stops charging at the corresponding control boundary;
pause, background, loss and stage completion stop the activation. Closing the
time bank while authorization is arriving cannot start AI afterward. Stale
account operations cannot populate another account's wallet or pause its game.
An expired or uncertain authorization never resumes automatically. Corrupt local
journals retain server recovery controls; a corrupt cache can be removed only
after authoritative absence of a pending reservation.

The `/__assistance` fixture ran the **actual application and local PostgreSQL
ledger**, with fake authentication only: four grouped checks passed for partial
takeover, pause/no hidden debit, cancellation during delayed authorization, and
agreement between the displayed balance and debit ledger. This is neither a
provider sandbox purchase nor a native-device test. The fixture creates only
disposable local credit, is guarded by `QA_FIXTURES=1`, and is excluded from
packaged assets. Screenshot evidence is held locally in
`.openai/local/product-redesign/assistance-ledger-pass.png`.

`npm run build:web`, `npm run check`, and `npm test` passed **125/125** (37.33s)
after the player flow was connected. The subsequent corrupt-journal case passed
in the focused **13/13** assistance suite. Final verification below will supersede
those intermediate counts. No production migration, API deployment, new APK or
iPhone build is claimed at this checkpoint.

Final check for this checkpoint: `npm run check` and `npm test` passed
**126/126** (35.75s). Both browser fixtures were rerun: routing **5/5** and
real-ledger integration **4/4** grouped checks passed. The routing fixture now
starts from an isolated guest namespace and blanks the previous document before
clearing storage, preventing its pagehide save from contaminating the next run.

### Next implementation work, without reducing the original scope

1. Add trusted/versioned economy configuration, bounded UTC manual rewards and
   introduction, and persistent manual/clean-clear mastery. Preserve unknown
   clean status for old snapshots rather than inventing a clean result. Server
   completion must acquire the wallet lock before the run lock: adding a reward
   trigger without reconciling the current reserve/completion lock order would
   introduce a deadlock risk.
2. Add verified provider transaction ownership/tombstones before live monetary
   grants. Deleting an account must not make an old store transaction mintable
   again. Complete refund/restoration and exact benefit/price provenance.
3. Implement actual native IAP, owned-web checkout and native/web rewarded
   adapters, with missing setup clearly unavailable. Registry discovery found
   RevenueCat Capacitor 13.7.6 (Capacitor >=8), web 1.73.1 and community AdMob
   8.2.1; these are researched candidates, **not installed integrations** yet.
4. Add learning/revenue instrumentation, substantive critical review and the full
   RES/CTL/PHY/COM/INT evidence table. Update the old native smoke's unrestricted
   watch assumption; do not report an old APK smoke as a pass for this source.
   Build/sync native packages and verify available hardware/toolchains, keeping
   unavailable Apple/hardware/provider tests explicitly unverified.

## Verification and remaining scope

Controls, finite assistance, authoritative accounting, real commercial adapters,
broader product selection, instrumentation and the full RES/CTL/PHY/COM/INT
coverage audit remain part of the objective. No production commerce readiness,
native device pass or final product selection is claimed by this interim record.

## Manual earning and mastery checkpoint

Migration 202610260002 adds immutable, typed economy versions, one introduction per account, and four distinct-stage manual rewards per UTC day. A run snapshots its reward evaluation, including a capped result, so retrying tomorrow cannot invent a reward. Completion and reservation use wallet-first locking. Only positively consumed assistance marks a run assisted; a canceled zero-use reservation does not forfeit manual credit. Unsettled reservations must reconcile before completion.

Personal manual/clean stamps use compact int8multiranges and survive recent-history truncation and guest linking without earning currency from imported records. Manual and clean best times are separate from assisted times; unknown historical loss counts do not manufacture clean badges. The live database was read-only checked as PostgreSQL 17.11, supporting the required range functions. No production migration was applied.

All 144 Node tests passed (42.84s), including real PostgreSQL tests for caps, UTC/config retries, imports, assistance eligibility, permissions and atomic rollback. The actual app plus local PostgreSQL browser fixture completed a stage through scripted touch input and passed three grouped checks: campaign/mastery persistence, exactly 45,000ms intro plus manual credit, and visible home/replay stamps. This scripted input trace is not a human playtest. Local evidence: .openai/local/product-redesign/manual-reward-pass.png.

RevenueCat Capacitor 13.7.6, purchases-js 1.73.1 and AdMob 8.2.1 were installed and audited (zero npm vulnerabilities). Installation alone is not provider integration or sandbox verification. The default native plugin whitelist excludes AdMob until an app ID and consent setup are supplied; an absent Google Mobile Ads app ID must not crash free builds. A missing upstream npm license file is reproduced from the exact RevenueCat hybrid-common 19.15.0 source tag in licenses/. Build and syntax/catalog checks passed.

The owner asked us to choose providers and give account setup instructions after implementation; no more account/credential requests are needed now. Stripe India invitation eligibility and Paddle's stored-value exclusion require care when selecting web checkout. Provider selection and approval remain distinct from working integration.

## Native purchases and durable ownership checkpoint

Selected provider path: RevenueCat over native Google Play/Apple consumable billing, Razorpay Standard Checkout for the owned website, AdMob for native voluntary rewarded ads and Google's web ad integration for browser rewards. No automatic/interstitial advertisements or ad-removal SKU are selected. Razorpay's India checkout/local-payment path avoids depending on a new Stripe India invitation. International activation and the game's commercial eligibility still need provider approval; this is a selection, not an approval claim. Paddle was considered: it serves games but also excludes virtual currency/stored value; we will not assume our bank is approved there. The unused RevenueCat web SDK was removed. Sources checked 26 October: [Stripe India](https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india?locale=en-GB), [Paddle AUP](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle), [Razorpay checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/). Web checkout and ad adapters are still implementation work.

Migration 202610260003 adds immutable product-benefit mappings and globally unique provider/store-app/environment transaction ownership. Original store SKU and actual application bundle identify native benefits; RevenueCat project or product IDs cannot create a fresh identity for an old purchase. Independent RevenueCat API responses confirm the actual app bundle, consumable product, store, owner/original owner, quantity, timestamp, environment and owned/refunded state. The webhook payload is only a lookup hint, authenticated with a deployment secret. Provider response size and pagination origins are bounded. Sources: [purchase API](https://www.revenuecat.com/docs/api-v2/purchase), [product/app expansion](https://www.revenuecat.com/docs/api-v2/product), and its downloaded official OpenAPI schema.

Refund is terminal against stale owned responses. Refund-before-grant cannot mint a credit; existing credit reversals preserve unrelated lots, already consumed value and held-reservation accounting. Account deletion removes progress and balance but retains a minimal receipt tombstone with its owner reference removed, preventing restore/reinstall from replenishing it. A late first receipt after deletion also becomes a non-granting tombstone. Deletion screens and draft privacy/terms now disclose removal of unused purchased time and retention of minimal transaction records. Provider-side privacy deletion/outbox work and a production retention review remain required before enabling commerce.

The player time bank now loads native SDK prices, sells exact one-time durations, handles cancellation/pending approval, keeps an account-scoped checkout journal and offers recovery of the existing server balance. A successful SDK callback alone cannot update money/time. Account switching during a store prompt cannot credit the next account. Retiring all sale products retains recovery. Web cannot load the native plugin, and missing configuration leaves manual play available. Native checkout has no external web-payment link. The root native plugin whitelist excludes AdMob until its build configuration exists. Android launch mode is singleTop for payment-app return; iOS has the IAP capability flag and Swift 5.0. Source: [RevenueCat Capacitor installation](https://www.revenuecat.com/docs/getting-started/installation/capacitor).

Verification: the full Node suite passed 173/173 (77.11s), including nine PostgreSQL purchase-ownership cases and provider/client failure and identity-race tests. Subsequent real-bundle identity hardening passed the focused 17/17 provider/database tests; the additional project-migration regression then passed in the 9/9 verifier suite. Deno 2.9.6 now runs through npm exec and the API typecheck passed. Actual-app browser fixtures still pass controls 5/5 and assistance plus PostgreSQL 4/4 grouped checks. These are local/mocked provider tests, not RevenueCat/store sandbox transactions.

Android assembleDebug passed with RevenueCat included (3m13s, 184 tasks); its APK is a local development artifact, not a public release. Both native asset trees were synced. The mobile sync wrapper normalizes Windows-generated Swift package paths for Mac portability. iOS source/package sync is verified, but no Xcode archive/device run has occurred. No production migrations, provider configuration, API deployment or public APK update are claimed.

The development APK was inspected: its bundled purchase module and exactly the three intended native plugins are present; AdMob is absent. Four configured private server credential values were checked against packaged web assets, with zero matches. This scan does not prove provider configuration or replace release signing/security review.

## Owned-web checkout and partial refunds checkpoint

The owned browser edition now has a separate Razorpay Standard Checkout adapter. It does not use the native IAP plugin. Backend-owned price versions and immutable SKU quantities produce a durable account-bound intent before any provider order is requested. A lost create response is recovered by its exact unique receipt, not by blindly posting another order. The provider confirms amount, currency, product/intent notes and environment; web checkout presents that actual quoted INR amount for a separate confirmation. A quote check cannot itself open a payment window. Opening uses the fresh confirmation click, without an intervening network await. Existing quotes retain their promised quantity across later price/configuration changes; captured late payments are honored. New quote creation is bounded at 20/account/hour.

Client callbacks require an HMAC over the server-held order ID and returned payment ID. The provider is then queried independently for capture, exact amount/currency, owner-bound order and cumulative refunds. Webhooks authenticate the untouched raw body with a current/previous configured secret, check merchant identity and perform the same independent lookup. Authorized/failed/uncaptured payments cannot mint time. A closed window is an uncertain outcome, not proof of cancellation. Late callbacks remain in the original account's journal, cannot overwrite a newer checkout, and cannot directly credit money/time. Server recovery and webhooks can reconcile a completed payment after callback/network loss. Owned-origin gates and platform routing keep native and portal editions away from web checkout.

Migration 202610260004 supports cumulative partial reversals from the original lot. Unspent credit is reversed first; held credit remains held until settlement, and consumed refunded value is separate from spendable balance. A refund after reservation revokes renewal. New activations can still use the valid remainder of a partially refunded lot. Thirty generated settlement/refund cases agree with an independent final-balance model. Migration 202610260005 binds web orders, payments, immutable price versions, original durations and reported provider fee/tax fields. Partial reversal uses exact SQL numeric arithmetic with less than one millisecond of downward rounding; a full refund revokes the exact full quantity. Stale lower refund totals cannot recreate value. Fees/taxes are stored as reported, not yet treated as a verified net-revenue model. Dispute/chargeback reconciliation and the broader commercial metric pipeline remain work.

Provider-specific API calls use fixed HTTPS origins, bounded bodies and deadlines, no redirect forwarding of credentials, and controlled diagnostic errors. Account deletion retains non-granting order/receipt tombstones, including first capture arriving after deletion. Local recovery cursors continue large histories across bounded batches/restarts instead of repeatedly getting stuck on their first pages. Damaged checkout journals require authoritative recovery before a new checkout. The owner will receive the ordered account/configuration guide once implementation is ready; no real provider credentials or merchant approval exist here.

Current official sources checked 26 October: [create orders](https://razorpay.com/docs/api/orders/create/), [receipt lookup](https://razorpay.com/docs/api/orders/fetch-all/), [Standard Checkout and signature verification](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [raw webhook HMAC/idempotency](https://razorpay.com/docs/webhooks/validate-test/), [payment capture/refund fields](https://razorpay.com/docs/api/payments/fetch-with-id/). International-payment and gaming eligibility remain external approval gates. The initial owned-site implementation quotes INR; it does not invent a USD marketing conversion. Native store prices remain their actual localized SDK prices.

Verification: all 212 Node tests passed (57.69s), including the complete current migration chain, provider/client failure cases and real PostgreSQL orchestration with a mocked provider. The API passes Deno 2.9.6 typecheck; build/syntax/catalog checks pass. A subsequent browser check found that an HTML modal could cover an external checkout iframe. The app now closes the time-bank modal before opening web checkout, keeps gameplay paused, and returns only if the original game/account/navigation state is still appropriate. Price confirmation receives focus and remains visible in the mobile-sized scrolling dialog.

After those UI fixes, the actual application plus local PostgreSQL passed five grouped browser checks: price review without opening checkout, explicit mock-SDK opening with no unverified credit, exact 300,000ms capture grant once, actual finite-assistance gameplay/manual takeover, and restore after spending without refill. The provider API, SDK and authentication are mocks; this is **not** Razorpay sandbox verification, real payment testing or physical-device evidence. Local screenshots: .openai/local/product-redesign/web-quote-review.png and web-checkout-ledger-pass.png. All financial mocks live under tests/ and guarded localhost QA routes, outside packaged assets and API deployment context. No production schema changes, provider activation, API deployment or new public APK are claimed.

## Reward opportunity and native verification checkpoint

Migrations 202610260006/7 reserve a versioned, account/device-bound opportunity before ad loading. Reward milliseconds, UTC bucket, original cap, provider/platform and immutable placement are frozen. Prepared expiry or cancellation before invoking the SDK releases an unused slot. Committed/uncertain native views stay pending, including after dismissal; an already-earned reward cannot be cancelled. A valid delayed callback honors its original amount/day even after configuration or placement retirement. Pending slots reduce availability and are distinct from successful credits. Native failure after invocation remains uncertain until reconciliation; UI/SDK integration must explain this rather than presenting it as a successful view or silently discarding it.

The native GET callback handler validates Google's exact raw signed query with ECDSA P-256/SHA-256, converts DER signatures for WebCrypto, rejects duplicate/malformed fields, fetches keys only from Google's fixed HTTPS key server, handles rotation, and caches no key set beyond 24 hours. A live read successfully fetched/imported the current Google key set (one usable P-256 key). That verifies current key format/connectivity, not a real rewarded callback. Source: [Google SSV guide](https://developers.google.com/admob/android/ssv), checked 26 October, page updated 23 October 2026.

Only independently verified native callbacks reach the private grant/inbox functions. The signed transaction, nonce, unit, reward tuple and event timestamp bind the original offer. A retained proof contains raw signed content, signature, key ID and the Google public key used at receipt. Mapping errors become review records without granting or losing evidence. Duplicate callbacks cannot create another lot. Account deletion removes the offer's account/device links; a late native completion remains non-granting for that deleted owner. New-offer configuration is separate from processing a previously promised valid callback. A deployment's provider environments must match MONETIZATION_ENVIRONMENT, and staging must use its own database.

The browser H5 provider exposes an adViewed client callback, not native Google SSV. Its selected path therefore has explicitly bounded client trust, one committed nonce, durable idempotency, original-time recovery and the same shared opportunity cap. It is not labelled cryptographically verified. SDK cancellation/final-callback ordering and fresh user-gesture presentation must be respected in the remaining client adapter. Source: [H5 adBreak callbacks](https://developers.google.com/ad-placement/apis/adbreak). The native plugin documentation states test ads do not invoke the SSV endpoint; do not add a TEST-signature bypass or call a simulated callback real sandbox evidence. [Plugin rewarded-ad guide](https://github.com/capacitor-community/admob/blob/main/docs/rewarded.md).

Verification: the full suite passed 233/233 (55.02s). The subsequent before-presentation cancellation case passed in the focused 13/13 PostgreSQL reward suite; the eight cryptographic tests also pass. The latter use independently generated OpenSSL signatures and mock Google key responses, including altered/reordered queries, invalid encodings, substituted keys, rotation and stale-cache rejection. Two cases join that cryptographic path to the actual PostgreSQL grant/inbox. The API passes Deno 2.9.6 typecheck. Ad API failures no longer invalidate a successfully synchronized stage-save indicator.

Still required: the player ad preparation/confirmation/recovery interface, native UMP/privacy/build configuration, actual AdMob and H5 adapters, configuration/setup tooling, chargeback/provider-privacy lifecycle work, revenue/experiment instrumentation and the final full requirement audit. AdMob remains excluded from the default native build. No real ad has been requested, no publisher approval or real SSV callback is claimed, and no production schema/API/public build was changed.

## Rewarded SDK and player flow checkpoint

The time bank now has an optional reward section with availability, an exact promised duration, separate preparation and final Watch buttons, cancellation, and pending-reward recovery. Preparing an offer never opens an ad. The final H5 show function executes synchronously in the new Watch click, after server authorization. A prepared offer expires locally after two monotonic minutes and is invalidated by leaving the game; recovering its unopened journal returns the original opportunity. Completing a reward does not launch assistance or resume gameplay.

`rewarded-adapters.js` contains the actual pinned AdMob Capacitor integration and the Google H5 callback adapter. Native preparation checks plugin availability and adult eligibility before importing the SDK, requests current UMP consent information, shows a required available consent form, and refuses to request ads unless UMP permits it. It initializes once, requests non-personalized ads with General content rating, and exposes UMP privacy options when required. It binds the opportunity UUID to both SSV fields. SDK reward callbacks remain hints: the full-screen session ends on dismissal/failure rather than the native reward promise, which can resolve while the ad is still visible. Listener cleanup and serialized loading prevent a stale load from overwriting a newer reward identity. No ATT prompt was added.

H5 waits for explicit consent authorization before loading its fixed Google script, uses Google's sandbox flag only in the sandbox environment, and requires the actual adViewed callback for its bounded client-trust claim. No native completion can invoke the browser grant path. Repeated callbacks are sticky/deduplicated. An early definitive H5 dismissal releases its opportunity; an uncertain native result stays awaiting independent SSV. A native opportunity already acknowledged by the server as awaiting need not occupy the finite device journal forever: delayed delivery is retained by the server inbox and credited there, including after reinstall. The original H5 earned timestamp is durably retained across failed requests and restart, anchored to the server's authorization plus monotonic elapsed time rather than the phone wall clock. A placement/configuration change between catalog and reservation cancels before any SDK request instead of sending the wrong unit into a promised opportunity.

Ad, purchase and assistance operations share UI exclusion rules. External forms/ads/checkout close the HTML top-layer dialog, pause and save the current game, stop existing synthesized tones and temporarily mute new tones. Mute ownership supports overlapping external surfaces without changing the player's sound preference. Returning checks the game, account and navigation identity; it never automatically resumes the simulation. Purchase external cleanup now also releases its mute when an account change suppresses reopening the old panel.

This is still an implementation checkpoint, not ad activation. `ad-runtime.js` defaults to disabled with audience policy unreviewed; AdMob is still excluded from default native plugin registration. The optional 18-or-older acknowledgement is an eligibility guard, not evidence of an approved target-audience/children policy or a legal age-verification system. The owned-web adapter's default consent function denies requests: the concrete certified browser CMP bridge and published messages are still required. Native App ID/build profile tooling, store disclosures, audience review, real consent-geography testing and real publisher callbacks remain release gates. No ad request was sent to Google, no real provider account was configured, and no production API/database or public APK was changed.

Verification: full automated suite **254/254 passed** (51.48s), including 19 adapter/service tests and three audio tests. The six grouped mobile-size browser checks exercise the actual app, service, H5 adapter and real PostgreSQL ledger with explicitly mocked publisher callbacks: no automatic presentation, cancellation/slot recovery, paused external display, exactly 30,000ms once for duplicate completion callbacks, no automatic assistance, non-refilling recovery, early dismissal, and invalidation/recovery after backgrounding. The existing checkout browser flow also passed all five grouped checks after shared external-UI integration. This is scripted browser evidence, not physical-device comfort, real advertising or provider sandbox evidence. `npm run build:web`, syntax/catalog parity and Deno API typecheck passed. Local screenshots are retained under `.openai/local/product-redesign/rewarded-offer-review.png` and `rewarded-ledger-pass.png`.

Next: native ad build configuration and certified browser consent integration; monotonic shared wallet snapshot acceptance; dispute/provider privacy/reconciliation lifecycle; commercial measurement; remaining product and release audit; then the ordered account setup guide requested by the owner. RevenueCat remains the selected native IAP coordinator, Razorpay the owned-web payment provider, AdMob the mobile rewarded provider, and Google H5 the owned-browser rewarded provider. Account creation and genuine provider validation are deferred until the code/setup paths are ready, as requested.

## Native ad configuration, consent bridge and wallet ordering checkpoint

`configure:ads` now validates a public profile and prepares the matching runtime settings, separate Android/iOS plugin registration, native App IDs and delayed measurement flags. It does not source environment text as executable code or accept private provider keys. Production requires review flags and rejects demo App IDs. Android-only configuration cannot accidentally register an unconfigured iOS plugin. Reconfiguration is idempotent and disabling restores native IDs/plugin lists without erasing existing settings. Android pre-build rejects a registered plugin with no App ID; dependency versions are pinned. The actual AdMob native SDK compiled successfully with Google's demo App IDs and requests disabled: 217 tasks in 2m28s. iOS source/SPM synchronization passed; Xcode/signing/device evidence is still absent. The default disabled profile and three-plugin registration were restored afterward. See [ad configuration reference](AD-CONFIGURATION.md) for exact commands and evidence.

The owned-browser path now connects to Google Privacy & messaging. It loads only the configured publisher's official CMP tag, only on an owned origin after eligible deliberate ad preparation. It rejects denied/unknown/unconfigured ad-purpose signals, Global Privacy Control and current GPP opt-outs/known-child/unsupported signals. GPP 1.1 ping data is queried for each opportunity; the removed getGPPData API and one-time initial US opt-out state are not used. No analytics tag is added. European choices reopen through Google's supported API; US choices retain Google's default entry rather than calling an Ad Manager-only override. Visible consent forms cannot time out into a resumed game. The browser flow still requires published provider messages and real geographic/default-entry verification; this is not a claim of legal certification. Sources: [Google CMP API](https://developers.google.com/funding-choices/fc-api-docs), [GPP API specification](https://github.com/InteractiveAdvertisingBureau/Global-Privacy-Platform/blob/main/Core/CMP%20API%20Specification.md).

Migration 008 serializes wallet observations with the same per-account lock used by financial writers and returns an account-bound snapshot counter as an exact decimal string. Client snapshot acceptance rejects older/equal versions, foreign owners and malformed balances, including versions beyond JavaScript's safe integer range. All bank/checkout/ad/cloud assignments use the same bank accessor. Legacy response compatibility ends after the first versioned response for that bank instance. The displayed balance is never activation authority. Regression testing found and corrected a copied older refunded-consumed formula; the final migration retains the cumulative partial-refund calculation, and the independent 30-case refund model passes.

Verification: **274/274 automated tests passed** (55.65s), including six profile tests, eight consent tests and six snapshot tests with actual PostgreSQL role/transaction/counter checks. The actual browser bridge passed five grouped mock-CMP/real-ledger UI checks; the existing six reward and five checkout browser checks also passed with the ordered wallet backend. Native Android compilation, web bundling, syntax/catalog parity and Deno API checking passed. An ADB device inventory was empty; no physical-device result was fabricated. Screenshots remain in `.openai/local/product-redesign/consent-wallet-integration-pass.png` and `rewarded-wallet-snapshots-pass.png`. No real publisher request, store sandbox transaction, production schema/API deployment or public APK was made.

Remaining work includes financial disputes/chargebacks, provider privacy deletion and reconciliation lifecycle, reliable real callback hosting, commercial/experiment measurement, wider device/release verification, the complete requirement-by-requirement product audit and the owner's final account setup guide. The final report still needs consolidation into the requested twelve-part deliverable.

## Verified web disputes and recoverable operations checkpoint

Razorpay dispute webhooks now authenticate the raw bytes and merchant, then independently query the dispute, payment and original order. Only canonical minimal financial facts enter the private database path. Event amounts can request a freshness retry but cannot mint or reverse credit. Open cases do not remove funds. Confirmed losses target only the original purchase; cash refunds plus chargeback deductions are capped at its original amount and converted with its original immutable duration. A later-phase win restores only the unspent reversed remainder, never consumed time or an extra grant. Pending appeals retain the last confirmed loss; older phases remain stale. Conflicting same-phase terminal outcomes require explicit independently verified review. The relevant provider fields are documented in [Razorpay's dispute entity](https://razorpay.com/docs/api/disputes/entity).

Migration 009 keeps the cumulative refund and reversible chargeback components separate, preserves ordered snapshots, records restoration as an adjustment rather than a promotional grant, and applies first capture plus known disputes in one transaction. Active held credit remains held; reversal invalidates renewal without making it simultaneously spendable elsewhere. Deleted-owner cases remain non-granting tombstones. Existing public/native grant and recovery contracts remain intact; direct unwrapped web capture is private.

The resumable operator command discovers missed disputes and checkpoints an entire provider page before processing. Exact replay after network/write failure is safe. It binds its journal to merchant/environment/database, rejects loops/corrupt state, excludes concurrent local commands and checkpoints before an orderly stop. Inspection is read-only. A terminal correction requires the fingerprint of concrete inspected financial facts and saved dispute revision, re-queries before applying, and checks that revision again inside the locked SQL transaction. A new financial observation after the read cannot be overwritten by the late correction; duplicates leave an unchanged review usable. A higher-phase final outcome clears an older conflict even after an intermediate appeal. No provider refund/accept/contest operation is automated. The operator reference is [web dispute recovery](WEB-DISPUTE-RECOVERY.md); the final account-creation guide remains deferred as requested.

Client recovery explains confirmed chargebacks and pending dispute reviews instead of reporting a bare successful sync after a balance change. These notices persist across paged recovery/restart. An audit also found that deleted-receipt warnings had only persisted within one in-memory batch; they now persist across a client restart during the same recovery scan. Normal restoration still never refills consumed time or opens a new checkout.

Verification: **301/301 automated tests passed** (59.37s), including sixteen real-PostgreSQL dispute/orchestration cases, an independent twenty-case rounding/reversal model, eight durable discovery/CLI tests and provider/receipt-notice tests. The focused sixteen-case suite also covers explicit zero/full monetary boundaries and an observation/correction interleaving at the SQL commit boundary. Six grouped browser checks passed against the actual app and PostgreSQL with local provider/SDK mocks, including an explained chargeback, exact changed quantity, no duplicate checkout and no refill. Syntax/catalog parity and Deno API typecheck passed. Evidence: `.openai/local/product-redesign/web-chargeback-recovery-pass.png`. No production schema/API, real payment/provider account or public binary was changed.

Remaining: provider deletion/cleanup retry lifecycle, reliable deployed callback/recovery operations, commercial measurement/experiments, broader product/device/release verification and the final twelve-part requirement audit/report/account setup handoff. Same-phase conflicts intentionally need the documented operator review; that path has not been exercised against a real provider case.

## Account erasure, local recovery and offline dependency checkpoint

Migration 010 registers native provider identities before SDK configuration, then inserts provider cleanup jobs and per-device random deletion receipts in the actual Auth deletion transaction. A rollback removes all deletion effects. Lost HTTP responses can be resolved using only the saved random receipt; no account lookup or email is exposed by the status endpoint. Multiple devices keep independent receipts, including when a prepare response is lost. Existing financial ownership tombstones remain non-granting after deletion.

RevenueCat cleanup verifies project access before interpreting a customer 404. DELETE success means queued, not erased. The leased worker retries temporary failures, requires explicit review for invalid configuration/permissions, and waits for two absence checks at least 24 hours apart before redacting the clear subject. Late verified deleted-owner receipts reopen cleanup and invalidate an older worker acknowledgment. Email delivery uses a tracked manual erasure/retention review; retained records are never reported erased. The private keyring keeps retired projects accessible and rejects mixed environments. The operator command has safe counts, bounded batches, inspect/retry/manual-resolution operations and no contact payload in logs. See [account deletion recovery](ACCOUNT-DELETION-RECOVERY.md). It has not been run against real credentials or scheduled in Azure.

The app seals deleted owners against late writes, purges account progress/current field/assistance/purchase/ad/recovery journals and its auth cache, clears private form fields and serializes native SDK logout after in-flight identification. Guest saves, other accounts, preferences and device identity survive. Failed local removals keep a durable receipt for startup recovery. The privacy and deletion notices distinguish immediate account deletion from provider cleanup, retained financial records and pseudonymous retired-subject guards. These records currently have no automatic expiry; an approved retention/backup policy remains required.

An offline audit found that the service worker omitted several modules added during earlier checkpoints. Its cache now includes the real app/legal module dependency graph, including wallet snapshots, reward/consent modules and the new privacy module, with a cache-version change. A graph-based offline regression check detects future missing dependencies. This is automated source/cache coverage, not a fabricated physical-device airplane-mode result.

Verification: the initial full suite passed 325/325 (60.57s); the updated privacy/client/operator focused suite passed 25/25, and the offline suite passed 3/3. The actual browser app and real disposable PostgreSQL passed four grouped deletion checks: account journals removed, signed out, nonempty guest score/mastery preserved (ordinary last-played timestamp advances), private form fields cleared, and queued provider/SMTP jobs. Auth/provider identities are fixtures, with no real account deletion. Screenshot: .openai/local/product-redesign/account-deletion-recovery-pass.png. Web bundling, syntax/catalog parity and API Deno checking passed. The final full suite passed **327/327** (61.00s), including the operator CLI and offline dependency checks.

Remaining: periodic provider-customer discovery for profiles recreated without payment webhooks, deployed callback/cleanup/recovery operations and alerts, real-provider/device validation, commercial measurement and experiments, wider product/release checks, and the final twelve-part audit/report plus ordered account setup guide requested by the owner. This checkpoint is not a production-readiness claim.

## Provider customer discovery checkpoint

Migration 011 adds a service-only, idempotent provider-observation registry. RevenueCat customer pagination now validates the project and exact same-origin cursors, pages past unrelated SDK/custom IDs, and sends only canonical game UUID candidates to the retired-account matcher. Active and unknown identities cannot be queued. The scanner persists a full candidate page and observation nonce before SQL; replay after an applied-but-lost response does not invalidate the same cleanup lease again. Cursor hashes detect page loops across invocations; completion removes current subjects and cursor from the private journal. An unacknowledged page cannot be discarded by the explicit restart flag.

The review found a retention exception: a new observation previously could reopen a manually retained provider profile for automatic erasure. It now remains in manual review with its retention reference until an explicit operator retry. This applies to late purchase webhooks as well as discovery. The operator guide documents per-project scans, durable storage, periodic restart/resume, private cursor handling and monitoring. Real provider cursor behavior after concurrent deletion still needs sandbox validation; no provider account was queried or deleted.

Verification: 25/25 focused privacy/discovery tests and **337/337 full tests** passed (55.28s). A composed test uses the production HTTP adapter and scan orchestrator with real disposable PostgreSQL: it applies a page, loses the SQL response, starts a cleanup lease, replays the saved observation and proves that lease remains current. Configuration/cursor attacks, replay, active-account exclusion, retained exceptions, interruption and completion redaction are covered. API Deno check passed. Next work is commercial measurement/experiment integration, deployed callback/recovery operations, device/release verification and the complete final audit/setup guide.

## Verified purchase financial measurement checkpoint

Migration 012 and the private native receipt wrapper atomically persist a verified purchase/grant and normalized monetary observation. RevenueCat API snapshots contribute USD gross/commission/tax/proceeds estimates, rounded once to integer micros without multiplying a transaction total by quantity or subtracting commission/tax twice. Missing or inconsistent money remains unknown and does not invalidate an independently verified purchase. Immutable, fingerprint-deduplicated observations prevent restoration/sync from counting another sale; differing usable snapshots require review. Provider-reported country is distinguished from a verified storefront or inferred location.

The read-only operator report groups by provider/platform/product/reported country/currency. It preserves known subtotals while returning null complete proceeds when coverage is missing or ambiguous. Refunded native net proceeds remain unresolved without fee/adjustment evidence; stale owned responses cannot resurrect a refunded receipt. Legacy receipts without monetary observations/orders stay counted with unknown amounts. Financial tombstones remain after game account deletion without returning player identity in reports.

Owned-web cash uses independently verified captured amounts, cumulative refunds, confirmed dispute deductions and the provider's inclusive fee. Razorpay's fee already includes GST, so the separate tax field is informational and is not deducted again. Cash deductions are not capped at the game-time reversal limit: a full refund plus retained fees and a separate confirmed deduction may yield negative cash. The report keeps USD/INR separate, never substitutes a draft checkout price, and explicitly returns no finalized-settlement or net-contribution claim. See [commercial measurement operator guidance](COMMERCIAL-MEASUREMENT.md).

Verification: **350/350 full tests passed** (56.89s), including thirteen financial cases and a composed production-verifier/persistence/real-PostgreSQL test. Coverage includes restore deduplication, quantities, unknown and conflicting money, transactional rollback, refunded and deleted owners, inclusive fee tax, additional chargeback cash, legacy records, permissions and safe CLI setup/date failures. Focused financial/native verification passed 22/22; syntax/catalog parity and Deno API checking passed. No live provider report, production migration/deployment or real payment was performed.

Next: first-party engagement/consent, stable account experiment assignment/exposures, ad lifecycle/value and publisher-report reconciliation, actual cohort/acquisition/variable-cost inputs and contribution calculations, then deployed operations, device/native release checks and the requested full requirement audit/account setup handoff. This is the purchase-fact foundation of COM-24, not completion of that whole analytics requirement.

## Optional account analytics checkpoint — 27 October

**D-MEA-02** selects explicit opt-in analytics for signed-in accounts, with no guest analytics identifier/upload. The account-wide revision fences stale devices and lost responses; offline opt-out stays locally off and cannot overwrite a newer remote choice. Opt-out clears optional activity, assignment and queues; Auth deletion cascades, local account deletion purges journals, and account export includes optional events with truthful partial-export feedback. Raw events expire after 90 days; the bounded service-only cleanup command still requires an actual scheduled job before collection is enabled. The API collection flag defaults off. See [optional play analytics](OPTIONAL-PLAY-METRICS.md).

The real app now records optional help usage, bounded manual/assisted real-active-time segments and sticky-assisted terminal outcomes. Typed ingestion rejects free-form/contact payloads, deduplicates retries and run outcomes, caps daily/stream volume, and never grants currency. A paused, immutable coaching-copy experiment uses stable account assignment and records a viewable stage-one presentation only after 250ms with no obscuring dialog/home/splash. Assignment alone is not an exposure or a measured study result. The sample is consenting signed-in accounts; acquisition/installation and all-player retention remain unknown.

Lifecycle audit: pagehide now uses the same pause/save/input-clear/assistance-stop path as backgrounding. Native buy and restore explicitly enter the existing external pause/save/mute context before SDK invocation; web price review remains visible until a fresh checkout confirmation. Component tests cover both native platforms, cancellation, store failure and web confirmation ordering.

Verification: the final full suite passed **383/383 tests** (53.32s), including the lifecycle adjustment and four native/web purchase-panel boundary cases. The actual browser app and disposable PostgreSQL passed five grouped analytics checks. Web bundling, syntax/catalog parity and Deno API checking passed. No production migration/deployment, real-player activity, provider account, real payment or public binary was changed. Actual offer/ad exposure wiring, ad financial reconciliation, cohort/contribution reporting, deployed operations, native/device checks and the final twelve-part report/setup guide remain outstanding.

## Actual offer and ad observations checkpoint — 27 October

Priced native buttons and original web quote text now report optional exposure only after 50% intersection and 250ms foreground dwell with an unobscured centre. Account/panel changes cancel pending capture. Native amounts use actual SDK price/currency; web order responses include immutable product/configuration alongside actual provider price. Loading a catalog is not a view. Missing observer support or invalid optional metadata produces no fabricated event and never blocks checkout.

Rewarded adapters now distinguish request/display/reward/closure/failure. Native display comes from `Showed`; H5 placement completion alone does not imply display. AdMob's pinned rewarded paid-value callback contributes normalized currency/micros/precision without network names or impression identifiers. Identical observations deduplicate; conflicting value snapshots are retained for later review, never summed or used for currency grants. These account-scoped optional client reports are not verified publisher proceeds. H5 has no invented per-impression money. The still-unapplied migration 013 is extended with the strict optional value schema and owner/opportunity checks before any live rollout.

Verification: **394/394 full tests passed** (48.55s). Added coverage includes actual panel observation wiring, dwell/foreground/overlay/account races, SDK callback/precision/deduplication boundaries, optional failure isolation and real-PostgreSQL ad ownership/schema rejection with no grants. Actual browser checkout and rewarded fixtures each passed seven grouped checks using real disposable PostgreSQL and local SDK/provider/auth mocks. Quote exposure, normal financial recovery and separate ad phases were observed through the actual app. No real ads/payments, production migration or public binary was used. Publisher reconciliation, cohort/contribution reports and the remaining deployment/device/final-report work still follow.

## Optional-account report checkpoint — 27 October

Migration 014 adds a service-only read-only report and `npm run report:play`. It groups seven/thirty-day, end-exclusive play windows by first optional observation date, separates exact return days and their maturity, preserves manual/assisted play, and exposes real price/configuration groups, distinct ad phases and SDK value precision/conflicts. Late contradictory values mark the original opportunity unknown; cross-day repeats cannot create another first value. Coaching counts separate assignment, exposure and mature manual outcomes, including server sequence ordering so an earlier same-batch clear cannot be attributed to a later exposure.

The scope is currently consenting surviving accounts, with no identity in operator output. Opt-outs/deletions remove them from analysis. Unknown acquisition, financial attribution, publisher proceeds and winner remain unknown; selection/survivorship, offline receipt dates, expiry and dropped observations are explicit. The CLI environment is a label for its configured database, so separate sandbox/production collection projects are required. This report does not turn sign-ins into installers or SDK value into revenue.

Nine focused PostgreSQL/CLI cases and **403/403 full tests** passed (47.82s), covering receipt-day/maturity boundaries, price/currency separation, duplicate/late/conflicting callbacks, same-batch outcome ordering, expiry, deletion, roles and safe configuration/date failures. Syntax/catalog parity and whitespace checks passed. No real player data or production database was queried.

## Reviewed contribution calculator checkpoint — 27 October

`report:contribution` calculates exact D7/D30 window contribution from private operator-reviewed aggregate source evidence. It verifies expected file hashes, omits source paths/contents from output, distinguishes publisher/purchase/acquisition/cost proof kinds, and never assumes unknown cost is zero. Net inputs are used once without another store/ad-network share deduction. All variable components and additional merchant tax are explicit; integer micros preserve large/negative adjustments and currencies remain separate.

Only mature, reviewed, final cohort measurements yield an observed total. Estimated proceeds/calendar allocations stay estimates. A per-new-player measure additionally requires a positive, complete independently reviewed unique acquired-player denominator; install events and optional accounts never masquerade as it. Attribution/source truth still needs operator review; hashes pin bytes, not authenticity. No player data, report API estimate, or SDK callback is silently converted into a financial claim. The incomplete example returns no result until real evidence exists. See [contribution reporting](CONTRIBUTION-REPORT.md).

Eight focused model/actual-CLI tests passed, including each missing component, verified zero versus unknown, exact signed arithmetic, currency mismatch, maturity, denominator/attribution limits, proof-kind validation and changed-file rejection/path redaction. These amounts/files are fixtures; actual provider settlement/publisher reconciliation and acquisition/cost reports remain external data prerequisites. This isolated private reporting utility does not change the game/runtime or production configuration. Deployed operational recovery, native/device validation, the final requirement audit/report and ordered provider account setup remain to finish.

## Durable operational source checkpoint — 27 October

The dedicated `reward-callback` edge entry point and legacy Azure route share a signature-verifying handler. It acknowledges only a committed verified inbox/ledger result and exposes no balance/proof. A small entry graph avoids the Azure catalog/API cold path without pretending a real delivery SLA was measured. Migration 015 adds bounded exponential retries for generic stored verified-reward application failures; mapping/time/transaction conflicts remain manual and eight exhausted retries remain visible.

The private worker runs maintenance plus configured provider cleanup/discovery/dispute scans using PostgreSQL journals, random lease tokens and exact generations. Lost acknowledgments replay the same persisted page/observation; stale workers cannot overwrite new state. Complete scans clear current subjects/cursors, and older provider tasks are prioritized between bounded invocations. A real integration test exposed a database serialization concern: dispute recovery compared JSON object order as identity. It now compares exact fields instead, preserving scope/environment ownership through JSONB reordering.

Safe counts/heartbeat/review/backlog status and nonzero failure exits are implemented. The worker has no public execution endpoint. The API image now caches its source graph and supports environment-only runtime, while the actual installed ACR packager excludes .env/signing/local/Git material. Deployment profile expansion, actual edge deployment, Azure schedule and monitoring installation still remain; no source checkpoint is a live reliability claim. See [operational recovery](OPERATIONAL-RECOVERY.md).

Verification: **427/427 full tests** passed (46.00s), including composed OpenSSL-signature/public-handler/PostgreSQL grant, trigger-induced transient recovery, retry exhaustion, role/lease fencing and lost discovery acknowledgments. The final focused worker suite passed **9/9**, including the added fair-deferral case. Syntax/catalog parity and Deno typechecking passed; the pinned environment-only Deno worker starts and fails closed without credentials or filesystem access. A local ACR context contained 24 allowed files/127,218 bytes and no private material; it was not uploaded. No production resources/migrations, real provider account/data, public binary or operator message was changed/sent.

## Azure private configuration checkpoint — 27 October

The existing deployment forwarded only the original Supabase settings. It now resolves allowlisted provider/feature configuration into managed secret references, preserves existing recovery/unmanaged settings, and keeps unrelated management/mail/DNS/deletion credentials out of newly configured API values. Secret-bearing updates use a private temporary ARM body instead of process arguments; files are removed on success/failure and raw private diagnostics stay out of output. The API preflight checks all new tables and the status RPC before an image build, and collection activation requires recent successful retention. Dedicated Single revision mode is explicit; old immutable suffixes and response-only fields are not blindly replayed into a new revision.

Local PowerShell orchestration/payload tests passed. A real read-only plan confirmed the selected subscription; current Azure provider metadata supports stable ARM `2026-07-01`. A real **validation-only** request initially rejected the read-shaped API body despite green local fixtures. After removing optional null/response fields and normalizing input, Azure accepted both API and manual worker bodies with dummy secrets and the existing image. No deployment, image build, new worker, schedule or real key update was requested. This is schema/preflight evidence, not a live/sandbox reliability claim.

The worker's overdue decision now filters to currently expected task identities, preserving retired metadata without permanent false alarms; missing keys for actually due cleanup/retained web receipts still raise review. The full suite passed **430/430** (42.84s). Google's live public-key endpoint was read successfully and one current verification key imported; no real signature, ad delivery or reward was tested. Next are migration application support, actual API/edge/worker rollout and monitoring, then native/device checks, full requirement/report consolidation and the ordered account setup guide.
