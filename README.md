# Brick Breaker · Channels & Swarms

Dense colored fields, permanent gray channels, an orange paddle and earned +3/×3 and piercing paddle-shooting pickups that grow one white ball into a swarm. Mobile-first web, Android and iPhone source. Version 3 adds a clear stage journey and optional cloud integration.

**Play:** https://speedinno.github.io/brick-breaker/

**Primary private source:** https://github.com/SpeedInno-Org/Brick-Breaker

**Approved public source/build mirror:** https://github.com/speedinno/brick-breaker

**Launch handoff:** [CHANDRAHAS-LAUNCH-GUIDE.md](CHANDRAHAS-LAUNCH-GUIDE.md). Supabase provisioning, monitored support email, production signing, real-device beta and store submission remain owner-managed launch gates. This is the version 3.0.0 source/product handoff. Store publication follows owner setup and signed beta acceptance. Cloud is deliberately disabled until real project configuration is supplied; guest play works now.

**Mobile API on Azure:** [Azure CLI deployment](docs/AZURE-API.md) prepares a dedicated API in SpeedInno Org Subscription, with Supabase Auth/Postgres and Resend SMTP. It uses ACR cloud builds without GitHub Actions or publishing a web game. Credentials and hosted acceptance are required before live use.

## The journey

Clear the twelve starter stages in any order. Each clear earns **✓ Completed**. All twelve unlock stage 13; later stages unlock one at a time. Future cards show locks without previews. Tap a lock to see exactly what to finish, or use Play next. Replaying stages preserves completion and best results. AUTO and manual clears both count.

Beyond the starters, twenty-two architecture recipes construct new chambers, loops and branching paths. These are newly synthesized layouts, not mirrored starter boards. The cloud catalog is designed to publish each versioned stage once and reuse it for everyone, with canonical structural deduplication and concurrent publication protection. An expanding journey describes the system accurately; finite grids cannot guarantee mathematically infinite unique boards.

Drag to steer, launch through the entry and catch boosts. +3 adds three balls; ×3 triples the swarm up to 768; ↔ widens the paddle; — adds a temporary safety floor; ♨ enables temporary fireballs; the pink/purple shooting pickup fires piercing paddle shots for eight seconds. Gray walls remain. Watch/AUTO steers the paddle through the same simulation, with 1×/2×/4× playback. Keyboard: arrows/A/D move, Space launches/advances, P/Escape pauses.

Guest progress and the current field save on the device. Optional email accounts synchronize completed stages and personal history after Supabase is deployed. A current swarm is local to its device. Importing guest progress is explicit. Accounts have separate local namespaces, export and in-app/web deletion flows. There are no ads, purchases, tracking SDKs or competitive rewards.

## Development

Node 22+:

```sh
npm ci
npm run build:web
npm test
npm run check
npm run dev
npm run mobile:sync
```

Preview http://127.0.0.1:4173. Development-only `/__mobile?width=320&height=568` provides a compact viewport. `QA_FIXTURES=1` enables explicitly labeled disposable progression fixtures on the dev server; these routes are not shipped in `dist` or native assets.

`dist/` is the complete static app. `supabase/` contains the migration and authenticated Edge Function. `npm run configure:cloud` generates public configuration from environment variables; see the handoff. `node scripts/release-preflight.mjs --production` checks required public configuration. Do not put administrator keys in a client build.

CI runs game/database tests, generator parity and backend type checking, then creates a debug Android APK, unsigned Android AAB, unsigned iOS archive and simulator app. Signing and physical-device testing are separate. Android uses Java 21, SDK 36/min 24. iOS uses Xcode 26+, minimum 15.4. The simulator app is not an installable iPhone IPA. See [mobile builds](docs/MOBILE.md), [architecture](docs/ARCHITECTURE.md), [QA/red-team evidence](docs/RED_TEAM.md), and [reference review](docs/REFERENCES.md).

Public native artifacts/releases: https://github.com/speedinno/brick-breaker/releases

The original game code is MIT licensed; bundled dependency/font licenses apply to their files. Reference clips, third-party branding and watermarks are not bundled. Newly written behavior inspired by reviewed clips is not the original game's source or a claim of pixel-identical physics.

## Product downloads and evidence

[Version 3.0.0 packages, source and handoff guide](https://github.com/speedinno/brick-breaker/releases/tag/v3.0.0) · [final build/test evidence](docs/RELEASE-FINAL.md). Historical RC1/RC2 releases remain preserved.

Actual compiled Android app under offline emulator gameplay checks:

<img src="docs/native/android-final.png" width="270" alt="Version 3 Android native app running a dense brick field with hundreds of multiplying white balls">

![Twenty-two generated styles including simple Perimeter/Gateway and ornate rangoli designs, development previews](docs/native/final-22-patterns.png)

The journey grows gently in difficulty and marks progress through eight-stage chapters. Later stages weave more paths and chambers together, with carefully bounded ball speed and paddle control. Early breakthrough boosts remain. Styles are shuffled across chapters, and future patterns stay hidden until entered.

New future boards include rangoli, kolam, rosette and starweave motifs with radial colours. Artistic contours keep their symmetry without random chords. Continuous solid grey walls frame narrow channels; occasional mouths are near the far left or right edge, with a directional launch hint. Existing downloaded definitions remain stable.
