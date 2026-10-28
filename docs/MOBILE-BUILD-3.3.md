# Mobile builds — 3.3.0

## Current easier-opening candidate: build 22

Source `270b418e47d5508f4c971181c0f3a9b04e2c8be7` on `codex/easier-opening-rounds` adds wider early entries, a short free paddle shooter on stages 1–2, periodic Breather rounds, reliable touch reversal and a true first-play coaching screen. An Android emulator run of the preceding candidate revealed that optional coaching replaced the opening-volley instructions; this source fixes the interaction. A direct local browser check now shows the first-time help followed by the visible volley guidance and Launch control. The exact-source build 22 native pipeline is [run 40686307469](https://github.com/speedinno/brick-breaker/actions/runs/40686307469). Its verify, Android and unsigned iPhone archive/simulator compilation jobs succeeded. Local `npm test` passed 447/447 before this one-line coaching correction; its targeted checks and `npm run check` passed after the correction. The release source preflight reports version 3.3.0/build 22.

The [packaged Android gameplay check](https://github.com/speedinno/brick-breaker/actions/runs/40687613714) succeeded. It launched offline in a full-screen native viewport, verified first-play guidance, moved the paddle with a touch drag, cleared bricks with AUTO off, and confirmed the same stage, ball, lives and boost state after cold force-stop and relaunch. The APK's 62 runtime assets matched this exact source commit, and its SHA-256 is `6b31767ec6a672077521a64d66a6ae02e06bd8fc5efd3f0f97d4ce26cfc602cf`. Download the [Android test APK](https://github.com/speedinno/brick-breaker/releases/download/v3.3.0-rc.2/Brick-Breaker-3.3.0-build22-Android-test.apk) from the [public prerelease](https://github.com/speedinno/brick-breaker/releases/tag/v3.3.0-rc.2). This is debug-signed and may not install over an older package signed by a different key; protect guest progress before uninstalling any older test build. This check proves a functioning native package, not a human novice win rate.

The [packaged iPhone simulator check](https://github.com/speedinno/brick-breaker/actions/runs/40691888056) also passed on the exact app from build 22. The UI runner covered the full-screen home and stage, first-play guidance, reachable safe-area controls, account keyboard and panel close, locked stage requirement, manual brick destruction, and cold save/resume. The first run failed because its counter assertion expected an accessibility phrase that iOS WebKit did not expose; the recording showed the visible counter and stage. The corrected runner passed without rebuilding or changing the packaged app. This is simulator evidence; Chandrahas still needs a signed install on a physical iPhone and TestFlight review.

Build 22 signed-in starter play requires `202610280016_starter_catalog_v4.sql` and the matching API bundle first. Previously started v3 runs and completed-stage history are preserved. See [rollout notes](STARTER-DIFFICULTY-ROLLOUT.md) and [Chandrahas's account handoff](ACCOUNT-SETUP-2026-10.md). The APK is for guest/device testing until that cloud rollout. An unsigned iOS archive is a signing input, not an installable iPhone app. The dated build 21 record below remains useful history but its hashes and tests do not describe build 22.

## Historical build 21 record

Candidate content/source: `a22930a` on `codex/product-controls-economy`. This includes the controls/physics, finite assistance, purchase/ad recovery and optional measurement work; it is not a store publication or a claim that unavailable commercial accounts were tested. Later rollout documentation does not change its Android assets/native code. The API/worker container source remains `73fa1e0a170f`, as recorded in [Azure deployment](AZURE-API.md).

## Android build evidence

On Windows with Node 24.22.0, Android Studio's JBR 21, SDK/build-tools 36.0.0 and the local Gradle 8.14.3 distribution:

```powershell
npm run mobile:sync
node scripts/release-preflight.mjs
$env:JAVA_HOME='C:/Program Files/Android/Android Studio/jbr'
$env:ANDROID_HOME='C:/Users/chand/AppData/Local/Android/Sdk'
& ./.openai/local/gradle-8.14.3/bin/gradle.bat -p android assembleDebug bundleRelease --console=plain
```

The actual build succeeded in two minutes, 407 tasks (142 executed / 265 up to date). `aapt dump badging` reads `com.speedinno.brickbreaker`, version 3.3.0/code 21, minimum API 24 and target/compile API 36 from the APK. It declares Internet, vibration, network state, Play Billing and the app's protected receiver permission. AdMob is excluded from the default native plugin profile; ads and commercial provider configuration remain inactive. A later ad-enabled profile requires another native build and consent/device review.

| File | Bytes | SHA-256 |
|---|---:|---|
| `Brick-Breaker-3.3.0-build21-Android-test.apk` | 8,610,372 | `be3565f0d7298ad927d6f876e688a8581e698f0ab5d776c698f63447b021e314` |
| `Brick-Breaker-3.3.0-build21-Android-unsigned.aab` | 6,499,568 | `c435811ec75869312d57a4873db5a1e4b06609e9fbf086be56d3ce57f5055d74` |

Files and private audit receipts are in `.openai/local/product-redesign/` on the build workstation. These are local artifacts, not an asserted public download URL. The APK is debug-signed for installation/testing. The AAB has no JAR signature files and is unsigned; it needs the production upload key/Play signing setup before submission.

`apksigner verify --print-certs` passed. Certificate SHA-256 is `f230b9e8508a8c63b796d418d0efa3be3eb7049c2114d4573a9da0c7e2bccf6a`, matching the earlier local 3.2.0 build 20 APK. This supports an in-place update of that exact signed build; it does not establish compatibility with every historical CI signing key. Do not uninstall a mismatched older build before protecting its guest progress.

All **62 runtime files** in the APK's `assets/public/` and the AAB's `base/assets/public/` match current source by SHA-256. The sole excluded source file is `.nojekyll`, a web-hosting marker deliberately omitted by native asset packaging. The initial audit identified that marker; it was not a missing gameplay asset. The comparison found no other missing/changed runtime file and no ELF/native `.so` libraries. Every uncompressed archive entry was checked against the four configured private server/mail/DNS/token values available on this workstation; none was present. This scoped check is not a claim about credentials that have not been created.

The current full suite passed **442/442** (63.51s), followed by syntax/catalog parity and release source checks. A stale release-test fixture initially failed after the preflight gained build-number/purpose checks; its fixture now supplies those actual inputs and additionally proves mismatched build labels and missing categories are rejected. The final full run was executed with source frozen.

No physical device was connected in `adb devices -l`. The local SDK has no installed emulator/AVD. Compilation, byte comparison and certificate checks are **not** Android touch, frame-time, safe-area, audio, lifecycle, billing or consent device tests. The older phone feedback and historical native CI captures do not verify this new candidate.

## iPhone source and build path

The actual project and SPM references are synced with the same public assets and forward-slash package paths. The app privacy plist parses and now declares purchase history plus Analytics purposes for linked user/gameplay/interaction data used by the implemented optional measurement/reporting paths. Email remains App Functionality only; tracking flags remain false. Runtime consent/default-off collection is separate from this declaration. The final Xcode archive's combined app/SDK privacy report and store forms still require review. See Apple's [purpose values](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatypepurposes) and [manifest guidance](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests).

On a borrowed Mac, with Xcode selected and Node 22+ installed:

```bash
bash scripts/build-ios.sh
```

The script installs locked dependencies, syncs the actual iOS project, checks source/public settings, compiles an unsigned device archive and simulator app, validates the app privacy resource, and packages both with source/toolchain receipts and checksums in `build/ios-delivery/`. It does not sign or publish to Apple. Shell syntax was checked with Git Bash here; **Xcode and these builds were not executed on this Windows host**.

`azure-pipelines-ios.yml` provides the same manual build on Microsoft's hosted `macOS-latest` agent without GitHub Actions. Both push and PR triggers are disabled. No pipeline, account, paid agent or cloud job was created/queued by adding this source. A DevOps project, authorized repository connection and available hosted macOS parallelism are external prerequisites. A local YAML parser is not installed; hosted schema/execution validation remains pending. Microsoft's [Xcode pipeline guidance](https://learn.microsoft.com/en-us/azure/devops/pipelines/ecosystems/xcode) documents the hosted Mac path. Existing Azure application access does not establish free hosted build minutes.

An unsigned archive is not an installable iPhone IPA. Apple team signing, an applicable provisioning route, a real iPhone/TestFlight test, current store SDK requirements and publisher/store review remain open. No new iPhone binary or physical-device success is claimed.

## Remaining release work

Finish the complete product/requirement audit and report, choose the intended notification route and independent missed-run observer, configure the selected provider accounts and run their real sandboxes, then test/sign the actual native candidates and complete store disclosures. The source preflight now explicitly reports **public cloud configuration**, version/build parity and manual gates; it no longer labels those narrow checks as complete production configuration. The ordered account setup guide follows implementation, as requested by the owner.
