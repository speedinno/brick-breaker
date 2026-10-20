# Red-team and QA report

Release: Prism Rush 1.0.0 · 20 October 2026

## Scope and evidence

This review covered the browser game, stage generator, physics, persistence, offline shell, static assets, and release configuration. It did not penetrate external services or test accounts belonging to other people.

`npm test`: 13 passing automated tests. `npm run check`: syntax checks pass for engine, app, and service worker. The pattern test checks 10,000 consecutive stages for seed 8937. A 30-minute fixed-step simulated Zen session uses paddle following, automatic charged pulses, and stage advancement; it checks finite positions, entity limits, and grid consistency. It is a simulation of gameplay time, not 30 minutes of measured physical-device performance.

Browser QA used the available Chromium-based in-app browser: desktop launch and scoring; responsive iframe views at 320 × 568, 390 × 700, and 390 × 844; mode switching; Settings and its focus behavior; and the mobile install entry point. These are responsive browser previews, not physical-device emulation or an iOS Safari test.

## Risks challenged and addressed

| Risk / abuse case | Handling and verification |
| --- | --- |
| Repetitive stages | Twelve procedural families vary their parameters, carving, random voids, and colors by stage seed. Exact duplicates are checked across 10,000 consecutive generated layouts. The live session also remembers up to 256 recent signatures. No infinite uniqueness claim is made. |
| Ball tunnels through thin bricks | Physics runs at 120 Hz, with additional movement substeps capped at 2.5 logical pixels. Automated high-speed collision and paddle/wall reflection checks pass. |
| Balls settle into nearly horizontal loops | Minimum vertical velocity and late-stage steering toward remaining bricks provide recovery. Pulse helps clear scattered remnants. |
| Bomb damage wraps around a row | Explicit row/column bounds prevent a bomb on one edge from damaging unrelated bricks on the opposite edge. Regression test passes. |
| Entity explosion / slowdown | Eighteen-ball cap, fourteen-drop cap, bounded particle effects, capped ball speed, fixed update budget, and a spatial grid prevent unbounded entity growth. Long-session simulation checks the caps. |
| Repeated damage scores the same brick twice | Destruction checks hit points before removal; the damage operation is idempotent. Grid size and remaining count are checked throughout simulation. |
| Loss / win racing | Win detection precedes ball-loss handling. Life loss only runs in the playing state. Tests verify single game-over transitions, preserved stage damage, and stage progression. |
| App switching causes an unfair loss | Visibility and blur events pause play and clear held input. The player resumes explicitly. Settings also pauses a live game. |
| Finger scroll interrupts play | The canvas uses pointer capture and `touch-action: none`; cancellation clears dragging. Controls remain regular accessible buttons. |
| Invalid / stale local saves | Storage access and JSON parsing are guarded; seed, stage, score, lives, and best values are validated and bounded. Failures fall back to a fresh playable game. |
| Cache grows from arbitrary URLs | Only the explicit same-origin asset allowlist is cached; query-string variations and unrelated paths are ignored. A mock offline test verifies cached script recovery and rejection of unrelated requests. |
| Third-party tracking or offline font failure | Fonts and their licenses are bundled. Gameplay makes no analytics, account, advertising, or third-party font requests. Browser/hosting providers still operate their own infrastructure. |
| Stored score manipulation | Best scores are explicitly device-local. There is no global competition, paid reward, or claim of anti-cheat verification. Editing local storage can change local records. |
| Sensitive data / code injection | No user-generated HTML, credential entry, API keys, remote commands, or backend input surface. Runtime text is generated internally. Service worker scope is relative to the app directory. |
| Sensory overload | Sound and haptics default off. Reduced effects follows the system preference on first visit and can be changed in Settings. No camera/microphone/location permissions are requested. |
| Misleading native download claims | The release is clearly described as an installable web app; it is not represented as an APK or an App Store listing. |
| Promotional spam | No replies or social posts were sent. Launch notes recommend relevant personal replies and creator collaboration, not repetitive bulk link posting. |

## Release limits and follow-up

- No guarantee of zero defects or of infinite non-repeating layouts. The automated uniqueness evidence covers the tested sequence, and human fun/balance judgments require actual players.
- Physical Android and iPhone tests, Safari audio/install/offline behavior, and low-end phone frame-time/battery profiling remain unverified. Browser install, sharing, and vibration support varies.
- The canvas game conveys score, lives, and controls through surrounding HTML, but the real-time spatial gameplay does not have a nonvisual screen-reader alternative. UI keyboard support is provided; full WCAG conformance is not claimed.
- Local progress has no cloud backup. A checkpoint resumes the start of a stage, not an in-flight frame. Clearing browser storage removes saves. Two simultaneous tabs are not synchronized.
- GitHub Pages / Sites availability, browser storage eviction, and first-load network access are outside the game engine. Offline availability begins after a successful cache installation.
- This release has no monetization, accounts, purchases, ad SDKs, push notifications, or collected player telemetry. Adding those would require a fresh privacy and security review.
- Before a paid native-store launch: test on physical devices, collect real playtest feedback, review age/content rating and platform policies, and create signed native packages if that distribution is desired.
