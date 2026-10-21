#requires -Version 7.2
# Exercise the real deployment script without network calls or Azure changes.
$ErrorActionPreference = 'Stop'
$global:brickDeployTestCommands = [Collections.Generic.List[object]]::new()
$global:brickDeployTestExisting = $false
$global:brickDeployTestReceipt = ''
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
        'containerapp show' { @{ properties = @{ configuration = @{ ingress = @{ fqdn = 'api.example.test' } } } } | ConvertTo-Json -Depth 8 }
        default { '{}' }
    }
}
function Invoke-WebRequest {
    param($Uri, $Headers, $Method, $ContentType, $Body, $UserAgent, [switch]$SkipHttpErrorCheck, $TimeoutSec)
    if ($Uri -like 'https://project.example.test/*') { Assert ($UserAgent -eq 'brick-breaker-deployment/1.0') 'Secret-key checks must identify a server, not a browser.'; return @{ StatusCode = 200 } }
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
        if ($alreadyDeployed) {
            Assert ($actions -contains 'containerapp update') 'Existing apps must update.'
            Assert ($actions -notcontains 'containerapp create') 'Must not recreate an existing app.'
        } else {
            Assert ($actions -contains 'containerapp create') 'First deployment must create an app.'
            $create = @($global:brickDeployTestCommands | Where-Object { $_[0] -eq 'containerapp' -and $_[1] -eq 'create' })[0]
            Assert ($create -contains '--registry-identity' -and $create -contains '--user-assigned') 'Private image pulls need managed identity.'
        }
        Assert ($global:brickDeployTestReceipt -notmatch 'test-key') 'Receipt must never contain credentials.'
        Assert (($global:brickDeployTestReceipt | ConvertFrom-Json).apiUrl -eq 'https://api.example.test') 'Receipt must identify the deployed API.'
    }
    Write-Output 'Deployment orchestration passed: plan only, forbidden subscription, explicit subscription on every operation, first deploy/redeploy, managed identity, no keys in build/receipt.'
} finally { Remove-Item -LiteralPath $secretsPath }
