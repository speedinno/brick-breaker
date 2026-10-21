#requires -Version 7.2
[CmdletBinding()]
param(
    [switch]$Plan,
    [string]$SubscriptionId = 'cb69a440-eed5-4854-a89b-588dc241fc68',
    [string]$Location = 'centralindia',
    [string]$ResourceGroup = 'rg-brick-breaker-api-cin',
    [string]$RegistryName = 'acrbrickbreakercb69a440',
    [string]$EnvironmentName = 'cae-brick-breaker-api-cin',
    [string]$AppName = 'ca-brick-breaker-api',
    [string]$SecretsFile = (Join-Path $PSScriptRoot '../.env.api'),
    [ValidateRange(0, 2)][int]$MinReplicas = 0
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent

function Invoke-Azure {
    param([string[]]$Arguments)
    # Explicit subscription on EVERY operation; never switch the CLI default.
    $raw = & az @Arguments --subscription $SubscriptionId --only-show-errors --output json
    if ($LASTEXITCODE -ne 0) { throw "Azure CLI operation failed: $($Arguments[0]) $($Arguments[1]). Check the preceding Azure error." }
    if ($raw) { ($raw -join "`n") | ConvertFrom-Json }
}

if ($SubscriptionId -eq 'acd1c944-4dfe-4258-aeba-87356ecf6b2e') { throw 'Sigzio Dev is explicitly excluded from this deployment.' }
Get-Command az -ErrorAction Stop | Out-Null
$account = Invoke-Azure -Arguments @('account', 'show')
if ($account.state -ne 'Enabled') { throw 'The selected subscription is not enabled.' }
$source = (& git -C $repoRoot rev-parse --short=12 HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify the source commit.' }
$imageTag = "$source-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))"
$planInfo = [ordered]@{
    subscription = $account.name; subscriptionId = $account.id; location = $Location
    resourceGroup = $ResourceGroup; registry = $RegistryName; environment = $EnvironmentName
    app = $AppName; image = "${RegistryName}.azurecr.io/brick-breaker-api:$imageTag"
    source = $source; minReplicas = $MinReplicas; maxReplicas = 2; cpu = 0.5; memory = '1Gi'
    build = 'Azure Container Registry Tasks (no GitHub Actions or local Docker)'
}
if ($Plan) { $planInfo | ConvertTo-Json; return }
$dirtyApi = & git -C $repoRoot status --porcelain --untracked-files=normal -- supabase/functions Dockerfile.api .dockerignore scripts/deploy-api.ps1
if ($dirtyApi) { throw 'Commit the API/container/deployment changes before deploying so the image tag identifies its source.' }

if (!(Test-Path -LiteralPath $SecretsFile -PathType Leaf)) { throw 'Create the ignored .env.api file using .env.api.example first. Do not pass keys on the command line.' }
$settings = @{}
foreach ($line in Get-Content -LiteralPath $SecretsFile) {
    if ($line -match '^\s*(#|$)') { continue }
    if ($line -notmatch '^\s*([A-Z_]+)\s*=(.*)$') { throw 'Invalid .env.api line; use NAME=value.' }
    $name = $Matches[1]; $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) { $value = $value.Substring(1, $value.Length - 2) }
    $settings[$name] = $value
}
# Supabase's newer dashboard uses publishable/secret names. Map these to the
# server's existing environment names without modifying the owner's file.
if (!$settings.SUPABASE_ANON_KEY) { $settings.SUPABASE_ANON_KEY = $settings.SUPABASE_PUBLISHABLE_KEY }
if (!$settings.SUPABASE_SERVICE_ROLE_KEY) { $settings.SUPABASE_SERVICE_ROLE_KEY = $settings.SUPABASE_SECRET_KEY }
foreach ($name in @('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY')) {
    if (!$settings[$name] -or $settings[$name] -match '^YOUR_') { throw "Missing deployment setting: $name" }
}
$projectUrl = [uri]$settings.SUPABASE_URL
if ($projectUrl.Scheme -ne 'https' -or $projectUrl.AbsolutePath -ne '/' -or $projectUrl.UserInfo -or $projectUrl.Query -or $projectUrl.Fragment) { throw 'SUPABASE_URL must be an HTTPS project origin.' }
if ($settings.SUPABASE_ANON_KEY.StartsWith('sb_secret_')) { throw 'SUPABASE_ANON_KEY must contain the public publishable/anon key.' }
if ($settings.SUPABASE_ANON_KEY -eq $settings.SUPABASE_SERVICE_ROLE_KEY) { throw 'The public and server keys must be different.' }
$origins = $settings.ALLOWED_ORIGINS
if (!$origins) { $origins = 'https://localhost,capacitor://localhost' }
foreach ($origin in $origins.Split(',')) {
    $parsedOrigin = [uri]$origin.Trim()
    if ($parsedOrigin.Scheme -notin @('https', 'capacitor') -or !$parsedOrigin.Host -or $parsedOrigin.AbsolutePath -notin @('', '/') -or $parsedOrigin.UserInfo -or $parsedOrigin.Query -or $parsedOrigin.Fragment) { throw 'ALLOWED_ORIGINS must contain origins without paths, credentials, query or fragment.' }
}
$configuredOrigins = @($origins.Split(',') | ForEach-Object { $_.Trim() })
foreach ($nativeOrigin in @('https://localhost', 'capacitor://localhost')) {
    if ($nativeOrigin -notin $configuredOrigins) { throw "ALLOWED_ORIGINS must include $nativeOrigin for mobile builds." }
}
$origins = $configuredOrigins -join ','

# Fail before provisioning if the supplied keys do not reach the project.
# Values are passed only in headers and are never printed or written to receipts.
$healthHeaders = @{ apikey = $settings.SUPABASE_SERVICE_ROLE_KEY; Authorization = "Bearer $($settings.SUPABASE_SERVICE_ROLE_KEY)" }
$backend = Invoke-WebRequest -Uri ($projectUrl.AbsoluteUri.TrimEnd('/') + '/auth/v1/admin/users?page=1&per_page=1') -Headers $healthHeaders -SkipHttpErrorCheck -TimeoutSec 20
if ($backend.StatusCode -ne 200) { throw 'Supabase server credential validation failed. Check the project URL and server secret/service-role key.' }
$publicSettings = Invoke-WebRequest -Uri ($projectUrl.AbsoluteUri.TrimEnd('/') + '/auth/v1/settings') -Headers @{ apikey = $settings.SUPABASE_ANON_KEY } -SkipHttpErrorCheck -TimeoutSec 20
if ($publicSettings.StatusCode -ne 200) { throw 'Supabase public key validation failed.' }
$schema = Invoke-WebRequest -Uri ($projectUrl.AbsoluteUri.TrimEnd('/') + '/rest/v1/game_players?select=user_id,catalog_window,catalog_requests&limit=0') -Headers $healthHeaders -SkipHttpErrorCheck -TimeoutSec 20
if ($schema.StatusCode -ne 200) { throw 'Apply both Supabase migrations before deploying the API. Required player/quota columns were not accessible.' }

foreach ($provider in @('Microsoft.App', 'Microsoft.ContainerRegistry', 'Microsoft.ManagedIdentity')) {
    Write-Host "Ensuring resource provider: $provider"
    Invoke-Azure -Arguments @('provider', 'register', '--namespace', $provider, '--wait') | Out-Null
}
$groupExists = Invoke-Azure -Arguments @('group', 'exists', '--name', $ResourceGroup)
if ($groupExists) {
    $group = Invoke-Azure -Arguments @('group', 'show', '--name', $ResourceGroup)
    if ($group.tags.application -ne 'brick-breaker') { throw 'The target resource group belongs to another application. Choose a dedicated group.' }
} else {
    Invoke-Azure -Arguments @('group', 'create', '--name', $ResourceGroup, '--location', $Location, '--tags', 'application=brick-breaker') | Out-Null
}
$resources = @(Invoke-Azure -Arguments @('resource', 'list', '--resource-group', $ResourceGroup))
if (!$resources.Where({ $_.type -eq 'Microsoft.ContainerRegistry/registries' -and $_.name -eq $RegistryName })) {
    Write-Host 'Creating a private container registry.'
    Invoke-Azure -Arguments @('acr', 'create', '--resource-group', $ResourceGroup, '--name', $RegistryName, '--location', $Location, '--sku', 'Basic', '--admin-enabled', 'false') | Out-Null
}
$registry = Invoke-Azure -Arguments @('acr', 'show', '--resource-group', $ResourceGroup, '--name', $RegistryName)
Write-Host 'Building the API in Azure Container Registry Tasks.'
Invoke-Azure -Arguments @('acr', 'build', '--registry', $RegistryName, '--file', 'Dockerfile.api', '--image', "brick-breaker-api:$imageTag", '--platform', 'linux/amd64', '--no-logs', $repoRoot) | Out-Null

if (!$resources.Where({ $_.type -eq 'Microsoft.App/managedEnvironments' -and $_.name -eq $EnvironmentName })) {
    Write-Host 'Creating the Container Apps environment.'
    Invoke-Azure -Arguments @('containerapp', 'env', 'create', '--name', $EnvironmentName, '--resource-group', $ResourceGroup, '--location', $Location, '--logs-destination', 'none') | Out-Null
}
$identity = Invoke-Azure -Arguments @('identity', 'create', '--name', "$AppName-pull", '--resource-group', $ResourceGroup, '--location', $Location)
$assignmentHash = [System.Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes("$($registry.id)|$($identity.principalId)|AcrPull"))
$assignmentName = [guid]::new([byte[]]$assignmentHash[0..15]).ToString()
Invoke-Azure -Arguments @('role', 'assignment', 'create', '--name', $assignmentName, '--assignee-object-id', $identity.principalId, '--assignee-principal-type', 'ServicePrincipal', '--role', 'AcrPull', '--scope', $registry.id) | Out-Null
$image = "$($registry.loginServer)/brick-breaker-api:$imageTag"
$secretArgs = @("supabase-public=$($settings.SUPABASE_ANON_KEY)", "supabase-service=$($settings.SUPABASE_SERVICE_ROLE_KEY)")
$envArgs = @("SUPABASE_URL=$($projectUrl.AbsoluteUri.TrimEnd('/'))", 'SUPABASE_ANON_KEY=secretref:supabase-public', 'SUPABASE_SERVICE_ROLE_KEY=secretref:supabase-service', "ALLOWED_ORIGINS=$origins", 'PORT=8000')
if ($resources.Where({ $_.type -eq 'Microsoft.App/containerApps' -and $_.name -eq $AppName })) {
    Invoke-Azure -Arguments (@('containerapp', 'secret', 'set', '--name', $AppName, '--resource-group', $ResourceGroup, '--secrets') + $secretArgs) | Out-Null
    Invoke-Azure -Arguments (@('containerapp', 'update', '--name', $AppName, '--resource-group', $ResourceGroup, '--image', $image, '--min-replicas', "$MinReplicas", '--max-replicas', '2', '--set-env-vars') + $envArgs) | Out-Null
} else {
    Write-Host 'Creating the API Container App with managed-identity image pulls.'
    Invoke-Azure -Arguments (@('containerapp', 'create', '--name', $AppName, '--resource-group', $ResourceGroup, '--environment', $EnvironmentName, '--image', $image, '--registry-server', $registry.loginServer, '--registry-identity', $identity.id, '--user-assigned', $identity.id, '--ingress', 'external', '--target-port', '8000', '--transport', 'http', '--cpu', '0.5', '--memory', '1Gi', '--min-replicas', "$MinReplicas", '--max-replicas', '2', '--secrets') + $secretArgs + @('--env-vars') + $envArgs) | Out-Null
}
$app = Invoke-Azure -Arguments @('containerapp', 'show', '--name', $AppName, '--resource-group', $ResourceGroup)
$apiUrl = "https://$($app.properties.configuration.ingress.fqdn)"
$healthy = $false
for ($attempt = 0; $attempt -lt 12; $attempt++) {
    try { $probe = Invoke-RestMethod -Uri "$apiUrl/healthz" -TimeoutSec 20; if ($probe.status -eq 'ok') { $healthy = $true; break } } catch { }
    Start-Sleep -Seconds 5
}
if (!$healthy) { throw 'API health check failed. Inspect the Container App logs before using this revision.' }
$anonymous = Invoke-WebRequest -Uri $apiUrl -Method Post -ContentType 'application/json' -Body '{}' -SkipHttpErrorCheck -TimeoutSec 20
if ($anonymous.StatusCode -ne 401) { throw 'API must reject anonymous requests with HTTP 401.' }
foreach ($origin in @('https://localhost', 'capacitor://localhost')) {
    $cors = Invoke-WebRequest -Uri $apiUrl -Method Options -Headers @{ Origin = $origin } -SkipHttpErrorCheck -TimeoutSec 20
    if ($cors.StatusCode -ne 204 -or $cors.Headers['Access-Control-Allow-Origin'] -ne $origin) { throw "Native CORS check failed for $origin" }
}
$receipt = [ordered]@{ apiUrl = $apiUrl; healthUrl = "$apiUrl/healthz"; subscription = $account.name; subscriptionId = $account.id; resourceGroup = $ResourceGroup; app = $AppName; image = $image; source = $source; checkedAt = [DateTime]::UtcNow.ToString('o'); checks = @('process health', 'anonymous requests rejected', 'Android/iPhone CORS') }
$receiptDirectory = Join-Path $repoRoot '.openai/local'
New-Item -ItemType Directory -Path $receiptDirectory -Force | Out-Null
$receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $receiptDirectory 'azure-api-deployment.json') -Encoding utf8
$receipt | ConvertTo-Json
