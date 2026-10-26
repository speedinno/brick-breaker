#requires -Version 7.2
[CmdletBinding()]
param(
    [switch]$Plan,
    [switch]$ActivateSchedule,
    [string]$SubscriptionId='cb69a440-eed5-4854-a89b-588dc241fc68',
    [string]$ResourceGroup='rg-brick-breaker-api-cin',
    [string]$AppName='ca-brick-breaker-api',
    [string]$JobName='caj-brick-breaker-recovery',
    [string]$SecretsFile=(Join-Path $PSScriptRoot '../.env.api')
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'azure-cli.ps1')
. (Join-Path $PSScriptRoot 'azure-profile.ps1')
$repoRoot=Split-Path $PSScriptRoot -Parent
$azureApiVersion='2026-07-01'
if($SubscriptionId -eq 'acd1c944-4dfe-4258-aeba-87356ecf6b2e'){throw 'Sigzio Dev is explicitly excluded from this deployment.'}
$account=Invoke-Azure -Arguments @('account','show')
if($account.state -ne 'Enabled'){throw 'The selected subscription is not enabled.'}
$group=Invoke-Azure -Arguments @('group','show','--name',$ResourceGroup)
if($group.tags.application -ne 'brick-breaker'){throw 'The resource group belongs to another application.'}
$api=Invoke-Azure -Arguments @('containerapp','show','--name',$AppName,'--resource-group',$ResourceGroup)
if($api.tags.application -ne 'brick-breaker' -or @($api.properties.template.containers).Count -ne 1){throw 'The selected app is not the dedicated game API.'}
if($api.properties.provisioningState -ne 'Succeeded' -or ($api.properties.latestRevisionName -and $api.properties.latestRevisionName -ne $api.properties.latestReadyRevisionName)){throw 'The API image rollout is not ready; do not copy a pending image into recovery.'}
$container=$api.properties.template.containers[0];$image=$container.image
if($image -notmatch '^(?<registry>[a-z0-9]+\.azurecr\.io)/brick-breaker-api:(?<source>[a-f0-9]{12})-[0-9]{14}$'){throw 'The API does not use a source-tagged game image.'}
$registry=$Matches.registry;$source=$Matches.source
$tag=$image.Split(':')[-1]
$artifact=Invoke-Azure -Arguments @('acr','repository','show','--name',$registry.Split('.')[0],'--image',"brick-breaker-api:$tag")
if($artifact.digest -notmatch '^sha256:[a-f0-9]{64}$'){throw 'The current API image digest could not be verified.'}
$image="$registry/brick-breaker-api@$($artifact.digest)"
& git -C $repoRoot cat-file -e "${source}^{commit}"
if($LASTEXITCODE -ne 0){throw 'The deployed image source is not available in this checkout.'}
$environmentId=$api.properties.environmentId
if(!$environmentId){$environmentId=$api.properties.managedEnvironmentId}
$pull=@($api.properties.configuration.registries | Where-Object server -eq $registry)
if(!$environmentId -or $pull.Count -ne 1 -or !$pull[0].identity -or $pull[0].identity -eq 'system'){throw 'A verified environment and registry pull identity are required.'}
$identityId=$pull[0].identity
$resources=@(Invoke-Azure -Arguments @('resource','list','--resource-group',$ResourceGroup))
$existing=$null;$existingSecrets=@()
if($resources.Where({$_.type -eq 'Microsoft.App/jobs' -and $_.name -eq $JobName})){
 $existing=Invoke-Azure -Arguments @('containerapp','job','show','--name',$JobName,'--resource-group',$ResourceGroup)
 if($existing.tags.application -ne 'brick-breaker'){throw 'The target job belongs to another application.'}
}
$alreadyScheduled=$existing.properties.configuration.triggerType -eq 'Schedule'
if($Plan){[ordered]@{subscription=$account.name;subscriptionId=$account.id;resourceGroup=$ResourceGroup;job=$JobName;image=$image;source=$source;environmentId=$environmentId;currentTrigger=if($existing){$existing.properties.configuration.triggerType}else{'absent'};targetTrigger=if($alreadyScheduled -or $ActivateSchedule){'Schedule'}else{'Manual'};schedule=if($alreadyScheduled){$existing.properties.configuration.scheduleTriggerConfig.cronExpression}else{'*/5 * * * *'};cpu=0.25;memory='0.5Gi';timeoutSeconds=240;retryLimit=1;build='reuse the deployed API image';verification='one real execution plus advancing database heartbeats before new schedule activation'} | ConvertTo-Json;return}
$dirty=& git -C $repoRoot status --porcelain --untracked-files=normal -- scripts/deploy-operations.ps1 scripts/azure-cli.ps1 scripts/azure-profile.ps1
if($dirty){throw 'Commit deployment scripts before changing the worker.'}
if(!(Test-Path -LiteralPath $SecretsFile -PathType Leaf)){throw 'Missing ignored server configuration file.'}
$settings=@{}
foreach($line in Get-Content -LiteralPath $SecretsFile){
 if($line -match '^\s*(#|$)'){continue}
 if($line -notmatch '^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$'){throw 'Invalid server configuration line.'}
 $name=$Matches[1];$value=$Matches[2].Trim();if($value.Length -ge 2 -and $value[0] -in @([char]39,[char]34) -and $value[-1] -eq $value[0]){$value=$value.Substring(1,$value.Length-2)};$settings[$name]=$value
}
if(!$settings.SUPABASE_SERVICE_ROLE_KEY){$settings.SUPABASE_SERVICE_ROLE_KEY=$settings.SUPABASE_SECRET_KEY}
$apiVars=@($container.env);$apiDatabase=($apiVars | Where-Object name -eq 'SUPABASE_URL').value;$apiEnvironment=($apiVars | Where-Object name -eq 'MONETIZATION_ENVIRONMENT').value
if(!$settings.SUPABASE_URL -or !$apiDatabase -or $settings.SUPABASE_URL.TrimEnd('/') -ne $apiDatabase.TrimEnd('/') -or $apiEnvironment -notin @('production','sandbox')){throw 'Worker database/environment must match the deployed API.'}
if($settings.MONETIZATION_ENVIRONMENT -and $settings.MONETIZATION_ENVIRONMENT -ne $apiEnvironment){throw 'Worker environment differs from the deployed API.'}
$settings.MONETIZATION_ENVIRONMENT=$apiEnvironment
if(!$settings.SUPABASE_SERVICE_ROLE_KEY){throw 'Missing private database credential.'}
$database=[uri]$settings.SUPABASE_URL
if($database.Scheme -ne 'https' -or $database.UserInfo -or $database.Query -or $database.Fragment -or $database.AbsolutePath -ne '/'){throw 'Invalid worker database origin.'}
function Get-RecoveryStatus {
 try{
  $response=Invoke-WebRequest -Uri ($database.AbsoluteUri.TrimEnd('/')+'/rest/v1/rpc/game_operation_status') -Method Post -ContentType 'application/json' -Body '{}' -Headers @{apikey=$settings.SUPABASE_SERVICE_ROLE_KEY;Authorization="Bearer $($settings.SUPABASE_SERVICE_ROLE_KEY)"} -UserAgent 'brick-breaker-operations-deployment/1.0' -SkipHttpErrorCheck -TimeoutSec 20
  if($response.StatusCode -ne 200){throw 'Status unavailable'}
  $status=$response.Content | ConvertFrom-Json -ErrorAction Stop
  if($status.jobs -isnot [array]){throw 'Status shape differs'}
  return $status
 }catch{throw 'Private recovery status is unavailable. No execution success is assumed.'}
}
$before=Get-RecoveryStatus
if($existing){$existingSecrets=@(Invoke-Azure -Arguments @('containerapp','job','secret','list','--name',$JobName,'--resource-group',$ResourceGroup,'--show-values'))}
$payloadArgs=@{Settings=$settings;ExistingResource=$existing;ExistingSecrets=$existingSecrets;Location=$api.location;Image=$image;EnvironmentId=$environmentId;IdentityId=$identityId;RegistryServer=$registry}
$payload=New-WorkerAzurePayload @payloadArgs -Scheduled:$alreadyScheduled
$resourceId="/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.App/jobs/$JobName"
Invoke-AzurePayload -Url "https://management.azure.com${resourceId}?api-version=$azureApiVersion" -Payload $payload | Out-Null
function Wait-RecoveryProvisioning {
 for($attempt=0;$attempt -lt 24;$attempt++){
  $job=Invoke-Azure -Arguments @('containerapp','job','show','--name',$JobName,'--resource-group',$ResourceGroup)
  if($job.properties.provisioningState -eq 'Succeeded'){return $job}
  if($job.properties.provisioningState -in @('Failed','Canceled')){throw 'Recovery resource provisioning failed.'}
  Start-Sleep -Seconds 5
 }
 throw 'Recovery provisioning is still pending. Inspect the existing job before retrying.'
}
$null=Wait-RecoveryProvisioning
$started=[DateTimeOffset]::UtcNow
$execution=Invoke-Azure -Arguments @('containerapp','job','start','--name',$JobName,'--resource-group',$ResourceGroup)
if(!$execution.name){throw 'Azure did not return a recovery execution handle. Inspect executions; do not start a duplicate blindly.'}
$executionName=$execution.name;$completed=$false
Write-Host "Verifying recovery execution: $executionName"
for($attempt=0;$attempt -lt 60;$attempt++){
 $run=Invoke-Azure -Arguments @('containerapp','job','execution','show','--name',$JobName,'--resource-group',$ResourceGroup,'--job-execution-name',$executionName)
 if($run.properties.status -eq 'Succeeded'){$completed=$true;break}
 if($run.properties.status -in @('Failed','Stopped','Canceled')){throw "Recovery execution did not succeed: $executionName. Inspect its safe logs and retained database status."}
 Start-Sleep -Seconds 5
}
if(!$completed){throw "Recovery execution is still pending: $executionName. Poll this handle before retrying."}
if(@($run.properties.template.containers).Count -ne 1 -or $run.properties.template.containers[0].image -ne $image){throw 'Completed execution does not prove the requested image.'}
$after=Get-RecoveryStatus
foreach($kind in @('ad_reconcile','metrics_prune')){
 $key=Get-AzureOperationKey -Kind $kind -DatabaseUrl $settings.SUPABASE_URL -Environment $apiEnvironment;$previous=@($before.jobs | Where-Object key -eq $key)
 $oldSuccess=if($previous.Count -and $previous[0].lastSuccessAt){Convert-AzureTimestamp $previous[0].lastSuccessAt}else{[DateTimeOffset]::MinValue}
 $advanced=@($after.jobs | Where-Object {$_.key -eq $key -and $_.kind -eq $kind -and $_.lastSuccessAt -and (Convert-AzureTimestamp $_.lastSuccessAt) -ge $started -and (Convert-AzureTimestamp $_.lastSuccessAt) -gt $oldSuccess -and $_.outcome -eq 'success'})
 if(!$advanced.Count){throw 'The successful execution did not advance both maintenance heartbeats.'}
}
if($ActivateSchedule -and !$alreadyScheduled){
 $payload=New-WorkerAzurePayload @payloadArgs -Scheduled
 Invoke-AzurePayload -Url "https://management.azure.com${resourceId}?api-version=$azureApiVersion" -Payload $payload | Out-Null
}
$final=Wait-RecoveryProvisioning
$receipt=[ordered]@{job=$JobName;resourceId=$resourceId;subscriptionId=$account.id;image=$image;source=$source;execution=$executionName;executionStatus=$run.properties.status;trigger=$final.properties.configuration.triggerType;schedule=$final.properties.configuration.scheduleTriggerConfig.cronExpression;maintenanceHeartbeatsAdvanced=$true;checkedAt=[DateTimeOffset]::UtcNow.ToString('o');automaticScheduleObserved=$false;notificationsConfigured=$false}
$directory=Join-Path $repoRoot '.openai/local';New-Item -ItemType Directory -Path $directory -Force | Out-Null
$receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'azure-operations-deployment.json') -Encoding utf8
$receipt | ConvertTo-Json
