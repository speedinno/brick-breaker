# Full-screen mobile presentation — 3.1.0 (build 10)

Based on Chandrahas's `dev` commit `d3db7f2`. This update changes presentation and native window behavior; the existing Azure/Supabase configuration and gameplay progress formats are retained.

## What changed

- The application occupies the full dynamic viewport. The previous centered, height-limited webpage container and external padding are gone on phones.
- Android hides system bars with swipe-to-reveal navigation and restores immersive presentation when the window regains focus. Capacitor's built-in SystemBars configuration also hides the iPhone status bar and requests automatic hiding of the home indicator.
- Safe areas have one owner: CSS uses Capacitor's Android inset variables, with iOS/browser `env()` fallback. Controls stay outside the notch and gesture area.
- A uniform camera fits the entire physics world. Square tiles stay square, balls stay circular, and touch coordinates are transformed back into the original world. Compact screens may have narrow internal side gutters to preserve geometry; the app itself still fills the display.
- Canvas and its cached background render at device pixel ratio (capped at 3 for memory). Resizing does not reset gameplay or change saved ball positions.
- New charcoal/peach interface, bundled typography, consistent icons, large primary action, distinct completion treatment, rounded panels, 44–48 px touch controls, heart lives, large ball/brick counters and an accessible clearance meter.
- Account/history, settings and stage selection use the same visual treatment. Share remains available in Settings.

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

Build/test results for this iteration will be recorded below after CI completes.
