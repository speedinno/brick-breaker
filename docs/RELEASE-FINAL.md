# Version 3.0.0 product and launch handoff

Final application source: `6ed13166daf239f148357fd4bee9a878e08df44c`. Android versionCode 8; iOS build 8; marketing version 3.0.0. The release tag identifies the exact final source and guide, including documentation/evidence committed after the binary build. Those later changes do not alter app assets or native code.

## Verified behavior

Twelve starters have persistent completion ticks; all twelve unlock 13, then first clears unlock one next stage. Future designs stay hidden behind locks with exact requirements. Twenty-two shuffled design families include simple solid-colour Perimeter/Gateway and ornate rangoli motifs, occasional extreme-side narrow entrances, eight-stage chapters and a bounded gradual difficulty curve. Existing downloaded layouts and progress remain authoritative.

A separate caught pink/purple pickup grants eight game-seconds of piercing paddle shots, alongside ordinary multiplying white balls. Shots destroy coloured targets and leave permanent grey walls intact. Pause and validated device snapshots preserve effects; stage/life transitions clear them appropriately.

Optional email-account/cloud catalog/history/export/deletion source is included, with migrations and deployment procedure. The shipped public config intentionally leaves cloud disabled until the owner supplies a real project and monitored support address. Guest play works now.

## Build, tests and native evidence

- [Android/iOS build 39566831205](https://github.com/speedinno/brick-breaker/actions/runs/39566831205): both passed, source above.
- [Game/backend checks 39566831185](https://github.com/speedinno/brick-breaker/actions/runs/39566831185): 53 Node tests, six Deno HTTP contract tests, Deno type check, syntax/generator parity and dependency audit passed. SQL tests apply the real migrations in embedded Postgres and exercise RLS/concurrency/quotas/deletion. HTTP tests invoke the real entrypoint/SDK over mocked transport; hosted SMTP/Auth is separate.
- [Compiled native interaction checks 39567282464](https://github.com/speedinno/brick-breaker/actions/runs/39567282464): Android and iPhone passed on the exact downloaded compiled apps. Android tests offline bundled rendering, locks, public legal URLs, earned shooting, brick destruction, pause/resume, native disk commit and exact snapshot recovery immediately after process force-stop. iPhone XCTest tests locks, the scrolled picker close tap, real brick destruction, pause, process termination/relaunch and damaged-field restoration/resume. Its app executable is replaced with and hashed against the downloaded build before testing.
- [Pages deployment 39566859697](https://github.com/speedinno/brick-breaker/actions/runs/39566859697): passed. All 39 runtime files fetched from the public URL matched source, including binary icons and policy pages.

Package evidence: [all-file audit](native/package-audit-final.json), [Android gameplay](native/android-final.png), [Android restored](native/android-restored-final.png), [Android assertions](native/android-checks-final.json), [Android cold-restart assertions](native/android-relaunch-final.json), [iPhone gameplay](native/iphone-final.png), [iPhone restored](native/iphone-restored-final.png), [22 design previews](native/final-22-patterns.png), [actual browser shooting/resume](native/shooting-resume.png).

All 39 runtime assets match source in APK, AAB, simulator app and device archive. iOS app and embedded Capacitor/Cordova privacy manifests are included; minimum iOS 15.4. Android minimum API 24/target 36; APK/AAB contain no ELF .so libraries. Recheck final store dependencies/devices after owner configuration/signing.

## Review fixes and limits

[Final audit](FINAL-PRODUCT-AUDIT.md) records multiple review/fix loops: shooting/design gaps, blocked/corrupt storage, stale account replies, streamed body bounds, diagnostic leaks/timeouts/deletion freshness, focus/title/toast layout, native legal URLs, iPhone safe-area/close positioning, and Android WebView disk-flush loss. The last two were exposed by actual failed native checks, repaired and retested. Historical RC1/RC2 files are retained; their weaker startup-only results are not the final evidence.

Representative generator/physics tests do not prove every stochastic level wins or provide mathematically infinite layouts. Imports are private client-reported history, with no competitive prizes/economy. Device-local ball positions are not synchronized between phones. Emulator/simulator and local SQL/HTTP tests do not establish physical-device performance, live SMTP delivery, configured hosted policies or store approval.

## Downloads and owner work

[Final release: source, packages, one guide and checksums](https://github.com/speedinno/brick-breaker/releases/tag/v3.0.0).

APK: debug-signed Android test app; CI keys can differ. AAB: unsigned release bundle. Device xcarchive: unsigned, requires Apple team signing. Simulator ZIP: Mac simulator only, not an installable iPhone IPA. None is a production-signed store publication.

Give Chandrahas [CHANDRAHAS-LAUNCH-GUIDE.md](../CHANDRAHAS-LAUNCH-GUIDE.md). It contains laptop quickstart, both Git repositories, new Supabase/SMTP setup, a new monitored support mailbox if needed, public configuration/domain, hosted acceptance/backups/alerts, signing, beta, reviewer access, listing/privacy/deletion declarations and staged submission. No Azure Blob account is required for these small database records.

The delivered Android image is the adb device-screen capture after cold restoration and resume. Its earlier CDP page capture showed a blank canvas area despite canvas-pixel/gameplay assertions; that capture is not used as visual proof. The later device-screen capture contains the rendered field. Native state/paint and restart assertions passed; the device-screen capture shows the actual field and shooting.
