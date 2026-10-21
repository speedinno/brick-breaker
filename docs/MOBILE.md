# Native mobile builds

Both native projects package the complete `dist/` game for local offline execution. They share the same game engine as the browser version.

## Current v3 evidence

See [RELEASE-FINAL.md](RELEASE-FINAL.md) for final builds, launch checks and package audit. The v2 links below are explicitly historical.

## Android

Project: `android/`. Bundle ID: `com.speedinno.brickbreaker`. Minimum API 24; target/compile API 36. Java 21.

```sh
npm ci
npm run build:web
npx cap sync android
cd android
chmod +x gradlew
./gradlew assembleDebug bundleRelease
```

The installable test APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. It uses the build machine's debug signing key. Do not publish that key or call the APK a production-signed store release. CI debug keys can differ between builds; uninstalling a prior differently signed test build may be necessary.

The release AAB is at `android/app/build/outputs/bundle/release/app-release.aab`. It must be configured with the owner's production signing before Play Store distribution. Keep the keystore and passwords out of Git and release attachments.

## iPhone

Project: `ios/App/App.xcodeproj`. Bundle ID: `com.speedinno.brickbreaker`. Deployment target iOS 15.4. Xcode 26+ and a Mac are required for local native compilation. Swift Package Manager resolves the pinned Capacitor native runtime.

```sh
npm ci
npm run build:web
npx cap sync ios
npx cap open ios
```

Select the **App** target and the owner's signing team in Xcode. Change the bundle ID if it is already registered to a different team. Test on an iPhone, then Archive → Distribute App → TestFlight / App Store as appropriate. Provisioning profiles, certificates, and Apple account access are required for signed physical-device distribution.

CI produces an unsigned `.xcarchive` for later signing plus a Simulator `.app`. The Simulator app runs only in an iOS Simulator; the unsigned archive cannot be installed directly on a physical iPhone. These limitations are explicit in artifact names.

## Continuous builds

`.github/workflows/mobile.yml` runs Android on Ubuntu and iOS on macOS. Download the **Brick-Breaker-Android** and **Brick-Breaker-iOS** artifacts from a successful run. Failed or queued jobs are not completed builds. The workflow does not contain signing credentials or automatically submit either app to a store.

The approved public source/build mirror is https://github.com/speedinno/brick-breaker. The primary organization repository remains private. Historical v2 evidence only: both native jobs passed in [build 39532447345](https://github.com/speedinno/brick-breaker/actions/runs/39532447345), using application source commit `8fe6bab067166c106c8fbe9e5d5b1f06f5843a52`. The iOS store icon is exported as RGB without an alpha channel, and CI checks that encoding before compilation.

`.github/workflows/native-smoke.yml` accepts a successful build run ID and tests those exact artifacts, without rebuilding them. Android disables Wi-Fi and cellular data, launches the bundled WebView, checks native execution and painted bricks, starts AUTO, verifies brick destruction and pause/resume, and relaunches the process. Android also requires an earned shooting effect and compares the exact paused snapshot after a cold process restart. iPhone XCTest drives the exact packaged simulator executable through stage locks, the scrolled picker close control, brick destruction, pause and cold damaged-field restoration. Screenshot attachments are exported. These checks do not replace physical-device playtesting.

Historical v2 evidence only: Android and iPhone launch checks both passed in [run 39532730822](https://github.com/speedinno/brick-breaker/actions/runs/39532730822). Download the versioned packages and full source from [release 2.0.0](https://github.com/speedinno/brick-breaker/releases/tag/v2.0.0).

Before store release, verify real-device input, app switching, sound, safe-area layout, Android Back, offline operation, large-swarm performance, and save restoration. No telemetry is collected to replace that testing.

For the v3 production handoff, use [CHANDRAHAS-LAUNCH-GUIDE.md](../CHANDRAHAS-LAUNCH-GUIDE.md). It includes Supabase, support email, real-device beta, signing, privacy and store steps. CI artifacts remain unsigned/test-only. See the public Actions page for the latest v3 run.

Current handoff: version 3.0.0, Android versionCode 8 and iOS build 8. See [final evidence](RELEASE-FINAL.md) and [packages/source/guide](https://github.com/speedinno/brick-breaker/releases/tag/v3.0.0). RC1, RC2 and v2 are preserved as historical releases.
