[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Install', 'Verify')]
  [string]$Mode = 'Plan',
  [string]$MainZipPath = '',
  [string]$ProductHunterZipPath = '',
  [string]$ReleaseManifestPath = '',
  [string]$ExpectedMainSha256 = '',
  [string]$ExpectedProductHunterSha256 = '',
  [string]$ExpectedMainVersion = '',
  [string]$ExpectedProductHunterVersion = '',
  [string]$MainInstallRoot = '',
  [string]$ProductHunterInstallRoot = '',
  [switch]$SkipUpdaterStart,
  [switch]$Json
)

$ErrorActionPreference = 'Stop'
$script:RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script:LocalAppDataRoot = [System.IO.Path]::GetFullPath($env:LOCALAPPDATA).TrimEnd('\')
$script:WorkRoot = $null
$script:InstallCommitted = $false
$script:Warnings = New-Object System.Collections.Generic.List[string]

if (-not $MainInstallRoot) {
  $MainInstallRoot = Join-Path $script:LocalAppDataRoot 'GLDN Ops'
}
if (-not $ProductHunterInstallRoot) {
  $ProductHunterInstallRoot = Join-Path $script:LocalAppDataRoot 'GLDN Product Hunter'
}

function Write-Step([string]$Message) {
  if (-not $Json) { Write-Host $Message }
}

function Add-Warning([string]$Message) {
  $script:Warnings.Add($Message)
  if (-not $Json) { Write-Warning $Message }
}

function Resolve-FullPath([string]$Path, [switch]$AllowMissing) {
  if (-not $Path) { throw 'A required path was empty.' }
  $expanded = [Environment]::ExpandEnvironmentVariables($Path)
  if (-not $AllowMissing) {
    return [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $expanded).Path)
  }
  $providerPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($expanded)
  return [System.IO.Path]::GetFullPath($providerPath)
}

function Test-PathWithin([string]$Child, [string]$Parent) {
  $childFull = [System.IO.Path]::GetFullPath($Child).TrimEnd('\')
  $parentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\')
  return $childFull.StartsWith($parentFull + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Assert-ExactManagedRoot([string]$Path, [string]$ExpectedLeaf) {
  $full = Resolve-FullPath $Path -AllowMissing
  $expected = [System.IO.Path]::GetFullPath((Join-Path $script:LocalAppDataRoot $ExpectedLeaf)).TrimEnd('\')
  if (-not $full.TrimEnd('\').Equals($expected, [StringComparison]::OrdinalIgnoreCase)) {
    throw "The $ExpectedLeaf install root must be exactly $expected. Received: $full"
  }
  if (-not (Test-PathWithin $full $script:LocalAppDataRoot)) {
    throw "Unsafe install root outside LOCALAPPDATA: $full"
  }
  return $full
}

function Assert-SafeManagedPath([string]$Path) {
  $full = Resolve-FullPath $Path -AllowMissing
  if (-not (Test-PathWithin $full $script:LocalAppDataRoot)) {
    throw "Refusing to modify a path outside LOCALAPPDATA: $full"
  }
  if ($full.TrimEnd('\').Equals($script:LocalAppDataRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify the LOCALAPPDATA root: $full"
  }
  return $full
}

function Find-DefaultPackage([string]$ExactName, [string]$Pattern) {
  $distRoot = Join-Path $script:RepoRoot 'dist'
  if ($ExactName) {
    $exactPath = Join-Path $distRoot $ExactName
    if (Test-Path -LiteralPath $exactPath -PathType Leaf) { return $exactPath }
    throw "The source manifest requires $ExactName, but that exact package is missing under $distRoot. Build the current release; setup will not fall back to an older ZIP."
  }
  $matches = @(Get-ChildItem -LiteralPath $distRoot -File -Filter $Pattern -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending)
  if (-not $matches.Count) { throw "No package matching $Pattern was found under $distRoot. Supply its path explicitly." }
  return $matches[0].FullName
}

function Resolve-PackageInputs {
  $sourceMainVersion = ''
  $sourceHunterVersion = ''
  $mainManifestPath = Join-Path $script:RepoRoot 'extension\manifest.json'
  $hunterManifestPath = Join-Path $script:RepoRoot 'product-hunter-extension\manifest.json'
  if (Test-Path -LiteralPath $mainManifestPath) {
    $sourceMainVersion = [string]((Get-Content -Raw -LiteralPath $mainManifestPath | ConvertFrom-Json).version)
  }
  if (Test-Path -LiteralPath $hunterManifestPath) {
    $sourceHunterVersion = [string]((Get-Content -Raw -LiteralPath $hunterManifestPath | ConvertFrom-Json).version)
  }

  $resolvedMain = if ($MainZipPath) {
    Resolve-FullPath $MainZipPath
  } else {
    Find-DefaultPackage $(if ($sourceMainVersion) { "GLDN-Ops-local-v$sourceMainVersion.zip" } else { '' }) 'GLDN-Ops-local-v*.zip'
  }
  $resolvedHunter = if ($ProductHunterZipPath) {
    Resolve-FullPath $ProductHunterZipPath
  } else {
    Find-DefaultPackage $(if ($sourceHunterVersion) { "GLDN-Product-Hunter-v$sourceHunterVersion.zip" } else { '' }) 'GLDN-Product-Hunter-v*.zip'
  }
  foreach ($package in @($resolvedMain, $resolvedHunter)) {
    if ([System.IO.Path]::GetExtension($package) -ine '.zip') { throw "Package is not a ZIP file: $package" }
  }
  return [pscustomobject]@{ Main = $resolvedMain; Hunter = $resolvedHunter }
}

function Copy-DirectoryContents([string]$Source, [string]$Destination) {
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
  }
}

function Get-ExtensionSource([string]$ExtractRoot, [string]$ExpectedName, [switch]$RequireParentBundle) {
  $candidates = @(Get-ChildItem -LiteralPath $ExtractRoot -Recurse -File -Filter 'manifest.json' | ForEach-Object {
    try {
      $manifest = Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json
      if ([string]$manifest.name -eq $ExpectedName) {
        [pscustomobject]@{ ManifestPath = $_.FullName; ExtensionRoot = $_.Directory.FullName; Manifest = $manifest }
      }
    } catch {}
  })
  if ($candidates.Count -ne 1) {
    throw "Expected exactly one $ExpectedName manifest in the package; found $($candidates.Count)."
  }
  $candidate = $candidates[0]
  if ($RequireParentBundle) {
    if ((Split-Path $candidate.ExtensionRoot -Leaf) -ine 'extension') {
      throw 'The main package must be the full GLDN Ops local bundle with extension\manifest.json.'
    }
    $bundleRoot = Split-Path $candidate.ExtensionRoot -Parent
    foreach ($required in @('tools\install-update-agent.ps1', 'tools\gldn-update-agent.ps1', 'tools\gldn-update-core.ps1')) {
      if (-not (Test-Path -LiteralPath (Join-Path $bundleRoot $required) -PathType Leaf)) {
        throw "The main local bundle is missing $required."
      }
    }
    $candidate | Add-Member -NotePropertyName BundleRoot -NotePropertyValue $bundleRoot
  }
  return $candidate
}

function Assert-RequiredFile([string]$Root, [string]$RelativePath, [string]$Label) {
  $path = Join-Path $Root $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "$Label is missing required file: $RelativePath" }
  return $path
}

function Get-Hash([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Normalize-Sha256([string]$Value, [string]$Label) {
  $normalized = ([string]$Value).Trim().ToUpperInvariant()
  if ($normalized -and $normalized -notmatch '^[A-F0-9]{64}$') { throw "$Label is not a valid SHA-256 value." }
  return $normalized
}

function Find-AutoReleaseManifest([string]$MainPackage, [string]$MainVersion) {
  $candidates = @(
    (Join-Path (Split-Path $MainPackage -Parent) "release-manifest-v$MainVersion.json"),
    (Join-Path $script:RepoRoot "dist\public-release-v$MainVersion\downloads\release-manifest-v$MainVersion.json")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return (Resolve-FullPath $candidate) }
  }
  return ''
}

function Get-ManifestExpectedHash([object]$ReleaseManifest, [string]$PackagePath) {
  if (-not $ReleaseManifest) { return '' }
  $name = Split-Path $PackagePath -Leaf
  $matches = @($ReleaseManifest.files | Where-Object { (Split-Path ([string]$_.path) -Leaf) -ieq $name })
  if ($matches.Count -gt 1) { throw "Release manifest contains duplicate entries for $name." }
  if ($matches.Count -eq 1) { return Normalize-Sha256 ([string]$matches[0].sha256) "$name manifest hash" }
  return ''
}

function Get-SidecarExpectedHash([string]$PackagePath) {
  $sidecar = [System.IO.Path]::ChangeExtension($PackagePath, '.sha256.txt')
  if (-not (Test-Path -LiteralPath $sidecar -PathType Leaf)) { return '' }
  $firstToken = ((Get-Content -Raw -LiteralPath $sidecar).Trim() -split '\s+')[0]
  return Normalize-Sha256 $firstToken "$(Split-Path $sidecar -Leaf) hash"
}

function Resolve-ExpectedHash(
  [string]$PackagePath,
  [string]$ExplicitHash,
  [object]$ReleaseManifest,
  [switch]$AllowSidecar
) {
  $explicit = Normalize-Sha256 $ExplicitHash "$(Split-Path $PackagePath -Leaf) expected hash"
  $manifestHash = Get-ManifestExpectedHash $ReleaseManifest $PackagePath
  $sidecarHash = if ($AllowSidecar) { Get-SidecarExpectedHash $PackagePath } else { '' }
  $declared = @(@($explicit, $manifestHash, $sidecarHash) | Where-Object { $_ })
  if (@($declared | Sort-Object -Unique).Count -gt 1) {
    throw "Conflicting expected hashes were supplied for $(Split-Path $PackagePath -Leaf)."
  }
  if ($explicit) { return $explicit }
  if ($manifestHash) { return $manifestHash }
  return $sidecarHash
}

function Assert-PolicyPack([string]$RulesPath) {
  $pack = Get-Content -Raw -LiteralPath $RulesPath | ConvertFrom-Json
  $rules = @($pack.rules)
  if ([int]$pack.schemaVersion -lt 2) { throw 'The shared policy pack must use schema 2 or newer.' }
  if ([int]$pack.ruleCount -ne $rules.Count) { throw 'The shared policy pack declared count does not match its rules.' }
  if ([int]$pack.policyCoverage.hubPolicyCount -ne 70 -or @($pack.policyCoverage.pages).Count -ne 70) {
    throw 'The shared policy pack does not cover all 70 prohibited/restricted hub policies.'
  }
  $communityBlocks = @($rules | Where-Object {
    [string]$_.sourceType -in @('profile2-discord', 'profile2-telegram') -and [string]$_.action -ieq 'block'
  })
  if ($communityBlocks.Count) { throw 'The shared policy pack contains a community Block, which is forbidden.' }
  $readyPhrases = @($pack.clearancePolicy.readyPhrases)
  $uniqueReady = @($readyPhrases | ForEach-Object { ([string]$_).Trim().ToLowerInvariant() } |
    Where-Object { $_ } | Sort-Object -Unique)
  if ([string]$pack.clearancePolicy.mode -ne 'keyword-blocklist' -or
      -not [string]$pack.clearancePolicy.version) {
    throw 'The forbidden-item keyword profile is missing or invalid.'
  }
  return [pscustomobject]@{
    Version = [string]$pack.version
    RuleCount = $rules.Count
    ClearanceVersion = [string]$pack.clearancePolicy.version
    ReadyPhraseCount = $readyPhrases.Count
  }
}

function Assert-Packages([object]$Packages, [string]$ExtractRoot) {
  $mainExtract = Join-Path $ExtractRoot 'main'
  $hunterExtract = Join-Path $ExtractRoot 'hunter'
  New-Item -ItemType Directory -Force -Path $mainExtract, $hunterExtract | Out-Null
  Write-Step 'Expanding packages into an isolated staging folder...'
  Expand-Archive -LiteralPath $Packages.Main -DestinationPath $mainExtract -Force
  Expand-Archive -LiteralPath $Packages.Hunter -DestinationPath $hunterExtract -Force

  $main = Get-ExtensionSource $mainExtract 'GLDN Ops' -RequireParentBundle
  $hunter = Get-ExtensionSource $hunterExtract 'GLDN Product Hunter'
  $mainVersion = [string]$main.Manifest.version
  $hunterVersion = [string]$hunter.Manifest.version
  if (-not $mainVersion -or -not $hunterVersion) { throw 'One or both extension manifests are missing a version.' }
  if ($ExpectedMainVersion -and $mainVersion -ne $ExpectedMainVersion) {
    throw "Main package is v$mainVersion; expected v$ExpectedMainVersion."
  }
  if ($ExpectedProductHunterVersion -and $hunterVersion -ne $ExpectedProductHunterVersion) {
    throw "Product Hunter package is v$hunterVersion; expected v$ExpectedProductHunterVersion."
  }

  $mainRules = Assert-RequiredFile $main.ExtensionRoot 'listing-preflight-rules.json' 'GLDN Ops'
  $mainCore = Assert-RequiredFile $main.ExtensionRoot 'listing-preflight-core.js' 'GLDN Ops'
  [void](Assert-RequiredFile $main.ExtensionRoot 'listing-preflight.html' 'GLDN Ops')
  [void](Assert-RequiredFile $main.ExtensionRoot 'policy-listing-audit-core.js' 'GLDN Ops')
  [void](Assert-RequiredFile $main.ExtensionRoot 'product-research-output.json' 'GLDN Ops')
  $hunterRules = Assert-RequiredFile $hunter.ExtensionRoot 'policy-rules.json' 'Product Hunter'
  $hunterCore = Assert-RequiredFile $hunter.ExtensionRoot 'policy-core.js' 'Product Hunter'
  foreach ($required in @('background.js', 'hunter-core.js', 'risk-profile.js', 'amazon-content.js', 'ebay-content.js')) {
    [void](Assert-RequiredFile $hunter.ExtensionRoot $required 'Product Hunter')
  }
  if ((Get-Hash $mainRules) -ne (Get-Hash $hunterRules)) {
    throw 'GLDN Ops and Product Hunter do not contain the same reviewed policy rule pack.'
  }
  if ((Get-Hash $mainCore) -ne (Get-Hash $hunterCore)) {
    throw 'GLDN Ops and Product Hunter do not contain the same Listing Preflight policy core.'
  }
  $policy = Assert-PolicyPack $mainRules

  return [pscustomobject]@{
    Main = $main
    Hunter = $hunter
    MainVersion = $mainVersion
    HunterVersion = $hunterVersion
    MainRulesPath = $mainRules
    HunterRulesPath = $hunterRules
    MainCorePath = $mainCore
    HunterCorePath = $hunterCore
    Policy = $policy
  }
}

function Get-RunningGldnUpdaterAgents {
  $agents = @()
  try {
    $agents = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" |
      Where-Object {
        $line = [string]$_.CommandLine
        $line -match '(?i)gldn-update-agent\.ps1' -and $line -match '(?i)-Action\s+Serve(?:\s|$)'
      } | ForEach-Object {
        [pscustomobject]@{ ProcessId = [int]$_.ProcessId; CommandLine = [string]$_.CommandLine }
      })
  } catch {
    Add-Warning "Running GLDN updater processes could not be inspected: $($_.Exception.Message)"
  }
  return $agents
}

function Stop-UpdaterForExactRoot([string]$InstallRoot) {
  $agentPath = [System.IO.Path]::GetFullPath((Join-Path $InstallRoot 'tools\gldn-update-agent.ps1'))
  $matches = @(Get-RunningGldnUpdaterAgents | Where-Object {
    $_.CommandLine.IndexOf($agentPath, [StringComparison]::OrdinalIgnoreCase) -ge 0
  })
  foreach ($agent in $matches) {
    Write-Step 'Stopping the updater attached to the stable GLDN Ops folder...'
    Stop-Process -Id $agent.ProcessId -Force -ErrorAction Stop
  }
  foreach ($agent in $matches) {
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      if (-not (Get-Process -Id $agent.ProcessId -ErrorAction SilentlyContinue)) { break }
      Start-Sleep -Milliseconds 100
    }
    if (Get-Process -Id $agent.ProcessId -ErrorAction SilentlyContinue) {
      throw 'The existing GLDN Ops updater did not stop; no install was attempted.'
    }
  }
  return $matches.Count
}

function Test-InstalledState([object]$PackageInfo, [string]$MainRoot, [string]$HunterRoot) {
  $mainExtension = Join-Path $MainRoot 'extension'
  $hunterExtension = Join-Path $HunterRoot 'extension'
  $mainManifestPath = Assert-RequiredFile $mainExtension 'manifest.json' 'Installed GLDN Ops'
  $hunterManifestPath = Assert-RequiredFile $hunterExtension 'manifest.json' 'Installed Product Hunter'
  $mainManifest = Get-Content -Raw -LiteralPath $mainManifestPath | ConvertFrom-Json
  $hunterManifest = Get-Content -Raw -LiteralPath $hunterManifestPath | ConvertFrom-Json
  if ([string]$mainManifest.name -ne 'GLDN Ops' -or [string]$mainManifest.version -ne $PackageInfo.MainVersion) {
    throw 'Installed GLDN Ops name/version does not match the verified package.'
  }
  if ([string]$hunterManifest.name -ne 'GLDN Product Hunter' -or [string]$hunterManifest.version -ne $PackageInfo.HunterVersion) {
    throw 'Installed Product Hunter name/version does not match the verified package.'
  }
  $installedMainRules = Assert-RequiredFile $mainExtension 'listing-preflight-rules.json' 'Installed GLDN Ops'
  $installedHunterRules = Assert-RequiredFile $hunterExtension 'policy-rules.json' 'Installed Product Hunter'
  $installedMainCore = Assert-RequiredFile $mainExtension 'listing-preflight-core.js' 'Installed GLDN Ops'
  $installedHunterCore = Assert-RequiredFile $hunterExtension 'policy-core.js' 'Installed Product Hunter'
  if ((Get-Hash $installedMainRules) -ne (Get-Hash $PackageInfo.MainRulesPath) -or
      (Get-Hash $installedHunterRules) -ne (Get-Hash $PackageInfo.HunterRulesPath)) {
    throw 'An installed policy rule file does not match the verified release package.'
  }
  if ((Get-Hash $installedMainCore) -ne (Get-Hash $PackageInfo.MainCorePath) -or
      (Get-Hash $installedHunterCore) -ne (Get-Hash $PackageInfo.HunterCorePath)) {
    throw 'An installed policy core does not match the verified release package.'
  }
  return [pscustomobject]@{
    MainExtensionPath = $mainExtension
    ProductHunterExtensionPath = $hunterExtension
    MainVersion = [string]$mainManifest.version
    ProductHunterVersion = [string]$hunterManifest.version
    PolicyVersion = $PackageInfo.Policy.Version
    PolicyRules = $PackageInfo.Policy.RuleCount
    ClearanceVersion = $PackageInfo.Policy.ClearanceVersion
  }
}

function Remove-ManagedTarget([string]$Path) {
  $safe = Assert-SafeManagedPath $Path
  if (Test-Path -LiteralPath $safe) { Remove-Item -LiteralPath $safe -Recurse -Force }
}

function Restore-Backup([string]$BackupPath, [string]$TargetPath) {
  if (-not $BackupPath -or -not (Test-Path -LiteralPath $BackupPath)) { return }
  $safeTarget = Assert-SafeManagedPath $TargetPath
  if (Test-Path -LiteralPath $safeTarget) { Remove-ManagedTarget $safeTarget }
  Move-Item -LiteralPath $BackupPath -Destination $safeTarget
}

function Write-ManualChromeSteps([object]$Installed) {
  if ($Json) { return }
  Write-Host ''
  Write-Host 'One-time manual Chrome steps for EACH intended signed-in profile:' -ForegroundColor Cyan
  Write-Host '  1. Open Chrome yourself and go to chrome://extensions.'
  Write-Host '  2. Turn on Developer mode.'
  Write-Host '  3. Click Load unpacked and select:'
  Write-Host "       $($Installed.MainExtensionPath)"
  Write-Host '  4. Click Load unpacked again and select:'
  Write-Host "       $($Installed.ProductHunterExtensionPath)"
  Write-Host '  5. Open GLDN Ops, choose the correct computer, run Test Connection, then Run Feature Health Check.'
  Write-Host '  6. Open GLDN Product Hunter, choose the same permitted eBay computer, and scan/import complete Active Listings.'
  Write-Host '  7. Confirm both displayed versions match this receipt before research work.'
  Write-Host ''
  Write-Host 'This installer never opens Chrome, edits Chrome policy, touches Chrome profile storage, signs in, or performs a marketplace action.'
  Write-Host 'It installs only for this Windows user on this computer. It does not deploy to another computer.'
}

$mainRoot = Assert-ExactManagedRoot $MainInstallRoot 'GLDN Ops'
$hunterRoot = Assert-ExactManagedRoot $ProductHunterInstallRoot 'GLDN Product Hunter'
if ($mainRoot.Equals($hunterRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The two install roots must be different.'
}

$packages = Resolve-PackageInputs
$script:WorkRoot = Assert-SafeManagedPath (Join-Path $script:LocalAppDataRoot ("GLDN Research Workstation Installer\staging-" + [guid]::NewGuid().ToString('N')))
New-Item -ItemType Directory -Force -Path $script:WorkRoot | Out-Null

try {
  $packageInfo = Assert-Packages $packages $script:WorkRoot

  $resolvedReleaseManifest = if ($ReleaseManifestPath) {
    Resolve-FullPath $ReleaseManifestPath
  } else {
    Find-AutoReleaseManifest $packages.Main $packageInfo.MainVersion
  }
  $releaseManifest = $null
  if ($resolvedReleaseManifest) {
    $releaseManifest = Get-Content -Raw -LiteralPath $resolvedReleaseManifest | ConvertFrom-Json
    if ([int]$releaseManifest.schemaVersion -ne 1) { throw 'Unsupported release manifest schema.' }
    if ([string]$releaseManifest.version -ne $packageInfo.MainVersion) {
      throw 'Release manifest version does not match the main package.'
    }
  }
  $expectedMainHash = Resolve-ExpectedHash $packages.Main $ExpectedMainSha256 $releaseManifest
  $expectedHunterHash = Resolve-ExpectedHash $packages.Hunter $ExpectedProductHunterSha256 $releaseManifest -AllowSidecar
  if (-not $expectedMainHash -or -not $expectedHunterHash) {
    throw 'Both package hashes must be verified. Supply the staged release manifest or explicit expected SHA-256 values.'
  }
  $actualMainHash = Get-Hash $packages.Main
  $actualHunterHash = Get-Hash $packages.Hunter
  if ($actualMainHash -ne $expectedMainHash) { throw 'GLDN Ops package SHA-256 verification failed.' }
  if ($actualHunterHash -ne $expectedHunterHash) { throw 'Product Hunter package SHA-256 verification failed.' }

  $summary = [ordered]@{
    ok = $true
    mode = $Mode
    computerScope = 'current Windows user on this computer only'
    main = [ordered]@{ version = $packageInfo.MainVersion; zip = $packages.Main; sha256 = $actualMainHash; installRoot = $mainRoot; extensionPath = (Join-Path $mainRoot 'extension') }
    productHunter = [ordered]@{ version = $packageInfo.HunterVersion; zip = $packages.Hunter; sha256 = $actualHunterHash; installRoot = $hunterRoot; extensionPath = (Join-Path $hunterRoot 'extension') }
    policy = [ordered]@{ version = $packageInfo.Policy.Version; rules = $packageInfo.Policy.RuleCount; clearanceVersion = $packageInfo.Policy.ClearanceVersion; readyPhrases = $packageInfo.Policy.ReadyPhraseCount }
    releaseManifest = $resolvedReleaseManifest
    backupRoot = ''
    installed = $null
    receipt = ''
    warnings = @()
  }

  if ($Mode -eq 'Plan') {
    Write-Step ''
    Write-Step 'PLAN VERIFIED - no install folders were changed.'
    Write-Step "GLDN Ops v$($packageInfo.MainVersion) -> $mainRoot"
    Write-Step "Product Hunter v$($packageInfo.HunterVersion) -> $hunterRoot"
    Write-Step "Shared policy $($packageInfo.Policy.Version): $($packageInfo.Policy.RuleCount) rules; $($packageInfo.Policy.ReadyPhraseCount) starting phrases."
  } elseif ($Mode -eq 'Verify') {
    $installed = Test-InstalledState $packageInfo $mainRoot $hunterRoot
    $summary.installed = $installed
    Write-Step ''
    Write-Step 'VERIFIED - installed files match both release packages.'
    Write-Step "GLDN Ops v$($installed.MainVersion): $($installed.MainExtensionPath)"
    Write-Step "Product Hunter v$($installed.ProductHunterVersion): $($installed.ProductHunterExtensionPath)"
  } else {
    $assembledMain = Assert-SafeManagedPath (Join-Path $script:WorkRoot 'assembled-main')
    $assembledHunter = Assert-SafeManagedPath (Join-Path $script:WorkRoot 'assembled-hunter')
    Copy-DirectoryContents $packageInfo.Main.BundleRoot $assembledMain
    New-Item -ItemType Directory -Force -Path (Join-Path $assembledHunter 'extension') | Out-Null
    Copy-DirectoryContents $packageInfo.Hunter.ExtensionRoot (Join-Path $assembledHunter 'extension')

    $existingConfig = Join-Path $mainRoot 'extension\config.js'
    if (Test-Path -LiteralPath $existingConfig -PathType Leaf) {
      Copy-Item -LiteralPath $existingConfig -Destination (Join-Path $assembledMain 'extension\config.js') -Force
      Write-Step 'Preserved the existing local GLDN Ops config without reading or printing it.'
    }

    $backupRunRoot = Assert-SafeManagedPath (Join-Path $script:LocalAppDataRoot ("GLDN Research Workstation Backups\" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N')))
    $mainBackup = Join-Path $backupRunRoot 'GLDN Ops'
    $hunterBackup = Join-Path $backupRunRoot 'GLDN Product Hunter'
    $movedMain = $false
    $movedHunter = $false
    $installedMain = $false
    $installedHunter = $false
    $stoppedUpdaterCount = 0
    New-Item -ItemType Directory -Force -Path $backupRunRoot | Out-Null

    try {
      if (Test-Path -LiteralPath $mainRoot) {
        $stoppedUpdaterCount = Stop-UpdaterForExactRoot $mainRoot
        Move-Item -LiteralPath $mainRoot -Destination $mainBackup
        $movedMain = $true
      }
      if (Test-Path -LiteralPath $hunterRoot) {
        Move-Item -LiteralPath $hunterRoot -Destination $hunterBackup
        $movedHunter = $true
      }

      Move-Item -LiteralPath $assembledMain -Destination $mainRoot
      $installedMain = $true
      Move-Item -LiteralPath $assembledHunter -Destination $hunterRoot
      $installedHunter = $true

      $installed = Test-InstalledState $packageInfo $mainRoot $hunterRoot
      $updaterInstaller = Join-Path $mainRoot 'tools\install-update-agent.ps1'
      $updaterArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $updaterInstaller, '-InstallRoot', $mainRoot)
      if ($SkipUpdaterStart) { $updaterArgs += @('-SkipStart', '-SkipStartupShortcut') }
      & powershell.exe @updaterArgs | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'The local GLDN Ops updater did not install successfully.' }

      $installed = Test-InstalledState $packageInfo $mainRoot $hunterRoot
      $script:InstallCommitted = $true
      $summary.installed = $installed
      if ($movedMain -or $movedHunter) { $summary.backupRoot = $backupRunRoot }
      if (-not $movedMain -and -not $movedHunter) {
        Remove-Item -LiteralPath $backupRunRoot -Force
      }

      $receiptRoot = Join-Path $script:LocalAppDataRoot 'GLDN Research Workstation Installer'
      New-Item -ItemType Directory -Force -Path $receiptRoot | Out-Null
      $receiptPath = Join-Path $receiptRoot 'last-install.json'
      $receipt = [ordered]@{
        schemaVersion = 1
        installedAt = (Get-Date).ToUniversalTime().ToString('o')
        scope = 'current Windows user on this computer only'
        mainVersion = $installed.MainVersion
        productHunterVersion = $installed.ProductHunterVersion
        policyVersion = $installed.PolicyVersion
        policyRules = $installed.PolicyRules
        clearanceVersion = $installed.ClearanceVersion
        mainExtensionPath = $installed.MainExtensionPath
        productHunterExtensionPath = $installed.ProductHunterExtensionPath
        mainPackageSha256 = $actualMainHash
        productHunterPackageSha256 = $actualHunterHash
        releaseManifest = $resolvedReleaseManifest
        backupRoot = $summary.backupRoot
        chromeChanged = $false
        marketplaceActions = 0
      }
      [System.IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
      $summary.receipt = $receiptPath

      Write-Step ''
      Write-Step 'INSTALL VERIFIED - both stable folders match the reviewed packages.'
      Write-Step "Receipt: $receiptPath"
      if ($summary.backupRoot) { Write-Step "Rollback backup retained at: $($summary.backupRoot)" }
      Write-ManualChromeSteps $installed
    } catch {
      $installError = $_
      try { [void](Stop-UpdaterForExactRoot $mainRoot) } catch {}
      try { if ($installedHunter -and (Test-Path -LiteralPath $hunterRoot)) { Remove-ManagedTarget $hunterRoot } } catch {}
      try { if ($installedMain -and (Test-Path -LiteralPath $mainRoot)) { Remove-ManagedTarget $mainRoot } } catch {}
      try { if ($movedMain) { Restore-Backup $mainBackup $mainRoot } } catch { Add-Warning "Main rollback failed: $($_.Exception.Message)" }
      try { if ($movedHunter) { Restore-Backup $hunterBackup $hunterRoot } } catch { Add-Warning "Product Hunter rollback failed: $($_.Exception.Message)" }
      if ($stoppedUpdaterCount -and $movedMain -and (Test-Path -LiteralPath (Join-Path $mainRoot 'tools\install-update-agent.ps1'))) {
        try {
          $restoreUpdaterArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $mainRoot 'tools\install-update-agent.ps1'), '-InstallRoot', $mainRoot)
          if ($SkipUpdaterStart) { $restoreUpdaterArgs += @('-SkipStart', '-SkipStartupShortcut') }
          & powershell.exe @restoreUpdaterArgs | Out-Null
        } catch { Add-Warning "The restored updater could not be restarted: $($_.Exception.Message)" }
      }
      throw $installError
    }
  }

  $summary.warnings = @($script:Warnings)
  if ($Json) { $summary | ConvertTo-Json -Depth 8 }
} finally {
  if ($script:WorkRoot -and (Test-Path -LiteralPath $script:WorkRoot)) {
    $safeWorkRoot = Assert-SafeManagedPath $script:WorkRoot
    Remove-Item -LiteralPath $safeWorkRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
