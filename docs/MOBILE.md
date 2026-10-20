# Native mobile builds

Both native projects package the complete `dist/` game for local offline execution. They share the same game engine as the browser version.

## Android

Project: `android/`. Bundle ID: `com.speedinno.brickbreaker`. Minimum API 24; target/compile API 36. Java 21.

```sh
npm ci
npx cap sync android
cd android
./gradlew assembleDebug bundleRelease
```

The installable test APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. It uses the build machine's debug signing key. Do not publish that key or call the APK a production-signed store release. CI debug keys can differ between builds; uninstalling a prior differently signed test build may be necessary.

The release AAB is at `android/app/build/outputs/bundle/release/app-release.aab`. It must be configured with the owner's production signing before Play Store distribution. Keep the keystore and passwords out of Git and release attachments.

## iPhone

Project: `ios/App/App.xcodeproj`. Bundle ID: `com.speedinno.brickbreaker`. Deployment target iOS 15. Xcode 26+ and a Mac are required for local native compilation. Swift Package Manager resolves the pinned Capacitor native runtime.

```sh
npm ci
npx cap sync ios
npx cap open ios
```

Select the **App** target and the owner's signing team in Xcode. Change the bundle ID if it is already registered to a different team. Test on an iPhone, then Archive → Distribute App → TestFlight / App Store as appropriate. Provisioning profiles, certificates, and Apple account access are required for signed physical-device distribution.

CI produces an unsigned `.xcarchive` for later signing plus a Simulator `.app`. The Simulator app runs only in an iOS Simulator; the unsigned archive cannot be installed directly on a physical iPhone. These limitations are explicit in artifact names.

## Continuous builds

`.github/workflows/mobile.yml` runs Android on Ubuntu and iOS on macOS. Download the **Brick-Breaker-Android** and **Brick-Breaker-iOS** artifacts from a successful run. Failed or queued jobs are not completed builds. The workflow does not contain signing credentials or automatically submit either app to a store.

Before store release, verify real-device input, app switching, sound, safe-area layout, Android Back, offline operation, large-swarm performance, and save restoration. No telemetry is collected to replace that testing.
