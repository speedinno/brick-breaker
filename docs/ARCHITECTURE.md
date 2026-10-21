# Version 3 architecture

The mobile-first canvas game is bundled identically for static web/PWA and Capacitor Android/iOS. Network access is optional for guest play. dist/ contains all runtime assets, including the official bundled Supabase SDK. There is no remotely loaded game script or ad/analytics SDK.

## Stage lifecycle

progress.js owns completion/unlock rules. All twelve starters open 13; the generated frontier advances one per first clear. journey-ui.js shows ticks, locks, exact requirements, paging and Play next. Locked cards do not generate future previews.

generated.js constructs 52×52 graphs from circuit, orbit, honeycomb, constellation, atrium, vortex, delta and coral recipes. Randomized spanning trees/chords connect sites; walls, chambers, entry shafts and breakable gates form the board. Connectivity repair opens gates into inaccessible colored regions. Palette changes do not count as new geometry. engine.js preserves the starter motifs and clones catalog cells before damaging them.

catalog.js validates definitions, computes SHA-256 of canonical geometry under eight rotations/reflections, and caches in IndexedDB. Guests generate deterministic stage numbers locally. Account stages come from the shared published catalog; the server may select a different nonce to avoid duplicates. Guest layouts never substitute for missing account stages. Offline accounts need previously downloaded published definitions.

session.js restores a validated device-local field, lives, bounded swarm and effects. progress.js keeps isolated account/guest namespaces. Identity/load epochs guard asynchronous loads and launches. Account changes clear displayed history.

## Cloud lifecycle

cloud.js uses email OTP, plus ordinary password login for provisioned reviewer accounts. SDK bearer sessions stay on the device. Public project configuration is disabled until Chandrahas supplies it. No service credential enters a client bundle.

game-api validates every bearer token with Auth and checks unlock authorization before generation. Postgres unique version/level, unique canonical hash and per-level advisory lock choose one concurrent winner. Published definitions do not change. Completion prefetches the newly opened stage and one following stage; locked users cannot download it.

Private tables use Auth foreign keys with deletion cascade and RLS. Clients read only their records/unlocked catalog and cannot write tables directly. Restricted SQL functions handle transactional advancement, UUID run idempotency, exact score/statistic bounds and expiry. Guest/offline imports are private client-reported progress, not verified competitive results.

Cloud history is paginated 100 stages at a time. Snapshots return recent 128 summaries plus monotonic frontier/starter set. Exports traverse pages. Recent sign-in and explicit deletion remove Auth plus private records, retaining anonymous shared catalog.

## Operational boundaries

Service worker caching is restricted to listed same-origin static game assets; no APIs/auth/export responses. Native apps run bundled assets without a web service worker. Native lifecycle hooks pause/save and manage token refresh. Android Back closes dialogs/pauses before exiting. Android OS backup is disabled to avoid backing up device session data.

Uniqueness tests cover 1,000 canonical layouts, not an infinity proof. Reachability is a geometric property, not a proof every stochastic game can be won. Representative real-physics clears are tested. Limits: 768 balls, 30 drops, 120 Hz simulation.

The server catalog bundle is generated from the same client sources; npm run check detects stale parity. Freeze generator version 3 after publishing real catalog data. Future encoding/algorithm changes need a new version plus explicit progress/cache migration. See CHANDRAHAS-LAUNCH-GUIDE.md for operational and launch steps.

## Artistic variety and difficulty pacing

The journey uses sixteen shuffled architecture styles: Circuit, Orbit, Honeycomb, Constellation, Atrium, Vortex, Delta, Coral, Lotus, Crystal, Cathedral, Aurora, Mandala, Waterfall, Bloom and Prism. A full bag visits each style once; adjacent bag boundaries cannot repeat the same style. Each board has fresh geometric parameters and structural canonical deduplication. Designed petals, facets, arches, ribbons and terraces complement the graph layouts. Color fields vary harmoniously across axes, diagonals and radial bands.

Every eight journey clears opens another chapter. difficulty.js uses smooth bounded growth: journey ball speed rises from 350 toward 422 px/s, the normal paddle narrows from 82 toward 66 px, layout anchors/loops grow, and bonus interval/effect durations tighten gently. Guaranteed early +3/×3 breakthrough drops remain. Difficulty grows on average across a varied sequence; different layouts can still feel easier or harder than their neighbors. No endless speed escalation or unavoidable demand for purchases.

Revision 2 was added before owner-managed cloud provisioning. Existing cached guest definitions are retained rather than overwritten. Their completed ticks remain; newly generated stages use the new recipes. Do not change the generator after the real shared production catalog is populated. Later changes require a version/migration plan.

Unpublished layout generation has an atomic per-account budget of 120 authorizations per ten minutes, enforced by game_prepare_level before expensive work. Importing a high personal frontier cannot reset that budget. Existing shared stages remain downloadable. Background prefetch is bounded by the audited completion/start path. This reduces one-account resource abuse; deployment quotas, signup/SMTP limits, budgets and monitoring are still operator duties.
