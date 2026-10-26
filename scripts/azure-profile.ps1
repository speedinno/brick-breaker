# Pure payload builders. Callers keep these objects in private temporary files;
# secret values must never be arguments, build output, plans or receipts.
function Remove-AzureResponseNulls {
    param($Value)
    if ($Value -is [Collections.IDictionary]) {
        foreach ($key in @($Value.Keys)) { if ($null -eq $Value[$key]) { $Value.Remove($key) } else { Remove-AzureResponseNulls $Value[$key] } }
    } elseif ($Value -is [Collections.IEnumerable] -and $Value -isnot [string]) { foreach ($item in $Value) { Remove-AzureResponseNulls $item } }
}
function New-AzureEnvironmentState {
    param([Collections.IDictionary]$Settings, $ExistingResource, [object[]]$ExistingSecrets = @(), [switch]$Worker)
    $secretMap = @{}; $variables = @{}
    foreach ($item in $ExistingSecrets) {
        if (!$item.name -or (!$item.value -and !$item.keyVaultUrl)) { throw 'Cannot preserve an existing Azure secret. Fetch its value/reference privately before deployment.' }
        $copy = @{ name = [string]$item.name }
        foreach ($field in @('value','keyVaultUrl','identity')) { if ($item.$field) { $copy[$field] = $item.$field } }
        $secretMap[$copy.name] = $copy
    }
    foreach ($item in @($ExistingResource.properties.configuration.secrets)) { if ($item -and !$secretMap.ContainsKey($item.name)) { throw 'Existing Azure secret inventory is incomplete. Deployment is stopped.' } }
    $oldContainers=@($ExistingResource.properties.template.containers)
    foreach ($item in @($oldContainers[0].env)) {
        if (!$item) { continue }; $copy = @{ name = [string]$item.name }
        if ($item.secretRef) { $copy.secretRef = $item.secretRef } else { $copy.value = [string]$item.value }
        $variables[$copy.name] = $copy
    }
    $managed = @{
        SUPABASE_SERVICE_ROLE_KEY='supabase-service'; REVENUECAT_CONFIG_JSON='revenuecat-config';
        REVENUECAT_SECRET_KEY='revenuecat-server'; REVENUECAT_WEBHOOK_AUTH='revenuecat-webhook';
        RAZORPAY_CONFIG_JSON='razorpay-config'; RAZORPAY_KEY_ID='razorpay-key-id';
        RAZORPAY_KEY_SECRET='razorpay-secret'; RAZORPAY_WEBHOOK_SECRETS_JSON='razorpay-webhooks';
        REWARDED_ADS_CONFIG_JSON='rewarded-config'
    }
    if ($Worker) {
        foreach ($name in @('REVENUECAT_CONFIG_JSON','REVENUECAT_SECRET_KEY','REVENUECAT_WEBHOOK_AUTH','REWARDED_ADS_CONFIG_JSON')) { $managed.Remove($name) }
        $managed.PRIVACY_REVENUECAT_KEYS_JSON='privacy-revenuecat-keys'
    } else { $managed.SUPABASE_ANON_KEY='supabase-public' }
    foreach ($name in $managed.Keys) {
        if ($Settings.Contains($name)) { $value=[string]$Settings[$name] }
        elseif ($variables.ContainsKey($name) -and !$variables[$name].secretRef) { $value=[string]$variables[$name].value }
        else { continue }
        if ($value) { $secretMap[$managed[$name]] = @{ name=$managed[$name]; value=$value }; $variables[$name] = @{ name=$name; secretRef=$managed[$name] } }
        else { $variables[$name] = @{ name=$name; value='' } }
    }
    $getValue = {
        param($name)
        $entry = $variables[$name]; if (!$entry) { return $null }
        if ($entry.secretRef) { return $secretMap[$entry.secretRef].value }; return $entry.value
    }
    foreach ($name in @('SUPABASE_URL','MONETIZATION_ENVIRONMENT')) {
        if ($Settings.Contains($name)) { $variables[$name] = @{ name=$name; value=[string]$Settings[$name] } }
    }
    if (!$variables.ContainsKey('MONETIZATION_ENVIRONMENT')) { $variables.MONETIZATION_ENVIRONMENT = @{name='MONETIZATION_ENVIRONMENT';value='production'} }
    $environment = & $getValue 'MONETIZATION_ENVIRONMENT'
    if ($environment -notin @('sandbox','production')) { throw 'MONETIZATION_ENVIRONMENT must be sandbox or production.' }
    if (!(& $getValue 'SUPABASE_URL') -or !(& $getValue 'SUPABASE_SERVICE_ROLE_KEY')) { throw 'Missing managed database settings.' }
    if ($Worker) { $variables.OPERATIONS_ENV_ONLY=@{name='OPERATIONS_ENV_ONLY';value='true'} }
    else {
        if (!(& $getValue 'SUPABASE_ANON_KEY')) { throw 'Missing managed public Supabase key.' }
        foreach ($name in @('ALLOWED_ORIGINS','PLAY_METRICS_ENABLED')) { if ($Settings.Contains($name)) { $variables[$name]=@{name=$name;value=[string]$Settings[$name]} } }
        if (!$variables.ContainsKey('PLAY_METRICS_ENABLED')) { $variables.PLAY_METRICS_ENABLED=@{name='PLAY_METRICS_ENABLED';value='false'} }
        if ((& $getValue 'PLAY_METRICS_ENABLED') -notin @('true','false')) { throw 'PLAY_METRICS_ENABLED must be true or false.' }
        $variables.PORT=@{name='PORT';value='8000'}
    }
    foreach ($name in @('REVENUECAT_CONFIG_JSON','RAZORPAY_CONFIG_JSON','REWARDED_ADS_CONFIG_JSON')) {
        if (!$managed.ContainsKey($name)) { continue }; $raw=& $getValue $name; if (!$raw) { continue }
        try { $parsed=$raw | ConvertFrom-Json -ErrorAction Stop } catch { throw "Invalid private JSON configuration: $name" }
        if ($parsed.environment -ne $environment) { throw "Provider environment differs from this deployment: $name" }
        if ($name -eq 'REVENUECAT_CONFIG_JSON' -and (!(& $getValue 'REVENUECAT_SECRET_KEY') -or (& $getValue 'REVENUECAT_WEBHOOK_AUTH').Length -lt 32)) { throw 'RevenueCat configuration needs its server key and webhook authentication.' }
        if ($name -eq 'RAZORPAY_CONFIG_JSON' -and (!(& $getValue 'RAZORPAY_KEY_ID') -or !(& $getValue 'RAZORPAY_KEY_SECRET') -or !(& $getValue 'RAZORPAY_WEBHOOK_SECRETS_JSON'))) { throw 'Razorpay configuration needs its matching private keys and webhook keyring.' }
    }
    if ($Worker) {
        $raw=& $getValue 'PRIVACY_REVENUECAT_KEYS_JSON'; if ($raw) {
            try { $keyring=@($raw | ConvertFrom-Json -NoEnumerate -ErrorAction Stop); if ($keyring.Count -eq 1 -and $keyring[0] -is [array]) { $keyring=@($keyring[0]) } } catch { throw 'Invalid private RevenueCat cleanup keyring.' }
            if ($keyring.Count -gt 20 -or @($keyring | Where-Object { $_.environment -ne $environment -or !$_.projectId -or !$_.apiKey }).Count) { throw 'RevenueCat cleanup keyring differs from this environment.' }
        }
    }
    foreach ($entry in $variables.Values) { if ($entry.secretRef -and !$secretMap.ContainsKey($entry.secretRef)) { throw 'An existing environment variable references an unavailable secret.' } }
    return @{ Secrets=@($secretMap.Values); Variables=@($variables.Values); Environment=$environment }
}

function New-ApiAzurePayload {
    param([Collections.IDictionary]$Settings,$ExistingResource,[object[]]$ExistingSecrets=@(),[string]$AppName,[string]$Location,[string]$Image,[string]$EnvironmentId,[string]$IdentityId,[string]$RegistryServer,[int]$MinReplicas=0)
    if ($MinReplicas -lt 0 -or $MinReplicas -gt 2) { throw 'Invalid API replica minimum.' }
    if ($ExistingResource -and @($ExistingResource.properties.template.containers).Count -ne 1) { throw 'This deployment supports the dedicated single-container API only.' }
    $state=New-AzureEnvironmentState -Settings $Settings -ExistingResource $ExistingResource -ExistingSecrets $ExistingSecrets
    $identities=@{}; foreach ($key in @($ExistingResource.identity.userAssignedIdentities.PSObject.Properties.Name)) { if ($key) { $identities[$key]=@{} } }; $identities[$IdentityId]=@{}
    $identityType=if ($ExistingResource.identity.type -match 'SystemAssigned') {'SystemAssigned, UserAssigned'} else {'UserAssigned'}
    $config=if ($ExistingResource) {$ExistingResource.properties.configuration | ConvertTo-Json -Depth 50 | ConvertFrom-Json -AsHashtable} else {@{activeRevisionsMode='Single';ingress=@{external=$true;targetPort=8000;transport='http';allowInsecure=$false}}}
    if ($config.activeRevisionsMode -ne 'Single') { throw 'This script deploys the dedicated API in Single revision mode. Review an existing canary traffic policy separately.' }
    $config.Remove('targetLabel') | Out-Null
    if ($config.ingress) {
        $config.ingress.Remove('fqdn') | Out-Null
        if ($config.ingress.transport) {$config.ingress.transport=$config.ingress.transport.ToLowerInvariant()}
        if ($config.ingress.exposedPort -eq 0) {$config.ingress.Remove('exposedPort') | Out-Null}
    }; $config.secrets=$state.Secrets
    $registries=@($config.registries | Where-Object { $_ -and $_.server -ne $RegistryServer }); $config.registries=@($registries)+@(@{server=$RegistryServer;identity=$IdentityId})
    $template=if ($ExistingResource) {$ExistingResource.properties.template | ConvertTo-Json -Depth 50 | ConvertFrom-Json -AsHashtable} else {@{containers=@(@{name=$AppName});scale=@{}}}
    $template.Remove('revisionSuffix') | Out-Null
    $container=$template.containers[0]; if ($container.command -or $container.args) { throw 'The API has a custom command. Review it before changing the runtime.' }
    $container.Remove('imageType') | Out-Null
    $container.image=$Image; $container.env=$state.Variables; $container.resources=@{cpu=0.5;memory='1Gi'}
    if (!$container.probes) { $container.probes=@(@{type='Startup';httpGet=@{path='/healthz';port=8000;scheme='HTTP'};periodSeconds=5;timeoutSeconds=3;failureThreshold=30},@{type='Readiness';httpGet=@{path='/healthz';port=8000;scheme='HTTP'};periodSeconds=10;timeoutSeconds=3;failureThreshold=3}) }
    if (!$template.scale) {$template.scale=@{}}; $template.scale.minReplicas=$MinReplicas; $template.scale.maxReplicas=2
    $properties=@{environmentId=$EnvironmentId;configuration=$config;template=$template}; if ($ExistingResource.properties.workloadProfileName) {$properties.workloadProfileName=$ExistingResource.properties.workloadProfileName}
    $tags=if ($ExistingResource.tags) {$ExistingResource.tags | ConvertTo-Json | ConvertFrom-Json -AsHashtable} else {@{}}; $tags.application='brick-breaker'
    $payload=@{location=$Location;tags=$tags;identity=@{type=$identityType;userAssignedIdentities=$identities};properties=$properties}; Remove-AzureResponseNulls $payload; return $payload
}

function New-WorkerAzurePayload {
    param([Collections.IDictionary]$Settings,$ExistingResource,[object[]]$ExistingSecrets=@(),[string]$Location,[string]$Image,[string]$EnvironmentId,[string]$IdentityId,[string]$RegistryServer,[switch]$Scheduled)
    if ($ExistingResource -and ($ExistingResource.tags.application -ne 'brick-breaker' -or @($ExistingResource.properties.template.containers).Count -ne 1)) { throw 'The target job is not the dedicated Brick Breaker worker.' }
    $state=New-AzureEnvironmentState -Settings $Settings -ExistingResource $ExistingResource -ExistingSecrets $ExistingSecrets -Worker
    $config=@{triggerType=if($Scheduled){'Schedule'}else{'Manual'};replicaTimeout=240;replicaRetryLimit=1;registries=@(@{server=$RegistryServer;identity=$IdentityId});secrets=$state.Secrets}
    if ($Scheduled) {$config.scheduleTriggerConfig=@{cronExpression='*/5 * * * *';parallelism=1;replicaCompletionCount=1}} else {$config.manualTriggerConfig=@{parallelism=1;replicaCompletionCount=1}}
    return @{location=$Location;tags=@{application='brick-breaker';purpose='durable-recovery'};identity=@{type='UserAssigned';userAssignedIdentities=@{$IdentityId=@{}}};properties=@{environmentId=$EnvironmentId;configuration=$config;template=@{containers=@(@{name='recovery';image=$Image;env=$state.Variables;command=@('deno');args=@('run','--cached-only','--frozen','--allow-env','--allow-net','--config','supabase/functions/deno.json','scripts/run-operations.mjs','--batch','20');resources=@{cpu=0.25;memory='0.5Gi'}})}}}
}
