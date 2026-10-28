# Product implementation report — 27 October 2026

This is the decision and evidence record for the owner's version 1.1 brief as of 27 October. It supersedes intermediate statements in [the chronological work log](PRODUCT-IMPLEMENTATION-2026-10.md). The dated build evidence below concerns `codex/product-controls-economy`, **3.3.0/build 21, source a22930a**. The active easier-opening candidate is **3.3.0/build 25 on `codex/easier-opening-rounds`**. Its starter layouts, controller fixes, purchase recovery, migrations and native checks are described in [starter rollout notes](STARTER-DIFFICULTY-ROLLOUT.md) and the updated [account handoff](ACCOUNT-SETUP-2026-10.md). The live API/worker image is separately identified below and has not yet received the starter v6 update.

The build 21 software, database rollout, scheduled maintenance and local Android candidate were implemented. For build 25, **starter v6 migration/API rollout, commercial activation, physical-player acceptance, Apple signing, store submission and real-player/commercial validation remain open.** The exact-source build 25 package and native acceptance results are recorded in [mobile build evidence](MOBILE-BUILD-3.3.md). No unavailable account, device or player result is treated as passed. The ordered [account setup guide](ACCOUNT-SETUP-2026-10.md) follows the user's instruction to finish implementation before requesting account setup.

## 1. Product direction

The selected experience is a free, immediate channel-and-swarm arcade game: find a narrow entrance, aim with the paddle, grow a bounded swarm, and clear the coloured field. Intended contexts are short phone sessions and ordinary desktop/laptop play. Guest/manual/offline play remains available without signing in or buying anything. Accounts preserve progress and own optional assistance time across official editions.

Return play has two distinct goals: advance the journey and improve a stage's manual/clean mastery. Assistance can advance the campaign without falsely awarding manual mastery. A clean manual clear is recorded separately; legacy saves with unknown life-loss history do not gain an invented clean award. Paused coaching, explicit power-up descriptions, independent sensitivity controls and visible recovery states make the game easier to learn and trust.

This improves the seed proposal by giving manual play a purpose, removing unsolicited commercial interruptions, and making limited assistance an explicit choice. It avoids relying on an ad-funded idle loop or assuming that selling time proves enjoyment. The channel layouts distinguish the presentation; swarms and power-ups alone are readily copied. The core aiming experience still needs real-player validation.

## 2. Research and challenge

Research was accessed on 26–27 October 2026. These are product/policy observations and qualitative feedback, not market-size, revenue or retention measurements. No paid competitor intelligence, private competitor dashboards, representative player panel or acquisition campaign was available.

| Area | Evidence, implication and limit |
|---|---|
| Existing product and players | The repository, old phone screenshots and the owner's reports identify poor pickup/control clarity, uncertain ball directions, saving confusion and mobile presentation problems. Older feedback does not validate build 21. Reproduced engine defects are listed in section 4. |
| Competing play loops | [holedown's developer page](https://grapefrukt.itch.io/holedown) illustrates finite-shot aiming, upgrades and a finite campaign/endless alternative. [Atari's Breakout: Recharged](https://atari.com/products/breakout-recharged) illustrates challenge-led replay. A premium authored-puzzle product would need stronger content proof than this project currently has. |
| Player trust and friction | [Bricks Breaker Quest's Play listing/reviews](https://play.google.com/store/apps/details?hl=en&id=com.mobirix.swipebrick2) includes Diana B's 19 August 2026 complaint about ads/difficulty. [Its App Store reviews](https://apps.apple.com/us/app/bricks-breaker-quest/id1288430163?see-all=reviews) include Ilm910, 3 November 2018, on accidental spending, and Lrd_Vadr, 16 January 2022, preferring a fixed ad-free purchase. These selected, partly old reviews motivate tests; they do not establish prevalence. The fixed-price preference is counterevidence to assuming consumable time is ideal. |
| Controls and accessibility | [W3C Pointer Events](https://www.w3.org/TR/pointerevents3/), [MDN touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action) and [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) support explicit capture/cancellation and timestamped simulation. They do not select a comfortable gain, prove trackpad comfort or make screen-reader play equivalent to the visual game. |
| Geometry and timing | [Box2D's simulation documentation](https://box2d.org/documentation/md_simulation.html) informs fixed stepping/continuous collision analysis. The game retains its own engine; Box2D is not installed. Analytical fixtures, rather than the engine's reputation, establish the selected response. |
| Products and economics | [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/) and [Play payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en) govern digital purchases. Native editions use store billing; bought credits do not expire. There is no assumed enrollment in regional alternative-billing/link programs. Price, conversion, demand and contribution remain hypotheses. |
| Advertising/privacy | [Google rewarded-ad policy](https://support.google.com/admob/answer/7313578?hl=en) informs affirmative choice and reward clarity. [AdMob SSV](https://developers.google.com/admob/android/ssv) supplies independently signed native reward evidence. Browser H5 completion has weaker trust and is labelled accordingly. Nonpersonalized ads do not automatically eliminate consent obligations. |
| Distribution/acquisition | [Google's testing requirement](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en) applies the 12 continuously opted-in testers/14 days rule to new personal accounts; it is not a blanket organization-account rule. Organization verification and actual console requirements still apply. No paid acquisition is justified by present evidence; first test the free loop with a small recruited cohort. Portal editions require separate provider/contract approval and remain commercially disabled. |
| Performance, operations and learning | Actual browser frame sampling, Android compilation, SQL concurrency, hosted tests and Azure executions establish bounded technical facts. They do not establish battery use, phone latency, monthly costs or unit economics. [RevenueCat pricing](https://www.revenuecat.com/pricing), store deductions, hosting, support, content and acquisition all belong in contribution calculations. [The contribution tool](CONTRIBUTION-REPORT.md) keeps missing values unknown. |

The brief's nine research questions connect to implementation as follows:

| Brief area | Finding → decision → next evidence |
|---|---|
| Core enjoyment/identity | Entrance aiming followed by a swarm is the existing distinctive moment → retain free manual arcade loop (D-PROD-01) → observe whether new players understand and choose to replay it. |
| Controls/accessibility | Absolute pickup and small control regions can undermine predictable aiming → relative viewport controls, independent gains, focus/cancellation/reduced-effects settings (D-CTL-01/02) → physical handedness/occlusion/trackpad tasks. |
| Physics/game feel | Free-flight clamps and overlap awards were real defects → exact ordinary contacts plus explicit paddle aiming (D-PHY-01/02/03) → device confidence/aiming observations. |
| Difficulty/content/replay | Existing12 starters and22 procedural families are functional, not proven fair difficulty → preserve progression and add separate manual/clean mastery (D-PROD-01) → stage-level loss/retry/return evidence; no claim that more generated boards equal more fun. |
| Autoplay/economy | Unlimited AUTO removes manual learning and an unbounded gift loop risks farming → finite active time and bounded manual/ad supply (D-COM-03/04) → test comprehension, manual return and whether supply displaces demand. |
| Monetization | Interrupted play and accidental-spend complaints challenge the seed forced-ad model → voluntary rewards/two exact-benefit packs (D-COM-01) → real price/settlement/retention evidence. |
| Cross-platform experience | Local shared spending cannot prevent concurrent use → optional linked identity/server wallet, local field, free offline manual play (D-COM-02/03) → authentic three-edition ownership/lifecycle tests. |
| Acquisition/distribution | Store/portal access is conditional and no acquired audience is measured → owned editions, clear beta/store presentation/sharing; no assumed portal monetization → recruit pilot then measure mature acquisition cohorts before scaling. |
| Performance/operations | The API's cold path is unsuitable as the only fast reward ingress; phone thermal/battery evidence absent → dedicated ingress, bounded scheduled recovery and measured frame samples (D-OPS-01) → actual callback/device/cost/notification tests. |

The strongest objections are that time packs may sell relief from frustrating play, account requirements may reduce uptake, rewarded supply may undermine paid demand, relative desktop control may be less comfortable than pickup-absolute control, and more commercial infrastructure may cost more to operate than this game's audience supports. The response is free manual access, clear short activations, no forced ads, limited supply, mastery/replay, privacy-controlled measurement, staged activation and explicit experiments—not a claim that these objections have been disproved.

## 3. Decisions and rejected alternatives

Owner directions are three official platforms, smooth touch/arrows/mouse/trackpad, accurate documented physics and finite optional autoplay. The following are implementation decisions, not retroactive owner requirements.

| ID | Disposition and selected decision | Alternatives/rationale; remaining uncertainty |
|---|---|---|
| D-PHY-01 | Improve the shared custom engine with exact swept contacts. | Overlap-only substeps miss analytical residual motion; a full engine replacement adds migration/bundle work without a demonstrated benefit. |
| D-PHY-02 | Retain deliberate flat-paddle aiming; improve to a mirrored ±60° law with zero paddle-motion influence on the flat top. | Original ≈64.2° and physical-only flat reflection were considered. Rounded upper caps reflect in the moving paddle frame. Player preference is unmeasured. |
| D-PHY-03 | Reject random wall nudges and universal velocity-component clamps. | They change valid free flight. No separate stagnation rescue was required by the existing clear suites; unusual later-stage loops remain a playtest question. |
| D-CTL-01 | Replace absolute pickup with relative no-jump control; touch gain 2, desktop gain 1, independently adjustable 0.5–4. | Pickup-absolute and click-and-drag remain meaningful alternatives. No smoothing; desktop's net 3 CSS-pixel pickup threshold only prevents accidental takeover. Physical comfort comparison remains open. |
| D-CTL-02 | Improve keys to held-state, both directions neutral, full legal travel in 0.65s at 120Hz. | Last-key priority is less symmetrical. Text fields, controls and modifier shortcuts keep their keys. |
| D-PROD-01 | Add manual/clean replay mastery and optional short assistance to the free arcade loop. | Reject idle progression as the primary experience; defer premium authored puzzles, cosmetics and subscriptions without content/demand proof. |
| D-COM-01 | Replace automatic ads/ad removal with voluntary rewarded ads and two consumables: 300s and 900s. | No automatic ad pacing/removal product or promised post-removal bonus remains. Draft India ₹79/₹199 and US $0.99/$2.49 are price hypotheses. Actual store/checkout prices govern. |
| D-COM-02 | Optional verified account owns all assistance time. | Guest checkout/local money would complicate identity and double spending. Guest manual play is free; guest stage linking cannot mint time. Sign-in friction must be measured. |
| D-COM-03 | Online, single active reservation; choose 15s, 30s or a smaller remainder, maximum 30s per activation. | Reject cached offline shared spending. Active real milliseconds are debited; unused time is released. Offline manual play remains. No automatic restart/resume/next-stage activation. |
| D-COM-04 | Add bounded earned supply: intro 30s once after a recorded manual clear; distinct manual stages 15s each, max four/day; voluntary ads 30s each, max three pending/earned/day. | UTC server day, no reward for imports or assisted clears. Client manual telemetry is not proof of a human; this limits exposure, not all fraud. |
| D-MEA-01 | Add verified financial facts, product outcomes and reviewed contribution inputs. | Provider dashboards alone lack control/return-play outcomes. Firebase combined revenue is not net contribution after acquisition and variable costs; no Firebase account is required. |
| D-MEA-02 | Add default-off account opt-in analytics, bounded queues, revision fencing, export/deletion and 90-day raw expiry. | Reject silent guest identifiers. Consenting-account data has selection/survivorship bias; global collection/coaching experiment remain paused. |
| D-OPS-01 | Add small Supabase SSV ingress and digest-pinned Azure recovery jobs with private PostgreSQL journals. | Workstation-only recovery is not unattended. Always-warm API is a possible later cost/latency tradeoff. An actual failure alert fired; human notification and independent missing-run observation remain activation work. |

Preserved rights include existing stage completion/history, guest linking and legitimate nonexpired purchased time. No existing paid entitlement was found in the starting product. Unknown historical clean mastery is preserved as unknown. A new product's immutable benefit cannot silently replace an old receipt's benefit.

## 4. What was found

Starting source `db30b6235405f8869050232e478a318f05548386` passed 77 baseline tests. It used shared ES modules, a custom circle/grid engine, Capacitor, Supabase and an Azure API; commerce/ad SDKs were absent in the starting default package.

Reproduced against the original engine:

* An empty-court vertical ball at `(200,470)`, velocity `(0,-300)`, step `1/120`, became `(18,-321.4965007585619)` without a collision. Per-step clamps altered free-flight direction and speed.
* A ball initially at the centre of brick `[160,168] × [258,266]`, velocity `(100,100)`, destroyed it and awarded 10 points. Penetration correction was treated as a new impact.
* Contact-order review reproduced seam-dependent pickup/RNG results. Stable collider IDs now order simultaneous effects.
* The old final-pose paddle test, first-grid-cell selection and discarded sweep remainder could miss correct contact/time. Their replacements are covered by analytical fixtures; they do not prove the exact cause of every phone observation.
* During this final browser audit, the old control fixture itself dispatched `pagehide` to read a snapshot. The current app correctly pauses on that event, so the fixture caused its own routing failure. A test-only read-only observer replaced that side effect; all five grouped checks now pass.

The reported maximum-swarm experience, physical touch comfort, sound output and phone edge/cutout behaviour have not been reproduced on build 21 here. Older screenshots and test feedback remain useful inputs, not current acceptance results.

## 5. What changed

| Implementation | Delivered behaviour |
|---|---|
| `dist/controls.js`, `dist/physics.js`, `dist/engine.js`, `dist/app.js` | Unified input ownership/timing, no-jump controls, continuous contacts, aiming law, finite assistance integration, takeover and explicit resume. |
| `dist/assistance.js`, `dist/purchases.js`, `dist/purchases-ui.js`, `dist/purchase-recovery.js`, `dist/web-purchases.js` | Durable bounded time use, real native/web adapters, provider prices, recovery and honest unavailable states. |
| Reward/ad/consent modules under `dist/`; matching `_shared` verifier/handler modules | Voluntary placements, pause/save/mute, consent separation, signed native SSV inbox and bounded browser callback trust. |
| `supabase/migrations/` (17 files) | Private wallet/lots, grants, mastery, immutable products/prices, receipts, refunds/disputes, deletion outbox/discovery, financial facts, opt-in analytics and recovery journals. |
| `supabase/functions/game-api/`, `reward-callback/`, `_shared/` | Auth-bound shared state, independent purchase/reward verification, scoped privacy/recovery and bounded requests. |
| `scripts/` migration, recovery, reports and Azure deployment tools | Checksum-aware atomic migration, no workstation dependency for the running schedule, contribution/cohort reports, explicit subscription/profile preservation and monitoring. |
| Android/iOS source, `scripts/build-ios.sh`, `azure-pipelines-ios.yml` | Synced candidate assets, privacy purposes and a manual hosted-Mac build route. Only Android compiled in this environment. |
| `tests/game-observer.js`, `tests/performance-feedback.html`, `tests/controls-feedback.html` | QA-only nonmutating observation and reproducible browser frame/routing checks. Not packaged into the game/API. |

All three editions share gameplay/ledger contracts. Native checkout is RevenueCat plus Apple/Play billing; owned-browser checkout is Razorpay, currently INR only. Native rewarded ads use AdMob; owned-browser ads use H5. Unsupported/unapproved portal/native combinations fail closed without blocking free play.

## 6. Controls and physics

Touch starts anywhere in the noninteractive game-owned viewport and uses horizontal movement relative to pickup. Vertical motion does not move the paddle; another held finger cannot steal control. Clamping consumes overshoot so a reverse movement responds immediately. Pointer capture/cancel/lost capture, blur, visibility, orientation, menus and lifecycle interruptions clear intent. A captured gameplay release crossing a button cannot activate it; an independent intentional button click can.

Arrows/A/D are held states, independent of repeat rate. Both directions neutralize; releasing one resumes the other. Pointer and keys share timestamped ownership. Deliberate manual takeover settles assistance; held UI focus/modifier shortcuts do not become gameplay commands. Pointer gains are independent of DPR/CSS scaling, using the actual displayed board geometry. Software traces match engine state at 30/60/90/120/144Hz and irregular rendering within `1e-7` world units. This is determinism, not measured human input latency.

Simulation runs at **120Hz**. Ordinary contacts use exact swept circle faces/rounded corners and earliest time of impact; residual travel is consumed. Position tolerance `1e-7` world units, approach velocity `1e-9` units/s, simultaneous TOI `1e-10s`; max 16 contacts/ball/tick. Exhaustion freezes unresolved travel with a diagnostic rather than tunnelling. Initial overlap corrects without damage/score; destroyed colliders disappear before residual sweeps. Parallel seam normals coalesce; independent approaching constraints reflect once. Ordinary static reflections preserve speed.

Flat paddle offset `u∈[-1,1]` uses `theta=u×60°`, `vx=s×sin(theta)`, `vy=-s×cos(theta)`. Centre sends vertically upward; ±0.5 at speed 10 gives `(±5,-8.660254...)`. Upper rounded caps use geometric moving-frame reflection and normalize to configured arcade speed. Underside/passed/lost balls are one-way. No motion influence is added to flat-top aiming.

The high-speed fixture starts radius 5 at x=80, vx=6000, brick face x=100, dt=1/60: centre contact x=95 at 0.0025s, then reflected residual travel ends x=10. A point in an expanded square's false corner is not accepted as a circle/rectangle collision. The actual grid broad phase is also tested at the supported ordinary maximum speed 431. These distinguish low-level stress fixtures from supported gameplay speed.

## 7. Assistance and commercial design

Time is finite real active time, independent of 1×/2×/4× playback. Fractional carry survives checkpoints. Server FIFO lots reserve at most 30s; one wallet has one spender. Ten-second leases subtract round-trip delay and a safety margin. Pauses, takeover, loss/completion, ads, purchases, hidden/suspended apps and uncertain authority end activation. A final tick is truncated at the exact authorized boundary. Crashes retain a durable recovery identity; late/lost acknowledgments cannot rewind acknowledged use or silently launch again. New offline activation is unavailable; ordinary offline manual play is preserved.

Native RevenueCat verification independently binds store, bundle, project/app/product, environment, original/current owner, quantity and canonical transaction. Replays/restores cannot refill consumed time or transfer it to another account. Minimal transaction tombstones prevent regrant after account deletion. Razorpay uses immutable server quotes, captured canonical payments, HMAC notifications, cumulative refunds and dispute discovery. Refunds revoke only source-lot unused value and separately record already-consumed refunded value; unrelated credit is not erased. Receipts and observations are idempotent across client, callback and worker paths.

The two pack benefits are **300,000ms and 900,000ms**. Draft prices are hypotheses, never hardcoded charged-price claims. Native UI requires real SDK localized prices; web quotes use actual configured INR minor units. Disabled/missing providers show unavailable states, not fake checkout success. The default candidate has no activated purchase/ad providers and excludes AdMob registration.

Rewarded ads disclose 30 seconds, require explicit choice, and never interrupt free play automatically. Native client completion cannot mint credit; Google signature verification, immutable offer promise and durable inbox govern delivery. Pending/earned offers share daily quota and preserve original bucket/configuration during delayed delivery. Browser H5 callbacks cannot offer equivalent cryptographic proof; their bounded weaker trust is explicit. Ads mute/pause the game and require deliberate continuation. Audience/consent approval remains a real activation gate.

## 8. Quality, measurement and next experiments

Current browser observation: Windows Chromium **156.0.0.0**, DPR **1.25**, effective iframe viewport **369×852** (the nominal 393px frame shrank in the side-by-side layout). A single programmatically activated 30s assistance run at 4×, with a local fake identity/credit and actual app/engine/PostgreSQL, observed **29,972.3ms**, peak **21 balls**, 1,696 frame intervals: p50 **17.7ms**, p95 **18.3ms**, p99 **18.9ms**, max **20.3ms**, zero >33.34/50/100ms. App callback p95 **1.1ms**, max **7.1ms**. 14,400 simulation steps had p95 **0.1ms**, max **1.5ms**. Timer resolution and observer overhead apply. The expiry UI showed manual continuation. This is one foreground desktop sample, not 60fps certification, maximum-768-ball stress, battery, physical latency or phone evidence.

Earlier CPU-only seeded T-stage run: 132.367 simulated seconds, 15,884 ticks, peak 120 balls, zero solver exhaustion, approximately 540ms Node time. Existing starters and 22 generated families clear in regression tests. Neither result is player difficulty/retention evidence.

Implemented measurement separates manual/assisted segments, clear/loss/control outcomes, viewed prices/coaching, voluntary ad lifecycle/value estimates and verified purchase facts. It has explicit account opt-in, bounded queues, revision fencing, no guest analytics identifier, 90-day raw expiry, export/deletion and stable account study assignment. Global collection and the coaching study remain **off**. Financial and [contribution reports](CONTRIBUTION-REPORT.md) distinguish estimates/settlements, currencies, unknown costs and D7/D30 maturity; no real cohort/settlement/acquisition inputs have been supplied.

Concrete experiments, in order:

1. Recruit 8–12 target players for observed tasks on a small Android phone, Pixel-class phone, iPhone, Windows mouse/trackpad and Mac trackpad. Counterbalance relative vs pickup-absolute prototypes. Record unintended pickup jumps, aim errors, clutch count, time-to-target and comfort; do not select gain from synthetic traces alone.
2. Ask new players to launch, aim at an entrance, identify power-ups, pause/home/return, recover a save and explain assistance cost unaided. Record task completion and misconceptions before offering prompts. Retest corrected copy/layout.
3. Record 10-minute device sessions including large swarms, all boosts, thermal load, rotation/calls/background, audio and accessibility settings. Capture frame-time percentiles, stalls, memory and battery with native tooling; treat reproducible tunnelling/exhaustion or lost credit as release failures.
4. Run real provider sandbox journeys in the guide, including pending/cancel/refund/deleted-owner/delayed reward and two-device spending. Do not activate paid products based on local mocks.
5. With reviewed privacy and retention operations, first validate consent/data completeness; then run the paused coaching study. Predeclare manual return, comprehension and crash/purchase-trust guardrails. Estimate sample size from observed baseline/variance and meaningful effect; no arbitrary significance or winner claim from tiny cohorts.
6. After a stable free-loop pilot, test pack price/earned supply with actual store configuration and sufficient mature cohorts. Compare D7/D30 net contribution per newly acquired player, retention, manual return and support burden. No paid acquisition scaling until contribution coverage is adequate; consenting account counts are not all acquired players.

## 9. Executed verification and deployment

| Command/method | Actual result and scope |
|---|---|
| `npm test` | Final frozen candidate: **442/442**, 63.51s. Node/PGlite, mocked external transports where named. Private log `.openai/local/product-redesign/full-build21-tests.log`. Earlier counts in work log are checkpoints. |
| `npm run check`; `node scripts/release-preflight.mjs` | Syntax/generated parity and scoped public cloud/version/privacy checks passed. Preflight explicitly does not assess all production readiness. |
| `npm run mobile:sync` | Android and iOS assets/plugins synced; Windows SPM paths normalized. No iOS compile implied. |
| Gradle `-p android assembleDebug bundleRelease --console=plain` | Passed: 407 tasks, two minutes. Node24.22/JBR21/SDK36/Gradle8.14.3. APK debug-signed, AAB unsigned. Exact details/hashes in [mobile build evidence](MOBILE-BUILD-3.3.md). |
| Archive byte/certificate audit | All 62 runtime files match in APK/AAB; `.nojekyll` excluded intentionally. APK certificate matches prior local build20. Four available private credential values absent; no ELF libraries. Does not cover nonexistent future keys. |
| Migration plan/apply/read-back | All **17** ordered revisions installed live with checksums, zero pending. Two existing baselines adopted only after structural verification; no blind replay. [Runner](DATABASE-MIGRATIONS.md). |
| Hosted API acceptance | Actual disposable accounts/state/completion retry/import/RLS/export/delete/catalog persistence passed before/after rollout. Synthetic test data, not human play. Disposable identities and their bounded mail-review jobs cleaned. |
| API container | `ca-brick-breaker-api--0000002`, source `73fa1e0a170f`, digest `sha256:85c421809e5902b6886d87999d59c73b23991d7d818df33d2937ccad113ae556`; SpeedInno Org, Central India; health/auth/CORS checked. Not Sigzio Dev, no GitHub Actions. |
| Reward Edge ingress | `reward-callback` ACTIVE/version1; health200, malformed400, POST405, unknown404, invalid signature400 with current public key. No authentic Google reward delivery tested. |
| Azure recovery | Manual execution `...-6elnklo` succeeded; schedule `*/5 * * * *`; automatic `...-29884130` succeeded 20:50:00–20:50:27 UTC26Oct with advancing exact-database maintenance heartbeats. Subsequent ordinary executions succeeded. |
| Monitor | Credential-free intentional failed execution produced Failed metrics; actual alert **Fired 21:16:25 UTC26Oct**. Combined configuration changes do not isolate earlier visibility failure. No action group or human notification delivery. [Exact evidence](OPERATIONAL-RECOVERY.md). |
| Browser routing | Current `/__controls`: five grouped checks passed through production app with synthetic DOM pointers. Old test-side lifecycle mutation fixed. Native capture/gesture comfort not established. |
| Browser frame sample | `/__performance` via QA server, actual current app; results in section8 and private `current-browser-frame-evidence.txt`/`current-browser-frame-proof.png`. Local fake auth/credit, no real provider. |
| Final operator/QA audit | Actual `commercial-report.mjs` and `play-metrics-report.mjs` read-only commands succeeded against the matching live database using the newer secret-key setting. Five standalone CLIs now accept either server-key name; syntax/parity pass. All six QA observation/credit routes returned404 without `QA_FIXTURES=1`; both fixture scripts parse. All97 required coverage rows are present exactly once. |
| Focused final operator regression | `node --test tests/private-settings.test.mjs tests/commercial-financials.test.mjs tests/play-metrics-report.test.mjs tests/operations.test.mjs`: **34/34**, 6.49s after the CLI compatibility changes. Four configured private values were absent from384 versionable files and the branch patch against `origin/dev`; this is a scoped scan, not a claim about future credentials. |

API URL: https://ca-brick-breaker-api.braverock-ed05a525.centralindia.azurecontainerapps.io . Supabase region Mumbai. Production provider environment is configured, optional collection false and commercial provider configuration absent. Source/rollout changes after container source do not imply a rebuilt image.

No current physical ADB device, installed emulator/AVD, Mac/Xcode, iPhone archive, authentic store transaction, real AdMob SSV, live merchant settlement or player cohort was available. `bash -n scripts/build-ios.sh` and plist parsing passed; Azure Mac pipeline was prepared, not queued. Historical native CI runs are not candidate acceptance.

Platform matrix: Android app compilation/package audit passed, physical Android unverified; iPhone app sync/source checks passed, compile/device unverified; Windows Chromium156 app fixtures/frame sample passed, ordinary physical mouse/trackpad comparison unverified; macOS Safari/trackpad, iPhone Safari, Android Chrome, touchscreen browser and actual high-refresh/cutout/fullscreen/zoom device combinations not run here. Simulated render-rate/DPR/geometry checks do not replace those rows. Final operator/docs/QA changes do not change candidate assets or require pretending a new APK was built.

## 10. Requirement coverage

**Status convention:** “passed (software)” applies only to the stated implementation/fixture. Where a check also requires hardware/provider evidence, its overall status is **externally blocked**, with the software result stated separately. “Not run” identifies an unexecuted check without claiming a defect. “Design-replaced” names the governing decision and replacement evidence. No known failed product case is hidden as a design replacement. Test filenames below are under `tests/`; scripts are under `scripts/` unless stated.

### Research

| ID | Status | Evidence / gap |
|---|---|---|
| RES-01 | Passed | Baseline77, source inspection and reproduced fixtures; section4/work log. |
| RES-02 | Passed | Dated primary sources, competitor/player counterevidence and access limits, section2. Not representative market research. |
| RES-03 | Passed | All nine areas mapped in section2; acquisition/costs explicitly unknown. |
| RES-04 | Passed | Material loop/control/engine/commercial/ownership/measurement alternatives, section3. |
| RES-05 | Passed | Coherent decisions D-*; selected values agree with source/default configuration. Historical checkpoints superseded. |
| RES-06 | Passed | Strongest objections, seam review, privacy/recovery/rollout findings and remaining uncertainties. No independent human panel claimed. |
| RES-07 | Passed (software) | Working controls/physics/mastery/coaching/ledger/provider/recovery/measurement paths; files section5. Player benefit remains unmeasured. |
| RES-08 | Passed | Proof, hypotheses and explicit experiments separated in sections8–12. |

### Controls

| ID | Status | Evidence / gap |
|---|---|---|
| CTL-01 | Externally blocked | Region math/routing in `controls.test.mjs` and five browser groups pass; physical nine-position touch grid still required. |
| CTL-02 | Passed (software) | Stationary far pickup/no jump in controller tests and browser fixture. |
| CTL-03 | Passed (software) | Vertical-only motion leaves x unchanged in both. |
| CTL-04 | Passed (software) | Fresh clutch/no jump, browser and controller tests. |
| CTL-05 | Passed (software) | Clamped overshoot consumed; immediate reversal, browser and controller tests. |
| CTL-06 | Passed (software) | Secondary held pointer cannot acquire control; fresh pointer can. |
| CTL-07 | Passed (software) | Independent intentional UI action, modifier/text handling; browser fixture. |
| CTL-08 | Externally blocked | Capture routing implemented; synthetic DOM dispatch cannot establish real outside-element capture on devices. |
| CTL-09 | Externally blocked | Cancel/reset/suspension handlers and tests pass; actual rotation/calls/lost-capture hardware sequence pending. |
| CTL-10 | Externally blocked | Responsive/safe-area source present; small physical phones and both orientations not tested on candidate. |
| CTL-11 | Externally blocked | Mouse/trackpad mapping implemented and deterministic; Windows/Mac physical comfort comparison pending. |
| CTL-12 | Passed (software) | Modal/pause cancellation prevents stale resume movement, browser/controller checks. |
| CTL-13 | Passed (software) | Held-state arrows independent of repeat frequency, `controls.test.mjs`. |
| CTL-14 | Passed (software) | Simultaneous neutral and release-one policy tested. |
| CTL-15 | Passed (software) | Blur/hidden/reset clear controls and stop charging; controller/assistance tests. |
| CTL-16 | Passed (software) | UI text/control/modifier shortcuts retain behaviour; browser modifier check. |
| CTL-17 | Passed (software) | Single owner, timestamped takeover, no subsequent AI debit; controls/assistance tests. |
| CTL-18 | Passed (software) | Actual-engine traces at30/60/90/120/144Hz plus irregular delivery, tolerance1e-7. |
| CTL-19 | Externally blocked | Geometry/DPR/CSS mapping tests pass; native fullscreen/letterbox/zoom device matrix pending. |
| CTL-20 | Externally blocked | Mocked ad/checkout interruption and stalls pass; authentic SDK/device interruption pending. |

### Physics

| ID | Status | Evidence / gap |
|---|---|---|
| PHY-01 | Passed (software) | Horizontal face: (3,4) → (3,-4), speed5; `physics.test.mjs` PHY01..08. |
| PHY-02 | Passed (software) | Vertical face: (3,4) → (-3,4), speed5. |
| PHY-03 | Passed (software) | Top arena wall: (3,-4) → (3,4). |
| PHY-04 | Passed (software) | Diagonal normal: (3,4) → (-4,-3); separate true rounded-corner radial/TOI fixture. |
| PHY-05 | Passed (software) | Separating (-3,4) against (-1,0) is not reflected again. |
| PHY-06 | Passed (software) | Tangential contact has no invented normal impulse. |
| PHY-07 | Passed (software) | Deterministic randomized reflection/property cases in PHY01..08. |
| PHY-08 | Passed (software) | Scaled normals normalize; zero/nonfinite candidates cannot produce NaN state. |
| PHY-09 | Passed (software) | Radius1 false expanded-square corner rejected. |
| PHY-10 | Passed (software) | Swept false-corner miss rejected. |
| PHY-11 | Passed (software) | Actual grid at ordinary max431; high-speed thin-target analytical cases. |
| PHY-12 | Passed (software) | x95/0.0025s contact and x10 residual endpoint fixture. |
| PHY-13 | Passed (software) | Moving capsule intersects during travel, not final pose. |
| PHY-14 | Passed (software) | Mirrored geometry/moving paddle response. |
| PHY-15 | Passed (software) | Centre and ±0.5 offsets obey60° law, section6. |
| PHY-16 | Passed (software) | Upper caps reflect geometrically; underside/passed/lost balls ignored. |
| PHY-17 | Passed (software) | Simultaneous orthogonal constraints reflect once. |
| PHY-18 | Passed (software) | Reversed seam iteration preserves velocity/damage/score/pickup RNG. |
| PHY-19 | Passed (software) | Initial penetration corrects without awards, including separating/centre cases. |
| PHY-20 | Passed (software) | Distinct later impacts counted; duplicate resolution bounded. |
| PHY-21 | Passed (software) | Destroyed collider removed before residual sweep. |
| PHY-22 | Passed (software) | Actual-engine render-rate trace agreement, controls suite. |
| PHY-23 | Externally blocked | Nonfinite/suspended dt, restart/pause/lifecycle software checks pass; real ad/rotation/background device matrix pending. |
| PHY-24 | Passed (software) | Long rebounds/no random drift, fireball/shooter and stage-clear regressions. Maximum-swarm phone stress remains unexecuted. |
| PHY-25 | Passed (software) | Solver limit freezes unresolved movement and records diagnostics; no tunnelling fallback. |

### Commercial

| ID | Status | Evidence / gap |
|---|---|---|
| COM-01 | Passed (software) | Unlimited public AUTO/legacy paths removed; finite authority in app/assistance tests. |
| COM-02 | Passed (software) | Free guest/manual/offline and optional-account time disclosure; rewards/account tests. |
| COM-03 | Passed (software) | Fractional active-real-time debit at60/120/480 ticks/s, assistance tests. |
| COM-04 | Passed (software) | Stops on interruption/expiry and truncates final engine tick; no auto-resume. |
| COM-05 | Passed (software) | Credit provenance does not alter AI/control law; explicit activation only. |
| COM-06 | Passed (software) | Sticky assisted run and later manual/clean mastery, rewards/mastery tests. |
| COM-07 | Passed (software) | One intro gift only after manual server completion; retries/imports cannot duplicate. |
| COM-08 | Passed (software) | Distinct manual stages15s×max4 per UTC day; free core never quota-gated. |
| COM-09 | Externally blocked | Ledger/mock30s grant/cap/dedupe and durable signature inbox pass; authenticGoogleSSV/H5 provider journeys pending. |
| COM-10 | Passed (software) | Server UTC bucket, original delayed offer promise/reset boundaries, rewarded ledger tests. |
| COM-11 | Passed (software) | Shared wallet row locks/one reservation/concurrent attempts, real PGlite SQL. Not three physical clients. |
| COM-12 | Passed (software) | FIFO conservation/idempotent checkpoints/settlement, time-ledger tests. |
| COM-13 | Passed (software) | No new offline authority; late/cancelled leases release legitimate unused time. |
| COM-14 | Passed (software) | Crash/lostACK/reconnect journals and exact account recovery; assistance/recovery tests. |
| COM-15 | Externally blocked | Verifier/SQL pending/delay/duplicates/refunds/disputes pass using fixtures; real store/merchant sandbox pending. |
| COM-16 | Externally blocked | Consumed receipt cannot replenish in SQL; authentic native restore after reinstall pending. Permanent ad removal design-replaced D-COM-01. |
| COM-17 | Passed (software) | Partial/full source-only reversal, held/consumed accounting, unrelated lots preserved. Provider refund delivery still external. |
| COM-18 | Design-replaced D-COM-01 | No automatic ad pacing. Replacement: only affirmative rewarded placement; no forced-ad timer/product. |
| COM-19 | Externally blocked | Loading/show/reward/close/failure states and deliberate resume pass in mocks. Real SDK chronology pending; automatic-ad portion replaced D-COM-01. |
| COM-20 | Design-replaced D-COM-01 | No ad-removal purchase/bonus. No old paid entitlement found to migrate. Two immutable time packs replace it. |
| COM-21 | Externally blocked | Actual-price adapter/quote checks and honest missing-price state pass; real localized store catalog pending. |
| COM-22 | Passed (software) | Owner binding, deleted-owner tombstones, guest progress union without currency, purchase ownership/rewards tests. |
| COM-23 | Externally blocked | Portal/edition guards fail closed; third-party portal approval/terms not obtained. |
| COM-24 | Externally blocked | Financial dedupe, private cohort/consent/report/contribution tools pass; real reports, acquisition denominator, costs and mature outcomes absent. |
| COM-25 | Passed (software) | Concurrent pending/earned quota, delayed callback and original promise/bucket, rewarded-ledger/handler tests. |
| COM-26 | Passed (software) | Assisted/imported play cannot earn supply; unrelated credit survives refund. Human-fraud resistance is limited, disclosed D-COM-04. |

### Integrated journeys

| ID | Status | Evidence / gap |
|---|---|---|
| INT-01 | Externally blocked | Shared SQL12s+18s and account wallet conservation pass; actual Android+iPhone+browser linked-device journey pending. |
| INT-02 | Passed (software) | Deliberate manual takeover ends paid AI debit immediately; controls/assistance tests. |
| INT-03 | Externally blocked | Mock ad pause/save/mute/reconcile/deliberate resume pass; real SDK/device pending. |
| INT-04 | Passed (software) | Captured gesture crosses Home without clicking; separate Home action opens confirmation, current browser fixture. |
| INT-05 | Externally blocked | Moving-paddle high-speed geometry and input traces pass separately; physical fast-trackpad combined play pending. |
| INT-06 | Passed (software) | Assisted flag remains sticky within run; later fresh manual mastery stays separate. |
| INT-07 | Passed (software) | Restart/reconnect no automatic activation or duplicated introduction/mission. |
| INT-08 | Passed (software) | Two-client concurrent SQL reservations cannot overspend. Physical multi-device check pending under INT-01. |
| INT-09 | Design-replaced D-COM-01 | No premium/ad-removal scope. Replacement two-pack same-account portability/receipt checks pass in software; authentic store cross-device pending. |
| INT-10 | Passed (software) | Unconfigured/offline/outage commerce does not block free manual play; offline/storage/adapters tests. |
| INT-11 | Externally blocked | Resize/corner/lifecycle components tested; actual orientation/cutout/resume sequence pending. |
| INT-12 | Passed (software) | Identical input+120Hz engine traces and exact finite expiry across render/playback rates. |
| INT-13 | Externally blocked | Software cancellation/identity/ad/purchase/wallet-response race checks pass; authentic provider concurrency pending. |
| INT-14 | Passed (software) | Legacy saves union and unknown clean history preserved; global immutable receipt/tombstone tests. No preexisting paid products found. |
| INT-15 | Passed (software) | Wrong portal/origin/native mapping cannot expose unsupported commercial path; real provider approval pending. |
| INT-16 | Passed (software) | Reward quota/ad refusal/unavailability cannot lock manual core. |
| INT-17 | Passed (software) | Remainder exhaustion truncates tick and returns to explicit manual continuation; current browser expiry observed. |
| INT-18 | Externally blocked | SDK price/server quote authoritative in adapters/fixtures; real store localization pending. |

### Additional coverage introduced by the implementation

| ID | Status | Evidence / gap |
|---|---|---|
| NEW-01 | Passed (software) | Identity epoch/account-bound requests and monotonically versioned wallet snapshots reject stale responses. |
| NEW-02 | Passed (software) | Account deletion outbox, lostACK, provider discovery journals, tombstones and minimal retention; privacy/discovery tests. Real RevenueCat erasure external. |
| NEW-03 | Passed (software) | Privacy opt-out deletes optional events and fences late device events; retention/export excludes expired records. |
| NEW-04 | Passed (software) | Exact integer-micro financial facts, unknown coverage, currency separation, no double fee/tax subtraction; contribution tests. |
| NEW-05 | Passed | Actual live17-revision checksum plan/apply/read-back, baselines verified/adopted; migration tests. |
| NEW-06 | Passed | Digest-pinned scheduled worker +exact-database advancing heartbeats +automatic execution observed. Real provider backlog processing external. |
| NEW-07 | Externally blocked | Actual failure metric/portalFired passed. Human notification and independent missing-run observer not configured. |
| NEW-08 | Passed | Android build/package/certificate/62-file byte comparison and scoped secret scan. Physical acceptance external. |
| NEW-09 | Externally blocked | iOS sync/plist/bash checks passed; current Xcode compile/archive/signing/TestFlight not run. |
| NEW-10 | Passed | Current browser control fixture5groups and one30s frame sample, with synthetic/desktop limits stated. |
| NEW-11 | Externally blocked | Release-preflight rejects mismatched build/privacy declarations in tests; final enabled-SDK store forms and review external. |

## 11. External prerequisites

* Complete organization identity verification in Play Console and Apple enrollment; accept relevant paid-app agreements/tax/banking through the authorized company representative. DUNS issuance is not store approval.
* Choose/store the Android upload signing key; sign the AAB. Preserve the existing test-app data/signature compatibility. A debug APK is not the production Play artifact.
* Supply Mac/Xcode execution (borrowed Mac or an approved Azure-hosted Mac pipeline), signing/team access, and real iPhone testing. Prepared source is not an IPA/TestFlight build.
* Create RevenueCat/AdMob and, for the owned browser, Razorpay/H5 accounts. Configure actual immutable catalogs, private verifiers, SDK public keys, consent/audience settings and signed callback/webhook endpoints. Keep separate sandbox projects/databases. Detailed order and exact fields are in the account guide.
* Verify authentic sandbox purchases, restore/reinstall, refund/revocation, pending/cancel/deleted-owner states, delayed rewards and cross-device spending before activation. Complete matching privacy/Data safety/account-deletion/store declarations for the actual enabled SDK build.
* Assign an operator and notification action group; test delivery and independent missing-run observation. Current Azure alert has no human contact action. Confirm backup/retention and measured operating spend against the organization's budget.
* Obtain current device/playtest evidence and actual acquisition/settlement/cost/cohort data. These cannot be generated honestly by code or mock accounts.

## 12. Remaining issues and next actions

No known failing software regression is being accepted as launch-ready. The broad release acceptance matrix remains partly blocked by the prerequisites above; the implementation is not proof of store/provider approval or product-market fit.

Next sequence: review the new Android candidate on real devices; complete the account guide in order; configure an isolated sandbox and verify provider/device journeys; build/sign current Android and iPhone candidates; complete store disclosures and beta feedback; then activate products incrementally. Keep optional analytics/studies and unapproved ads disabled until their gates pass. Use actual pilot findings to tune controls, supply, pricing and learning cues.

The final report does not promise global superiority, a perfect score, revenue, a winning experiment or a fixed monthly cloud cost. It delivers a working coherent candidate and an auditable boundary between implemented behaviour and evidence still required for public release.
