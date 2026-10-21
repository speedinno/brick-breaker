# Version 3 architecture

The mobile-first canvas game is bundled identically for static web/PWA and Capacitor Android/iOS. Network access is optional for guest play. dist/ contains all runtime assets, including the official bundled Supabase SDK. There is no remotely loaded game script or ad/analytics SDK.

## Stage lifecycle

progress.js owns completion/unlock rules. All twelve starters open 13; the generated frontier advances one per first clear. journey-ui.js shows ticks, locks, exact requirements, paging and Play next. Locked cards do not generate future previews.

generated.js constructs 52×52 graphs from circuit, orbit, honeycomb, constellation, atrium, vortex, delta and coral recipes. Randomized spanning trees/chords connect sites; walls, chambers, entry shafts and breakable gates form the board. Connectivity repair opens gates into inaccessible colored regions. Palette changes do not count as new geometry. engine.js preserves the starter motifs and clones catalog cells before damaging them.

catalog.js validates definitions, computes SHA-256 of canonical geometry under eight rotations/reflections, and caches in IndexedDB. Open/read/write operations have bounded timeouts; denied, blocked, closed or corrupt storage falls back to validated memory entries (maximum 24). Guests generate deterministic stage numbers locally. Account stages come from the shared published catalog; the server may select a different nonce to avoid duplicates. Guest layouts never substitute for missing account stages. Offline accounts need previously downloaded published definitions.

session.js restores a validated device-local field, lives, bounded swarm and effects. progress.js keeps isolated account/guest namespaces. Identity/load epochs guard asynchronous loads and launches. Account changes clear displayed history.

## Cloud lifecycle

cloud.js uses email OTP, plus ordinary password login for provisioned reviewer accounts. SDK bearer sessions stay on the device. Public project configuration is disabled until Chandrahas supplies it. No service credential enters a client bundle.

game-api validates every bearer token with Auth and checks unlock authorization before generation. Postgres unique version/level, unique canonical hash and per-level advisory lock choose one concurrent winner. Published definitions do not change. Completion prefetches the newly opened stage and one following stage; locked users cannot download it.

Private tables use Auth foreign keys with deletion cascade and RLS. Clients read only their records/unlocked catalog and cannot write tables directly. Restricted SQL functions handle transactional advancement, UUID run idempotency, exact score/statistic bounds and expiry. Guest/offline imports are private client-reported progress, not verified competitive results.

Cloud history is paginated 100 stages at a time. Snapshots return recent 128 summaries plus monotonic frontier/starter set. Exports traverse pages. Recent sign-in and explicit deletion remove Auth plus private records, retaining anonymous shared catalog.

## Operational boundaries

Service worker caching is restricted to listed same-origin static game assets; no APIs/auth/export responses. Native apps run bundled assets without a web service worker. Native lifecycle hooks pause/save and manage token refresh. Android Back closes dialogs/pauses before exiting. Android OS backup is disabled to avoid backing up device session data.

Uniqueness tests cover 1,000 canonical layouts, not an infinity proof. Reachability is a geometric property, not a proof every stochastic game can be won. Representative real-physics clears are tested. Limits: 768 balls, 30 drops, 24 piercing shots, 120 Hz simulation.

The server catalog bundle is generated from the same client sources; npm run check detects stale parity. Freeze generator version 3 after publishing real catalog data. Future encoding/algorithm changes need a new version plus explicit progress/cache migration. See CHANDRAHAS-LAUNCH-GUIDE.md for operational and launch steps.

## Artistic variety and difficulty pacing

The journey uses twenty-two shuffled architecture styles: Circuit, Orbit, Honeycomb, Constellation, Atrium, Vortex, Delta, Coral, Lotus, Crystal, Cathedral, Aurora, Mandala, Waterfall, Bloom, Prism, Rangoli, Kolam, Rosette, Starweave, Perimeter and Gateway. A full bag visits each style once; adjacent bag boundaries cannot repeat the same style. Each board has fresh geometric parameters and structural canonical deduplication. Designed petals, facets, arches, ribbons and terraces complement the graph layouts. Color fields vary harmoniously across axes, diagonals and radial bands.

Every eight journey clears opens another chapter. difficulty.js uses smooth bounded growth: journey ball speed rises from 350 toward 422 px/s, the normal paddle narrows from 82 toward 66 px, layout anchors/loops grow, and bonus interval/effect durations tighten gently. Guaranteed early +3/×3 breakthrough drops remain. Difficulty grows on average across a varied sequence; different layouts can still feel easier or harder than their neighbors. No endless speed escalation or unavoidable demand for purchases.

Revisions 2, 3 and 4 were added before owner-managed cloud provisioning. Existing cached guest definitions are retained rather than overwritten. Their completed ticks remain; newly generated stages use the new recipes. Do not change the generator after the real shared production catalog is populated. Later changes require a version/migration plan.

Unpublished layout generation has an atomic per-account budget of 120 authorizations per ten minutes, enforced by game_prepare_level before expensive work. Importing a high personal frontier cannot reset that budget. Existing shared stages remain downloadable. Background prefetch is bounded by the audited completion/start path. This reduces one-account resource abuse; deployment quotas, signup/SMTP limits, budgets and monitoring are still operator duties.

Revision 3 adds four rangoli-inspired families, radial colour bands and occasional two-cell-wide mouths at column 3 or 49. Artistic contours use designed paths without random graph chords; an L-shaped approach joins their bottom contour without cutting across the motif. Connectivity repair uses breakable gates. Renderers fill wall cells edge to edge for a continuous solid grey outline. Directional launch hints identify extreme entries. The 22-style bag is independent of the eight-stage chapter cadence. Existing cached/shared definitions are authoritative and never overwritten.


Revision 4 adds restrained single-colour Perimeter and Gateway compositions alongside ornate families. New synthesis uses seed art-4 and recipe revision 4; catalog encoding remains version 3. Cached/shared layouts remain authoritative. Once the owner publishes real catalog rows, freeze them; future generator changes require a deliberate version and migration plan.

## Shooting, native layout and request boundaries

A distinct caught laser pickup starts eight game-seconds of paddle shooting. The first destroyed brick drops an early opportunity; it is not automatically activated. Shots fire every 0.16 seconds, sweep the intervening grid rows and pierce coloured targets/breakable gates while preserving permanent walls. They are separate from the fireball boost, freeze during pause and persist in validated device snapshots. Life loss, win and stage changes clear the effect. Older version-3 snapshots without shot fields remain accepted.

iOS uses contentInset=never; CSS alone owns safe-area padding. Dialog close targets are 44px with positive sticky offsets inside the scroll container. Dialog height subtracts safe insets, and restored focus prevents a scroll jump. Native policy/export/share links resolve against PUBLIC_GAME_URL rather than the bundled localhost origin. Web policy pages remain relative and offline-capable.

Cloud replies are bound to the captured account identity and cannot populate another account after a switch. Edge input is limited to 32 KiB of streamed bytes before strict UTF-8/JSON decoding. Backend HTTP calls have a ten-second timeout. Only exact controlled business messages leave the server; provider diagnostics are hidden. The entrypoint's HTTP contract tests use the real SDK and a mocked network transport; hosted SMTP/Auth acceptance remains owner work.


Android game progress/options/session keys also use a restricted native JavaScript storage bridge backed by private SharedPreferences. Synchronous commit completes before a save handler returns; this avoids WebView localStorage's deferred disk flush. One-time migration preserves old saves. Native storage becomes authoritative thereafter, including deletions; WebView storage is only a best-effort mirror. Non-game keys and Auth SDK tokens are not exported through this bridge. Android backup is disabled. Browser and iOS continue using validated device WebView/browser snapshots. Native tests force-stop Android immediately after a committed pause save; iPhone tests terminate/relaunch after pausing.
