# Full-screen mobile presentation — 3.1.0 (build 17)

Based on Chandrahas's `dev` commit `d3db7f2`. This update changes presentation and native window behavior; the existing Azure/Supabase configuration and gameplay progress formats are retained.

## What changed

- The application occupies the full dynamic viewport. The previous centered, height-limited webpage container and external padding are gone on phones.
- Android hides system bars with swipe-to-reveal navigation and restores immersive presentation when the window regains focus. Capacitor's built-in SystemBars configuration also hides the iPhone status bar and requests automatic hiding of the home indicator.
- Safe areas have one owner: CSS uses Capacitor's Android inset variables, with iOS/browser `env()` fallback. Controls stay outside the notch and gesture area.
- A uniform camera fits the entire physics world. Square tiles stay square, balls stay circular, and touch coordinates are transformed back into the original world. Compact screens may have narrow internal side gutters to preserve geometry; the app itself still fills the display.
- Canvas and its cached background render at device pixel ratio (capped at 3 for memory). Resizing does not reset gameplay or change saved ball positions.
- Continuous graphite rails frame the full arena down past the paddle, following the owner's additional X video reference (`alpraezolam/status/2112904084034658366`). These are visual rails, not new collision obstacles.
- New charcoal/peach interface, bundled typography, consistent icons, large primary action, distinct completion treatment, rounded panels, 44–48 px touch controls, heart lives, large ball/brick counters and an accessible clearance meter.
- Account/history, settings and stage selection use the same visual treatment. Share remains available in Settings.
- Account dialogs follow the visual viewport when the keyboard opens; their close control remains accessible. Canvas drawing and viewport sizing retain fallbacks for older supported iPhones.

## Build and install

```powershell
git fetch origin
git switch codex/immersive-mobile
npm ci
npm run mobile:sync
npm test
npm run check
```

Android: build `android/` with Java 21 and the Android SDK, or use the Native mobile builds workflow on this branch. A debug APK is for testing; release AAB signing remains with the owner. iPhone: compile/sign with Xcode using the team's existing app identity. The unsigned archive cannot be installed directly on a physical iPhone.

Install as an update when signatures match. GitHub's temporary debug signing key can differ between builds; a signature mismatch is not a game bug. **Do not uninstall an existing installation with important guest-only progress** just to replace the APK. First synchronize/export progress, or build with the same signing key. For ongoing beta testing use the team's stable signing key and Play internal testing/TestFlight.

## Acceptance

The Node suite includes camera geometry and touch mapping at compact phone, tall phone, tablet and landscape sizes. Native smoke tests additionally assert full viewport coverage, no document scroll, on-screen footer, screen-resolution canvas and minimum touch target sizes; existing offline gameplay, shooter and cold-save restoration checks remain.

Before a store upload, Chandrahas should also check the signed build on physical phones: a compact Android, a tall Android with camera cutout, gesture and three-button navigation, and an iPhone with a notch/Dynamic Island. Check launch, manual dragging to both edges, pause/resume, system-bar reveal, app switching, stage-picker scrolling/close, email keyboard and code entry, safe areas and saved progress after relaunch. No verification of these physical devices is implied by simulator results.

## Handoff to Chandrahas

1. Review [the mobile presentation PR](https://github.com/SpeedInno-Org/Brick-Breaker/pull/1) against `dev`. The primary private repository and the approved public build mirror contain the same feature branch. Neither `dev` nor `main` was moved by this update.
2. Install the test APK on a separate test device, or update with the existing signing key. Follow the progress-preservation guidance above. Compare the result with the native screenshots, including a phone with the same screen proportions as the owner's device.
3. Complete the physical-device acceptance list above using the owner's signed builds. Pay particular attention to cutouts, keyboard dismissal, app switching and both Android navigation modes. Android may show a one-time system tutorial when entering full screen; dismiss it normally. CI pre-acknowledges only this tutorial on its disposable emulator so it does not obscure screenshots.
4. Confirm the existing owner-managed cloud login and save service in the intended release environment. This change preserves the populated configuration from `dev`; it does not replace the backend, reset progress or provision new accounts.
5. Merge into `dev` after review and acceptance, then use the established release process. Sign the Android AAB with the team's release/upload key and the iOS archive with the team's Apple identity. Distribute through Play internal testing and TestFlight before the production rollout.
6. Continue with [the complete launch guide](../CHANDRAHAS-LAUNCH-GUIDE.md) for store accounts, metadata, support email, privacy disclosures and production operations. A native preview passing automated tests is not a store approval or evidence of physical-device testing.

## Recorded verification

Application source: `e32cb8e28e13c6f9b980eb946cc6ab591a983ad6`, version **3.1.0, build 17**. Later documentation commits do not change the packaged application. Checks recorded on 22 October 2026:

- **66 Node tests passed**, including camera/touch geometry and keyboard viewport transitions. Syntax and shared server/client generator parity passed.
- [Source/backend CI](https://github.com/speedinno/brick-breaker/actions/runs/39756048519) passed.
- [Android and iPhone builds](https://github.com/speedinno/brick-breaker/actions/runs/39756071750) passed: Android test APK, unsigned release AAB, unsigned iOS device archive and simulator app.
- All four packages contain **40 matching game assets** from the stated Git commit. Only license-notice CRLF/LF line endings are normalized for comparison. Native immersive configuration matches; iOS metadata confirms build 17. See [package audit](mobile-3.1/package-audit.json).
- Android API 35 emulator checks passed: full viewport, no document scrolling, screen-resolution canvas, at least 44 px touch targets, offline gameplay, shooter, stage locks and exact saved-field restoration after a cold restart. See [layout measurements](mobile-3.1/android-layout.json) and [restart assertions](mobile-3.1/android-relaunch-checks.json).
- [Final iPhone acceptance](https://github.com/speedinno/brick-breaker/actions/runs/39756698191) passed on an iPhone 17 Pro simulator using the exact packaged app ([test log](mobile-3.1/ios-gameplay.log)): immersive presentation, reachable touch controls, actual software keyboard, account close with one tap, stage-lock prompt, scrolled picker close, brick destruction, pause/resume and exact damaged-field restoration after a cold restart.

[Android native screenshot](mobile-3.1/android.png) · [iPhone native screenshot](mobile-3.1/iphone.png) · [iPhone account with keyboard](mobile-3.1/iphone-keyboard.png). Screenshots and native checks use emulators/simulators, not physical phones.

Native testing found two iPhone keyboard issues during this iteration: the viewport could pan the close control above the display, and input blur could move an action between pointer-down and click. The panel now tracks the visible viewport throughout keyboard dismissal, without resetting when input focus changes. The native test requires an actual software keyboard, a reachable close control and successful dismissal with one tap before continuing to stage locks and cold-save restoration. Builds 14–16 are superseded and are not the handoff package.

## Downloads

Use [the 3.1 preview release](https://github.com/speedinno/brick-breaker/releases/tag/v3.1.0-rc.1) for build 17, the Android test APK, unsigned Android/iOS release packages, this handoff and checksums. This is a prerelease for acceptance, not a store publication.
