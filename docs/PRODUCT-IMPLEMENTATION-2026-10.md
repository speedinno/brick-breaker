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
