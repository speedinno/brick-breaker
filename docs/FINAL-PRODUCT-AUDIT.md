# Final product audit — active work

Objective: finish the game and release artifacts, leaving owner-managed database/email configuration, domain setup and Apple/Google publication. Keep existing player progress and published layouts stable. Evidence must distinguish local/simulator validation from owner account and real-device launch validation.

## Requirements and completion evidence

| Requirement | Required evidence | Status |
| --- | --- | --- |
| Dense channel game, simple and ornate future patterns, gradual challenge | Reference 27 review, generated previews, uniqueness/reachability, real-physics clears | In progress: add simple architectures |
| Pink/purple paddle shooting separate from fireballs | Pickup, bounded timed projectiles, piercing columns, permanent walls, expiry, pause/resume tests and browser gameplay | Missing at audit start |
| Twelve starters, ticks, sequential future unlocks, hidden locked designs | Progress tests and rendered lock/completion interactions | Revalidate final build |
| Local field/history and offline/native restart | Snapshot validation and cold-restart field assertions on compiled package | Strengthen Android readiness test |
| Optional email accounts, isolated cloud saves/export/deletion | Actual SQL/RLS tests, client identity/failure tests; hosted configuration procedure | Audit client races and failures |
| Shared immutable creative catalog | Canonical deduplication, concurrent SQL publish, publication-budget checks | Revalidate expanded recipes |
| Mobile usability, lifecycle and accessibility | Compact phone, keyboard/dialog/manual/AUTO/pause checks, native launch evidence | Revalidate final build |
| Secure backend, privacy, bounded resources, dependency licenses | Adversarial request/SQL/save tests, type/parity/dependency checks, package audit | Review again after changes |
| Android and iPhone source and distributable test/store packages | Matching-source native builds, runtime evidence, checksums | Build final revision |
| Repositories, web deployment and one owner guide | Equal primary/mirror commits/tags, deployed asset parity, release assets, guide | Publish final revision |

## Review loops

1. Gameplay/reference review: RC2 lacks shooting and restrained perimeter stages. Fix with separate timed shooting pickup, preserve wall permanence, add simple generated families; test shooting/life loss/pause/snapshot and future-stage playability.
2. State/security review: inspect async identity transitions, storage/corruption, requests and resource bounds. Record specific findings and fixes here.
3. Native/product review: strengthen cold restart, inspect final phone layouts and packages, resolve regressions, rerun relevant checks.
4. Completion audit: inspect each requirement against final authoritative source, tests, rendered game, builds and publication. Do not mark complete while any software/build/documentation requirement is missing.

## Explicit owner setup boundary

No production Supabase project or SMTP credentials are available in this task. Do not create those accounts. Chandrahas owns database/SMTP/support identity, production domain, developer accounts, signing and store submission. Final guide must give executable setup steps and hosted acceptance checks. No claim that hosted login or store approval is already verified.

## Findings fixed in review loop 2

- Added a distinct shooting pickup, timed bounded shots, column sweep collision, wall preservation, loss/win cleanup and backward-compatible field snapshots. Five shooting regressions pass.
- Added two restrained, solid-colour future architectures; canonical uniqueness and 256-stage near-duplicate publication checks passed, and all 22 early architectures cleared under real physics.
- IndexedDB open/read/write could remain pending indefinitely or throw on a closed transaction. Bounded fallbacks now keep guest play available and reject corrupted definitions; memory cache is capped at 24. Two failure regressions pass.
- Responses from an old identity could arrive after switching accounts. The API client now binds the expected identity, rejects stale responses, clears stale state and protects action/account fields. Two identity/error regressions pass.
- The Edge Function buffered unbounded request input before its size check. It now caps streamed bytes before UTF-8/JSON decoding. Oversized, chunked, malformed and scalar requests are tested.
- Public domain links were hardcoded; PUBLIC_GAME_URL now configures sharing and native web export. Configuration checks reject secret keys and unsafe origins. Owner setup test passes.
- Canvas keyboard focus was suppressed; long stage titles could overlap controls; boost toast could cover paused/completed prompts. Focus/title styling and prompt cleanup are corrected.
- Android native verification now waits for a ready field and compares the exact paused gameplay snapshot after a cold process restart. New iPhone XCTest verification exercises locks, play, pause and damaged-field restoration on the packaged app. CI execution remains pending.

Current local full suite: **51 passing**. Syntax/server-client parity and Deno backend type check pass; npm audit reports zero advisories at this run. All 22 fresh design previews were visually inspected, including solid-colour Gateway and Perimeter. Actual browser AUTO play cleared starters 1 and 2; stage 3 earned the shooter, was paused with four balls/2,100 bricks and active shots, then reloaded with that same damaged field and shooter duration restored. The boost/pause overlap was corrected after observation. Final compiled native verification and publication are still required.

## HTTP review loop 3

The actual Edge entrypoint is now exercised with the real Supabase SDK over a mocked HTTP transport. Six contract tests cover CORS/method/auth ordering, identity mismatch, locked-stage rejection before generation, private state responses, malformed/oversized bodies, recent-sign-in deletion and exact error allowlisting. SQL/RLS still use actual embedded Postgres in separate tests. The former keyword error filter could return provider diagnostics containing a word such as “stage”; only exact controlled messages now leave the server. Expired/cleaned-up run IDs map to the existing private-progress recovery path. Backend HTTP fetches have a ten-second bound. Hosted SMTP/database configuration is still an owner acceptance step.

## Platform review loop 4

Android build 5 passed real native shooting and exact cold-snapshot restoration, replacing the former loading-screen-only restart check. iPhone build 5 is undergoing the new XCTest verification. All 38 runtime assets matched source in APK/AAB/iOS archive/simulator; the Pages-only .nojekyll marker is intentionally excluded by Capacitor.

The native legal links were still relative, which resolves to localhost/capacitor URLs when opened externally. They now use the configured public HTTPS game URL in native apps, including sign-in policy links; web/PWA policy pages stay relative and available offline. Native Android verification asserts those resolved URLs. Native build number advances to 6 for this change. Verify build 6 before handing off final artifacts. iPhone UI tests run serially and export their screenshot attachments for inspection.

### iPhone interaction failure and repair

Build 5’s XCTest compiled and launched the exact package, opened the stage map, scrolled to locked stage 13 and closed the requirement dialog. It then failed: tapping the stage map’s close button left the gallery open. The captured accessibility hierarchy confirms the gallery remained the modal and its close control lay partly above the native content viewport. This was not a green launch-only result.

The app had both native contentInset=always and CSS safe-area padding, plus a negative sticky offset/margin on close buttons. iOS now uses contentInset=never so CSS owns safe areas. Dialog height subtracts safe insets; close controls stay inside with positive offsets and 44px targets; focus restoration prevents a scroll jump. Build number advances to 7. XCTest explicitly requires the scrolled close control to be hittable and the dialog to disappear after one tap. Final native verification remains pending until that repair passes.
