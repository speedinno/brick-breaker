#requires -Version 7.2
$ErrorActionPreference='Stop'
$global:brickWorkerCommands=[Collections.Generic.List[object]]::new()
$global:brickWorkerBodies=[Collections.Generic.List[object]]::new()
$global:brickWorkerExisting=$null;$global:brickWorkerLastPayload=$null
$global:brickWorkerFailedRun=$false;$global:brickWorkerAdvance=$true;$global:brickWorkerStatusCalls=0;$global:brickWorkerArmFailure=$false
$subscription='cb69a440-eed5-4854-a89b-588dc241fc68'
function Assert($condition,[string]$message){if(!$condition){throw $message}}
function git{$global:LASTEXITCODE=0}
function Start-Sleep{param($Seconds)}
function New-Item{param($ItemType,$Path,[switch]$Force)}
function Set-Content{param([Parameter(ValueFromPipeline)]$Value,$LiteralPath,$Encoding)process{}}
function az{
 $a=[string[]]$args;$global:brickWorkerCommands.Add($a);$i=[array]::IndexOf($a,'--subscription');Assert ($i -ge 0 -and $a[$i+1] -eq $subscription) 'Every worker command must select SpeedInno Org.'
 Assert (($a -join ' ') -notmatch 'worker-private-fixture') 'No key may be an Azure process argument.'
 $global:LASTEXITCODE=0
 switch($a[0..1] -join ' '){
  'account show'{@{name='SpeedInno Org Subscription';id=$subscription;state='Enabled'} | ConvertTo-Json}
  'group show'{@{tags=@{application='brick-breaker'}} | ConvertTo-Json}
  'containerapp show'{@{location='centralindia';tags=@{application='brick-breaker'};properties=@{provisioningState='Succeeded';environmentId='/environments/fixture';configuration=@{registries=@(@{server='fixture.azurecr.io';identity='/identities/pull'})};template=@{containers=@(@{image='fixture.azurecr.io/brick-breaker-api:0123456789ab-20261027000000';env=@(@{name='SUPABASE_URL';value='https://project.example.test'},@{name='MONETIZATION_ENVIRONMENT';value='production'})})}}} | ConvertTo-Json -Depth 20}
  'acr repository'{@{digest=('sha256:'+('a'*64))} | ConvertTo-Json}
  'resource list'{if($global:brickWorkerExisting){@(@{name='caj-brick-breaker-recovery';type='Microsoft.App/jobs'}) | ConvertTo-Json -AsArray}else{'[]'}}
  'rest --method'{
   $at=[array]::IndexOf($a,'--body');Assert ($at -ge 0 -and $a[$at+1].StartsWith('@')) 'Private worker values need a body file.'
   $path=$a[$at+1].Substring(1);$body=[IO.File]::ReadAllText($path) | ConvertFrom-Json;$global:brickWorkerLastPayload=$body;$global:brickWorkerBodies.Add(@{path=$path;body=$body})
   Assert (($body | ConvertTo-Json -Depth 40) -notmatch 'not-for-worker') 'Unrelated account tokens must not be in the worker.'
   if($global:brickWorkerArmFailure){$global:LASTEXITCODE=1;'private-worker-fixture-diagnostic'}else{'{}'}
  }
  'containerapp job'{
   switch($a[2]){
    'show'{$body=if($global:brickWorkerLastPayload){$global:brickWorkerLastPayload}else{$global:brickWorkerExisting};$body.properties | Add-Member -NotePropertyName provisioningState -NotePropertyValue 'Succeeded' -Force;$body | ConvertTo-Json -Depth 40}
    'start'{@{name='fixture-execution'} | ConvertTo-Json}
    'execution'{Assert ($a -contains 'fixture-execution') 'Poll the returned execution handle.';@{properties=@{status=if($global:brickWorkerFailedRun){'Failed'}else{'Succeeded'};template=@{containers=@(@{image=$global:brickWorkerLastPayload.properties.template.containers[0].image})}}} | ConvertTo-Json -Depth 20}
    'secret'{@(@{name='supabase-service';value='worker-private-fixture'}) | ConvertTo-Json -AsArray}
    default{throw 'Unexpected worker command.'}
   }
  }
  default{throw 'Unexpected Azure operation.'}
 }
}
function Invoke-WebRequest{
 param($Uri,$Headers,$Method,$ContentType,$Body,$UserAgent,[switch]$SkipHttpErrorCheck,$TimeoutSec)
 Assert ($Uri -eq 'https://project.example.test/rest/v1/rpc/game_operation_status' -and $UserAgent -eq 'brick-breaker-operations-deployment/1.0') 'Unexpected status boundary.'
 $global:brickWorkerStatusCalls++
 $jobs=@()
 if($global:brickWorkerStatusCalls -gt 1 -and $global:brickWorkerAdvance){
  $identity='[["database","https://project.example.test"],["environment","production"],["provider","internal"]]';$hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($identity))).ToLowerInvariant().Substring(0,32)
  $jobs=@('ad_reconcile','metrics_prune') | ForEach-Object {@{key="$_-$hash";kind=$_;outcome='success';lastSuccessAt=[DateTimeOffset]::UtcNow.AddSeconds(1).ToString('o')}}
 }
 @{StatusCode=200;Content=(@{jobs=@($jobs)} | ConvertTo-Json -Depth 10)}
}
function Reset-WorkerFixture{$global:brickWorkerCommands.Clear();$global:brickWorkerBodies.Clear();$global:brickWorkerLastPayload=$null;$global:brickWorkerExisting=$null;$global:brickWorkerStatusCalls=0;$global:brickWorkerFailedRun=$false;$global:brickWorkerAdvance=$true;$global:brickWorkerArmFailure=$false}
$script=Join-Path $PSScriptRoot '../scripts/deploy-operations.ps1';$path=[IO.Path]::GetTempFileName()
[IO.File]::WriteAllText($path,"SUPABASE_URL=https://project.example.test`nSUPABASE_SECRET_KEY=worker-private-fixture`nRESEND_API_KEY=not-for-worker`nSUPABASE_ACCESS_TOKEN=not-for-worker`n")
try{
 $plan=& $script -Plan | ConvertFrom-Json;Assert ($plan.targetTrigger -eq 'Manual' -and $plan.image -match '@sha256:') 'Plan must pin the actual image digest and default to manual.';Assert (!$global:brickWorkerBodies.Count) 'Plan must not mutate.'
 $count=$global:brickWorkerCommands.Count;try{& $script -Plan -SubscriptionId 'acd1c944-4dfe-4258-aeba-87356ecf6b2e' | Out-Null;throw 'Excluded subscription accepted'}catch{Assert ($_.Exception.Message -match 'Sigzio Dev') 'Excluded subscription must stop before Azure calls.'};Assert ($count -eq $global:brickWorkerCommands.Count) 'No excluded subscription call is allowed.'
 Reset-WorkerFixture;$receipt=& $script -SecretsFile $path -ActivateSchedule | ConvertFrom-Json
 Assert ($receipt.trigger -eq 'Schedule' -and $receipt.executionStatus -eq 'Succeeded' -and $receipt.maintenanceHeartbeatsAdvanced) 'A schedule needs actual execution and matching heartbeat evidence.'
 Assert ($global:brickWorkerBodies.Count -eq 2 -and $global:brickWorkerBodies[0].body.properties.configuration.triggerType -eq 'Manual' -and $global:brickWorkerBodies[1].body.properties.configuration.triggerType -eq 'Schedule') 'Stage manual verification before the schedule update.'
 Assert (!$receipt.automaticScheduleObserved -and !$receipt.notificationsConfigured) 'Manual execution is not scheduled-delivery proof.'
 foreach($item in $global:brickWorkerBodies){Assert (!(Test-Path -LiteralPath $item.path)) 'Private body file must be deleted.'}
 $scheduled=$global:brickWorkerBodies[1].body
 Reset-WorkerFixture;$global:brickWorkerExisting=$scheduled;$receipt=& $script -SecretsFile $path | ConvertFrom-Json;Assert ($receipt.trigger -eq 'Schedule' -and $global:brickWorkerBodies.Count -eq 1) 'Updating a scheduled job must not silently downgrade it.'
 foreach($scenario in @('execution','heartbeat','arm')){
  Reset-WorkerFixture;if($scenario -eq 'execution'){$global:brickWorkerFailedRun=$true};if($scenario -eq 'heartbeat'){$global:brickWorkerAdvance=$false};if($scenario -eq 'arm'){$global:brickWorkerArmFailure=$true}
  $failed=$false;try{& $script -SecretsFile $path -ActivateSchedule | Out-Null}catch{$failed=$true;Assert ($_.Exception.Message -notmatch 'worker-private-fixture') 'Private failures must be redacted.'};Assert $failed 'A failed prerequisite must stop activation.'
  Assert ($global:brickWorkerBodies.Count -eq 1 -and $global:brickWorkerBodies[0].body.properties.configuration.triggerType -eq 'Manual') 'Never enable a schedule after a failed prerequisite.'
  foreach($item in $global:brickWorkerBodies){Assert (!(Test-Path -LiteralPath $item.path)) 'Failure must remove its private body file.'}
 }
 Write-Output 'Worker deployment orchestration passed: subscription, digest, private body, execution, heartbeat, schedule preservation and activation failure gates.'
}finally{Remove-Item -LiteralPath $path}
