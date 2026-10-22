# Mobile playtest update — 3.2.0, build 18

This update responds to the Pixel 9a playtest and screenshots from 22 October
2026. The phone's reported Android version was uncertain; no physical Pixel or
Android 17 certification is claimed.

## Changes

- A branded Android launch theme and a short bundled loading screen lead to a
  Home menu. Play/Continue, Stages, How to play, Account and Settings are explicit.
  Reopening the app offers the preserved field from Home instead of dropping
  directly into it. Gameplay and shortcuts cannot advance behind Home.
- Forced immersive system-bar hiding is removed. Capacitor supplies safe-area
  insets, and the board has an additional inner margin and rounded frame. The
  existing 416 × 660 physics world and touch-coordinate transform are preserved.
- Shorter labels, heavier bundled game typography and clear primary actions
  replace the editorial headings. Panel headers and close controls are separate
  from the scrolling content, including Settings, Help, Account and Stages.
- Saving is automatic. The former clickable “Device save” wording is replaced
  with a status; Account is a separate button. Playing fields checkpoint every
  two seconds and when pausing, opening panels, leaving the app or going Home.
  Storage failures are shown. Completed-stage/cloud saving remains automatic.
- First Play opens dedicated instructions. Help is also available from Home,
  gameplay and Settings, covering touch controls, lives, progression, offline
  saving, AUTO and every labeled pickup.
- `+3` adds exactly three and `×3` triples the live ball count, subject to the
  existing 768-ball performance ceiling. The wide paddle does not add balls.
  Pickup feedback now includes the before/after count. Each caught item applies
  once; tests cover multiple pickups caught in the same frame.
- Reward pacing is less aggressive: the first brick gives one additive pickup,
  early guaranteed triple chains are removed, only one multiplier can be airborne,
  and multiplier spawns are at least twelve game seconds apart. The cooldown
  survives restart. AUTO no longer silently switches playback to 2×.

Existing progress, account namespaces, published stage definitions and layouts
are preserved. A previously saved large swarm is retained when continuing it;
Restart this stage starts a fresh attempt without removing completed stages.
The deployed API and database migrations require no update for these changes.

## Verification

- 71 Node tests passed, including exact pickup arithmetic, single consumption,
  cooldown persistence, old-save compatibility and existing account isolation.
- All twelve starter motifs and all twenty-two generated architecture families
  cleared with the real simulation. Representative difficulty bands through
  stage 750 cleared for both existing test seeds. The old tests' requirement to
  reach 100 balls was replaced with bounded growth; clearing requirements remain.
- A before/after comparison using seed 8937 in AUTO mode reduced stage 1's
  collected multipliers from 22 to 3 and peak balls from 768 to 153. Simulation
  time changed from 41 to 145 seconds. This is a reproducible balance example,
  not a guarantee of human completion time.
- JavaScript syntax, shared generator parity and production configuration
  preflight passed. Android debug compilation succeeded with Java 21 / SDK 36.
- The opt-in localhost acceptance page passed six check groups: Home/splash,
  first-play Help and independent panel scrolling, automatic checkpoints without
  tapping Account, exact field restoration behind Home after reload, stage/lock
  navigation, and five simulated screen/safe-area sizes. It preserves the prior
  guest state around the test and sends no email or cloud writes.

To repeat the browser acceptance locally:

```powershell
$env:QA_FIXTURES='1'
npm.cmd run dev
# Open http://127.0.0.1:4173/__feedback and wait for PASS.
```

Android/iOS native smoke sources now enter through Home and acknowledge Help.
They have not been rerun on native emulators/simulators for this update. Android
APK compilation and browser safe-area checks do not replace a Pixel 9a retest.
On the phone, check launch, status/navigation bars, all screen corners, account
keyboard, long-panel close controls, automatic saving after force close and a
fresh stage's pickup pacing. Production signing and store acceptance remain.

## Distribution

Use the 3.2.0 build 18 test APK and its published SHA-256 checksum. It uses this
workstation's existing Android debug certificate, matching the locally built
3.1.0 dev APK supplied in this chat. Earlier CI APKs can use a different key.
If installation reports a signature mismatch, preserve guest progress and use
the matching key or a separate test device; do not uninstall valuable local data.
An iPhone release still requires a Mac, signing and TestFlight/device acceptance.
