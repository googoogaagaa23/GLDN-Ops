param(
  [ValidateSet("Status", "Reload", "Snapshot", "Restore")]
  [string]$Action = "Status",
  [string]$ProfileDirectory = "",
  [string]$Version = "",
  [string]$ExtensionRoot = "",
  [switch]$SkipReload
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $ExtensionRoot) { $ExtensionRoot = Join-Path $repoRoot "extension" }
$ExtensionRoot = (Resolve-Path -LiteralPath $ExtensionRoot).Path
$versionsRoot = Join-Path $repoRoot "extension_versions"
$chromeUserData = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"

function Assert-WithinRepo([string]$Path) {
  $resolved = [System.IO.Path]::GetFullPath($Path)
  $prefix = $repoRoot.TrimEnd('\') + '\'
  if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify a path outside the GLDN project: $resolved"
  }
  return $resolved
}

function Find-ChromeExe {
  $command = Get-Command "chrome.exe" -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $candidates = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
  )
  return $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
}

function Get-ProfileNames {
  $names = @{}
  $localState = Join-Path $chromeUserData "Local State"
  if (-not (Test-Path -LiteralPath $localState)) { return $names }
  try {
    $state = Get-Content -Raw -LiteralPath $localState | ConvertFrom-Json
    foreach ($property in $state.profile.info_cache.PSObject.Properties) {
      $names[$property.Name] = [string]$property.Value.name
    }
  } catch {}
  return $names
}

function Same-Path([string]$Left, [string]$Right) {
  if (-not $Left -or -not $Right) { return $false }
  try {
    return [System.IO.Path]::GetFullPath($Left).TrimEnd('\').Equals(
      [System.IO.Path]::GetFullPath($Right).TrimEnd('\'),
      [StringComparison]::OrdinalIgnoreCase
    )
  } catch { return $false }
}

function Get-GldnInstalls {
  if (-not (Test-Path -LiteralPath $chromeUserData)) { return @() }
  $profileNames = Get-ProfileNames
  $installs = @()
  Get-ChildItem -LiteralPath $chromeUserData -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $directory = $_.Name
    if ($ProfileDirectory -and $directory -ne $ProfileDirectory) { return }
    $securePreferences = Join-Path $_.FullName "Secure Preferences"
    if (-not (Test-Path -LiteralPath $securePreferences)) { return }
    try {
      $preferences = Get-Content -Raw -LiteralPath $securePreferences | ConvertFrom-Json
      foreach ($property in $preferences.extensions.settings.PSObject.Properties) {
        $entry = $property.Value
        if (-not (Same-Path ([string]$entry.path) $ExtensionRoot)) { continue }
        $installs += [pscustomobject]@{
          ProfileDirectory = $directory
          ProfileName = $(if ($profileNames.ContainsKey($directory)) { $profileNames[$directory] } else { $directory })
          ExtensionId = $property.Name
          ExtensionPath = [string]$entry.path
          Enabled = [int]$entry.disable_reasons -eq 0
        }
      }
    } catch {
      Write-Warning "Could not inspect Chrome profile $directory`: $($_.Exception.Message)"
    }
  }
  return @($installs)
}

function Get-ManifestVersion {
  $manifest = Get-Content -Raw -LiteralPath (Join-Path $ExtensionRoot "manifest.json") | ConvertFrom-Json
  return [string]$manifest.version
}

function Copy-ExtensionRuntime([string]$Source, [string]$Destination) {
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Get-ChildItem -LiteralPath $Source -Force | Where-Object { $_.Name -ne "config.js" } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
  }
}

function Save-Snapshot([string]$Label = "") {
  if (-not $Label) { $Label = Get-ManifestVersion }
  New-Item -ItemType Directory -Force -Path $versionsRoot | Out-Null
  $base = Join-Path $versionsRoot ("v" + $Label.TrimStart('v'))
  $target = $base
  if (Test-Path -LiteralPath $target) { $target = "$base-$(Get-Date -Format 'yyyyMMdd-HHmmss')" }
  Assert-WithinRepo $target | Out-Null
  Copy-ExtensionRuntime $ExtensionRoot $target
  [System.IO.File]::WriteAllText((Join-Path $versionsRoot "latest.txt"), (Split-Path $target -Leaf))
  return $target
}

function Restore-Snapshot([string]$Label) {
  if (-not $Label) { throw "Restore requires -Version, for example -Version 3.6.21." }
  $folder = if ($Label.StartsWith('v')) { $Label } else { "v$Label" }
  $source = Join-Path $versionsRoot $folder
  if (-not (Test-Path -LiteralPath $source)) {
    $source = Get-ChildItem -LiteralPath $versionsRoot -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like "$folder-*" } | Sort-Object LastWriteTime -Descending |
      Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not $source -or -not (Test-Path -LiteralPath $source)) { throw "Snapshot not found: $folder" }
  Assert-WithinRepo $source | Out-Null
  Assert-WithinRepo $ExtensionRoot | Out-Null

  $safetySnapshot = Save-Snapshot ((Get-ManifestVersion) + "-before-restore")
  Write-Host "Safety snapshot: $safetySnapshot"
  Get-ChildItem -LiteralPath $ExtensionRoot -Force | Where-Object { $_.Name -ne "config.js" } | ForEach-Object {
    $target = Assert-WithinRepo $_.FullName
    Remove-Item -LiteralPath $target -Recurse -Force
  }
  Copy-ExtensionRuntime $source $ExtensionRoot
  Write-Host "Restored: $source"
}

function Reload-Installs {
  $chrome = Find-ChromeExe
  if (-not $chrome) { throw "Google Chrome was not found." }
  $installs = @(Get-GldnInstalls)
  if (-not $installs.Count) {
    throw "No unpacked GLDN Ops installation points to $ExtensionRoot. Load that folder once in the intended Chrome profile."
  }
  foreach ($install in $installs) {
    $url = "chrome-extension://$($install.ExtensionId)/reload.html"
    # Start-Process joins ArgumentList values into one command line. Preserve the
    # space in profile directories such as "Profile 2" so Chrome cannot route
    # the reload page to a different profile.
    $profileArgument = '--profile-directory="{0}"' -f ($install.ProfileDirectory -replace '"', '\"')
    Start-Process -FilePath $chrome -ArgumentList @($profileArgument, $url) -WindowStyle Hidden
    Write-Host "Reload requested: $($install.ProfileName) [$($install.ProfileDirectory)] $($install.ExtensionId)"
  }
}

switch ($Action) {
  "Status" {
    $installs = @(Get-GldnInstalls)
    Write-Host "GLDN Ops local version: $(Get-ManifestVersion)"
    Write-Host "Extension folder: $ExtensionRoot"
    if ($installs.Count) { $installs | Format-Table ProfileName, ProfileDirectory, ExtensionId, Enabled -AutoSize }
    else { Write-Host "No Chrome profiles currently load this exact extension folder." }
  }
  "Reload" { Reload-Installs }
  "Snapshot" { Write-Host "Saved snapshot: $(Save-Snapshot $Version)" }
  "Restore" { Restore-Snapshot $Version; if (-not $SkipReload) { Reload-Installs } }
}
