#requires -Version 7.2
$ErrorActionPreference='Stop'
function Assert($value,$message){if(!$value){throw $message}}
$global:brickMonitorBody=$null;$global:brickMonitorExisting=$null;$global:brickMonitorPuts=0;$global:brickMonitorBadMetric=$false
$global:brickMonitorRegistrations=0
$subscription='cb69a440-eed5-4854-a89b-588dc241fc68';$jobId="/subscriptions/$subscription/resourceGroups/rg-brick-breaker-api-cin/providers/Microsoft.App/jobs/caj-brick-breaker-recovery"
function git{$global:LASTEXITCODE=0}
function New-Item{param($ItemType,$Path,[switch]$Force)}
function Set-Content{param([Parameter(ValueFromPipeline)]$Value,$LiteralPath,$Encoding)process{}}
function az{
 $a=[string[]]$args;$global:LASTEXITCODE=0;$at=[array]::IndexOf($a,'--subscription');Assert ($at -ge 0 -and $a[$at+1] -eq $subscription) 'Monitor commands need explicit subscription.'
 switch($a[0..1] -join ' '){
 'account show'{@{name='SpeedInno Org Subscription';id=$subscription;state='Enabled'} | ConvertTo-Json}
 'provider register'{$global:brickMonitorRegistrations++;'{}'}
 'containerapp job'{@{id=$jobId;location='centralindia';tags=@{application='brick-breaker'}} | ConvertTo-Json}
 'monitor metrics'{@(@{name=@{value='Executions'};namespace='Microsoft.App/jobs';unit='Count';supportedAggregationTypes=@('Total');dimensions=if($global:brickMonitorBadMetric){@()}else{@(@{value='state'})}}) | ConvertTo-Json -Depth 10 -AsArray}
 'resource list'{if($global:brickMonitorExisting){@(@{type='Microsoft.Insights/metricAlerts';name='brick-breaker-recovery-failed'}) | ConvertTo-Json -AsArray}else{'[]'}}
 'rest --method'{
  if($a -contains 'put'){$global:brickMonitorPuts++;$i=[array]::IndexOf($a,'--body');$global:brickMonitorBody=[IO.File]::ReadAllText($a[$i+1].Substring(1)) | ConvertFrom-Json;'{}'}
  else{if($global:brickMonitorBody){$global:brickMonitorBody | ConvertTo-Json -Depth 40}else{$global:brickMonitorExisting | ConvertTo-Json -Depth 40}}
 }
 default{throw 'Unexpected monitor command'}
 }
}
$script=Join-Path $PSScriptRoot '../scripts/deploy-recovery-monitor.ps1'
$plan=& $script -Plan | ConvertFrom-Json;Assert ($global:brickMonitorPuts -eq 0 -and $global:brickMonitorRegistrations -eq 0 -and $plan.notificationActions -eq 0 -and !$plan.monitorsMissingExecutions) 'Plan must not mutate or invent notification/absence coverage.'
$receipt=& $script | ConvertFrom-Json;Assert ($global:brickMonitorPuts -eq 1 -and $global:brickMonitorRegistrations -eq 2 -and $receipt.enabled -and $receipt.notificationActions -eq 0 -and !$receipt.failureDeliveryTested) 'New alert must register its required provider without contact actions or fake tested delivery.'
Assert ($global:brickMonitorBody.properties.criteria.allOf[0].dimensions[0].values[0] -eq 'Failed') 'Only failed executions satisfy the condition.'
Assert ($global:brickMonitorBody.properties.criteria.allOf[0].timeAggregation -eq 'Total' -and $global:brickMonitorBody.properties.scopes[0] -ceq $jobId.ToLowerInvariant()) 'Use summed execution counts and a canonical resource scope.'
Assert ($global:brickMonitorBody.properties.windowSize -eq 'PT15M') 'Failure observation must allow for metric ingestion latency.'
$global:brickMonitorExisting=$global:brickMonitorBody;$global:brickMonitorExisting.properties.actions=@(@{actionGroupId='/existing/operator-selected-group'});$global:brickMonitorExisting.tags | Add-Member -NotePropertyName owner -NotePropertyValue 'keep-owner';$global:brickMonitorBody=$null
$receipt=& $script | ConvertFrom-Json;Assert ($receipt.notificationActions -eq 1 -and $global:brickMonitorBody.tags.owner -eq 'keep-owner') 'Updating a configured rule must preserve its operator-selected actions and owner.'
$global:brickMonitorBadMetric=$true;$count=$global:brickMonitorPuts;$failed=$false;try{& $script | Out-Null}catch{$failed=$_.Exception.Message -match 'metric schema differs'};Assert ($failed -and $global:brickMonitorPuts -eq $count) 'Do not install a metric that the actual resource does not expose.'
Write-Output 'Recovery monitor checks passed: read-only plan, observed metric gate, exact scope, no invented notification delivery and preserved operator actions.'
