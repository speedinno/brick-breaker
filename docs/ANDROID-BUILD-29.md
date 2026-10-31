# Android build 29 — tester corrections

The tester reported three problems in build 28: a signed-in stage could stop with “Unsupported catalog version”; the sign-in action looked like plain text while unavailable orange autoplay buttons looked usable; and adjusting a separate angle slider felt less natural than tilting the gold arrow.

Build 29 accepts **published** starter catalogs v3–v9 from the signed-in service, validates each full layout, and caches each board under its actual version. It never mistakes an older board for v9. A player can use the existing server board while Chandrahas rolls out v9; once the API publishes v9, the app switches to that board. A signed-in player offline can reuse a previously downloaded published board. Guest/device play keeps the current v9 layout. The v9 database/API rollout remains necessary for signed-in users to see the same current shapes.

Before a manual launch, touch and drag the **gold arrow** on the field to set the shot direction. The paddle remains where the player placed it. A collapsed “Fine tune angle” control preserves an accessible alternative. The sign-in button is now the prominent orange action above the time choices; unavailable choices are neutral grey. The shape generator, first-stage entrances, paddle sizes, earned powers and save formats are unchanged.

Difficulty already increases from the opening stages: speed rises and paddle width decreases over the first twelve; later stages add more complex structures gradually, with an easier Breather every eighth stage beginning at Stage 20. These parameters are unchanged in build 29.

## Android acceptance

Install the [build 29 test APK](https://github.com/speedinno/brick-breaker/releases/download/v3.3.4-rc.1/Brick-Breaker-3.3.4-build29-Android-test.apk) on a physical Android phone. Verify direct arrow dragging before launch, unchanged manual stage play, the button states in the AUTO panel, email sign-in, and opening a stage after sign-in. A debug-signed APK is for testing only. Back up guest progress before uninstalling an older differently signed test APK. The release page records the exact-source build, emulator check and SHA-256 checksum.

Chandrahas should back up the company Supabase project, apply pending tracked migrations in order through `202610300021_starter_catalog_v9.sql`, then deploy the matching API from the private [`dev` branch](https://github.com/SpeedInno-Org/Brick-Breaker/tree/dev). Confirm fresh v9 and in-flight v8 runs with disposable accounts. See the [ordered account handoff](ACCOUNT-SETUP-2026-10.md). Do not begin iPhone packaging until the owner approves the Android candidate.
