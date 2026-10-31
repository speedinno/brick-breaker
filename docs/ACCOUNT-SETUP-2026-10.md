# Account setup and release order — SpeedInno Brick Breaker

## Current tester correction — Android build 29 (31 October 2026)

Use [build 29 / version 3.3.4](https://github.com/speedinno/brick-breaker/releases/tag/v3.3.4-rc.1) for the next Android pilot. [Android build 29 review](ANDROID-BUILD-29.md) covers the catalog compatibility and direct arrow control. Build 29 can load existing signed-in starter boards from published catalog v3–v8 without the raw “Unsupported catalog version” error. **To give signed-in players the current v9 board shapes, Chandrahas must still back up the Supabase project, apply pending tracked migrations through `202610300021_starter_catalog_v9.sql`, and deploy the matching API.** Test a new v9 run, a v8 in-flight run and a completion tick with disposable accounts. No credentials belong in Git. The owner asked to finish Android testing before iPhone work.

## Historical Android gate — build 28 (30 October 2026)

Use [build 28 / version 3.3.3](https://github.com/speedinno/brick-breaker/releases/tag/v3.3.3-rc.1) for the owner's next Android phone test. The first three lower mouths are only modestly wider; the original narrow channels now lead to visible upper exits into the bricks. [Android build 28 review](ANDROID-BUILD-28.md) has the exact test steps. Build 27 and earlier are historical after the owner's device feedback. The current Android APK is for testing and must not be uploaded as a Play production package. **Wait for the owner's Android OK before starting any iPhone work.**

For signed-in play, back up the company Supabase project and apply pending tracked revisions in order through **`202610300021_starter_catalog_v9.sql`**. Deploy the matching API bundle. Test a new v9 starter run and completion, an in-flight v3–v8 run, and stage 13 with disposable accounts. Guest/device play can be tested without the cloud rollout. Do not alter installed migration files. The account, monitored company support email, store, privacy, payment and ad tasks described below remain for Chandrahas after Android approval; keep credentials out of Git.

## Historical build 27 owner correction (29 October 2026)

**Use [build 27 / version 3.3.2](https://github.com/speedinno/brick-breaker/releases/tag/v3.3.2-rc.1) for the next phone pilot.** The owner physically rejected build 26's oversized empty first passages after seeing stages 1 and 2; build 25 was rejected earlier for free powers and automatic clears. The [updated starter rollout](STARTER-DIFFICULTY-ROLLOUT.md) describes the slim four-tile passages and three-tile breakable side exit. The manual paddle, aim arrow, one ball, stage order and earned pickups remain. Build 27 is still a **test build**, not a store-approved release. Record a fresh physical Android pilot before store submission.

For signed-in starter play, back up the Supabase project, install all pending tracked revisions in order **through `202610290020_starter_catalog_v8.sql`**, and deploy the API bundle from the same build 27 source. Test a new v8 starter run, a v3–v7 in-flight run, completion ticks, and stage 13 with disposable accounts. Do not change or replay earlier migrations. Guest/device play is independent of this cloud step.

Chandrahas also needs to complete the company-owned Play and Apple accounts, a monitored company-domain support email if none exists, signing keys, privacy/age/store forms, sandbox purchase and ad verification, physical Android and signed iPhone tests, and final store submissions. Follow the detailed account and release steps below.

Prepared 27 October 2026 and updated for the owner-directed build 27 correction on 29 October. This is Chandrahas's release handoff guide. The [product report](PRODUCT-COMPLETION-2026-10.md) records the wider product implementation, while [starter rollout notes](STARTER-DIFFICULTY-ROLLOUT.md) cover the current gameplay and shared-stage revision. Dashboard wording and eligibility can change; linked official documentation and the actual account's requirements govern.

## Current handoff — do these before a worldwide release

1. Use the private [`dev` source](https://github.com/SpeedInno-Org/Brick-Breaker/tree/dev) for build 27 / version 3.3.2. Exact packaged game source is `3259b24186812f7f751f79b03f8328e3b8de6fad`. The approved public mirror supplies the [Android test APK](https://github.com/speedinno/brick-breaker/releases/download/v3.3.2-rc.1/Brick-Breaker-3.3.2-build27-Android-test.apk), [checksum](https://github.com/speedinno/brick-breaker/releases/download/v3.3.2-rc.1/Brick-Breaker-3.3.2-build27-SHA256SUMS.txt), [native build](https://github.com/speedinno/brick-breaker/actions/runs/40909875627), and [installed Android check](https://github.com/speedinno/brick-breaker/actions/runs/40910841855). The APK is debug-signed and must not be uploaded as the Play production package.
2. Ask the owner and at least ten fresh players to test stages 1–4 on physical Android phones with AUTO off, following the [pilot and acceptance criteria](STARTER-DIFFICULTY-ROLLOUT.md). Record attempts and confusing shots. Build 25 and 26 were rejected by the owner and must not be used as approval signals.
3. Back up the existing Supabase project, apply only the pending migrations through starter catalog **v8**, deploy the matching API, then test signed-in completion and old-run compatibility with disposable accounts. Guest/device play works without this rollout; signed-in starter play requires it.
4. Finish company-owned Play and Apple accounts, obtain a monitored company-domain support email if one does not exist, and run the real payment/ad sandboxes only after each provider is configured. Keep all private credentials out of Git and the app package.
5. Sign the Android AAB and an iPhone archive with company keys, test the signed apps on actual devices, complete privacy/store disclosures, then submit through internal/closed Play testing and TestFlight before requesting worldwide store review. The unsigned iPhone archive is a signing input, not an installable IPA.

## Selected services

| Service | Purpose | Required when |
|---|---|---|
| Google Play Console, organization account | Android distribution and Play Billing | Android publication/purchases |
| Apple Developer Program + App Store Connect, organization | iPhone signing, TestFlight, App Store/IAP | iPhone distribution/purchases |
| RevenueCat | One native purchase SDK/verifier across Apple/Google | Activating either native time-pack catalog |
| AdMob | Voluntary native rewarded advertisements | Activating mobile rewards |
| Razorpay | Payment gateway suited to the India-registered business | Owned-browser checkout; current implementation supports INR |
| AdSense H5 Games Ads | Voluntary owned-browser advertisements | Activating browser ad rewards; separate approval from AdMob |
| Existing Supabase, Resend, Cloudflare, Azure | Identity/database/email/domain/API/recovery | Reuse the existing game setup |
| Azure DevOps hosted macOS or borrowed Mac | Xcode build execution | iPhone build; separate from the existing Azure API resource |

RevenueCat handles consumables as well as subscriptions; here there is **no subscription**. We use the game's existing Supabase wallet, not a second RevenueCat virtual-currency wallet. AdMob/H5 serve ads; Razorpay must not replace native store billing. No Stripe, Paddle, Firebase, portal account or additional login provider is needed for this selected release. This selection favors established integrations and the existing India/Azure stack; it is not a guarantee of account approval or lowest total cost.

## 1. Protect the release and company identity

1. Keep company accounts owned by SpeedInno, with a monitored work-domain email, two-factor authentication, recovery arrangements and named authorized administrators. Use **SPEEDINNO PRIVATE LIMITED** and the address matching its DUNS/legal records where legal identity is requested. Do not substitute a marketing name in legal fields.
2. Reuse the DUNS number already issued. Complete any outstanding company/contact/website verification in the actual Play/Apple dashboards. Issuance alone does not activate a developer membership.
3. Preserve app identity **`com.speedinno.brickbreaker`** on both native platforms. Do not casually change it after creating products or publishing.
4. Keep private keys in the ignored `.env.api`/managed cloud secret settings. Never paste keys into a Git issue, store description, app bundle or chat. Only public Supabase/SDK/ad identifiers belong in public configuration.
5. Establish a **separate sandbox Supabase database and provider projects** before commercial testing. Set `MONETIZATION_ENVIRONMENT=sandbox` there and `production` only in production. Never toggle the live player's database to sandbox as a shortcut.
6. Set up or confirm a monitored, company-owned **game support email** before store submission. If none exists, create a new address on the company domain. Test delivery and replies, give Chandrahas and a backup operator access, and use the same real address in both store listings, the game/support site and the privacy/account-deletion contact. Do not publish a placeholder or a personal mailbox as the public support address.
7. Take a backup, run the read-only migration plan, and apply only pending verified revisions. The production project had the first **17** revisions installed on 27 October; later tracked starter revisions v4–v7 must remain intact and build 27 adds revision **22**, `202610290020_starter_catalog_v8.sql`. Confirm exact pending checksums and apply them in order using [database migration instructions](DATABASE-MIGRATIONS.md). Never edit or replay an installed revision or rerun the two manually installed baseline files. Deploy the matching API bundle before signed-in build 27 starter play. With disposable accounts verify a new v8 run, completion tick and stage 13; also complete a previously started v3–v7 run with its original hash. An unfinished older layout may need replay after a client update; completed stages persist.

Builds 21–26 in the [mobile build history](MOBILE-BUILD-3.3.md) are historical; the owner physically rejected builds 25 and 26. Use the build 27 Android test APK for the next phone pilot. The package is debug-signed; the AAB remains unsigned until the company configures its release key. A build 27 physical novice playtest, signed iPhone install and store delivery are still required. Protect guest progress before uninstalling an older APK to resolve a signature mismatch.

## 2. Finish Google Play setup first

1. In Play Console, confirm that the account type is **organization** and finish the pending verification tasks. Follow the exact document/contact/device requirements displayed for this account; do not assume a DUNS lookup replaces them.
2. Choose **Create app**, enter the final public game name, default language, **Game**, and the intended free distribution setting. Complete declarations accurately. The two paid items are optional in-app consumables; free manual gameplay remains available.
3. Complete the dashboard setup: store listing, icon/feature graphic/current phone screenshots, support contact, accessible privacy policy, account-deletion web URL and in-app deletion path, ads declaration, target audience, content rating, Data safety, app access and distribution countries. Use the **actual enabled SDK build**, not a future ad-enabled configuration or old privacy checklist.
4. For sign-in review, explain that manual play is available as a guest and that account/time functionality uses email codes. Provide an accessible reviewer path/instructions as required by the console without exposing a personal mailbox or bypassing production authentication in code.
5. Set up Play App Signing and a protected upload key. Sign the release AAB with the upload key, keep a recovery copy outside Git, increment the version code for each upload, and upload to **Internal testing** first. A local APK is useful for gameplay checks but does not validate Play billing or delivery.
6. Add trusted internal testers and license testers under the relevant account testing settings. They must install through the correct Play test track and use the intended Google accounts when testing billing.
7. Create two **one-time products**, intended to be consumed by the RevenueCat SDK: suggested store IDs `autoplay_300s_v1` and `autoplay_900s_v1`. Finalize supported IDs before creation; do not rename published identities. Describe exact benefits: **300 seconds** and **900 seconds** in this game's shared time bank, with at most30s per activation. Do not describe a subscription, permanent AUTO, ad removal or an auto-win.
8. Set country availability, tax settings and actual prices; draft ₹79/₹199 are hypotheses, not a requirement. Verify the SDK displays the charged localized price and exact benefit together. Complete payment profile/tax/bank requirements for sales.
9. Run the real purchase checklist in section8 before opening products to production. Resolve Play prelaunch-report findings and actual pilot feedback.

Google's published **12 testers continuously opted in for14 days** production-access rule is specifically for qualifying new **personal** accounts. It should not be presented as an automatic organization-account requirement. Check your console's actual gate and still run a substantive closed pilot for this game. [Official testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

## 3. Complete Apple enrollment and obtain a current iPhone build

1. Finish organization enrollment using the existing Apple Account, work email, legal entity/DUNS and binding authority. Your screenshot directed enrollment through the **Apple Developer app**; follow that route on an iPhone/iPad/Mac, or contact Apple if the requested route is unavailable. [Apple organization enrollment](https://developer.apple.com/help/account/membership/program-enrollment).
2. Complete the membership purchase only through Apple and wait until the team/membership is active. Follow the local amount/tax actually quoted. A free Apple Account alone does not provide App Store/TestFlight distribution.
3. In Certificates, Identifiers & Profiles, register the app's explicit bundle ID `com.speedinno.brickbreaker`. In App Store Connect, create its app record with that bundle ID and an internal unique SKU. Complete the paid-app agreements, tax and banking requirements before selling IAP.
4. Create two **consumable IAPs**, recommended IDs matching the same300s/900s names if available. Add exact benefit descriptions, localization, price/territories and review information. No expiry of purchased unused time is introduced by the game. Submit IAPs with the app as Apple requires.
5. On a borrowed Mac install/select supported Xcode, install Node22+, obtain the source branch and run the commands in [the iPhone build instructions](MOBILE-BUILD-3.3.md). `bash scripts/build-ios.sh` prepares unsigned archive/simulator outputs and receipts; it does not create an installable signed IPA.
6. Open `ios/App/App.xcodeproj`, select the company team/signing, confirm bundle ID/version/build and resolve required provisioning. Run on a connected iPhone first. Then archive, validate and distribute to App Store Connect through Xcode with the authorized team.
7. Alternatively use the supplied **manual** `azure-pipelines-ios.yml` in Azure DevOps Services. Connect the repository, select the existing YAML, grant/obtain hosted macOS parallelism and queue manually. It currently produces **unsigned** artifacts. Signing secrets/profiles, upload steps and actual pipeline execution still need configuration; no job has been queued here. This uses no GitHub Actions minutes. Check [Azure DevOps pricing/hosted grants](https://azure.microsoft.com/en-us/pricing/details/devops/azure-devops-services/) in your organization; the Azure API subscription does not automatically include unlimited hosted Mac builds.
8. Complete App Privacy using the combined archive's app/SDK privacy report. Add screenshots, content rating, support/privacy URLs, account-deletion explanation, export-compliance answers and review instructions. Do not copy another app's privacy answers.
9. Add App Store Connect sandbox testers; distribute the signed beta through TestFlight. Test the actual IAPs and cross-device account wallet. External TestFlight availability can require beta review. An iPhone installable package is an **IPA**, not an APK; an unsigned archive cannot be installed by tapping a link.

## 4. Configure RevenueCat after the store apps/products exist

RevenueCat is selected for one native integration across both stores. [Project setup](https://www.revenuecat.com/docs/projects/overview) and [consumable support](https://www.revenuecat.com/docs/platform-resources/non-subscriptions) describe its model. Its current pricing page advertises a free threshold then a tracked-revenue charge; confirm the actual account terms and what counts as tracked revenue before activation. Store commissions/taxes remain separate. [Pricing](https://www.revenuecat.com/pricing).

1. Create a company-owned project, with separate sandbox/production deployment configuration. Add the Android Play app and Apple app using the exact bundle IDs. Connect the appropriate Play service credentials and Apple purchase credentials by RevenueCat's platform instructions, with scoped access.
2. Import both real consumable products for each store. Record RevenueCat's **project ID**, **app IDs**, **product IDs** and each store's **store identifier**. Those four concepts are different. The client uses the exact configured products and actual SDK prices; do not create a subscription/paywall experiment as a prerequisite.
3. Obtain each public SDK key (`goog_...`, `appl_...`) and a server-only v2 key with the project/product/app/customer/purchase read permissions used by the verifier. Configure a separate appropriately scoped cleanup key for customer discovery/deletion in the worker. Do not put either server key in mobile source.
4. Keep purchase restore/transfer settings consistent with the game's **fixed original game-account ownership**. A store purchase must not silently transfer between unrelated game accounts. Review the project's restore behavior with RevenueCat's current instructions; test shared-store-account/different-game-account cases. Existing consumed receipts do not refill on restore.
5. Add the mapping below as **one-line JSON** in private `REVENUECAT_CONFIG_JSON`, substituting the actual provider IDs. This example shows Android300s only; include both packs for every platform being activated. Use `production` only with the matching production deployment:

```json
{"projectId":"ACTUAL_PROJECT","environment":"sandbox","products":[{"id":"ACTUAL_RC_PRODUCT","appId":"ACTUAL_RC_APP","platform":"android","bundleId":"com.speedinno.brickbreaker","storeId":"autoplay_300s_v1"}],"android":{"publicKey":"goog_ACTUAL_PUBLIC_SDK_KEY"}}
```

6. Set private `REVENUECAT_SECRET_KEY`. Generate a random webhook authentication string of at least32 characters and set `REVENUECAT_WEBHOOK_AUTH`; configure the **exact same Authorization header value** in RevenueCat. Endpoint: `<API_BASE>/webhooks/revenuecat`. Use the isolated sandbox API base for sandbox. Dashboard “TEST” delivery is intentionally ignored as transaction evidence; a real sandbox transaction is required.
7. Configure the **worker-only** `PRIVACY_REVENUECAT_KEYS_JSON` as a one-line array, for example `[{"projectId":"ACTUAL_PROJECT","environment":"sandbox","apiKey":"PRIVATE_CLEANUP_KEY"}]`. Include still-needed retired projects; do not discard keys while their cleanup/discovery obligations remain.
8. Insert immutable product rows into the **matching** database as shown below, initially `available=false`. RevenueCat scopes derive from the real store app, not the RevenueCat project: `play_store:com.speedinno.brickbreaker` or `app_store:com.speedinno.brickbreaker`.

```sql
-- Example only: run in the intended isolated SANDBOX after IDs are finalized.
insert into public.game_purchase_products
 (provider,scope,environment,product_id,platform,benefit_key,milliseconds,config_version,available)
values
 ('revenuecat','play_store:com.speedinno.brickbreaker','sandbox','autoplay_300s_v1','android','autoplay_time',300000,'packs_v1',false),
 ('revenuecat','play_store:com.speedinno.brickbreaker','sandbox','autoplay_900s_v1','android','autoplay_time',900000,'packs_v1',false);
-- iOS uses app_store:com.speedinno.brickbreaker and platform ios.
```

9. Deploy the scoped API/worker configuration, verify maintenance/deletion permissions and webhook authentication, then enable **only the sandbox rows** for sandbox testers. Match benefit/config versions in all catalog paths. A published benefit row is immutable except availability; changed benefits require a new product ID. After authentic tests pass, create/review separate production mappings/rows and enable deliberately. Never grant credit from a client success callback or manually imitate a real receipt.

## 5. Configure AdMob mobile rewarded ads

1. Create the company AdMob account/payment profile and add Android and iOS apps separately. Associate their store listings when available. Obtain one App ID (`ca-app-pub-...~...`) and one **rewarded** unit (`ca-app-pub-.../...`) for each platform. App IDs and unit IDs are not interchangeable.
2. Complete app readiness/account checks, publisher identity/payment requirements and applicable app-ads.txt ownership setup. Use Google test devices/test ads while developing; do not click live ads to test.
3. Review target audience and privacy requirements for the actual countries. Current activation is conservatively adult-eligible/general audience; an adult checkbox is not a full Families policy implementation. Publish and test applicable Privacy & messaging/UMP messages; verify consent denial, withdrawal and underage/unknown states before enabling. Do not mark review flags true merely to suppress an error.
4. Copy `.env.ads.example.json` to ignored `.env.ads.json`. Set actual App IDs, matching environment, reviewed flags and the current required iOS SKAdNetwork list. Production profiles reject the demo IDs. Run:

```powershell
npm run configure:ads -- --file .env.ads.json
npm run mobile:sync
```

5. Rebuild both native apps. This changes SDK registration and requires fresh privacy/device/store review. Build21's default APK deliberately excludes AdMob registration. See [native ad configuration](AD-CONFIGURATION.md).
6. In each rewarded unit, enable server-side verification. Production endpoint:
   `https://aemdjnguquaosvhytagy.supabase.co/functions/v1/reward-callback`
   Use the corresponding **sandbox project's** deployed endpoint for sandbox units. The function's health alone does not prove signed reward processing. Configure reward amount **30** and a chosen exact item string such as **autoplay_seconds**, then match those fields in the placement row. [Google SSV instructions](https://developers.google.com/admob/android/ssv).
7. Insert a new versioned private `game_ad_placements` row per native platform/environment. Fields are `id`, `provider='admob'`, `platform`, `environment`, `request_unit` (full rewarded unit), `verification_unit` (the **actual signed callback's** ad_unit representation), `reward_amount=30`, `reward_item` (exact configured string), `active=false`. Google's examples use a numeric verification unit; do not assume it equals the full request unit. Use the AdMob console verification tool and inspect the verified callback safely before activation. Placement identity/promise fields are immutable; version changes create a new row.
8. Set private one-line `REWARDED_ADS_CONFIG_JSON`, for example `{"environment":"sandbox","android":{"placement":"android_reward_v1"},"ios":{"placement":"ios_reward_v1"}}`, matching the rows. Configure/deploy the corresponding reward Edge ingress/API/worker before exposing the placement.
9. Verify a real provider-signed callback maps the offer/user/unit/amount/item correctly and commits one grant; replay it safely in sandbox to verify no second grant. Simulate delayed delivery/recovery, refusal/no-fill/close/error and quota exhaustion. Test ads alone may not produce the production SSV path. Keep ads unavailable until authentic delivery and consent/device behaviour are established.

## 6. Set up owned-browser payments with Razorpay

This step can follow mobile beta work. Native apps do not direct users to it to avoid store billing. The current web implementation is **INR-only**, even if the gateway account supports other currencies.

1. Create/activate the SpeedInno Razorpay business account with its legal/KYC/bank details. Supply the real owned HTTPS game website with accurate product, contact, privacy, terms and refund information. Approval for this business/use case is required, not implied by registration.
2. Use Test mode first. Under Account & Settings → API Keys, create test keys and keep `key_secret` private. Live keys require the provider's website/account approval; do not use live money for initial tests. [Official API key steps](https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/).
3. Record the actual merchant account ID (`acc_...`). Pick a stable scope such as `web:brickbreaker.speedinno.com` and exact owned origin. Configure:

```json
{"merchantId":"acc_ACTUAL_ID","scope":"web:brickbreaker.speedinno.com","environment":"sandbox","ownedOrigins":["https://YOUR_SANDBOX_GAME_HOST"]}
```

4. Save that one-line JSON as private `RAZORPAY_CONFIG_JSON`; set matching `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Create a separate random webhook secret of at least32 characters and store `RAZORPAY_WEBHOOK_SECRETS_JSON=["PRIVATE_WEBHOOK_SECRET"]`. A previous secret can remain during a deliberate rotation (max3); it is not the same thing as the payment API secret.
5. In the matching database insert two `game_purchase_products` rows, provider `razorpay`, chosen scope/environment, platform `web`, exact300000/900000ms benefits and `available=false`. Insert `game_web_prices` rows pointing to those product IDs, `currency='INR'`, integer **paise**, `current=false`. If later approved, ₹79 is7900paise and ₹199 is19900paise; do not choose a charge by mistaking rupees for paise. New prices are immutable versions; retire the old `current` flag and activate the new one atomically.
6. In Razorpay Account & Settings → Webhooks, add `<API_BASE>/webhooks/razorpay`, matching secret and monitored failure email. Select supported payment/refund/dispute events: `payment.captured`, `payment.authorized`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`, and the available `payment.dispute.*` events handled by the API. The server independently fetches canonical payments/disputes; signed webhook content is a freshness hint. [Official webhook setup](https://razorpay.com/docs/payments/dashboard/account-settings/webhooks/).
7. Ensure `ALLOWED_ORIGINS` includes only intended owned browser origins alongside native origins; deploy matching settings. Activate only sandbox catalog/price flags and test capture/cancel/pending/lostACK/recovery/refunds/disputes before making live rows current/available. A user seeing a provider success screen is not sufficient evidence of credit.
8. Verify real webhook response/retry timing against Azure's scale-to-zero cold path; the bounded worker/client recovery supports delayed delivery but does not prove timely merchant acknowledgment. If needed, choose measured always-warm/ingress changes with their actual costs. Monitor webhook failures and canonical recovery backlog.

## 7. Add owned-browser rewarded ads only after H5 approval

1. Apply to the AdSense H5 Games Ads program for the owned game site. Native AdMob approval does not automatically approve the browser site. [Official H5 setup](https://support.google.com/adsense/answer/9959170?hl=en).
2. Publish the required ads.txt/provider ownership setup and applicable Google Privacy & messaging CMP. Add a reviewed `web` section to the public ad profile with `publisherId`, the exact official `cmpScriptUrl`, exact `origins` and `consentReviewed`. The allowed CMP URL format is documented in [AD-CONFIGURATION.md](AD-CONFIGURATION.md).
3. Add a versioned `game_ad_placements` row provider `h5`, platform `web`, matching environment, publisher `request_unit='ca-pub-...'`, initially inactive. Set private `REWARDED_ADS_CONFIG_JSON.web` to its placement ID plus exact approved origins. Keep portal origins excluded.
4. Test refusal/withdrawal, applicable EU/US consent, Global Privacy Control, Google privacy links, no-fill and earned/closed callbacks on the actual approved site. No ad should start merely because consent was accepted. Browser callback trust is weaker than signed native SSV; the promise/quota/retry rules remain enforced.
5. Only activate after publisher approval and real site checks. Leave this feature unavailable without blocking the manual game if approval is absent.

## 8. Provider and device acceptance before production activation

Record app build/source, store track/provider environment, device/OS, test steps, expected/actual balances, canonical receipt/reward status and redacted evidence. Do not put customer identifiers or raw provider bodies into public reports.

| Journey | Required observation |
|---|---|
| Buy each native/web pack | Actual charged price and300s/900s grant; one canonical receipt, no double credit on callbacks/retry. |
| Pending/cancel/failure | No false success/grant; free play remains. Later authorized completion recovers exactly once. |
| Crash/lost connection after charge | Reopen/recover without repurchasing; truthful pending state until verification. |
| Restore/reinstall/sign-out | Same game owner retains unused time; consumed receipts do not refill; another game account cannot steal them. Protect guest saves before reinstall. |
| Refund/partial refund/dispute | Only source value reversed; already-consumed value separately recorded; unrelated gifts/purchases survive. Use provider-approved sandbox facilities and reconcile real callbacks/worker results. |
| Two devices +browser | Same linked account balance; reserve on one, second cannot overspend; stop/recover remaining time across editions. |
| Manual takeover and expiry | Correct active-real-time debit at all playback rates; stop immediately; no auto restart/next-stage activation. |
| Rewarded ad | Deliberate choice, exact30s disclosure, consent/refusal/no-fill/close/error and verified delayed grant; duplicate callbacks do not grant again. |
| Account deletion | Local/cloud deletion, SDK retirement and actual provider cleanup/discovery; retained transaction evidence disclosed; no account resurrection/regrant. |
| Real phones/computers | Small/Pixel-class Android and iPhone safe areas, touch/clutch/capture, keyboard/mouse/trackpad, audio, rotation, background/calls, thermal and large-swarm frame sampling. |

Mock/SQL checks already exist. This table requires **authentic provider and physical-device evidence**; dashboard test-event delivery and compiled SDKs alone do not complete it.

## 9. Deploy settings, operations and privacy in order

1. Keep `PLAY_METRICS_ENABLED=false` and commercial rows unavailable while preparing. Migration plans are read-only by default. Confirm the intended database/environment and provider identities before applying private configuration.
2. Configure worker cleanup/recovery keys before enabling the corresponding API provider. Run the read-only plans and inspect them, using the scripts' explicit **SpeedInno Org** subscription defaults; Sigzio Dev is excluded:

```powershell
./scripts/deploy-api.ps1 -Plan
./scripts/deploy-operations.ps1 -Plan
./scripts/deploy-recovery-monitor.ps1 -Plan
```

3. Deploy API/settings and the matching digest-pinned worker through the documented scripts, verify health and advancing exact-database maintenance heartbeats, and preserve the existing schedule. See [Azure API](AZURE-API.md) and [operations](OPERATIONAL-RECOVERY.md). A new image/configuration still needs read-back verification; successful source tests are not a deployment receipt.
4. Add an operator-selected Azure Monitor action group to `brick-breaker-recovery-failed`; test actual notification delivery. Add an independent missing-execution/heartbeat observer. Current actual portalFired evidence has **no human notification action** and cannot detect an absent scheduler by itself.
5. Review manual privacy queues, backups, retained financial evidence and business retention duties. Mail-provider retention requires actual review; do not label a retained record erased. Keep retired RevenueCat cleanup keys available until obligations are resolved.
6. Review privacy policy, in-app consent, Google Data safety and Apple App Privacy for the **final activated SDKs and countries**. Only then consider optional analytics. Verify retention/export/deletion and opt-out across devices before enabling collection. The coaching experiment remains paused until there is a justified study plan.
7. Confirm actual provider/store fees and Azure/Supabase/Resend/ACR/DevOps spend. The implemented contribution report accepts reviewed source evidence and keeps absent costs unknown. Existing Azure applications or shared allowances do not make this game automatically free.

Standalone operator commands accept either the legacy `SUPABASE_SERVICE_ROLE_KEY` or newer `SUPABASE_SECRET_KEY`. Keep only the real chosen value populated, with the matching database/environment; do not accidentally prefer an example placeholder. Public publishable keys cannot replace server secrets.

## 10. Beta, submission and gradual launch

Finish physical gameplay and the authentic sandbox checklist before activating monetization. Use Play's internal/closed tracks and a current signed TestFlight build for a real pilot. Give at least ten first-time players stages 1 and 2 with the built-in instructions and no AUTO. Record first clear time, losses/retries, touch aim, pickup understanding, and whether each player chooses to continue. Review stages 5, 9, 13 and a later Breather for the intended difficulty progression. If the opening still causes repeated failures like the owner's original report, tune it and run another fresh-player pilot before submission. Collect observations about mastery/replay, save recovery and assistance value; do not recruit testers merely to inflate a required count.

Resolve crash/payment/save/consent failures, produce final store screenshots/descriptions and review notes, verify support/deletion URLs, and submit through each console's actual checklist. Store review is an external approval, not something the code can mark passed. Release gradually with a responsible operator, visible rollback/availability controls and monitored support. Keep free manual play usable during provider outages.

The first account session should therefore be **Play organization verification → Android internal beta/signing/products → Apple membership/build access → RevenueCat sandbox → AdMob sandbox**. Razorpay/H5 follow for the owned-browser edition. Account creation, company agreements, KYC and payments remain actions for the authorized company representative; technical configuration and verification can then be completed together without exposing secrets in chat.
