# Shared private Azure CLI transport. The calling script supplies SubscriptionId.
function Get-AzureOperationKey {
    param([string]$Kind,[string]$DatabaseUrl,[string]$Environment)
    $url=[uri]$DatabaseUrl
    if($Kind -notmatch '^[a-z_]+$' -or $Environment -notin @('production','sandbox') -or $url.Scheme -ne 'https' -or $url.UserInfo -or $url.Query -or $url.Fragment -or $url.AbsolutePath -ne '/'){throw 'Invalid operational identity.'}
    $identity='[["database",'+($url.GetLeftPart([uriPartial]::Authority) | ConvertTo-Json -Compress)+'],["environment",'+($Environment | ConvertTo-Json -Compress)+'],["provider","internal"]]'
    $digest=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($identity))).ToLowerInvariant().Substring(0,32)
    return "$Kind-$digest"
}
function Convert-AzureTimestamp {
    param($Value)
    # PowerShell 7.5+ can deserialize ISO JSON strings into DateTime. Passing
    # those back through culture-dependent string parsing corrupts the check.
    if ($Value -is [DateTimeOffset]) { return $Value.ToUniversalTime() }
    if ($Value -is [DateTime] -and $Value.Kind -ne [DateTimeKind]::Unspecified) { return ([DateTimeOffset]::new($Value)).ToUniversalTime() }
    if ($Value -is [string] -and $Value -match '(Z|[+-][0-9]{2}:[0-9]{2})$') {
        try { return [DateTimeOffset]::Parse($Value,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() } catch { }
    }
    throw 'A valid timezone-qualified operational timestamp is required.'
}
function Invoke-Azure {
    param([string[]]$Arguments)
    # Explicit subscription on EVERY operation; never switch the CLI default.
    $command = Get-Command az -ErrorAction Stop
    if ($command.CommandType -eq 'Application') {
        $start = [Diagnostics.ProcessStartInfo]::new(); $start.UseShellExecute=$false; $start.CreateNoWindow=$true
        if ([IO.Path]::GetExtension($command.Source) -eq '.cmd') {
            $start.FileName=Join-Path (Split-Path (Split-Path $command.Source -Parent) -Parent) 'python.exe'
            if (!(Test-Path -LiteralPath $start.FileName)) { throw 'Cannot locate the installed Azure CLI runtime.' }
            $start.ArgumentList.Add('-IBm'); $start.ArgumentList.Add('azure.cli')
        } else { $start.FileName=$command.Source }
        foreach ($item in ($Arguments+@('--subscription',$SubscriptionId,'--only-show-errors','--output','json'))) { $start.ArgumentList.Add($item) }
        $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
        $process=[Diagnostics.Process]::new(); $process.StartInfo=$start
        try {
            $process.Start() | Out-Null; $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync(); $process.WaitForExit()
            $raw=$stdout.GetAwaiter().GetResult(); $diagnostic=$stderr.GetAwaiter().GetResult()
            if ($process.ExitCode -ne 0) {
                if ($diagnostic -match 'AADSTS|az login|Please run|Refresh Token') { throw 'Azure authentication needs renewal. Sign in with Azure CLI and retry.' }
                throw "Azure CLI operation failed: $($Arguments[0]) $($Arguments[1]). Private diagnostics are not printed."
            }
        } finally { $process.Dispose() }
    } else {
        # Unit tests supply a local az function; no shell/network is used.
        $raw = & az @Arguments --subscription $SubscriptionId --only-show-errors --output json
        if ($LASTEXITCODE -ne 0) { throw "Azure CLI operation failed: $($Arguments[0]) $($Arguments[1])." }
    }
    if ($raw) { try { ($raw -join "`n") | ConvertFrom-Json -ErrorAction Stop } catch { throw 'Azure CLI returned an invalid JSON response. Private output is not printed.' } }
}

function Invoke-AzurePayload {
    param([string]$Url,$Payload)
    $temporary=[IO.Path]::GetTempFileName()
    try {
        if (!$IsWindows) { [IO.File]::SetUnixFileMode($temporary,([IO.UnixFileMode]::UserRead -bor [IO.UnixFileMode]::UserWrite)) }
        [IO.File]::WriteAllText($temporary,($Payload | ConvertTo-Json -Depth 60),[Text.UTF8Encoding]::new($false))
        Invoke-Azure -Arguments @('rest','--method','put','--url',$Url,'--body',('@'+$temporary),'--headers','Content-Type=application/json')
    } finally { Remove-Item -LiteralPath $temporary -ErrorAction SilentlyContinue }
}

