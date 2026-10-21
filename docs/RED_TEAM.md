# v2 red-team and QA report

20 October 2026 · Channel-and-swarm rebuild

## Evidence

Sixteen automated tests pass. They cover 1,000 consecutive distinct layouts; deterministic generation; intact gray walls; open routes from the entrance to every breakable region across 60 generated stages; a normal single-ball first serve; exact +3 and ×3 behavior; pickup catching; high-speed collision; temporary power expiration; loss and win transitions; and finite, bounded swarms. A watch simulation grows beyond 100 balls and clears the T field; all twelve reference motifs clear with the same physics in the tested seed, within the 900-second simulation limit per stage.

This replaces the v1 test claims. The old 10,000-layout test applied to the old generator, not this rebuild. Simulation time is not measured physical-device runtime. Exact non-repetition for infinitely many stages is not claimed.

The browser review covered 26 loaded X video results at opening, middle, and late positions. Sixteen results use the dominant channel-and-swarm style, including duplicate uploads. See REFERENCES.md for the full URL inventory and distinctions. No claim is made that every X video worldwide was reviewed or that every clip is the same game.

## Risks addressed

| Risk | Handling |
| --- | --- |
| Wrong genre/feel | The old gradient patterns, bomb grid, opening fireball, 18-ball cap, Pulse, and marketing layout were replaced by the observed dense tiles, gray walls, narrow entries, caps, orange paddle, and hundreds of white balls. |
| Enclosed colored islands prevent finishing | A graph pass adds the minimum gate connections needed to make every breakable component reachable. Reachability tests cover canonical and generated stages. This is a deliberate progression repair beyond what the unfinished clips establish. |
| Stable one-ball loops | Minimum nonzero velocity components and small angle perturbations after prolonged non-destructive wall bouncing reduce exact periodic loops. There is no teleportation or invisible mass brick destruction. Some narrow patterns are intentionally slow; 2× / 4× playback is available. |
| Swarm causes unbounded work | 768-ball cap, 30-drop cap, bounded fixed-step update budget, cached field rendering, and a spatial collision grid. No per-ball trails or particle explosion. Physical low-end phone profiling is still required. |
| Thin-wall tunneling | 120 Hz fixed simulation plus movement substeps of at most 1.8 logical pixels. High-speed collision regression tests pass. |
| Walls accidentally destroyed | Walls have separate permanent collision behavior. Damage and fireball tests verify they remain. |
| Brick damaged twice | Destroyed cells are removed and damage is idempotent; remaining counts are checked during the swarm simulation. |
| App switch or stuck input loses a life | Visibility/blur handling pauses play and clears held keys and pointer dragging. Lost lives retain the current field damage. |
| Touch scrolling interrupts game | Pointer capture and canvas `touch-action: none`. Normal HTML buttons and keyboard controls remain available. |
| Corrupt saves or storage failure | Guarded JSON and storage operations, bounded integer validation, and fresh-game fallback. There is no cloud save or cross-tab synchronization. |
| Cache growth or unrelated private pages cached | An explicit same-origin asset allowlist ignores query variations and unrelated URLs. The offline fallback test passes. Native builds package local assets and skip service-worker registration. |
| Dependency vulnerabilities | Native tooling uses pinned Capacitor packages and a lockfile. CLI 8.4.3 avoids the moderate transitive advisory found in CLI 8.5.3; npm audit reports zero advisories at this check. Repeat audits when dependencies change. |
| Secret leakage | Signing materials are ignored by Git. No signing keys, Apple certificates, provisioning profiles, GitHub tokens, or account credentials belong in the source or public build. |
| Misleading iPhone download | An unsigned device archive or Simulator app is not presented as an installable signed IPA. Physical iPhone distribution remains dependent on the owner's Apple signing. |
| Misleading Android release | A debug-signed test APK is distinguished from a production-signed Play Store release; the AAB needs production signing. |
| Sensory/accessibility limitations | Sound and haptics default off; reduced effects follows system preference. The canvas has keyboard controls and surrounding semantic HTML, but no full nonvisual gameplay equivalent. WCAG conformance is not claimed. |

## Remaining limits

Browser validation and native build validation do not substitute for physical Android and iPhone playtests, thermal/battery testing, low-memory handling, or App Store review. The code is an independent recreation of observable mechanics; original timings, hidden rules, and exact source physics cannot be inferred with certainty from recordings. No zero-defect guarantee is made.

Native build outcomes are recorded in GitHub Actions and the release notes. A build should only be called successful once its job completes. A signed physical-device iOS release requires Apple Developer access; a production Android store release requires owner-managed signing.

## Native validation · 21 October 2026

Both Android and iOS compilation jobs passed in [run 39530188773](https://github.com/speedinno/brick-breaker/actions/runs/39530188773), building application commit `a20be624496d49799c464808d15dc690f79b78e4`. The APK, simulator app, and unsigned device archive were inspected: their index, engine, controller, styles, and manifest match the current game source after newline normalization.

The Android API 35 emulator test used the exact downloaded APK with Wi-Fi and mobile data disabled. It verified native Capacitor execution, a painted dense field with 2,328 initial breakable cells, AUTO launch, brick count falling to 2,318 with three balls after 20 seconds, pause/resume, and process relaunch. No uncaught JavaScript exception or native fatal exception was reported. The screenshot was visually inspected for field rendering and phone layout. This is a startup and gameplay smoke test, not a low-end device performance benchmark.

The exact iPhone Simulator app was installed, launched, terminated and relaunched. Screenshots show the dense T field, game controls, safe-area layout, and the saved-stage Continue prompt after relaunch. Both screenshots were visually inspected. An initial CI run hung after producing its screenshots and was stopped; that runner issue is not represented as a passed workflow. The workflow now separates startup, launch, relaunch and simulator shutdown with explicit time limits. Native touch gameplay on a physical iPhone remains unverified.
