# Rangoli and side-entry release candidate

RC2 contains twenty architecture families, including Rangoli, Kolam, Rosette and Starweave. Designed contours retain symmetry, wall cells form continuous solid grey outlines, radial colours highlight the motif, and some mouths lie near the far left/right edges. Directional launch hints help players locate them. The existing bounded difficulty curve, chapter goals, ticks and sequential unlocks remain.

Validation: 39 automated checks, including 1,000 canonical layouts, shared-catalog deduplication, progression/RLS/session/offline checks, twelve starter clears, twenty early journey clears, later difficulty-band clears, and 200 boards with two-cell mouths and sixteen representative extreme-entry serves. Syntax/client-server parity, backend Deno type checking and dependency audit passed. Phone layout at 320×568 and twenty fresh pattern previews were visually inspected. The stage 14 right-entry prompt was verified through a labeled disposable progression fixture. Existing cached/shared definitions remain authoritative.

Compiled application commit: `cd54b50286a1087be69275e31f5d88f6f2704e46`.

Following the labeled simulated starter/history fixture, actual browser AUTO gameplay cleared the newly generated stage 14 Starweave through its right-edge entrance. The UI displayed its completion tick and unlocked stage 15. [Completion evidence](native/completed-rc2.png), [entrance design](native/right-entry-rc2.png), [twenty style previews](native/rangoli-patterns-rc2.png). This demonstrates one real new-stage clear; the fixture is not evidence of earlier human-earned history.

- [Android/iOS builds 39544090523](https://github.com/speedinno/brick-breaker/actions/runs/39544090523): both passed.
- [Source checks 39544090497](https://github.com/speedinno/brick-breaker/actions/runs/39544090497): passed.
- [Native launch checks 39544368440](https://github.com/speedinno/brick-breaker/actions/runs/39544368440): both passed on those exact build artifacts. Android checks bundled native execution, offline play, twelve starter cards and locked stage 13, AUTO brick destruction, pause/resume and process relaunch. iPhone Simulator launches and relaunches the packaged app. Both platforms’ launch/relaunch screenshots were inspected; these are simulator/emulator checks, not physical-device certification. [Android assertions](native/android-checks-rc2.json), [Android screenshot](native/android-rc2.png), [iPhone screenshot](native/iphone-rc2.png).
- [Pages deployment 39544110426](https://github.com/speedinno/brick-breaker/actions/runs/39544110426): passed. Deployed generated/app/journey/difficulty/service-worker assets matched source.

Package audit: [package-audit-rc2.json](native/package-audit-rc2.json). iOS version 3.0.0/build 4/minimum 15.4; app and embedded Capacitor/Cordova privacy manifests present. Android APK/AAB contain no ELF .so libraries. Compiled APK, iOS simulator and device archive game assets match source, including the generator and dependency notices.

RC2 is a development candidate. Supabase/SMTP/support setup, hosted integration tests, physical-device beta, owner signing and store submission remain Chandrahas’s gates. RC1 remains available separately.

Native evidence limit: the Android relaunch screenshot was taken during “Getting your stage ready”; the script asserts process startup/no native crash, not completed field restoration after relaunch. Initial offline native gameplay and pause/resume assertions passed. Device-local snapshot restoration is covered separately by unit tests. Before store rollout, wait for the field after a cold restart and verify actual bricks, lives and effects restore on physical Android/iPhone devices; do not treat the CI process check as that certification.
