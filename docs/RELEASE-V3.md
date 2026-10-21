# Version 3 release-candidate evidence

Application source: 838390c2a2fd358d89a6fba44ce7e102ae62c86a.

- [Native Android and iOS build](https://github.com/speedinno/brick-breaker/actions/runs/39540301794): both passed.
- [Game/backend checks](https://github.com/speedinno/brick-breaker/actions/runs/39540301654): passed; 33 automated tests, syntax/generator parity, dependency audit and Deno backend check.
- [Compiled native launch checks](https://github.com/speedinno/brick-breaker/actions/runs/39540575697): passed on both platforms. Attached screenshots/check JSON cover those exact compiled packages.
- [Public web deployment](https://github.com/speedinno/brick-breaker/actions/runs/39540316975): passed. Published application, cloud config, privacy/deletion pages and third-party notices matched source on verification.

Package audit: [package-audit-v3.json](native/package-audit-v3.json). Compiled iOS version 3.0.0/build 3/minimum 15.4 verified from both Info.plists. App plus Capacitor/Cordova privacy manifests are present in both iOS packages. Android APK/AAB contain no ELF .so libraries. Final game assets and dependency notices matched source in all three application packages.

Browser flow: an explicitly labeled development fixture seeded eleven starters. Real AUTO gameplay cleared starter 12, unlocked 13, then cleared generated stage 13 and unlocked 14. Stage 14 displayed a new graph layout. Locked stage messages and completion ticks were checked, including at 320×568. Fixture history is not a claim of twelve human-earned clears.

Cloud is disabled in this candidate. Hosted email delivery, real two-account synchronization/deletion, backups, support email, physical devices, production signing, store metadata and review remain owner gates. The Chandrahas guide contains the full procedure. No App Store/Play Store launch is claimed.
