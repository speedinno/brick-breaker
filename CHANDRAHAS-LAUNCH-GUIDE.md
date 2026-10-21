# Brick Breaker — Chandrahas's launch guide

Prepared 21 October 2026. Code version 3.0.0, release candidate. This guide is the handoff requested by the product owner. **You own Supabase, support email, developer accounts, production signing and store submission.** No Supabase project was created for this game during development. No store submission, live email delivery, or physical-device certification is claimed.

## 1. Start here

Primary private repository: https://github.com/SpeedInno-Org/Brick-Breaker

Approved public source/build mirror: https://github.com/speedinno/brick-breaker

Public game: https://speedinno.github.io/brick-breaker/

The organization CI was blocked by its billing/spending setting. The owner authorized using the public mirror for builds. The two repositories are separate copies; synchronization is **manual**. Never put database credentials, SMTP passwords, signing keys, reviewer passwords, private documents or player data in either repository. Public source includes the same application code and migrations. A Supabase publishable key is intentionally public; it grants no administrator access.

Read this file, `docs/ARCHITECTURE.md`, and `docs/RED_TEAM.md`. Use Node 22+:

```sh
npm ci
npm run build:web
npm test
npm run check
node scripts/release-preflight.mjs
npm run dev
```

Source checks currently pass with cloud disabled. Production preflight intentionally fails until public configuration is supplied:

```sh
node scripts/release-preflight.mjs --production
```

Passing that script checks source/configuration, not store approval or live operational readiness.

## 2. What players get

- All twelve starter stages are playable immediately, in any order. Each real clear gets a persistent **✓ Completed** tick. Manual and AUTO both count.
- Completing **all twelve** unlocks 13. Completing 13 unlocks 14, and so on. Replaying a completed stage does not unlock extra stages.
- Future journey cards show a lock, with no pattern preview. Tapping one tells the player which stage(s) to finish and offers the required stage.
- Generated layouts use graph construction, varied chambers, branches, loops and sixteen architecture families. They are not transformations of the starter twelve. A finite grid cannot honestly guarantee mathematically infinite different boards; describe this as an expanding, procedurally generated journey.
- Every eight journey clears completes a chapter. The map shows chapter, challenge label and clears remaining. Ball speed, paddle control and layout complexity change gradually within safe bounds; early breakthrough boosts remain. Sixteen shuffled architecture styles include petals, crystals, arches, ribbons and mandalas. See dist/difficulty.js and docs/ARCHITECTURE.md for the curve. Existing cached guest boards stay stable; newly generated boards use the expanded recipes.
- Guest progress is local. Optional accounts synchronize completed stages, selected stage and personal history. The exact in-progress field/swarm is a **device-local** snapshot, not cross-device live simulation.
- Guest detailed history keeps starters plus the most recent 128 generated records. Completion ticks/frontier persist beyond that. Cloud history is paginated and retains per-stage summaries. There is no replay-by-replay event log.
- Existing v2 selected-stage state is not treated as evidence of completion; the prior best score can migrate.

## 3. Create the game Supabase project

Create a **new, owner/team-managed project for Brick Breaker**, under the correct organization and billing owner. Choose a data region suited to the intended audience and legal commitments. Invite appropriate maintainers with least privilege and enable owner MFA. Set spend alerts and a database backup/recovery policy. Keep its database password in your team's secret manager.

Install/use the official Supabase CLI. From the repository:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npm run build:web
npx supabase functions deploy game-api --no-verify-jwt
```

`db push` applies every committed migration, including `202610210001_game.sql` and the new-catalog generation budget in `202610210002_catalog_budget.sql`. Read it first. Do not run it twice manually through SQL Editor or reset a production database. For future changes, add new migrations. The function has `verify_jwt=false` because it explicitly validates every request bearer token through `auth.getUser`; this supports current signing-key formats. **Do not remove that explicit check.**

Supabase supplies the function's `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` environment variables. The service-role key exists only server-side. It must never enter `dist/`, native assets, screenshots, GitHub variables, browser storage, or a public guide. No Azure Blob account is needed: these small level definitions and player records belong in Postgres.

Set the function secret `ALLOWED_ORIGINS` to a comma-separated list of actual browser origins, for example:

```text
https://speedinno.github.io,https://localhost,capacitor://localhost
```

An origin has no `/brick-breaker/` path. Add your own HTTPS game domain when deployed. Add any private preview origin only if needed. For local testing explicitly add `http://127.0.0.1:4173`, then remove it from production if not needed. Use the dashboard or `supabase secrets set` securely; avoid storing secret-bearing shell history. CORS is not authorization; JWT and RLS provide authorization.

Run Supabase security/performance advisors and review exposed tables/functions. RLS is enabled on every game table; authenticated users read only their own progress/history and unlocked catalog stages. Browser clients cannot write tables directly. Catalog publication is service-role-only. Preserve these grants.

## 4. Email delivery and support — required before launch

**Create a new monitored support mailbox if one does not already exist.** A suitable choice is `support@<your-owned-domain>` or `games@<your-owned-domain>`. Confirm the legal publisher owns the domain. Configure mailbox access for the people answering player, privacy and deletion requests. Test inbound/outbound delivery and spam handling. A public GitHub issue tracker is a temporary guest-build fallback, not the final private account-support channel.

Configure a production transactional email provider in Supabase custom SMTP. A separate sender such as `noreply@<your-owned-domain>` can send login codes; retain the monitored support mailbox for replies. Verify the domain and SPF/DKIM/DMARC. Do not rely on Supabase's default restricted development email service for a worldwide launch.

In Supabase Authentication:

1. Enable email authentication and email sign-ups; disable unused providers. Keep password sign-in available for the dedicated store review account.
2. Set the email sign-in template to visibly include **`{{ .Token }}`**. The game accepts 6–10 digit codes; select a matching length and a short expiry such as 10 minutes. It verifies codes in the app; it does not depend on universal links or an email redirect.
3. Set the production Site URL and allowed redirects to the actual public HTTPS game domain. No arbitrary wildcard redirects.
4. Configure sender identity, rate limits and abuse monitoring appropriate to the plan. No client CAPTCHA widget is bundled; if you enable mandatory CAPTCHA, first add and test its web/native challenge flow. Do not enable a setting that silently breaks the shipped login UI.
5. Test actual delivery to at least two unrelated email providers, expired/wrong codes, repeat requests, sign-out, refresh, and recovery after reinstall on a second device.

## 5. Put public settings into every build

Obtain the project **URL and publishable key** (or legacy public anon key). Use a local shell environment, not a committed `.env` file:

```powershell
$env:SUPABASE_URL='https://YOUR_PROJECT_REF.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY='YOUR_PUBLIC_PUBLISHABLE_KEY'
$env:SUPPORT_EMAIL='support@YOUR_DOMAIN'
$env:PUBLISHER_NAME='YOUR_LEGAL_PUBLISHER_NAME'
npm run configure:cloud
npm run build:web
node scripts/release-preflight.mjs --production
npm test
npm run check
npm run mobile:sync
```

The script rejects a service-role/secret key and writes `dist/cloud-config.js`. This file contains **public settings only** and may be committed. In this repository the CI builds the checked-in config; setting GitHub variables alone does not change it. Commit the configured file, then push the **same source commit** to both remotes. Check the diff contains only public values. Never paste a database password or SMTP password there.

```sh
git remote -v
git push organization main
git push github main
node publish-pages.mjs
```

`publish-pages.mjs` expects a remote named `github` pointing at the public mirror and pushes the `dist` subtree to `gh-pages`. Add that remote in a fresh clone if absent. Primary remote can be named `organization`; verify actual URLs before pushing. The public repository's Pages settings must serve `gh-pages` root. Wait for Pages deployment, then check `cloud-config.js`, privacy/support/deletion URLs, and login on the **deployed** page. Existing service workers update after fetching the new version; increment the cache version when shipping changed assets/config. Rebuild native binaries after cloud config changes; a published website does not update bundled native assets.

## 6. Validate the live backend with two disposable accounts

Use a staging Supabase project first if possible. Automated SQL tests use real embedded Postgres with test auth roles; they do not prove your hosted project's SMTP, gateway settings, or policies are configured correctly.

- Account A: clear starters in mixed order. At eleven clears, 13 must stay locked. Clear the last starter: 13 opens, 14 stays locked. Clear 13: 14 opens. Replays must not advance twice.
- Sign in as A on another device/browser: completions and next stage must match. A new in-progress field starts there; local ball positions are not uploaded.
- Sign out and sign in as B: no A history/results should appear. Check direct API/table reads cannot access A rows, runs, or locked catalog stages. Anonymous edge requests must fail.
- Clear offline on a previously downloaded stage; reconnect and use Sync. Confirm retries are idempotent. Guest/offline imports are explicitly client-reported personal progress. Expired audited attempts fall back to that same private import path.
- Start the same new stage from two accounts concurrently. Exactly one version/level definition should win; everyone subsequently downloads that stored definition.
- Export history on the web. Confirm it contains only that account's identity/progress/history, including pagination beyond 100 rows.
- Delete a disposable account through Account → Delete my account, entering DELETE. A fresh sign-in within 15 minutes is required; if prompted, sign out and back in. Confirm Auth identity, `game_players`, `game_runs`, `game_completions` are removed. Shared anonymous catalog definitions must remain.
- Test the external route `https://speedinno.github.io/brick-breaker/delete-account.html` from a fresh browser, sign in, and delete without installing the app. Sign-in is a reasonable identity check. Do not require a support ticket as the only route.

Do not delete a real player's account to test. Use explicit disposable test accounts and retain test evidence privately. Signing out keeps a separate per-account local save for returning users; deleting removes that account's local save on the device performing deletion. Other devices' offline storage is not remotely erased; explain clearing app/browser data when handling privacy requests.

## 7. Catalog, operations and security boundaries

`game_catalog` stores a versioned definition once per stage. Generation validates reachability and density; the canonical SHA-256 detects exact repeats including all rotations/reflections. Recent 48 layouts also receive a structural-distance check. A transaction/advisory lock and unique hash resolve concurrent publication. Completion prefetches the unlocked stage and one following stage server-side; locked users still cannot fetch it. No player email/ID is embedded in shared definitions.

**Freeze generator version 3 after publishing its first real levels.** Existing definitions are immutable. If rules/layout encoding change, design a new catalog version and progress/cache migration. Never regenerate existing stage numbers or truncate the production catalog. Keep the bundled client/server generator in parity with `npm run build:web` and `npm run check`.

There is no competitive leaderboard, currency, purchase, prize, or server-authoritative replay verification. An account owner can forge their own client-reported progress/import. Hash checks, run IDs, score bounds and rate limits stop some mistakes/abuse, but are **not anti-cheat certification**. Add server replay validation before any competitive or monetary feature. Import is bounded to a frontier of 1,000,000 in this version; normal audited advancement uses safe integer levels. "Unlimited" is product shorthand for an expanding catalog, not infinite storage or a mathematical guarantee.

Unpublished catalog generation is budgeted per account at 120 authorizations per ten minutes through the second migration. Importing progress does not reset this quota; existing shared stages remain available. This is an abuse limit, not a paid unlock or a change to normal progression.

Monitor function failures/latency, auth send failures, database size and catalog prefetch failures. Never log tokens, email codes, passwords or full request bodies. Configure alerts and a support response process. Retain/expire infrastructure logs consistently with the final privacy notice. Record the selected region, subprocessors, email provider, backup retention and deletion policy. Review RLS after each migration.

Schedule a daily owner-side cleanup (Supabase Cron or another controlled job) for old attempts:

```sql
delete from public.game_runs where expires_at < now();
```

Review your retention policy first. Expiry is seven days; cleanup is not automatically scheduled by this source migration. Keep completion summaries until account deletion. Test restores into staging, never over active production by surprise. Roll back app code to a compatible tag if necessary; never roll back by deleting users' progress. Back up before schema changes.

## 8. Android production package

Permanent application ID currently `com.speedinno.brickbreaker`; verify availability/ownership before the first store upload. Source version is 3.0.0, versionCode 3. Increase versionCode for each subsequent upload. Android min SDK 24, target/compile SDK 36; Java 21. CI builds a **debug-signed test APK** and **unsigned release AAB**. Neither is a signed production store release.

1. Create/verify the appropriate organization Google Play Console account, ownership/contact details and payments profile. Use the company's account, not a temporary contractor identity.
2. Enroll in Play App Signing. Create and securely back up the upload keystore/passwords in the team's secret manager. Never commit keystores. The debug APK uses a different signing key and is for testing only; users may need to uninstall it before installing a differently signed build, so first sync/export test progress if needed.
3. `npm run mobile:sync`, open `android/` in Android Studio, then Generate Signed Bundle/APK → Android App Bundle → release. Set the upload keystore locally. This project deliberately has no committed production signing credentials. Keep generated bundles outside source control.
4. Test the signed AAB through Play internal testing on real low-end and recent Android devices, API 24/35/36, small/large screens, 60/120Hz, background/kill/relaunch, airplane mode, thermal/performance limits, external links, login and deletion. Review Play pre-launch report and accessibility. CI emulator tests cover bundled offline gameplay, pause/resume and relaunch; they are not a physical-device lab.
5. Check all final dependencies for 16 KB memory page support. This build is Java/Kotlin/web with no intended native `.so` game engine; recheck the actual final artifact if adding any SDK.
6. Fill content rating, target audience, ads declaration (no ads), Data safety, privacy policy, external account deletion URL, app-access credentials and countries. New personal accounts created after 13 November 2023 can require 12 opted-in closed testers continuously for 14 days before production access; follow the requirement shown for your actual account.

## 9. iPhone production package

Bundle ID currently `com.speedinno.brickbreaker`; verify/register it in the correct Apple Developer team. Source is 3.0.0 build 3; use a new build number per upload. Minimum iOS 15.4. Use a Mac and **Xcode 26+ with iOS 26 SDK or newer** for submission requirements current at this handoff.

1. Enroll/verify the company's Apple Developer organization (including D-U-N-S and legal authority where applicable), accept required agreements and complete App Store Connect business/trader disclosures.
2. `npm ci && npm run mobile:sync`; open `ios/App/App.xcodeproj`. Select App target, correct Team and bundle ID, configure signing/provisioning. Archive for a physical iOS device using Release, then Validate/Distribute through Xcode Organizer to App Store Connect.
3. The CI `.xcarchive` is **unsigned**; the simulator ZIP is **not an iPhone IPA**. Build/sign under your team for actual devices. Do not advertise these CI files as App Store-ready installations.
4. Inspect the final archive's `App.app/PrivacyInfo.xcprivacy` and embedded SDK manifests, and generate Xcode's privacy report. The app manifest declares optional linked email, user ID, gameplay content and product interaction for functionality, no tracking. Reconcile additional infrastructure/security logs and any future SDKs with App Store Connect's disclosures. Do not guess required-reason API codes; audit actual native APIs if dependencies change.
5. Test on real minimum-supported and recent iPhones using TestFlight. Exercise safe areas, compact screens, landscape, audio interruption, external browser links, account lifecycle, offline play and session restoration. Review iPad behavior if offering iPad availability; current layout is phone-first. The icon is opaque RGB; use actual current screenshots, never a simulator screenshot mislabeled as a physical-device test.
6. Email-only first-party login does not itself require Sign in with Apple. Reassess Apple's login rule if adding Google/Facebook/social login. Complete age/content rating, privacy, support URL, export compliance/encryption answers using the actual final dependencies and intended distribution. Submit, answer reviewer questions, then choose a controlled rollout.

## 10. Reviewer access and store assets

Create a dedicated Supabase test account with a long unique **normal password** via the trusted server/dashboard. It must sign in through Account → existing-account password sign-in. There is no hardcoded bypass or master password. Store its credentials privately in each store's app-access/review instructions, not this repository. Reviewers must not depend on access to your OTP inbox. Give them exact navigation, explain guest play and starter unlock rules, and provide any legitimate prepared test progress needed to see the journey. Rotate credentials if exposed; avoid expiring them during review.

Suggested listing (adapt with final brand/legal review):

- Name: **Brick Breaker: Swarm Journey** (27 characters).
- Short description: **Find the channel, catch boosts, and grow a spectacular swarm of bouncing balls.**
- Main description: "Guide one ball through narrow channels and watch a whole swarm emerge. Catch +3 and ×3 boosts, protect your paddle, and break through dense fields of color. Complete twelve starter stages to unlock an expanding journey of new chambers, branching paths and loops. Play by hand or relax with AUTO. Your completion ticks show where you are and what comes next. Play offline as a guest, or use an optional account to keep completed stages and personal history across devices. No ads or in-app purchases in this version."

Only mention functioning cloud accounts after section 6 passes. Capture portrait screenshots from the signed current app: fresh board, earned swarm, ✓ completion, locked next-stage explanation, generated journey, optional account page with **fictional/test** email. Never expose player data. No third-party clips/watermarks or claims of owning another game's code. The app icon is in the native asset folders; preserve its no-alpha Apple export. Keep all store image source/exports in a team-controlled asset folder with ownership records.

Privacy URLs after Pages publication:

- Privacy: https://speedinno.github.io/brick-breaker/privacy.html
- Account deletion: https://speedinno.github.io/brick-breaker/delete-account.html
- Support URL: https://speedinno.github.io/brick-breaker/terms.html — its Support section uses the configured monitored mailbox. A dedicated company support page can replace this later. The repository's issues page can handle public bugs, not private account requests.

For Data safety/App Privacy, optional email/user identifier and saved gameplay/history are collected when an account is used; they are linked to that account for app functionality. Assess IP/device/security logs with Supabase, hosting and SMTP providers. Do not select blanket "no data collected" for the cloud-enabled app. No ads, tracking, purchases or analytics SDKs are in this candidate. Reconcile the declarations whenever adding any SDK. Review the intended age audience, regional consent and child-directed obligations before enabling accounts for the selected audience; this code is not a parental consent platform.

Select distribution territories deliberately. "Worldwide" does not bypass regional game registration, licensing, consumer/privacy laws or EU trader requirements. Get an appropriate legal review for the publisher, audience, terms and launch regions. No document here guarantees legal/store compliance.

## 11. Final go/no-go and handover record

Before public store release record the final source SHA/tag, signed artifact hashes, owner accounts, signing backups, cloud project/region, support mailbox, SMTP sender, deployed policy URLs, beta evidence, reviewer access, monitoring owner and rollback plan. Require:

- [ ] Source checks and backend type check pass on the final commit.
- [ ] Production preflight passes; same public config is bundled on web/Android/iOS.
- [ ] Two-user hosted login/save/export/deletion and offline recovery tests pass.
- [ ] Shared catalog concurrency/locked-stage access tests pass on hosted staging.
- [ ] Support/privacy mailbox and SMTP deliver reliably; backup/cleanup/alerts are configured.
- [ ] Signed Android internal test and Apple TestFlight pass on real devices.
- [ ] Store screenshots/metadata/access/privacy/deletion/age/territory declarations match the final app.
- [ ] Owner verification, fees, agreements and signing ownership are complete.
- [ ] Store reviews approve the binaries; rollout is enabled by the owner.

Do not describe the release candidate as globally launched before the final steps complete. GitHub builds are development deliverables. Launch with a staged rollout, watch crashes/auth failures/support reports, and pause rollout if completion saves or deletion fail.

If another engineer/agent helps, give them this prompt: "Continue Brick Breaker from CHANDRAHAS-LAUNCH-GUIDE.md in SpeedInno-Org/Brick-Breaker. Supabase/store setup belongs to Chandrahas. Inspect current source and test evidence; preserve catalog version 3 and player progress. Never publish secrets. Complete the remaining checklist with owner-managed accounts and report verified evidence versus pending gates."

## Official references (recheck at submission)

- [Supabase CLI migrations](https://supabase.com/docs/guides/deployment/database-migrations), [email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Edge Functions](https://supabase.com/docs/guides/functions).
- [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/), [SDK requirements](https://developer.apple.com/news/upcoming-requirements/), [in-app deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/), [App Privacy](https://developer.apple.com/app-store/app-privacy-details/), [privacy manifests](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk), [TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).
- [Google target SDK](https://developer.android.com/google/play/requirements/target-sdk), [16 KB page sizes](https://developer.android.com/guide/practices/page-sizes), [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-GB), [testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-en), [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en-en), [reviewer access](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en-en).

## Candidate evidence

Application commit: fd824b5df628c24f877999d6a3a22fa307f82f1b. Both native builds passed: https://github.com/speedinno/brick-breaker/actions/runs/39542142668 . The compiled Android/iPhone launch checks also passed: https://github.com/speedinno/brick-breaker/actions/runs/39542592444 . There are 38 current automated tests including the subsequent backend-only generation-budget check. See docs/RELEASE-V3.md and docs/RED_TEAM.md for evidence and limits.

Candidate packages/source: https://github.com/speedinno/brick-breaker/releases/tag/v3.0.0-rc.1 . The Android APK is debug signed; AAB and iOS archive are unsigned. Store signing and real-device/cloud validation remain your responsibility.
