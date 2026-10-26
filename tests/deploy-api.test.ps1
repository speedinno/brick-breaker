#requires -Version 7.2
# Exercise the real deployment script without network calls or Azure changes.
$ErrorActionPreference = 'Stop'
$global:brickDeployTestCommands = [Collections.Generic.List[object]]::new()
$global:brickDeployTestExisting = $false
$global:brickDeployTestReceipt = ''
$global:brickDeployTestPayloads = [Collections.Generic.List[object]]::new()
$global:brickDeployTestArmFailure=$false
$global:brickDeployTestSchemaMissing=$false
$subscription = 'cb69a440-eed5-4854-a89b-588dc241fc68'
function Assert($condition, [string]$message) { if (!$condition) { throw $message } }
function git {
    if ($args -contains 'rev-parse') { '0123456789ab' }
    $global:LASTEXITCODE = 0
}
function az {
    $arguments = [string[]]$args
    $global:brickDeployTestCommands.Add($arguments)
    $index = [array]::IndexOf($arguments, '--subscription')
    Assert ($index -ge 0 -and $arguments[$index + 1] -eq $subscription) 'Every command must explicitly select SpeedInno Org.'
    $global:LASTEXITCODE = 0
    switch ($arguments[0..1] -join ' ') {
        'account show' { @{ name = 'SpeedInno Org Subscription'; id = $subscription; state = 'Enabled' } | ConvertTo-Json }
        'group exists' { $global:brickDeployTestExisting | ConvertTo-Json }
        'group show' { @{ tags = @{ application = 'brick-breaker' } } | ConvertTo-Json }
        'resource list' {
            if ($global:brickDeployTestExisting) {
                @(
                    @{ type = 'Microsoft.ContainerRegistry/registries'; name = 'acrbrickbreakercb69a440' },
                    @{ type = 'Microsoft.App/managedEnvironments'; name = 'cae-brick-breaker-api-cin' },
                    @{ type = 'Microsoft.App/containerApps'; name = 'ca-brick-breaker-api' }
                ) | ConvertTo-Json
            } else { '[]' }
        }
        'acr show' { @{ id = '/subscriptions/test/registries/brick'; loginServer = 'registry.example.test' } | ConvertTo-Json }
        'identity create' { @{ id = '/subscriptions/test/identities/pull'; principalId = '00000000-0000-4000-8000-000000000001' } | ConvertTo-Json }
        'containerapp show' { @{identity=@{type='UserAssigned';userAssignedIdentities=@{}};properties=@{configuration=@{activeRevisionsMode='Single';ingress=@{fqdn='api.example.test';external=$true;targetPort=8000;transport='http'};secrets=@(@{name='supabase-public'},@{name='supabase-service'});registries=@()};template=@{containers=@(@{name='ca-brick-breaker-api';env=@();image='old-image'});scale=@{}}}} | ConvertTo-Json -Depth 15 }
        'containerapp secret' { Assert ($arguments[2] -eq 'list' -and $arguments -contains '--show-values') 'Existing secrets must be preserved privately.'; @(@{name='supabase-public';value='public-test-key'},@{name='supabase-service';value='server-test-key'}) | ConvertTo-Json }
        'rest --method' {
            Assert ($arguments -contains 'put') 'Resource update must use the verified ARM payload.'
            $at=[array]::IndexOf($arguments,'--body');Assert ($at -ge 0 -and $arguments[$at+1].StartsWith('@')) 'Secrets must use a private request file.'
            $path=$arguments[$at+1].Substring(1);Assert (Test-Path -LiteralPath $path) 'Missing request file.'
            $global:brickDeployTestPayloads.Add(@{path=$path;body=([IO.File]::ReadAllText($path)|ConvertFrom-Json)})
            Assert (($arguments -join ' ') -notmatch 'test-key') 'No secret value may be a process argument.'
            if ($global:brickDeployTestArmFailure) { $global:LASTEXITCODE=1; 'private-server-test-key-diagnostic' } else { '{}' }
        }
        default { '{}' }
    }
}
function Invoke-WebRequest {
    param($Uri, $Headers, $Method, $ContentType, $Body, $UserAgent, [switch]$SkipHttpErrorCheck, $TimeoutSec)
    if ($Uri -like 'https://project.example.test/*') { Assert ($UserAgent -eq 'brick-breaker-deployment/1.0') 'Secret-key checks must identify a server, not a browser.'; if ($global:brickDeployTestSchemaMissing -and $Uri -like '*/game_metric_preferences?*') { return @{StatusCode=404} }; return @{ StatusCode = 200;Content='{"jobs":[]}' } }
    if ($Method -eq 'Post') { return @{ StatusCode = 401 } }
    if ($Method -eq 'Options') { return @{ StatusCode = 204; Headers = @{ 'Access-Control-Allow-Origin' = $Headers.Origin } } }
    throw 'Unexpected HTTP operation in deployment test.'
}
function Invoke-RestMethod { param($Uri, $TimeoutSec) Assert ($Uri -eq 'https://api.example.test/healthz') 'Wrong health URL'; @{ status = 'ok' } }
function New-Item { param($ItemType, $Path, [switch]$Force) }
function Set-Content { param([Parameter(ValueFromPipeline)]$Value, $LiteralPath, $Encoding) process { $global:brickDeployTestReceipt = $Value } }

$deployScript = Join-Path $PSScriptRoot '../scripts/deploy-api.ps1'
$secretsPath = [IO.Path]::GetTempFileName()
[IO.File]::WriteAllText($secretsPath, "SUPABASE_URL=https://project.example.test`nSUPABASE_ANON_KEY=public-test-key`nSUPABASE_SERVICE_ROLE_KEY=server-test-key`n")
try {
    $plan = (& $deployScript -Plan) | ConvertFrom-Json
    Assert ($plan.subscriptionId -eq $subscription) 'Plan selected the wrong subscription.'
    Assert ($global:brickDeployTestCommands.Count -eq 1) 'Plan must not provision resources.'
    $global:brickDeployTestCommands.Clear()
    $rejected = $false
    try { & $deployScript -Plan -SubscriptionId 'acd1c944-4dfe-4258-aeba-87356ecf6b2e' | Out-Null } catch { $rejected = $_.Exception.Message -match 'Sigzio Dev' }
    Assert $rejected 'Sigzio Dev must be rejected before any Azure operation.'
    Assert ($global:brickDeployTestCommands.Count -eq 0) 'Forbidden subscription reached Azure.'
    foreach ($alreadyDeployed in @($false, $true)) {
        if ($alreadyDeployed) { [IO.File]::WriteAllText($secretsPath, "SUPABASE_URL=https://project.example.test`nSUPABASE_PUBLISHABLE_KEY=public-test-key`nSUPABASE_SECRET_KEY=server-test-key`n") }
        $global:brickDeployTestExisting = $alreadyDeployed
        $global:brickDeployTestCommands.Clear()
        & $deployScript -SecretsFile $secretsPath | Out-Null
        $actions = @($global:brickDeployTestCommands | ForEach-Object { $_[0..1] -join ' ' })
        Assert ($actions -contains 'acr build') 'Must build through Azure ACR Tasks.'
        Assert ($actions -notcontains 'account set') 'Must not change the global Azure subscription.'
        $build = @($global:brickDeployTestCommands | Where-Object { $_[0] -eq 'acr' -and $_[1] -eq 'build' })[0]
        Assert (($build -join ' ') -notmatch 'test-key') 'Build command must never contain credentials.'
        Assert ($actions -contains 'rest --method') 'New/update deployments must apply a private ARM body.'
        Assert ($actions -notcontains 'containerapp create' -and $actions -notcontains 'containerapp update') 'Do not pass managed secret values as CLI options.'
        $payload=$global:brickDeployTestPayloads[$global:brickDeployTestPayloads.Count-1]
        Assert (!(Test-Path -LiteralPath $payload.path)) 'Private request file must be removed after the operation.'
        Assert ($payload.body.identity.type -eq 'UserAssigned') 'Private image pulls need managed identity.'
        Assert ($payload.body.properties.configuration.registries[0].identity -eq '/subscriptions/test/identities/pull') 'Image pull identity differs.'
        Assert (($payload.body.properties.template.containers[0].env | Where-Object name -eq 'SUPABASE_SERVICE_ROLE_KEY').secretRef -eq 'supabase-service') 'Service key must remain a secret reference.'
        Assert ($global:brickDeployTestReceipt -notmatch 'test-key') 'Receipt must never contain credentials.'
        Assert (($global:brickDeployTestReceipt | ConvertFrom-Json).apiUrl -eq 'https://api.example.test') 'Receipt must identify the deployed API.'
    }
    $global:brickDeployTestCommands.Clear(); $global:brickDeployTestSchemaMissing=$true; $rejected=$false
    try { & $deployScript -SecretsFile $secretsPath | Out-Null } catch { $rejected=$_.Exception.Message -match 'pending game migrations' }
    Assert $rejected 'Missing schema must stop deployment.'
    Assert (@($global:brickDeployTestCommands | Where-Object {$_[0] -eq 'acr'}).Count -eq 0) 'Missing schema must not build an image.'
    $global:brickDeployTestSchemaMissing=$false
    [IO.File]::AppendAllText($secretsPath,"PLAY_METRICS_ENABLED=true`n"); $global:brickDeployTestCommands.Clear(); $rejected=$false
    try { & $deployScript -SecretsFile $secretsPath | Out-Null } catch { $rejected=$_.Exception.Message -match 'successful retention worker' }
    Assert $rejected 'Collection must not enable without recently verified retention.'
    Assert (@($global:brickDeployTestCommands | Where-Object {$_[0] -eq 'acr'}).Count -eq 0) 'Failed retention gate must precede the image build.'
    [IO.File]::WriteAllText($secretsPath,"SUPABASE_URL=https://project.example.test`nSUPABASE_ANON_KEY=public-test-key`nSUPABASE_SERVICE_ROLE_KEY=server-test-key`n")
    $global:brickDeployTestArmFailure=$true; $rejected=$false
    try { & $deployScript -SecretsFile $secretsPath | Out-Null } catch { Assert ($_.Exception.Message -notmatch 'private-server-test-key') 'Never print a private CLI diagnostic.'; $rejected=$_.Exception.Message -match 'Azure CLI operation failed' }
    Assert $rejected 'A failed ARM update cannot be claimed successful.'
    Assert (!(Test-Path -LiteralPath $global:brickDeployTestPayloads[$global:brickDeployTestPayloads.Count-1].path)) 'Failed updates must also remove their private request file.'
    Write-Output 'Deployment orchestration passed: plan only, forbidden subscription, explicit subscription, create/update ARM bodies, schema/retention gates, managed identity, no keys in process/build/receipt, temporary cleanup on success/failure.'
} finally { Remove-Item -LiteralPath $secretsPath }
