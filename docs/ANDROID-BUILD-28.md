# Android build 28 — upper channel exits

## What changed

The owner tested build 27 on Android and found that small breakable openings near the bottom of the first stages did not reward a successful entry shot. Build 28 keeps the original T, Switchback, H and later motif paths, solid gray walls, manual launch, one starting ball, existing paddle sizes, and earned powers. Stages 1–3 have a six-tile opening only at the bottom mouth, narrowing to their original four-tile channel. The first eight starter motifs have open upper exits into the colored bricks. No breakable shortcut is placed beside the lower mouth in stages 1–8. Later starter stages keep their narrower entries and gain an upper breakable cap where appropriate. Generated stages 13 onward are unchanged.

The Stage 3 H chamber has two upper exits, one on each upright. The lower entry remains on the left. A player can place the paddle beneath it, aim straight up and reach bricks at the top. The same manual shot reaches upper bricks in stages 1 and 2 within three simulated seconds. These are repeatable engine checks, not evidence of a human win rate.

## Android review gate

Install the build 28 test APK on a physical Android phone. With AUTO off, play stages 1–4 from a fresh guest profile. Check that the lower mouth is easy to identify, the ball visibly reaches upper bricks, stages still need manual paddle control, and the route is satisfying rather than automatic. Record attempts, clear time and any confusing shot. **Do not begin iPhone packaging or store submission until the owner approves Android.** The APK is debug-signed for testing; it is not the Play Store release bundle.

## Shared stage and cloud rollout

Guest/device play uses the bundled board. Signed-in play needs starter catalog **v9**. Chandrahas should back up Supabase, apply all pending tracked migrations in order through `202610300021_starter_catalog_v9.sql`, deploy the API from the same Git revision, and test a new v9 starter run, old v3–v8 in-flight run, completion tick and stage 13 with disposable accounts. Do not edit installed migrations or republish previous catalog rows. Earlier runs retain their original hashes and completed stages remain saved. See [account and store handoff](ACCOUNT-SETUP-2026-10.md).

## Source and evidence

The [private dev branch](https://github.com/SpeedInno-Org/Brick-Breaker/tree/dev) is the primary source. The [approved public mirror](https://github.com/speedinno/brick-breaker/tree/codex/easier-opening-rounds) supplies Android CI and the [build 28 APK](https://github.com/speedinno/brick-breaker/releases/download/v3.3.3-rc.1/Brick-Breaker-3.3.3-build28-Android-test.apk). The release page includes the SHA-256 checksum and exact CI run IDs. The local 453-test suite, JavaScript/catalog parity and dependency audit passed before the CI build. Android package and installed emulator results are recorded on the release page; physical-player acceptance remains open.
