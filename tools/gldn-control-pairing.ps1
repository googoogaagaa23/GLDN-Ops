$script:AgentPendingPairs = @{}
$script:AgentBindings = @()
$script:AgentBindingsPath = Join-Path $InstallRoot 'control-bindings.json'
if (Test-Path -LiteralPath $script:AgentBindingsPath) {
  try { $script:AgentBindings = @(Get-Content -Raw -LiteralPath $script:AgentBindingsPath | ConvertFrom-Json) }
  catch { throw 'Background-control bindings could not be read. No profile was automatically trusted.' }
}

function Get-ControlTokenHash([string]$Token) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Token)))).Replace('-', '') }
  finally { $sha.Dispose() }
}
function Save-AgentBindings {
  $temp = "$script:AgentBindingsPath.tmp"
  ConvertTo-Json -InputObject @($script:AgentBindings) -Depth 6 | Set-Content -LiteralPath $temp -Encoding UTF8
  Move-Item -LiteralPath $temp -Destination $script:AgentBindingsPath -Force
}
function Start-AgentPairing($Body, [string]$ExtensionId) {
  if ([string]$Body.installationId -notmatch '^[a-f0-9-]{36}$') { throw 'Invalid profile installation identity.' }
  foreach ($key in @($script:AgentPendingPairs.Keys)) {
    if ($script:AgentPendingPairs[$key].expiresAt -lt [DateTime]::UtcNow) { $script:AgentPendingPairs.Remove($key) }
  }
  if ($script:AgentPendingPairs.Count -ge 30) { throw 'Too many pending pairing requests. Wait for them to expire.' }
  $code = ([guid]::NewGuid().ToString('N')).Substring(0, 12).ToUpperInvariant()
  $secret = New-AgentControlToken
  $script:AgentPendingPairs[$code] = [pscustomobject]@{
    code = $code; extensionId = $ExtensionId; installationId = [string]$Body.installationId
    tokenHash = Get-ControlTokenHash $secret; expiresAt = [DateTime]::UtcNow.AddMinutes(10)
    approved = $false; profileDirectory = ''
  }
  return [pscustomobject]@{ ok = $true; code = $code; token = $secret; expiresAt = $script:AgentPendingPairs[$code].expiresAt.ToString('o') }
}
function Approve-AgentPairing($Body) {
  $pair = $script:AgentPendingPairs[[string]$Body.code]
  if (-not $pair -or $pair.expiresAt -lt [DateTime]::UtcNow -or $pair.approved) { throw 'The pairing code is expired, used, or unknown.' }
  $profile = [string]$Body.profileDirectory
  if ($profile -notmatch '^(Default|Profile(?: \d+)?)$') { throw 'An exact Chrome profile directory is required.' }
  $target = Resolve-GldnExtensionRequestTarget -ExtensionId $pair.extensionId -FallbackInstallRoot $InstallRoot
  if (@($target.profileDirectories) -cnotcontains $profile) { throw 'The selected Chrome profile does not have this GLDN installation.' }
  $binding = [pscustomobject]@{
    extensionId = $pair.extensionId; installationId = $pair.installationId
    tokenHash = $pair.tokenHash; profileDirectory = $profile; pairedAt = [DateTime]::UtcNow.ToString('o')
  }
  $script:AgentBindings = @($script:AgentBindings | Where-Object {
    $_.installationId -cne $pair.installationId -and -not ($_.extensionId -ceq $pair.extensionId -and $_.profileDirectory -ceq $profile)
  }) + @($binding)
  Save-AgentBindings
  $pair.approved = $true
  $pair.profileDirectory = $profile
  return [pscustomobject]@{ ok = $true; profileDirectory = $profile; installationId = $pair.installationId }
}
function Get-AgentPairingStatus($Body, [string]$ExtensionId) {
  $pair = $script:AgentPendingPairs[[string]$Body.code]
  if (-not $pair -or $pair.expiresAt -lt [DateTime]::UtcNow -or $pair.extensionId -cne $ExtensionId -or $pair.tokenHash -cne (Get-ControlTokenHash ([string]$Body.token))) { throw 'Pairing expired or proof did not match.' }
  return [pscustomobject]@{ ok = $true; approved = $pair.approved; profileDirectory = $pair.profileDirectory; installationId = $pair.installationId }
}
function Assert-AgentProfileBinding([string]$ExtensionId, [string]$ProfileToken) {
  if ($ProfileToken.Length -lt 40) { throw 'Pair this Chrome profile from Health & Installations before using background control.' }
  $hash = Get-ControlTokenHash $ProfileToken
  $bindings = @($script:AgentBindings | Where-Object { $_.extensionId -ceq $ExtensionId -and $_.tokenHash -ceq $hash })
  if ($bindings.Count -ne 1) { throw 'This Chrome profile has no approved background-control pairing.' }
  return $bindings[0]
}
function Remove-AgentPairing([string]$ExtensionId, [string]$ProfileToken) {
  $binding = Assert-AgentProfileBinding $ExtensionId $ProfileToken
  $script:AgentBindings = @($script:AgentBindings | Where-Object { $_.installationId -cne $binding.installationId })
  Save-AgentBindings
  return [pscustomobject]@{ ok = $true; disabled = $true }
}
function Get-AgentInstallations {
  $root = Get-GldnChromeUserDataRoot
  $profiles = @()
  foreach ($directory in (Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | Where-Object Name -Match '^(Default|Profile(?: \d+)?)$')) {
    $path = Join-Path $directory.FullName 'Secure Preferences'
    $installs = @()
    $readable = $true
    try {
      $preferences = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
      foreach ($entry in $preferences.extensions.settings.PSObject.Properties) {
        $location = [string]$entry.Value.path
        if (-not $location -or -not [IO.Path]::IsPathRooted($location)) { continue }
        $manifestPath = Join-Path $location 'manifest.json'
        if (-not (Test-Path -LiteralPath $manifestPath)) { continue }
        $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
        if ([string]$manifest.name -ne 'GLDN Ops') { continue }
        $disabled = @($entry.Value.disable_reasons | Where-Object { $null -ne $_ -and [int]$_ -ne 0 }).Count -gt 0
        $installs += [pscustomobject]@{ extensionId = $entry.Name; diskVersion = $manifest.version; disabled = $disabled }
      }
    } catch { $readable = $false }
    $profiles += [pscustomobject]@{ profileDirectory = $directory.Name; readable = $readable; installations = @($installs) }
  }
  return [pscustomobject]@{ ok = $true; profiles = @($profiles); observedAt = [DateTime]::UtcNow.ToString('o'); source = 'Chrome installation files, not live runtime state' }
}
