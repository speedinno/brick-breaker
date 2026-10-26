#requires -Version 7.2
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../scripts/azure-profile.ps1')
function Assert($value,$message) { if (!$value) { throw $message } }
function Reject($work,$pattern) { $rejected=$false; try { & $work | Out-Null } catch { $rejected=$_.Exception.Message -match $pattern }; Assert $rejected "Expected rejection: $pattern" }
$settings=@{SUPABASE_URL='https://fixture.example';SUPABASE_ANON_KEY='public-fixture';SUPABASE_SERVICE_ROLE_KEY='private-fixture';ALLOWED_ORIGINS='https://localhost,capacitor://localhost'}
$arguments=@{AppName='game-api';Location='centralindia';Image='registry.example/game:commit';EnvironmentId='/environments/game';IdentityId='/identities/pull';RegistryServer='registry.example'}
$fresh=New-ApiAzurePayload -Settings $settings @arguments
$envMap=@{}; foreach ($item in $fresh.properties.template.containers[0].env) {$envMap[$item.name]=$item}
Assert ($envMap.PLAY_METRICS_ENABLED.value -eq 'false') 'Collection must default off.'
Assert ($envMap.MONETIZATION_ENVIRONMENT.value -eq 'production') 'New deployment must explicitly resolve its default environment.'
Assert ($envMap.SUPABASE_SERVICE_ROLE_KEY.secretRef -eq 'supabase-service') 'Private values belong in secret references.'
Assert (($fresh.properties.template.containers[0].env | ConvertTo-Json) -notmatch 'private-fixture') 'No plaintext private key in container env.'
Assert ($fresh.properties.template.scale.minReplicas -eq 0 -and $fresh.properties.template.scale.maxReplicas -eq 2) 'Replica policy differs.'
Assert ($fresh.identity.userAssignedIdentities.ContainsKey('/identities/pull')) 'Registry identity missing.'
Assert ($fresh.properties.template.containers[0].probes.Count -eq 2) 'New app needs process startup/readiness probes.'

$existing=@{identity=@{type='SystemAssigned, UserAssigned';userAssignedIdentities=@{'/identities/old'=@{clientId='readonly'}}};tags=@{owner='fixture'};properties=@{configuration=@{activeRevisionsMode='Single';runtime=$null;revisionTransitionThreshold=$null;targetLabel='';ingress=@{fqdn='read-only.example';customDomains=$null;exposedPort=0;external=$true;targetPort=8000;transport='Http';traffic=@(@{latestRevision=$true;weight=100})};secrets=@(@{name='old-provider'},@{name='extra-secret'});registries=@()};template=@{revisionSuffix='old-revision';containers=@(@{name='existing-name';imageType='ContainerImage';image='old-image';env=@(@{name='EXTRA';secretRef='extra-secret'},@{name='REVENUECAT_SECRET_KEY';secretRef='old-provider'});resources=@{cpu=0.5;memory='1Gi'}});scale=@{rules=@(@{name='manual-rule'})}}}} | ConvertTo-Json -Depth 40 | ConvertFrom-Json
$oldSecrets=@(@{name='old-provider';value='keep-provider-secret'},@{name='extra-secret';value='keep-unmanaged-secret'}) | ConvertTo-Json | ConvertFrom-Json
$updated=New-ApiAzurePayload -Settings $settings -ExistingResource $existing -ExistingSecrets $oldSecrets @arguments
Assert ($updated.tags.owner -eq 'fixture') 'Preserve existing ownership tags.'
Assert ($updated.properties.template.containers[0].name -eq 'existing-name') 'Preserve actual container identity.'
Assert ($updated.identity.userAssignedIdentities.ContainsKey('/identities/old')) 'Preserve existing managed identity.'
Assert ($updated.identity.type -match 'SystemAssigned') 'Do not remove the existing system identity.'
Assert (!$updated.properties.configuration.ingress.ContainsKey('fqdn')) 'Read-only ingress fields cannot be written.'
Assert ($updated.properties.configuration.ingress.transport -eq 'http') 'CLI response transport casing must be normalized for ARM input.'
Assert (!$updated.properties.configuration.ingress.ContainsKey('exposedPort') -and !$updated.properties.configuration.ContainsKey('targetLabel')) 'Empty response-only fields must not enter the update.'
Assert (($updated | ConvertTo-Json -Depth 40) -notmatch ':\s*null') 'Optional response nulls must be omitted from ARM input.'
Assert ($updated.properties.environmentId -eq '/environments/game') 'Use the current environment resource field.'
Assert ($updated.properties.configuration.ingress.traffic[0].weight -eq 100) 'Existing traffic must survive.'
Assert (($updated.properties.configuration.secrets | Where-Object name -eq 'old-provider').value -eq 'keep-provider-secret') 'Missing file values must not erase recovery credentials.'
Assert (($updated.properties.template.containers[0].env | Where-Object name -eq 'EXTRA').secretRef -eq 'extra-secret') 'Preserve unmanaged environment settings.'
Assert (!$updated.properties.template.containers[0].ContainsKey('imageType')) 'Response-only image metadata cannot be sent as a runtime setting.'
Assert (!$updated.properties.template.ContainsKey('revisionSuffix')) 'A new image must not reuse an immutable old revision suffix.'
Reject { New-ApiAzurePayload -Settings $settings -ExistingResource $existing @arguments } 'inventory is incomplete'

$configured=$settings.Clone();$configured.MONETIZATION_ENVIRONMENT='sandbox';$configured.REVENUECAT_CONFIG_JSON='{"environment":"production"}'
Reject { New-ApiAzurePayload -Settings $configured @arguments } 'environment differs'
$configured.REVENUECAT_CONFIG_JSON='{"environment":"sandbox"}'
Reject { New-ApiAzurePayload -Settings $configured @arguments } 'server key and webhook'
$configured.REVENUECAT_SECRET_KEY='fixture-key';$configured.REVENUECAT_WEBHOOK_AUTH='x'*32;$configured.PLAY_METRICS_ENABLED='maybe'
Reject { New-ApiAzurePayload -Settings $configured @arguments } 'true or false'
$configured.PLAY_METRICS_ENABLED='false';$configured.CLOUDFLARE_API_TOKEN='MUST-NOT-DEPLOY';$configured.RESEND_API_KEY='MUST-NOT-DEPLOY';$configured.SUPABASE_ACCESS_TOKEN='MUST-NOT-DEPLOY';$configured.PRIVACY_REVENUECAT_KEYS_JSON='[{"projectId":"proj_test","environment":"sandbox","apiKey":"private-cleanup-key"}]'
$api=New-ApiAzurePayload -Settings $configured @arguments
Assert (($api | ConvertTo-Json -Depth 40) -notmatch 'MUST-NOT-DEPLOY|private-cleanup-key') 'Unrelated/deletion-only credentials must not reach the API.'
$workerArgs=$arguments.Clone();$workerArgs.Remove('AppName');$worker=New-WorkerAzurePayload -Settings $configured @workerArgs
$workerJson=$worker | ConvertTo-Json -Depth 40
Assert ($worker.properties.configuration.triggerType -eq 'Manual') 'Initial worker must be reviewable before scheduling.'
Assert ($workerJson -notmatch 'MUST-NOT-DEPLOY|fixture-key|public-fixture') 'Worker must not receive unrelated/public/billing-verifier credentials.'
Assert ($workerJson -match 'private-cleanup-key') 'Cleanup keyring missing from private worker secrets.'
Assert (($worker.properties.template.containers[0].env | Where-Object name -eq 'OPERATIONS_ENV_ONLY').value -eq 'true') 'Cloud worker must not read a local credentials file.'
Assert ($worker.properties.template.containers[0].command[0] -eq 'deno' -and $worker.properties.template.containers[0].args -contains 'scripts/run-operations.mjs') 'Worker entry point differs.'
Assert ($worker.properties.configuration.replicaTimeout -eq 240 -and $worker.properties.template.containers[0].resources.cpu -eq 0.25) 'Bounded worker resource profile differs.'
$scheduled=New-WorkerAzurePayload -Settings $configured -Scheduled @workerArgs
Assert ($scheduled.properties.configuration.scheduleTriggerConfig.cronExpression -eq '*/5 * * * *') 'Schedule must use the intended UTC interval.'
$oldWorker=$scheduled | ConvertTo-Json -Depth 40 | ConvertFrom-Json
$oldWorker.tags | Add-Member -NotePropertyName owner -NotePropertyValue 'preserve-worker-owner'
$oldWorker.identity.type='SystemAssigned, UserAssigned'
$oldWorker.identity.userAssignedIdentities | Add-Member -NotePropertyName '/identities/extra-worker' -NotePropertyValue @{}
$oldWorker.properties.configuration.scheduleTriggerConfig.cronExpression='*/10 * * * *'
$oldWorker.properties.template.containers[0].env+=@(@{name='REVENUECAT_SECRET_KEY';value='remove-unneeded-billing-key'},@{name='RESEND_API_KEY';value='remove-unneeded-mail-key'},@{name='UNMANAGED_WORKER_SETTING';value='preserve-owner-setting'})
$workerUpdate=New-WorkerAzurePayload -Settings $configured -ExistingResource $oldWorker -ExistingSecrets $oldWorker.properties.configuration.secrets -Scheduled @workerArgs
Assert ($workerUpdate.tags.owner -eq 'preserve-worker-owner' -and $workerUpdate.identity.type -match 'SystemAssigned' -and $workerUpdate.identity.userAssignedIdentities.ContainsKey('/identities/extra-worker')) 'Worker updates must preserve ownership and managed identities.'
Assert ($workerUpdate.properties.configuration.scheduleTriggerConfig.cronExpression -eq '*/10 * * * *') 'Updating an existing scheduled job must preserve its cron.'
Assert (($workerUpdate.properties.template.containers[0].env | ConvertTo-Json) -notmatch 'remove-unneeded') 'Known billing/mail settings must not survive in the worker environment.'
Assert (($workerUpdate.properties.template.containers[0].env | Where-Object name -eq UNMANAGED_WORKER_SETTING).value -eq 'preserve-owner-setting') 'Unmanaged worker settings must survive.'
$oldWorker.properties.template.containers[0].command=@('custom-command')
Reject { New-WorkerAzurePayload -Settings $configured -ExistingResource $oldWorker -ExistingSecrets $oldWorker.properties.configuration.secrets @workerArgs } 'custom worker command'
$configured.PRIVACY_REVENUECAT_KEYS_JSON='[{"projectId":"proj_test","environment":"production","apiKey":"private-cleanup-key"}]'
Reject { New-WorkerAzurePayload -Settings $configured @workerArgs } 'differs from this environment'
Write-Output 'Azure payload checks passed: new/update, retention, provider environments, secret references/isolation, worker mode and bounded schedule.'
