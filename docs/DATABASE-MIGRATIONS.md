# Applying the game database changes

Use Node 22+ and `npm ci` (including development dependencies). The operator-only baseline check runs the two original SQL files in a disposable PGlite PostgreSQL instance; this does not send local test data to Supabase. The ignored `.env.api` needs `SUPABASE_URL` and the existing account-level `SUPABASE_ACCESS_TOKEN`. This management token is never bundled in the game, API image or recovery worker.

```powershell
npm run migrate:database
```

The default is a read-only plan. It prints repository file names, normalized SHA-256 checksums and installed/pending states. It reads only schema, permission and migration metadata, not player rows. HTTP/provider error bodies are withheld. Configuration is read privately; do not put keys on the command line.

For the original project whose two October 21 migrations were already run manually:

```powershell
npm run migrate:database -- --apply --adopt-existing-baseline
```

The runner compares the live game tables, columns/defaults, constraints, indexes, triggers, row-security policies, effective player/service permissions and game function definitions against the actual original repository SQL. It accounts for Supabase's default service-function grants and PostgreSQL 18's separate NOT NULL constraint rows; nullability is still checked explicitly. A different or partially installed untracked schema stops without adoption. Ordinary unrelated public tables are not included in the game baseline.

Both manually installed baseline versions are then recorded **together in one database transaction**, without rerunning their DDL. The database verifies its observed baseline again under the migration lock immediately before recording it. `adopted=true` and the baseline fingerprint distinguish this observed schema comparison from a claim that historical SQL execution was checksum-tracked. Subsequent files execute in order, with each file's DDL and checksum committed atomically. On an empty project all files, including the baseline, execute normally.

For a tracked project, omit the adoption option:

```powershell
npm run migrate:database -- --apply
```

A private RLS-enabled `public.game_schema_revisions` table stores versions, checksums and adoption metadata. Player and service roles have no table access; migration administration uses the database management connection. Checksums normalize CRLF to LF and remove a leading UTF-8 BOM so the same source has the same identity on Windows and Unix. Changed checksums, unknown versions, gaps, incomplete adoption and missing predecessors stop the runner. An advisory transaction lock serializes this runner; the five-second lock timeout fails a contended deployment rather than waiting indefinitely behind gameplay.

Each SQL file has one outer transaction. The runner removes only that wrapper and executes the trusted repository body in a single anonymous PostgreSQL statement alongside the revision insert. A successful HTTP status alone is insufficient: it rereads the committed receipt. After a connection loss, **rerun the read-only plan first**. If a migration committed but its acknowledgement was lost, the matching stored checksum skips its DDL on retry. If it failed, both its schema changes and revision insert roll back; previously committed files remain installed. Fix a genuinely failed migration before retrying; do not mark it applied by hand.

This journal is specific to this runner. It does **not** repair or populate `supabase_migrations.schema_migrations`. Do not switch blindly to `supabase db push`; reconcile any CLI migration history explicitly first. The management query endpoint is currently documented as beta/experimental and can change: [Supabase API reference](https://supabase.com/docs/reference/api/v1-run-a-query). No automatic destructive rollback is supplied; preserve backups and deploy the compatible API after schema verification.

Local verification uses real PostgreSQL DDL, permissions and transaction rollback. It covers existing progress preservation, a fresh project, lost adoption/DDL acknowledgements, schema drift, between-observation adoption changes, checksum/gap/predecessor rejection, duplicate retries, nested dollar quoting and sanitized management failures. These fixtures do not prove every live PostgreSQL configuration or a production rollout.
