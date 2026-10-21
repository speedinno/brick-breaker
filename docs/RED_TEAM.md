# v3 QA and red-team record

21 October 2026. Tested properties and limits; not a zero-defect certification.

## Automated evidence

npm test: **51 passing Node checks**, plus **6 passing Deno HTTP contract tests**. npm run check: syntax and generated server/client bundle parity pass. Backend passes deno check. Dependency audit: zero reported advisories at this handoff; advisories can change.

- 1,000 generated layouts are distinct under canonical rotations/reflections, with node/edge diversity. Separate tests cover 1,000 overall layouts and 60 boards' reachability. JSON roundtrip, metadata validation and published-definition mutation isolation pass.
- Real unmodified watch physics clear the 12 starters and generated stages 13–34 using a representative seed. This is not a universal proof for all levels/seeds. Tests cover permanent walls, exact +3/×3, bounded balls/drops, collision, lives, pickups, effects and win conditions.
- Progress tests enforce all twelve before 13, one-at-a-time advancement, replay idempotency, corrupt-save normalization, isolated account namespaces and monotonic merge.
- Session tests restore broken bricks/swarm/lives/effects and reject wall deletion, NaN and malformed state.
- Embedded Postgres tests apply the actual migration with representative Supabase auth roles. RLS prevents cross-user reads/direct writes; catalog publication is idempotent/unique; stage skips, cross-user runs, forged scores and replayed advancement fail. Import validates starter requirements. Auth deletion cascades private records while keeping shared stages.
- Static offline-cache tests confirm required assets exist and unrelated routes are ignored.

## Browser evidence

Development UI checked on an isolated localhost origin. Eleven starter completions were seeded with an explicitly labeled development-only fixture. The remaining twelfth stage was cleared through real AUTO gameplay: a completion tick appeared, stage 13 opened, and 14 stayed locked. Before that clear, the lock prompt correctly named the one missing starter. Compact 320×568 layout/generated field inspected visually. Fixture data is not evidence of twelve human-earned completions.

Native evidence belongs to the linked v3 Actions runs and release artifacts. Previous v2 emulator/simulator results must not be called v3 results. Native CI checks the bundled privacy resource and compiled app separately. Physical devices and hosted auth are not covered by local browser/SQL checks.

## Threats and boundaries

| Risk | Handling and remaining limits |
| --- | --- |
| Another account's data | Auth validation, RLS, separate device namespaces, history reset on identity change. Hosted two-account tests still required. |
| Catalog races/duplicates | Transaction/advisory lock, unique canonical hash, bounded retry and stored winner reuse. Recent structural distance adds near-duplicate filtering. |
| Locked pattern disclosure | Auth/unlock check before generation; DB catalog policy. Guest device owners can inspect their own generator. |
| Replay/skip/fake result | Audited UUID/hash/expiry/score bounds and idempotent finish. No server-authoritative replay verification. |
| Fake imported progress | Accepted private client-reported history, bounded import. No leaderboards/prizes/economy. Add replay verification before competitive features. |
| Async sign-in race | Identity/load epochs and captured game references; separate account field snapshots. |
| Network failure | Bounded fetch, published cache, pending retries/idempotent completion; expired runs can import personal progress. No fake successful authentication. |
| Corrupt local state | Normalized progress, validated snapshots and cloned catalog. Device owner can still edit their private save. |
| Secrets | Public settings only in client; service role only server. No API/auth service-worker cache; no request bodies/tokens logged. |
| Deletion | Fresh sign-in plus DELETE; live Auth/private cascade. Shared anonymous catalog retained. Other offline devices/backups require documented handling. |
| Resource abuse | 768 balls, 30 drops, 24 shots, bounded histories/cache/requests/retries, start rate limit. Infrastructure quotas/alerts are owner configuration. |
| Store claims | Debug APK/unsigned AAB/archive labeled. No signed IPA, store publication or physical-device guarantee claimed. |

The Chandrahas guide covers actual SMTP, deployment, cleanup/backups, support mailbox, beta, disclosures and submission. Source tests cannot establish those external facts.

The creative update adds monotonic difficulty/bounds tests, checks twenty-two-style bags for adjacent repeats, verifies later recipe graphs grow in complexity, and clears later levels 36, 60, 100, 180, 350 and 750 with two simulation seeds each. This supplements the first twenty-two generated-stage clear checks and is not an all-level/all-seed guarantee.

A real-Postgres regression test also verifies that a high imported frontier cannot generate unlimited new catalog stages, cannot reset its quota by importing again or updating a row, and can still access already-published stages. The budget resets after its window. This backend hardening was introduced before RC2; RC2 includes its regression check alongside the new compiled pattern changes.

RC2 adds 200-stage coverage for all four rangoli families and both extreme entry positions. Every sampled mouth is two cells wide. Sixteen representative left/right serves enter the field through real ball physics. Twenty new style previews and the compact 320×568 phone layout were inspected. Native RC2 evidence is recorded separately in RELEASE-RC2.md. These samples do not prove every future board is equally attractive or every stochastic run wins.


## Final review loops

See FINAL-PRODUCT-AUDIT.md for the requirement matrix and findings. The final pass added separate paddle shooting and two simple design families, fixed hanging/corrupt IndexedDB operations, rejected stale account replies, bounded streamed request bodies and backend HTTP calls, hid provider diagnostics with an exact allowlist, and tightened deletion sign-in checks. UI fixes cover focus visibility, long titles, boost/pause overlap, native public legal URLs and the iPhone scrolled modal close control.

The first iPhone XCTest exposed a real failed close interaction in build 5; that result is retained in the audit. Build 7 removes double native/CSS insets and negative sticky close offsets. Final native results, package parity and screenshot evidence are recorded in RELEASE-FINAL.md. Historical RC2 launch-only limitations are superseded by explicit gameplay and damaged-field cold-restart assertions, while signed physical-device and hosted account acceptance remain owner launch gates.
