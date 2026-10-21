# Mobile API deployment through Azure CLI

This deployment hosts only the game API. Android and iPhone continue to use
bundled game assets, Supabase Auth/Postgres, and Supabase SMTP backed by Resend.
It does not publish a web game or use GitHub Actions.

## Verified deployment: 21 October 2026

- API: https://ca-brick-breaker-api.braverock-ed05a525.centralindia.azurecontainerapps.io
- Health: https://ca-brick-breaker-api.braverock-ed05a525.centralindia.azurecontainerapps.io/healthz
- Active revision: `ca-brick-breaker-api--0000001`, Healthy/Provisioned.
- Deployed API source: `9e7502738184`.
- Image: `acrbrickbreakercb69a440.azurecr.io/brick-breaker-api:9e7502738184-20261021152840`.
- Both SQL migrations were applied by the owner in Supabase's SQL Editor.
  Before a future CLI `db push`, reconcile its migration history with those
  already-applied versions; do not run the initial schema again.

Hosted acceptance passed using two disposable password accounts: authenticated
state/saves, starter completion/retry idempotency, locked/generated stage access,
guest import, cross-account SQL/RLS isolation, export, fresh-sign-in deletion,
private-record cascades, and shared-catalog preservation. Both test accounts were
removed. Completion statistics were synthetic API test input, not a claim of
manual gameplay. SMTP/OTP delivery and signed physical-device builds were not
tested in this deployment. The subsequent mobile build described below bundles
the public configuration.

The acceptance harness can be run explicitly after deployment. It creates two
disposable accounts without sending email, deletes their private data, and keeps
the normal anonymous stage definitions published during the test:

```powershell
node --env-file=.env.api scripts/smoke-hosted-api.mjs https://YOUR_API_HOST
```

## Selected Azure target

- Subscription: **SpeedInno Org Subscription** (`cb69a440-eed5-4854-a89b-588dc241fc68`).
- Region: **Central India**, near the Supabase database in Mumbai. The subscription's
  Container Apps provider lists Central India; it does not list West India.
- Dedicated resource group: `rg-brick-breaker-api-cin`.
- ACR Basic registry: `acrbrickbreakercb69a440`.
- Container Apps environment: `cae-brick-breaker-api-cin`.
- API Container App: `ca-brick-breaker-api` (0.5 CPU, 1 GiB, 0–2 replicas by default).

Every CLI operation specifies the subscription explicitly. The script refuses
Sigzio Dev and does not change the Azure CLI's default subscription. Container
Apps, ACR storage/build tasks, and any enabled monitoring are Azure-billed
resources; existing Azure access is not a promise of free hosting.

## Prepare and inspect

Use PowerShell 7.2+, Azure CLI, its `containerapp` extension, and a signed-in account
with resource creation and role-assignment permissions in the selected
subscription. Local Docker is unnecessary: `az acr build` builds the Linux image
in Azure from the local checkout.

```powershell
./scripts/deploy-api.ps1 -Plan
```

`-Plan` reads the subscription and prints the proposed resources without creating
or changing anything. Inspect the plan and commit the tested source before an
actual deployment. No keys are required for this step.

Local verification commands (the PowerShell test mocks Azure and performs no
deployment):

```powershell
npm.cmd test
npm.cmd run check
pwsh -File tests/deploy-api.test.ps1
npx.cmd --yes --package=deno deno test --allow-env --config supabase/functions/deno.json supabase/functions/game-api/index.test.ts
```

## Supply server credentials locally

Copy `.env.api.example` to `.env.api` and fill it in using your local editor:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_SECRET_OR_SERVICE_ROLE_KEY
ALLOWED_ORIGINS=https://localhost,capacitor://localhost
```

The newer names `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` are also
accepted in place of `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.

`.env.api` is Git-ignored. The Docker build context uses an allowlist containing
only the Dockerfile and API sources, so credentials, Git history, and native
signing files are not uploaded to the build service. The script loads keys
without printing them and places them in Azure Container Apps secrets. The
Resend key belongs in Supabase's custom SMTP settings; this API does not use it.

Apply **both** `supabase/migrations/*.sql` migrations to the new project before
deployment. If using the Supabase CLI, sign in with the current CLI, link the
correct project, and run `supabase db push`. A previous expired CLI access token
must be replaced by the owner; do not reset an existing production database.

## Deploy

```powershell
./scripts/deploy-api.ps1
```

The script validates the project keys and required player/quota columns before
provisioning. It then registers resource providers, creates dedicated resources,
builds a commit/timestamp image tag, grants a managed identity
`AcrPull`, and creates or updates the Container App. It does not grant registry
administrator access. It aborts if the selected resource group belongs to
another application. Initial provider registration and image-pull role
propagation can take time. If Azure reports a propagation delay, rerun after the
role is active. If ACR Tasks is unavailable to the subscription, resolve its
eligibility/quota or use a local Docker build/push; GitHub Actions is unnecessary.

After deployment it checks:

- Public `GET /healthz` returns `{"status":"ok"}`.
- Anonymous API calls return HTTP 401.
- Android/iPhone preflight requests receive the correct CORS headers.

The public endpoint and source/image identifiers are written to the ignored
`.openai/local/azure-api-deployment.json`. Health indicates that the process is
running; it does not certify SMTP or account/database functionality. Run the
two-account hosted acceptance checks in the launch guide before production.

The default zero minimum replicas permits cold starts. Use `-MinReplicas 1` for
an always-running replica when launch latency requirements justify its cost.
The dedicated environment initially has no persistent Log Analytics destination;
configure log retention, metrics/alerts, backups, and expired-attempt cleanup
before public production. Do not log bearer tokens, codes, keys, or request bodies.

## Connect mobile builds

The current Android/iOS assets contain the deployed Azure endpoint, public
Supabase URL/key, and support contact. Both native build numbers are now **9**
(version **3.0.0**). Android `assembleDebug` and `bundleRelease` succeeded locally
with JDK 21, Android SDK 36, and Gradle 8.14.3. The debug APK signature was verified;
the release AAB is unsigned and requires production signing before store upload.
Both archives contain the current public config, and scans of the archives and
native assets found none of the supplied server credentials. iOS assets were
synced; an iOS archive still requires macOS/Xcode and signing.

Local outputs (ignored by Git):

- `android/app/build/outputs/apk/debug/app-debug.apk`: device testing.
- `android/app/build/outputs/bundle/release/app-release.aab`: unsigned release bundle.

All 62 Node tests, JavaScript/server parity checks, and production configuration
preflight passed after these changes. Physical-device testing remains required.

Set public client configuration using the deployed endpoint:

```powershell
$env:API_URL='https://YOUR_CONTAINER_APP_FQDN'
$env:SUPABASE_URL='https://YOUR_PROJECT_REF.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY='YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY'
$env:SUPPORT_EMAIL='support@YOUR_DOMAIN'
$env:PUBLISHER_NAME='YOUR_LEGAL_PUBLISHER'
npm.cmd run configure:cloud
npm.cmd run mobile:sync
```

`API_URL` is public and contains no key. The mobile client obtains/refreshes its
Supabase session before calling Azure with that user's bearer token; the API
still validates the token with Supabase Auth and enforces the existing SQL/RLS
rules. Account changes invalidate pending responses. Omitting `API_URL` retains
the original Supabase Edge Functions endpoint for existing deployments.

Rebuild/sign native packages after changing their bundled public settings and
increase build numbers for new store uploads. Keep existing public privacy,
support, terms, and account-deletion pages available for mobile store requirements;
hosting an interactive web game is not required for the API deployment. Native
export/deletion browser flows currently use the configured public game URL and
must be reviewed separately if that browser game will be retired.

## Configure email codes

Add `SUPABASE_ACCESS_TOKEN`, `RESEND_API_KEY`, `AUTH_SENDER_EMAIL`,
`SUPPORT_EMAIL`, and the owned `TEST_EMAIL` to the ignored `.env.api`.
The access token is a Supabase account token with permission to update Auth
configuration. These credentials must never be bundled into mobile assets.

```powershell
node --env-file=.env.api scripts/configure-email.mjs
# After the sender domain is verified, explicitly request one test code:
node --env-file=.env.api scripts/configure-email.mjs --send-test
```

The setup uses Resend SMTP over TLS, enables confirmed email signup, and installs
code-only signup/login templates with an eight-digit code valid for ten minutes.
It checks persisted settings, preserves unrelated Auth settings, and refuses to
replace an active email hook. The test option refuses an unverified sender and
sends only to `TEST_EMAIL`. A successful request alone does not prove delivery;
check Resend delivery events and confirm the message arrives, then exercise
sign-in and account operations on a device.

SMTP configuration has been applied with sender
`login@brickbreaker.speedinno.com`. The owner chose a separate game subdomain
because other Resend accounts use the root domain. The game subdomain has been
created in the current Resend account and verified on 21 October 2026. Its four
records have been added to the `speedinno.com` Cloudflare zone:
TXT `resend._domainkey.brickbreaker`, MX/TXT `send.brickbreaker`, and CNAME
`rsend.brickbreaker`. Use the exact values in
`.openai/local/resend-game-dns-records.txt` or the game subdomain's Resend page,
keep CNAME proxying disabled, and verify that subdomain. Leave root-domain and
other application DNS records unchanged, including the existing
`resend._domainkey`, `send`, and root MX records. The earlier root-domain
verification instructions are superseded; do not replace another account's DKIM
key or transfer its domain to complete the game setup.

All four records exactly matched Resend's expected values through both Google
and Cloudflare public DNS. A Cloudflare read-back confirmed that unrelated DNS
records remained unchanged. Supabase SMTP settings were revalidated, and two
explicit test-code requests to the owner's configured test inbox received
Resend's `delivered` event. The production client's code-verification method
accepted the eight-digit code, and its authenticated Azure `state` request passed.
The test session was signed out; the owner's account and progress were retained.
Codes, session tokens, and message bodies were not written to the receipts.
Resend delivery confirms recipient-server acceptance; inbox/spam placement still
needs owner confirmation. Receipts are ignored local files:
`.openai/local/cloudflare-game-dns.json`,
`.openai/local/email-configuration.json`, and
`.openai/local/email-flow-acceptance.json`.

The first authenticated API request exceeded the client's 12-second timeout.
The health check and a subsequent email-login/API test passed. The deployment
still permits scaling to zero; verify cold-start behavior on devices before
launch and choose a minimum replica count if required by latency targets.

References: [Resend SMTP](https://resend.com/docs/send-with-smtp),
[Resend Cloudflare DNS setup](https://resend.com/docs/guides/dns/cloudflare),
[Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Inspect and roll back

```powershell
az containerapp logs show --subscription cb69a440-eed5-4854-a89b-588dc241fc68 --resource-group rg-brick-breaker-api-cin --name ca-brick-breaker-api --type console --tail 50
az containerapp revision list --subscription cb69a440-eed5-4854-a89b-588dc241fc68 --resource-group rg-brick-breaker-api-cin --name ca-brick-breaker-api --output table
```

To roll back, update the app to a previously verified image tag from a deployment
receipt. Keep the database/catalog and player progress intact. Do not delete
the resource group or reset Supabase as a rollback mechanism.

References: [ACR cloud builds](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-tutorial-quick-task),
[Container Apps containers](https://learn.microsoft.com/en-us/azure/container-apps/containers),
[Deno Docker images](https://docs.deno.com/runtime/reference/docker/).
