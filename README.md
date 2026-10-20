# Brick Breaker · Prism Rush

A mobile-first arcade game inspired by the satisfying dense-brick and channel-pattern clips circulating on X. Original code, UI, and procedural layouts; no copied video, branding, or assets from those posts.

**Play:** https://speedinno.github.io/brick-breaker/

## The game

- Twelve geometric pattern families with seeded variations, color changes, and fresh layouts at each stage. A test checks 10,000 consecutive stages for exact layout duplicates. This is extensive variety, not a mathematical promise of infinite unique patterns.
- Fast, substepped ball physics with spatial-grid collision lookup.
- Explosive chain reactions, combo multipliers, multiball (up to 18), fireballs, a wider paddle, safety shields, and a charged Pulse.
- The first serve of a stage gets a short fireball boost. Every 65 bricks broken grants another multiball or fire boost.
- Arcade: three starting lives, a recovered life after each stage (up to five), and increasingly fast balls, capped for playability.
- Zen: permanent safety floor, separate progress and best score.
- Touch, mouse, and keyboard input; automatic pause on app switch; optional sound, haptics, and reduced effects.
- Installable PWA, offline assets including fonts, stage checkpoints, and local personal bests. No runtime dependencies, ads, accounts, analytics, payments, or network leaderboard.

## Play on your phone

Open the play link. On Android, use the browser's **Install app / Add to Home screen** action. On iPhone, open in Safari and use **Share → Add to Home Screen**. The game offers installation help in Settings. Once its offline assets have been cached on a successful first visit, the installed game can run without a connection.

This release is a web app, not a signed Android APK or an App Store binary. Browser support for install prompts, haptics, and sharing varies. Progress is stored on the device and can be cleared by the browser.

## Controls

Drag anywhere on the board or move the mouse to steer. Hit the paddle edge for angled shots. Catch falling +2 / fire / wide / shield boosts. At 100% energy, tap Pulse.

Keyboard: **← / →**, **A / D** move; **Space** launches or continues; **P / Escape** pauses; **X** triggers Pulse. Settings has a restart action. Opening Settings pauses a live game.

## Run locally

Node.js 20 or newer; no installation step or dependencies needed.

```sh
npm run dev
```

Open http://127.0.0.1:4173. Modules and the service worker require HTTP(S); double-clicking the HTML file is not supported. The development server binds to loopback only. `/__mobile?width=390&height=844` is a development-only responsive iframe preview and is not part of the deployed static game.

```sh
npm test
npm run check
```

`dist/` is the complete static build. Deploy it at a site root or subdirectory; all application asset paths are relative. GitHub Pages uses the `gh-pages` branch. The `publish-pages.mjs` helper updates that branch from `dist/` after checks pass.

## Saves and scoring

Each mode saves the stage seed, stage number, score, and lives at a checkpoint. Reloading restarts that stage's bricks; it does not reconstruct an in-flight ball. Damaged bricks stay broken between lost lives in the same session. Best scores update on loss, stage clear, mode switch, and app switch. Bests are local and are not suitable for competitive verification.

## Validation and limitations

See [the red-team and QA report](docs/RED_TEAM.md) for test coverage, addressed risks, and device-testing limits. Automated simulation is not a replacement for human testing on physical iOS and Android devices. No software can be guaranteed free of all issues.

Font files are bundled with their SIL Open Font Licenses in `dist/fonts/`. Original game code is under the MIT license.
