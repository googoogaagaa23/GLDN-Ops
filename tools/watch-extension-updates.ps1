param(
  [string]$ExtensionId = "ddfegcgadpkgegbjnbipbmbogcllcjci",
  [int]$QuietSeconds = 6
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$extensionRoot = Resolve-Path (Join-Path $repoRoot "extension")
$versionTool = Join-Path $PSScriptRoot "extension-version.ps1"
$statePath = Join-Path $repoRoot "extension_versions\watcher-state.txt"

function Get-ManifestVersion {
  $manifest = Get-Content (Join-Path $extensionRoot "manifest.json") -Raw | ConvertFrom-Json
  return [string]$manifest.version
}

function Read-LastVersion {
  if (Test-Path $statePath) { return (Get-Content $statePath -Raw).Trim() }
  return ""
}

function Save-LastVersion([string]$Version) {
  New-Item -ItemType Directory -Force -Path (Split-Path $statePath -Parent) | Out-Null
  Set-Content -Path $statePath -Value $Version
}

function Invoke-SettledUpdate {
  try {
    $version = Get-ManifestVersion
    $lastVersion = Read-LastVersion
    if ($version -and $version -ne $lastVersion) {
      powershell -NoProfile -ExecutionPolicy Bypass -File $versionTool -Action Snapshot -Version $version | Out-Host
      Save-LastVersion $version
    }
    powershell -NoProfile -ExecutionPolicy Bypass -File $versionTool -Action Reload -ExtensionId $ExtensionId | Out-Host
    Write-Host "Reload triggered for Juice H8er $version. Refresh open eBay/Amazon tabs for new content scripts."
  } catch {
    Write-Host "Watcher update failed: $($_.Exception.Message)"
  }
}

New-Item -ItemType Directory -Force -Path (Split-Path $statePath -Parent) | Out-Null
if (-not (Read-LastVersion)) { Save-LastVersion (Get-ManifestVersion) }

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $extensionRoot.Path
$watcher.IncludeSubdirectories = $true
$watcher.Filter = "*.*"
$watcher.EnableRaisingEvents = $true

$script:lastChange = Get-Date
$script:pending = $false

$action = {
  $name = $Event.SourceEventArgs.Name
  if ($name -match '(^|\\)config\.js$') { return }
  if ($name -match '\.(tmp|crdownload)$') { return }
  $script:lastChange = Get-Date
  $script:pending = $true
}

$subscriptions = @()
$subscriptions += Register-ObjectEvent -InputObject $watcher -EventName "Changed" -Action $action
$subscriptions += Register-ObjectEvent -InputObject $watcher -EventName "Created" -Action $action
$subscriptions += Register-ObjectEvent -InputObject $watcher -EventName "Deleted" -Action $action
$subscriptions += Register-ObjectEvent -InputObject $watcher -EventName "Renamed" -Action $action

Write-Host "Watching extension updates in $($extensionRoot.Path). Press Ctrl+C to stop."

try {
  while ($true) {
    Start-Sleep -Seconds 1
    if (-not $script:pending) { continue }
    if (((Get-Date) - $script:lastChange).TotalSeconds -lt $QuietSeconds) { continue }
    $script:pending = $false
    Invoke-SettledUpdate
  }
} finally {
  $subscriptions | ForEach-Object { Unregister-Event -SubscriptionId $_.Id -ErrorAction SilentlyContinue }
  $watcher.Dispose()
}
