#requires -Version 7.2
[CmdletBinding()]
param([switch]$Plan,[string]$SubscriptionId='cb69a440-eed5-4854-a89b-588dc241fc68',[string]$ResourceGroup='rg-brick-breaker-api-cin',[string]$JobName='caj-brick-breaker-recovery',[string]$RuleName='brick-breaker-recovery-failed')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'azure-cli.ps1')
. (Join-Path $PSScriptRoot 'azure-profile.ps1')
if($SubscriptionId -eq 'acd1c944-4dfe-4258-aeba-87356ecf6b2e'){throw 'Sigzio Dev is explicitly excluded from this deployment.'}
$account=Invoke-Azure -Arguments @('account','show')
if($account.state -ne 'Enabled'){throw 'The selected subscription is not enabled.'}
$job=Invoke-Azure -Arguments @('containerapp','job','show','--name',$JobName,'--resource-group',$ResourceGroup)
$metrics=@(Invoke-Azure -Arguments @('monitor','metrics','list-definitions','--resource',$job.id))
$resources=@(Invoke-Azure -Arguments @('resource','list','--resource-group',$ResourceGroup));$existing=$null
$resourceId="/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.Insights/metricAlerts/$RuleName"
$url="https://management.azure.com${resourceId}?api-version=2018-03-01"
if($resources.Where({$_.type -eq 'Microsoft.Insights/metricAlerts' -and $_.name -eq $RuleName})){$existing=Invoke-Azure -Arguments @('rest','--method','get','--url',$url)}
$payload=New-RecoveryFailureAlert -Job $job -MetricDefinitions $metrics -ExistingRule $existing
if($Plan){[ordered]@{subscription=$account.name;subscriptionId=$account.id;rule=$RuleName;job=$JobName;metric='Executions';dimension='state=Failed';threshold='Maximum > 0';evaluation='PT1M';window='PT5M';notificationActions=@($payload.properties.actions).Count;monitorsMissingExecutions=$false} | ConvertTo-Json;return}
$root=Split-Path $PSScriptRoot -Parent
if(& git -C $root status --porcelain --untracked-files=normal -- scripts/deploy-recovery-monitor.ps1 scripts/azure-cli.ps1 scripts/azure-profile.ps1){throw 'Commit the monitoring scripts before deployment.'}
Invoke-Azure -Arguments @('provider','register','--namespace','Microsoft.Insights','--wait') | Out-Null
Invoke-AzurePayload -Url $url -Payload $payload | Out-Null
$actual=Invoke-Azure -Arguments @('rest','--method','get','--url',$url)
if(!$actual.properties.enabled -or $actual.properties.scopes[0] -ne $job.id -or $actual.properties.criteria.allOf[0].metricName -ne 'Executions' -or $actual.properties.criteria.allOf[0].dimensions[0].values[0] -ne 'Failed'){throw 'The alert configuration could not be verified after deployment.'}
$receipt=[ordered]@{resourceId=$resourceId;job=$JobName;enabled=$true;notificationActions=@($actual.properties.actions).Count;monitorsMissingExecutions=$false;failureDeliveryTested=$false;checkedAt=[DateTimeOffset]::UtcNow.ToString('o')}
$directory=Join-Path $root '.openai/local';New-Item -ItemType Directory -Path $directory -Force | Out-Null
$receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'azure-recovery-monitor.json') -Encoding utf8
$receipt | ConvertTo-Json
