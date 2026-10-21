# Mobile API deployment through Azure CLI

This deployment hosts only the game API. Android and iPhone continue to use
bundled game assets, Supabase Auth/Postgres, and Supabase SMTP backed by Resend.
It does not publish a web game or use GitHub Actions.

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
