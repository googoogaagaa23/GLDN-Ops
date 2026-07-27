$script:GldnUpdaterVersion = "1.0.0"
$script:GldnDefaultMetadataUrl = "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/downloads/latest.json"

function Get-GldnDefaultInstallRoot {
  if ($env:GLDN_OPS_INSTALL_ROOT) {
    return [System.IO.Path]::GetFullPath($env:GLDN_OPS_INSTALL_ROOT)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "GLDN Ops"))
}

function Get-GldnChromeUserDataRoot {
  if ($env:GLDN_CHROME_USER_DATA) {
    return [System.IO.Path]::GetFullPath($env:GLDN_CHROME_USER_DATA)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"))
}

function Get-GldnChromeExtensionInstalls {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ExtensionId,
    [string]$ChromeUserDataRoot = (Get-GldnChromeUserDataRoot)
  )
  if ($ExtensionId -notmatch '^[a-p]{32}$') { throw "Invalid GLDN Ops extension ID." }
  if (-not (Test-Path -LiteralPath $ChromeUserDataRoot)) { return @() }

  $installs = @()
  foreach ($profile in (Get-ChildItem -LiteralPath $ChromeUserDataRoot -Directory -ErrorAction SilentlyContinue)) {
    $securePreferences = Join-Path $profile.FullName "Secure Preferences"
    if (-not (Test-Path -LiteralPath $securePreferences)) { continue }
    try {
      $preferences = Get-Content -Raw -LiteralPath $securePreferences | ConvertFrom-Json
      $settings = $preferences.extensions.settings
      if (-not $settings) { continue }
      $property = $settings.PSObject.Properties | Where-Object Name -CEQ $ExtensionId | Select-Object -First 1
      if (-not $property) { continue }
      $entry = $property.Value
      if ([int]$entry.location -ne 4) { continue }
      $rawPath = [Environment]::ExpandEnvironmentVariables([string]$entry.path)
      if (-not $rawPath -or -not [System.IO.Path]::IsPathRooted($rawPath)) { continue }
      $extensionRoot = [System.IO.Path]::GetFullPath($rawPath)
      $manifestPath = Join-Path $extensionRoot "manifest.json"
      if (-not (Test-Path -LiteralPath $manifestPath)) { continue }
      $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
      if ([string]$manifest.name -ne "GLDN Ops") { continue }
      $installs += [pscustomobject]@{
        extensionId = $ExtensionId
        extensionRoot = $extensionRoot
        profileDirectory = $profile.Name
      }
    } catch {
      continue
    }
  }
  return @($installs)
}

function Resolve-GldnExtensionRequestTarget {
  param(
    [string]$ExtensionId = "",
    [string]$FallbackInstallRoot = (Get-GldnDefaultInstallRoot),
    [string]$ChromeUserDataRoot = (Get-GldnChromeUserDataRoot)
  )
  $fallbackRoot = [System.IO.Path]::GetFullPath($FallbackInstallRoot)
  if (-not $ExtensionId) {
    return [pscustomobject]@{
      source = "configured"
      extensionId = ""
      installRoot = $fallbackRoot
      extensionRoot = (Join-Path $fallbackRoot "extension")
      profileDirectories = @()
    }
  }

  $installs = @(Get-GldnChromeExtensionInstalls -ExtensionId $ExtensionId -ChromeUserDataRoot $ChromeUserDataRoot)
  if (-not $installs.Count) {
    throw "Chrome does not report a loaded unpacked GLDN Ops folder for extension $ExtensionId. Run the newest one-time updater setup once."
  }
  $paths = @($installs | ForEach-Object extensionRoot | Sort-Object -Unique)
  if ($paths.Count -ne 1) {
    throw "Chrome reports more than one loaded folder for extension $ExtensionId. GLDN Ops stopped instead of guessing which copy to update."
  }
  $extensionRoot = [System.IO.Path]::GetFullPath([string]$paths[0])
  if ((Split-Path $extensionRoot -Leaf) -ine "extension") {
    throw "The loaded GLDN Ops folder must be named extension before automatic updates can modify it safely."
  }
  return [pscustomobject]@{
    source = "chrome-profile"
    extensionId = $ExtensionId
    installRoot = (Split-Path $extensionRoot -Parent)
    extensionRoot = $extensionRoot
    profileDirectories = @($installs | Where-Object { $_.extensionRoot -ieq $extensionRoot } | ForEach-Object profileDirectory | Sort-Object -Unique)
  }
}

function Assert-GldnPathWithin {
  param([string]$Path, [string]$Parent)
  $resolvedPath = [System.IO.Path]::GetFullPath($Path)
  $resolvedParent = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  if (-not $resolvedPath.StartsWith($resolvedParent, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe GLDN Ops path: $resolvedPath"
  }
  return $resolvedPath
}

function Get-GldnManifestVersion {
  param([string]$ExtensionRoot)
  $manifestPath = Join-Path $ExtensionRoot "manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath)) { return "" }
  return [string]((Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json).version)
}

function ConvertTo-GldnVersion {
  param([string]$Value)
  try { return [version]$Value } catch { throw "Invalid GLDN Ops version: $Value" }
}

function Read-GldnReleaseMetadata {
  param(
    [string]$MetadataUrl = $script:GldnDefaultMetadataUrl,
    [string]$MetadataPath = ""
  )
  if ($MetadataPath) {
    $text = Get-Content -Raw -LiteralPath (Resolve-Path -LiteralPath $MetadataPath).Path
  } else {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $MetadataUrl -TimeoutSec 15
    $text = [string]$response.Content
  }
  $text = ([string]$text).TrimStart([char]0xFEFF)
  $metadata = $text | ConvertFrom-Json
  foreach ($property in @("version", "url", "sha256")) {
    if (-not [string]$metadata.$property) { throw "Release metadata is missing $property." }
  }
  [void](ConvertTo-GldnVersion ([string]$metadata.version))
  if ([string]$metadata.sha256 -notmatch '^[A-Fa-f0-9]{64}$') {
    throw "Release metadata contains an invalid SHA-256 value."
  }
  return $metadata
}

function Test-GldnZipEntries {
  param([string]$ZipPath)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    foreach ($entry in $archive.Entries) {
      $name = [string]$entry.FullName
      if ([System.IO.Path]::IsPathRooted($name) -or $name -match '(^|[\\/])\.\.([\\/]|$)') {
        throw "Release package contains an unsafe path: $name"
      }
    }
  } finally {
    $archive.Dispose()
  }
}

function Resolve-GldnStagedExtensionRoot {
  param([string]$ExtractRoot)
  $rootManifest = Join-Path $ExtractRoot "manifest.json"
  if (Test-Path -LiteralPath $rootManifest) { return $ExtractRoot }

  $manifest = Get-ChildItem -LiteralPath $ExtractRoot -Recurse -File -Filter "manifest.json" |
    Where-Object { $_.FullName -match '[\\/]extension[\\/]manifest\.json$' } |
    Select-Object -First 1
  if (-not $manifest) { throw "Release package does not contain extension\manifest.json." }
  return Split-Path $manifest.FullName -Parent
}

function Test-GldnStagedExtension {
  param([string]$ExtensionRoot, [string]$ExpectedVersion)
  foreach ($file in @("manifest.json", "background.js", "popup.html", "popup.js", "foundation.js", "shared.js")) {
    if (-not (Test-Path -LiteralPath (Join-Path $ExtensionRoot $file))) {
      throw "Release package is missing required extension file: $file"
    }
  }
  $version = Get-GldnManifestVersion $ExtensionRoot
  if ($version -ne $ExpectedVersion) {
    throw "Release metadata says $ExpectedVersion, but the package contains $version."
  }
  return $version
}

function New-GldnSnapshot {
  param([string]$InstallRoot, [string]$Reason = "update")
  $extensionRoot = Join-Path $InstallRoot "extension"
  if (-not (Test-Path -LiteralPath (Join-Path $extensionRoot "manifest.json"))) { return $null }

  $version = Get-GldnManifestVersion $extensionRoot
  $versionsRoot = Join-Path $InstallRoot "versions"
  New-Item -ItemType Directory -Force -Path $versionsRoot | Out-Null
  $snapshotRoot = Join-Path $versionsRoot ("{0}-{1}" -f $version, (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
  [void](Assert-GldnPathWithin $snapshotRoot $InstallRoot)
  New-Item -ItemType Directory -Force -Path $snapshotRoot | Out-Null
  Copy-Item -LiteralPath $extensionRoot -Destination (Join-Path $snapshotRoot "extension") -Recurse -Force
  [pscustomobject]@{
    version = $version
    reason = $Reason
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $snapshotRoot "snapshot.json") -Encoding UTF8

  $snapshots = @(Get-ChildItem -LiteralPath $versionsRoot -Directory | Sort-Object LastWriteTime -Descending)
  foreach ($old in ($snapshots | Select-Object -Skip 10)) {
    [void](Assert-GldnPathWithin $old.FullName $versionsRoot)
    Remove-Item -LiteralPath $old.FullName -Recurse -Force
  }
  return $snapshotRoot
}

function Restore-GldnExtensionTree {
  param([string]$SourceExtensionRoot, [string]$DestinationExtensionRoot, [string]$InstallRoot)
  [void](Assert-GldnPathWithin $DestinationExtensionRoot $InstallRoot)
  if (Test-Path -LiteralPath $DestinationExtensionRoot) {
    Remove-Item -LiteralPath $DestinationExtensionRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $DestinationExtensionRoot -Parent) | Out-Null
  Copy-Item -LiteralPath $SourceExtensionRoot -Destination $DestinationExtensionRoot -Recurse -Force
}

function Invoke-GldnExtensionUpdate {
  param(
    [string]$InstallRoot = (Get-GldnDefaultInstallRoot),
    [string]$MetadataUrl = $script:GldnDefaultMetadataUrl,
    [string]$MetadataPath = "",
    [string]$SourceZipPath = "",
    [switch]$Force
  )
  $InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
  New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
  $extensionRoot = Join-Path $InstallRoot "extension"
  $metadata = Read-GldnReleaseMetadata -MetadataUrl $MetadataUrl -MetadataPath $MetadataPath
  $targetVersion = [string]$metadata.version
  $currentVersion = Get-GldnManifestVersion $extensionRoot
  if ($metadata.minimumUpdaterVersion -and
      (ConvertTo-GldnVersion ([string]$metadata.minimumUpdaterVersion)) -gt (ConvertTo-GldnVersion $script:GldnUpdaterVersion)) {
    throw "This release requires updater v$($metadata.minimumUpdaterVersion). Run the newest one-time GLDN Ops installer first."
  }

  if ($currentVersion -and -not $Force -and (ConvertTo-GldnVersion $targetVersion) -le (ConvertTo-GldnVersion $currentVersion)) {
    return [pscustomobject]@{
      ok = $true
      updated = $false
      currentVersion = $currentVersion
      latestVersion = $targetVersion
      message = "GLDN Ops is already current."
    }
  }

  $mutex = [System.Threading.Mutex]::new($false, "Local\GLDN-Ops-Updater")
  $lockTaken = $false
  $tempRoot = Join-Path $InstallRoot ("staging\" + [guid]::NewGuid().ToString("N"))
  $zipPath = Join-Path $tempRoot "release.zip"
  $extractRoot = Join-Path $tempRoot "extract"
  $snapshotRoot = $null
  try {
    $lockTaken = $mutex.WaitOne([TimeSpan]::FromSeconds(5))
    if (-not $lockTaken) { throw "Another GLDN Ops update is already running." }
    New-Item -ItemType Directory -Force -Path $tempRoot, $extractRoot | Out-Null
    if ($SourceZipPath) {
      Copy-Item -LiteralPath (Resolve-Path -LiteralPath $SourceZipPath).Path -Destination $zipPath -Force
    } else {
      Invoke-WebRequest -UseBasicParsing -Uri ([string]$metadata.url) -OutFile $zipPath -TimeoutSec 120
    }
    $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
    if ($actualHash -ne ([string]$metadata.sha256).ToUpperInvariant()) {
      throw "Release checksum verification failed. No extension files were changed."
    }
    Test-GldnZipEntries $zipPath
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot -Force
    $stagedExtensionRoot = Resolve-GldnStagedExtensionRoot $extractRoot
    [void](Test-GldnStagedExtension $stagedExtensionRoot $targetVersion)

    $preservedConfig = $null
    $configPath = Join-Path $extensionRoot "config.js"
    if (Test-Path -LiteralPath $configPath) {
      $preservedConfig = [System.IO.File]::ReadAllBytes($configPath)
    }
    $snapshotRoot = New-GldnSnapshot -InstallRoot $InstallRoot -Reason "before-update-to-$targetVersion"
    try {
      Restore-GldnExtensionTree -SourceExtensionRoot $stagedExtensionRoot -DestinationExtensionRoot $extensionRoot -InstallRoot $InstallRoot
      if ($preservedConfig) {
        [System.IO.File]::WriteAllBytes((Join-Path $extensionRoot "config.js"), $preservedConfig)
      }
      [void](Test-GldnStagedExtension $extensionRoot $targetVersion)
    } catch {
      if ($snapshotRoot) {
        Restore-GldnExtensionTree -SourceExtensionRoot (Join-Path $snapshotRoot "extension") -DestinationExtensionRoot $extensionRoot -InstallRoot $InstallRoot
      }
      throw
    }

    $state = [pscustomobject]@{
      updaterVersion = $script:GldnUpdaterVersion
      currentVersion = $targetVersion
      previousVersion = $currentVersion
      updatedAt = (Get-Date).ToUniversalTime().ToString("o")
      releaseUrl = [string]$metadata.url
      sha256 = $actualHash
    }
    $state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallRoot "updater-state.json") -Encoding UTF8
    return [pscustomobject]@{
      ok = $true
      updated = $true
      previousVersion = $currentVersion
      currentVersion = $targetVersion
      latestVersion = $targetVersion
      rollbackAvailable = [bool]$snapshotRoot
      message = "GLDN Ops updated to v$targetVersion."
    }
  } finally {
    if ($lockTaken) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
    if (Test-Path -LiteralPath $tempRoot) {
      [void](Assert-GldnPathWithin $tempRoot $InstallRoot)
      Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
  }
}

function Get-GldnSnapshots {
  param([string]$InstallRoot = (Get-GldnDefaultInstallRoot))
  $versionsRoot = Join-Path $InstallRoot "versions"
  if (-not (Test-Path -LiteralPath $versionsRoot)) { return @() }
  return @(Get-ChildItem -LiteralPath $versionsRoot -Directory | Sort-Object LastWriteTime -Descending | ForEach-Object {
    $metadataPath = Join-Path $_.FullName "snapshot.json"
    $metadata = if (Test-Path -LiteralPath $metadataPath) { Get-Content -Raw -LiteralPath $metadataPath | ConvertFrom-Json } else { $null }
    [pscustomobject]@{
      id = $_.Name
      version = if ($metadata) { [string]$metadata.version } else { Get-GldnManifestVersion (Join-Path $_.FullName "extension") }
      reason = if ($metadata) { [string]$metadata.reason } else { "legacy" }
      createdAt = if ($metadata) { [string]$metadata.createdAt } else { $_.LastWriteTimeUtc.ToString("o") }
      path = $_.FullName
    }
  })
}

function Invoke-GldnExtensionRollback {
  param(
    [string]$InstallRoot = (Get-GldnDefaultInstallRoot),
    [string]$SnapshotId = ""
  )
  $InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
  $snapshots = @(Get-GldnSnapshots $InstallRoot)
  $selected = if ($SnapshotId) { $snapshots | Where-Object id -eq $SnapshotId | Select-Object -First 1 } else { $snapshots | Select-Object -First 1 }
  if (-not $selected) { throw "No GLDN Ops rollback version is available." }
  [void](Assert-GldnPathWithin $selected.path (Join-Path $InstallRoot "versions"))
  $sourceExtensionRoot = Join-Path $selected.path "extension"
  [void](Test-GldnStagedExtension $sourceExtensionRoot ([string]$selected.version))
  $currentVersion = Get-GldnManifestVersion (Join-Path $InstallRoot "extension")
  [void](New-GldnSnapshot -InstallRoot $InstallRoot -Reason "before-rollback-to-$($selected.version)")
  Restore-GldnExtensionTree -SourceExtensionRoot $sourceExtensionRoot -DestinationExtensionRoot (Join-Path $InstallRoot "extension") -InstallRoot $InstallRoot
  return [pscustomobject]@{
    ok = $true
    rolledBack = $true
    previousVersion = $currentVersion
    currentVersion = [string]$selected.version
    snapshotId = [string]$selected.id
    message = "GLDN Ops rolled back to v$($selected.version)."
  }
}

function Get-GldnUpdaterStatus {
  param(
    [string]$InstallRoot = (Get-GldnDefaultInstallRoot),
    [string]$MetadataUrl = $script:GldnDefaultMetadataUrl,
    [switch]$Refresh
  )
  $currentVersion = Get-GldnManifestVersion (Join-Path $InstallRoot "extension")
  $latestVersion = ""
  $errorMessage = ""
  if ($Refresh) {
    try { $latestVersion = [string](Read-GldnReleaseMetadata -MetadataUrl $MetadataUrl).version } catch { $errorMessage = $_.Exception.Message }
  }
  return [pscustomobject]@{
    ok = [bool]$currentVersion
    service = "gldn-update-agent"
    updaterVersion = $script:GldnUpdaterVersion
    currentVersion = $currentVersion
    diskVersion = $currentVersion
    latestVersion = $latestVersion
    updateAvailable = [bool]($latestVersion -and $currentVersion -and (ConvertTo-GldnVersion $latestVersion) -gt (ConvertTo-GldnVersion $currentVersion))
    rollbackCount = @(Get-GldnSnapshots $InstallRoot).Count
    installRoot = $InstallRoot
    error = $errorMessage
  }
}
