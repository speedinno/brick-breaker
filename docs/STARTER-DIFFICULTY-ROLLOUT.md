# Easier opening rounds — rollout notes

The current feature branch changes stages 1–4 to six-tile entrances, stages 5–8 to four tiles, and early play to a wider paddle, gentler speed and more frequent boosts. Every eighth stage from 20 is a Breather with more forgiving play controls. Later-stage layouts do not change.

Signed-in players use a shared catalog. The existing version 3 starter rows and runs must remain in place so a previously started stage can finish against its original hash. The new starter definitions use catalog version 4 only for stages 1–12; stage 13 onward remains version 3. Completion history remains stored as the existing progress edition (version 3), so completion ticks and records do not split between catalog revisions.

Before shipping a new Android/iPhone/web client, apply `supabase/migrations/202610280016_starter_catalog_v4.sql` through the established migration process and deploy the matching API bundle. The migration allows v4 starter catalog rows and routes new starter runs to them. Existing v3 rows and in-flight runs remain readable. Then use two disposable signed-in accounts to fetch a revised starter, start/complete it, and confirm the completion tick, history and cross-device sync. Test an already started v3 run before its expiry as well. Check a newly generated stage above 12 still uses v3.

Do not ship the client before backend migration and API deployment: its v4 starter validation will reject old shared definitions. Keep a record of the migrated schema revision, deployed API image and client commit for the release. A physical phone playtest should confirm the opening feels wide enough and stage 1 can be won without repeated frustrating retries; automated clearability alone cannot establish this.

The pasted review also identified control focus/swipe behavior, purchase retry recovery, backend test and native acceptance issues. Those must be addressed before treating this branch as a release candidate.
