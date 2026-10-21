# Creative patterns and gradual difficulty — release-candidate evidence

Compiled application commit: `fd824b5df628c24f877999d6a3a22fa307f82f1b`. Backend generation-budget hardening follows in source commit `dd2f381a68e4895ad341543981a8da0222aacb03`; it changes no compiled web/native application asset.

- [Android and iOS builds](https://github.com/speedinno/brick-breaker/actions/runs/39542142668): both passed.
- [Compiled native launch checks](https://github.com/speedinno/brick-breaker/actions/runs/39542592444): both passed on those exact artifacts. Android checks offline native rendering, 12 starter cards/locked stage 13, AUTO brick destruction, pause/resume and process relaunch. iPhone Simulator launch/relaunch screenshots were inspected.
- [Creative application checks](https://github.com/speedinno/brick-breaker/actions/runs/39542142691): 37 checks passed before backend hardening. [Backend hardening checks](https://github.com/speedinno/brick-breaker/actions/runs/39542801807) passed with the additional catalog-budget regression, for 38 total.
- [Public web deployment](https://github.com/speedinno/brick-breaker/actions/runs/39542157281): passed. Generated layouts, difficulty module, engine, app, journey UI and service worker matched deployed source on verification.

The system has sixteen shuffled architecture styles and eight-stage chapter goals. Difficulty rises smoothly within bounded control/physics limits. Tests cover 1,000 canonical generated layouts, 256 consecutive shared publications under the recent-layout filter, starter/journey progression, all twelve starter clears, sixteen early journey clears, and later levels 36, 60, 100, 180, 350 and 750 with two simulation seeds each. These are representative checks, not a proof for every future board or seed.

Browser QA on an isolated localhost origin confirmed chapter labels/goals, completion ticks, exact lock messages and a real clear of revised stage 14 unlocking stage 15. Earlier simulated progression came from an explicitly labeled disposable fixture, not human-earned history. Sixteen design previews were inspected together. Existing cached guest boards remain stable; new generations use the expanded recipes.

Package audit: [package-audit-v3.json](native/package-audit-v3.json). Both iOS Info.plists report version 3.0.0/build 3/minimum 15.4. App and embedded Capacitor/Cordova privacy manifests are present. Android APK/AAB contain no native ELF .so libraries. Game assets, difficulty code and dependency notices match committed source in all three compiled application packages.

Cloud remains disabled pending Chandrahas's owner-managed Supabase project, custom SMTP and support mailbox. Hosted two-account synchronization/export/deletion, backup/cleanup configuration, physical-device beta, signing and store review remain owner gates. The root CHANDRAHAS-LAUNCH-GUIDE.md contains the procedure. This candidate is not globally store-published.
