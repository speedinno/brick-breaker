# Brick Breaker: Android build 30 and launch handoff

**Owner:** Chandrahas · **Source:** private `dev` branch · **Android candidate:** 3.3.5 / build 30. This document is the current handoff. Older build notes remain as release history. Do not submit this debug APK to a store.

## What build 30 changes

- The earned paddle shooter alternates one shot at a time between its left and right edge. Its firing rate is unchanged. Positioning the paddle at a screen edge now reaches the outer brick columns. Two visible purple muzzle points show where shots originate.
- A fire pickup can appear **once per stage** at most. Catching it activates fire only once; the limit survives a saved game. No ability starts free. The guaranteed early shooter pickup is removed from Stages 1–4, where it made an untended opening shot too productive; later stages retain it. Early shooter duration is four seconds, later duration eight seconds.
- Stage 9 is now the shorter **Fork** motif. The difficult **Nested squares** board moves to Stage 12. Existing Stage 9/12 in-progress v9 device saves can finish on their original board; new attempts use catalog v10. Completed stages remain completed. Stage speed, paddle progression, other patterns and the later Breather rounds are unchanged.

## Before the Android phone pilot

1. Install the build 30 APK from the release attached to this source commit. Keep the existing app installed if Android permits an update. A debug-signing key change may require uninstalling; back up unlinked guest progress first.
2. On a fresh guest profile, play Stages 1–4 manually with AUTO off. Confirm one ball, deliberate paddle placement and arrow aim, no free shooter, and no unattended clear. Try Stage 9: it must say **Fork**. Stage 12 must say **Nested squares**.
3. Catch the purple shooter on a later stage, move the paddle far left and right, and watch shots originate from alternating edges. Catch a fire pickup and verify no second fire pickup appears in that same stage, including after leaving and resuming.
4. Have the tester from the screenshot replay the Stage 9/12 situation. Record attempts, clear time, and whether the outermost remaining bricks are now reachable. A simulator clear is not evidence of human enjoyment.
5. Test a saved in-progress old Stage 9 attempt before updating if one is available. It should resume the old layout; a new Stage 9 attempt should use Fork.

## Cloud rollout (company account)

The installed live Supabase/API can still publish earlier starter boards. Build 30 safely accepts published v3–v10, but signed-in players see the new order **only after** the matching v10 cloud rollout. Back up the company Supabase database, apply pending tracked migrations in order through `202610310022_starter_catalog_v10.sql`, and deploy the `game-api` from the **same commit**. Never edit or replay an applied migration. With disposable accounts, check a new Stage 9/12 v10 run, completion ticks, an unfinished v9 run, account switch, offline cache, and Stage 13. Keep service-role keys and signing credentials out of Git.

## Rescue and competition design: engineering still required

The requested paid blast, ad-for-one-ball rescue, public rankings and competitions are **not in build 30**. Do not advertise or configure them as live features yet. Shipping a local entitlement button would let edited app state grant purchased items or ad rewards, and client-reported completion times are not trustworthy enough for a public prize leaderboard. The current purchase and rewarded-ad systems grant **autoplay time only**. Chandrahas should assign implementation and security review for the following before claiming these features:

1. **Paid blast:** create a separate consumable product, immutable product IDs, account-bound server balance and idempotent receipt verification. Debit one unit transactionally before a blast is applied. Persist an interrupted redemption, handle store pending states and refunds, and mark that run assisted for rankings. Put the price in the store UI before opening checkout. Keep manual retries free.
2. **Ad revive:** show a clearly labeled optional **Watch ad for one extra ball** choice after all lives are lost, alongside an equally visible **Retry without ad** action. Never open an ad automatically. Grant the ball only after the server verifies the rewarded event; persist pending rewards across restart and cap revives to one per attempt. The current time-bank ad reward must not silently double as a life reward. Disable the choice when ads, consent, or connectivity are unavailable.
3. **Rankings and competitions:** require opt-in, use a safe generated display name, allow opt-out/delete, and separate manual, autoplay, paid-blast and ad-assisted runs. Exclude guest imports. Build a server-validated, rate-limited challenge record with replay or equivalent fraud review before offering prizes. Start with a small closed pilot and no prizes, then check cheating, moderation, privacy and retention before worldwide launch.

Store policy references: [Google Play payments](https://support.google.com/googleplay/android-developer/answer/18265346), [Apple in-app purchases](https://developer.apple.com/app-store/review/guidelines/), and [AdMob rewarded-ad choice and disclosure](https://support.google.com/admob/answer/7313578). Policies can change; recheck them in the store accounts at submission time.

## Release operations

- Obtain or create a monitored company-domain support email; use it in the game, privacy page, terms and both store listings. Set escalation and deletion-request ownership.
- Complete the owner-managed Play Console, AdMob, RevenueCat, Supabase and API configuration. Check age, audience and regional ad consent, privacy/data safety declarations, account deletion, backup/restore and financial reporting with real sandbox accounts.
- Get the owner's Android gameplay approval **before iOS implementation and packaging**, per the owner instruction. Then complete Apple Developer/App Store Connect setup, iPhone signing and TestFlight testing.
- Build a **company-signed AAB** for Play testing. The attached debug APK is only a test artifact. Test actual physical Android devices and a staged Play release before production. Investigate crashes, payment/ad callbacks, account recovery and support cases. Do not call the game worldwide launch ready until the rescue/competition decision above is resolved and store approval is obtained.

The detailed existing account and provider setup steps are in [ACCOUNT-SETUP-2026-10.md](ACCOUNT-SETUP-2026-10.md). Use this file for the current build and remaining feature boundary; the older notes in that guide are historical.
