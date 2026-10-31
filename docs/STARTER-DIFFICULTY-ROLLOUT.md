# Manual opening rounds — build 28 rollout

**Current build 30:** Stage 9 now uses Fork and Nested squares moves to Stage 12 under catalog v10. The stage speed/paddle progression remains gradual and later chapter Breathers remain. The earned shooter alternates edge shots; fire appears at most once per stage. See [the current handoff](LAUNCH-HANDOFF-BUILD-30.md). The details below describe historical builds 28–29.

**Build 29 keeps these exact board shapes and difficulty settings.** It changes only signed-in catalog compatibility, direct arrow aiming and button presentation; see [Android build 29 review](ANDROID-BUILD-29.md).

## Current correction after the owner's build 27 Android test

The owner found that a successful shot into the lower channel led to a tiny brick opening near the floor, so there was little immediate payoff. Build 28 retains the original paths and rules. The lower mouths of stages 1–3 are six tiles wide for two rows, then return to the original four-tile channels. Stages 4–8 and 12 remain four tiles at the entrance; stages 9–11 remain two. The first eight shapes have open upper exits into the colored field, including both uprights of the Stage 3 H. No lower breakable shortcut remains in stages 1–8. Manual placement and aiming, normal paddle widths, one starting ball and earned pickups remain unchanged.

The starter catalog advances to **v9** through additive migration `202610300021_starter_catalog_v9.sql`; it preserves v3–v8 boards and in-flight runs. The API and migration must deploy together before signed-in build 28 starter play. Automated checks confirm a centered manual shot reaches upper bricks in stages 1–3 within three simulated seconds, all 12 starter boards can clear with the skilled simulator, and an untended opening shot does not automatically clear Stage 1. The owner's physical Android pilot is still the acceptance test. iPhone work waits for that approval.

## Historical build 27 rollout

## Owner correction after the Android build 26 test

The owner rejected build 26's eight-tile first passages. The opening looked like a large empty hall with a nearly invisible route into the bricks. Build 27 keeps the original T channel and Switchback paths, solid gray walls, manual aim, one starting ball, normal paddle widths and earned boosts. Stages 1–8 and the occasional easier stage 12 now have **four-tile passages**; stages 9–11 keep two-tile passages. Only stages 1–2 gain a **three-tile breakable side cap** near the lower entrance, colored warm gold so the first target is visible. No automatic power or free opening clear was added.

The corrected T board was visually checked at a 360 × 800 phone viewport. A fixed 77-shot position/angle sample found a deliberate brick hit within five seconds for 9 stage-1 shots and 6 stage-2 shots; this is an aimability regression check, not a human success rate. With the existing skilled watch paddle and earned pickups, 20/20 fixed seeds cleared each of stages 1 and 2 within ten simulated minutes; the median winning times were 56 and 79 seconds respectively. These are mechanics proxies. Physical beginner play still decides whether the target is clear and enjoyable.

Build 27 uses starter catalog **version 8**. Apply `202610290020_starter_catalog_v8.sql` after all existing revisions, then deploy the matching API before signed-in build 27 play. The new revision preserves v3–v7 shared boards and in-flight runs; their server completion uses their original hashes. Stage 13 onward remains catalog version 3. Guest/device play needs no cloud rollout. The API now queries the current starter catalog version; that version lookup had lagged behind the client in build 26.

For the next physical pilot, test stages 1–4 with AUTO off. Watch where the player positions the paddle, whether they notice the gold side cap, how many attempts it takes to finish, and whether they start stage 2. Stop store submission if players still struggle to understand the first target. Use build 27 for this pilot; build 26 is a rejected historical candidate.

## Historical build 26 analysis

The owner tested build 25 on a physical Android phone and rejected its free shooting, oversized paddle and automatic clears. Build 26 returns to the original T, Switchback, H, M and subsequent solid-gray motifs, original paddle widths (112 units on stages 1–4, 100 on 5–8, 90 on 9–12), original speed and boost cadence, and a single ordinary ball on **every** launch. No shooter or extra ball activates at launch; pickups have to be caught in play. A stationary opening shot cannot finish stage 1.

The only starter layout changes are wider corridors: stages 1–2 have eight-tile entrances rather than six, stage 8 has six rather than four, and stage 12 has four rather than two. Stages 3–4 keep six, 5–7 keep four, and 9–11 keep two. The stage 8 and 12 openings provide occasional easier shots without changing the standard paddle or granting powers. Stage 13 onward retains its published layout generator and every-eighth-stage Breather from stage 20.

Before each shot, the player can tap or drag to position the paddle and adjust a clearly drawn gold launch arrow from 55° left to 55° right. The initial direction is straight up; the game no longer steers the manual shot toward the entrance. The compact aiming dock sits below the visible paddle and board. Paddle position and selected angle save with the current field. The player can aim again after losing a ball. Optional AUTO uses its separately authorized time bank; it does not grant a free launch ability.

The local suite includes a geometry check that deliberate shots can break a brick within five seconds in all twelve starter motifs, a no-free-power test for stages 1, 2, 8 and 12, an unattended-shot non-clear test, input retention after touch release, starter route checks, and cloud migration tests. These verify mechanics, **not human win rate or fun**. The owner should test the build 26 APK before store release and report any stage where aiming is confusing or progress stalls.

A read-only Stage 1 engine proxy on 29 October used the game's perfect `watch` paddle for 20 fixed seeds, with the shipped build 26 layout and earned pickups. Nineteen cleared within ten simulated minutes; their median clear time was about 255 seconds (range 212–419 seconds). One seed still had 1,053 of 2,093 bricks after ten minutes. This is an upper-skill, automatic-paddle reference and **cannot establish novice success**. It does show why the phone pilot must measure clear time as well as attempts: a reachable first brick is weaker evidence than a satisfying first clear. Do not restore free shooter or oversized paddle in response; use the owner's physical feedback before changing the approved manual mechanics.

A second in-memory comparison changed only the channel radius on Stages 1–2; it did not alter the released layouts. For each width, 189 fixed paddle/angle combinations were tried for five simulated seconds, and 20 seeds ran with the same `watch` paddle for at most ten minutes. Both stages had the same entrance-shot count. Clear-time medians below include only seeds that won.

| Opening tiles | Shots entering channel / 189 | Stage 1 watch clears / 20; median | Stage 2 watch clears / 20; median |
|---:|---:|---:|---:|
| 6 (earlier) | 85 | 20; 214s | 20; 253s |
| **8 (build 26)** | **107** | **19; 255s** | **20; 249s** |
| 10 (trial) | 129 | 19; 381s | 19; 217s |
| 12 (trial) | 145 | 17; 404s | 20; 299s |

The wider opening reliably increased the sampled chance of entering the channel, but Stage 1's automatic clear became slower beyond eight tiles. Stage 2 did not show a monotonic clear-time trend. This proxy supports retaining the owner's requested modest widening for the next **physical** test; it does not prove eight tiles is optimal for people or settle the first-round difficulty.

## Shared catalog deployment

Build 26 uses starter catalog **version 7**. Apply all pending migrations through the tracked migration process, including `202610280016_starter_catalog_v4.sql`, `202610280017_starter_catalog_v5.sql`, `202610280018_starter_catalog_v6.sql` and `202610280019_starter_catalog_v7.sql`, in order. Deploy the matching API bundle **before** signed-in build 26 clients request starter boards. The new migration preserves v3–v6 shared rows and in-flight runs; server completion continues to honor their original hashes. Stage 13 onward remains catalog version 3. Progress records and completion ticks remain in the existing progress edition. A client update during an unfinished older layout may require replaying that stage; completed stages persist.

With two disposable signed-in accounts, fetch a v7 stage, start and complete it, check the completion tick and synced history, then check a stage above 12 still uses v3. Confirm an older v3–v6 in-flight run still completes on the server before its expiry. Record the migration revision, API image, source commit and APK build number together. Guest/device play works without this rollout.

## Physical beginner pilot

Ask at least ten first-time players on a mix of small and large Android phones to play stages 1–4 manually, with AUTO off and no outside coaching. Record attempts, clear time, lives lost, aim/channel confusion, whether they choose to start stage 2, and where they stop. Include the owner's build 25 feedback as a rejection of that version, not as build 26 acceptance. Invite a short screen recording if a player gets stuck. Have a few participants try the wider stage 8 and 12 entrances after more demanding rounds.

Provisional acceptance target: at least eight of ten clear stage 1 within two attempts, at least seven voluntarily start stage 2, and nobody observes an unattended automatic stage clear. Revise and repeat if multiple players cannot understand placement/aim or a starter stage consistently stalls. These are targets for the next pilot, not measured outcomes.
