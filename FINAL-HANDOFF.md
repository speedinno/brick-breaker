# Brick Breaker — final handoff to Chandrahas

**Current handoff:** use [Chandrahas's ordered account and store setup guide](docs/ACCOUNT-SETUP-2026-10.md), the [Android build 29 review](docs/ANDROID-BUILD-29.md), the [opening-stage rollout](docs/STARTER-DIFFICULTY-ROLLOUT.md) and the [product report](docs/PRODUCT-COMPLETION-2026-10.md). Finish the Android test before iPhone work. The remainder of this file records earlier build history and does not describe the current package.

**Latest playtest update: 3.2.0, build 20.** See the
[mobile feedback update](docs/MOBILE-FEEDBACK-3.2.md) for Home, Help, safe-area,
automatic-save, guest-stage linking, cloud-status, sound-switch and pickup-pacing
changes and their verification. The build 17 download references below are
historical; use the build 20 preview for retesting.

Updated 22 October 2026. Start here for the current **3.1.0 / native build 17** delivery. This guide supersedes setup assumptions and package versions in the older 3.0 launch guide.

The implementation, native preview packages and automated verification are complete for this update. Production release still requires the owner tasks below: real email acceptance, support/policy details, signing, physical-device testing and store submission. The game has not been published to either app store.

## 1. Where everything is

| Item | Location |
| --- | --- |
| Primary private repository | [SpeedInno-Org/Brick-Breaker](https://github.com/SpeedInno-Org/Brick-Breaker) |
| Current delivery branch in both repositories | `codex/immersive-mobile` |
| Review and merge into `dev` | [Pull request #1](https://github.com/SpeedInno-Org/Brick-Breaker/pull/1) |
| Approved public source/build mirror | [speedinno/brick-breaker](https://github.com/speedinno/brick-breaker/tree/codex/immersive-mobile) |
| Build 17 downloads and SHA-256 checksums | [3.1 preview release](https://github.com/speedinno/brick-breaker/releases/tag/v3.1.0-rc.1) |
| Android test install | [Build 17 APK](https://github.com/speedinno/brick-breaker/releases/download/v3.1.0-rc.1/Brick-Breaker-3.1.0-build17-Android-test.apk) |
| Mobile changes, evidence and acceptance details | [Mobile presentation handoff](docs/MOBILE-PRESENTATION-3.1.md) |
| Existing cloud deployment and operations | [Azure API guide](docs/AZURE-API.md) |

These are two repositories: the private organization repository is the primary source; the public repository is the authorized build mirror. Both contain this delivery branch. `dev` and `main` were not moved by this delivery. The existing public website can therefore still show an older version until its release branch is deliberately updated.

Packaged application source: `e32cb8e28e13c6f9b980eb946cc6ab591a983ad6`. Later commits update documentation and evidence only. Use **build 17**; builds 14–16 are superseded.

## 2. Set up your laptop

Install Git and Node.js 22 or later. Then:

```powershell
git clone --branch codex/immersive-mobile https://github.com/SpeedInno-Org/Brick-Breaker.git
cd Brick-Breaker
npm ci
npm test
npm run check
npm run mobile:sync
npm run dev
```

For an existing checkout, first preserve any local changes, then fetch and switch to the delivery branch. The dev server prints its local URL. Android builds need Java 21 and Android SDK 36. Use `npm run android:open` to open Android Studio. iOS signing/building needs a Mac with Xcode 26 or later; use `npm run ios:open` there. The current app identity is `com.speedinno.brickbreaker`; confirm ownership and preserve it for updates to an existing listing.

The public mirror's **Native mobile builds** workflow can build this branch without a local Mac. Its iOS archive is unsigned and still requires the owner's signing workflow. The simulator ZIP cannot be installed on a physical iPhone. The unsigned AAB is not a finished Play upload.

## 3. Verify the existing cloud setup

**Do not start by creating a replacement Supabase project.** Chandrahas's `dev` work already supplied Azure/Supabase configuration, and this update preserves it. The [Azure guide](docs/AZURE-API.md) records the deployed API, applied migrations and hosted acceptance from 21 October. Those historical checks do not prove today's email delivery or production readiness.

- Confirm access to the intended Azure subscription, API deployment, Supabase project and SMTP provider. Check the deployed API health and inspect the release app's public configuration.
- The two database migrations were already applied manually. Reconcile migration history before any CLI migration push; do not rerun the initial schema or reset the database.
- Verify Supabase email/OTP delivery through the configured SMTP provider using real test inboxes, including spam placement, expired/incorrect codes and resend behavior. Confirm sender-domain verification and the intended app/website authentication settings.
- On two signed physical devices, test sign-in, explicit guest-progress import, stage completion, cross-device completed-stage history, offline play followed by reconnect, sign-out/account switching, export and account deletion. The in-progress ball field is local to its device; it is not a cross-device live-session save.
- Use disposable accounts for destructive acceptance. Confirm deletion removes private player data while preserving the shared stage catalog. The existing hosted harness is documented in the Azure guide.
- Keep service-role keys, SMTP credentials, database passwords, `.env.api`, signing files and recovery codes out of Git and client bundles. Store owner credentials in the team's password manager and deployment secrets. Public client configuration is expected to be bundled.

Use the Azure deployment guide for an intentional backend update. This presentation release does not itself require replacing the API or storage service. Additional Azure Blob storage is not a prerequisite for the current implementation.

## 4. Finish product ownership and support

- Confirm the publisher/legal name and access to the team's Apple Developer, App Store Connect and Google Play Console accounts. Use team-controlled accounts and invite the people responsible for ongoing releases.
- **If no monitored product support mailbox exists, create one.** A suitable form is `games-support@<your-owned-domain>` or `brickbreaker-support@<your-owned-domain>`. These are naming suggestions, not existing addresses. Assign an owner, test inbound/outbound delivery and use the real address consistently in the app, support page and store listings.
- Confirm the production domain and publish working HTTPS privacy, support and account-deletion pages. Check the in-app links and unauthenticated access from another device. Use the actual data flow and retention/deletion behavior when finalizing these pages.
- Complete store privacy/data-safety, content rating, reviewer instructions and listing metadata based on the shipped build. Recheck current requirements in each store console at submission. Do not claim no data is collected when account/cloud features collect it.
- Capture listing screenshots from the final signed app on representative devices. Use game-owned artwork and assets. The X reference videos and other games' branding are not assets for the listing.

The [extended launch guide](CHANDRAHAS-LAUNCH-GUIDE.md) contains detailed support, privacy, reviewer-access and operational checklists. Its 3.0 package links and “create a Supabase project” instructions are historical; use this guide and the Azure deployment record for the current state.

## 5. Sign and test the native release

1. Review PR #1 and the native screenshots linked in the mobile handoff. Merge into `dev` after review and acceptance, then follow the team's normal promotion process. Keep the approved public mirror aligned with the exact source selected for builds; do not copy private credentials into it.
2. Android: use the team's stable upload/release key, back it up securely and produce a signed AAB for Play internal testing. The supplied APK is a debug test build. Temporary CI debug keys may differ between builds. **Do not uninstall a user's important guest-only progress to resolve a signature mismatch.** First sync/export progress, use a matching key or test on a separate device.
3. iPhone: configure the Apple team, certificates and provisioning for the existing app identity, then sign/archive and upload through the team's App Store Connect workflow. Distribute a TestFlight build for acceptance.
4. Test a compact Android, a tall Android with camera cutout, gesture and three-button navigation, and a notched/Dynamic Island iPhone. Verify full-screen borders, safe areas, drag control at both edges, pause/resume, system-bar reveal, app switching, account keyboard/code entry, one-tap dialog close, scrollable stage selection and saved-game restoration after force close.
5. Check progression: starter completion ticks; stage 13 locked until all twelve starters are complete; subsequent stages unlock sequentially; locked-stage prompts explain the requirement; later layouts and difficulty remain playable. Test manual and AUTO modes, shooting pickups and a busy swarm on the least powerful supported test phone.
6. Record device/OS/build, results and any defects. Resolve release-blocking failures before production submission. If source or public configuration changes, rebuild and repeat the affected checks. Use a new native build number for subsequent uploads as appropriate.

## 6. Evidence already completed

- 66 Node tests, syntax checks and shared generator parity passed.
- [Source/backend CI](https://github.com/speedinno/brick-breaker/actions/runs/39756048519) passed.
- [Android/iOS package builds](https://github.com/speedinno/brick-breaker/actions/runs/39756071750) passed.
- [Native acceptance](https://github.com/speedinno/brick-breaker/actions/runs/39756698191) passed on an Android API 35 emulator and iPhone 17 Pro simulator. Coverage includes full viewport, touch controls, keyboard dismissal, gameplay, stage locks and exact damaged-field restoration after restart.
- All four native packages were audited against 40 matching game assets from the packaged source commit. Download checksums were verified after release publication.

See the [detailed evidence](docs/MOBILE-PRESENTATION-3.1.md#recorded-verification). Simulator/emulator results do not replace signed physical-device acceptance, live OTP testing or store review.

## 7. Launch and record the handover

After internal testing/TestFlight acceptance, finalize listings, provide reviewer access/instructions where needed and submit signed builds. Use a controlled rollout and monitor crashes, support requests, authentication, API failures, database capacity and infrastructure costs. Confirm backups and a recovery procedure before inviting production users. Preserve stage generator/version compatibility and existing saves when updating or rolling back.

Record these items in the team's private release notes and share the non-secret results with the product owner:

- Approved Git commit, merged branch, version/build and signing-key ownership.
- Android internal-test/production link and iOS TestFlight/App Store link.
- Physical-device acceptance results and real email/cloud acceptance results.
- Support email, production policy/support/deletion URLs and accountable support owner.
- Cloud project/resource ownership, monitoring/backup owner and recovery procedure location.
- Store submission status, any remaining blocker and next owner/action.

Do not include passwords, tokens or signing private keys in the handover record. Source delivery is complete; owner-managed release tasks above remain the launch gates.
