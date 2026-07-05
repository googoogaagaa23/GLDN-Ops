param(
  [ValidateSet("Snapshot", "List", "Restore", "Reload")]
  [string]$Action = "List",
  [string]$Version = "",
  [string]$ExtensionId = "ddfegcgadpkgegbjnbipbmbogcllcjci",
  [switch]$ReloadAfter
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$extensionRoot = Resolve-Path (Join-Path $repoRoot "extension")
$versionsRoot = Join-Path $repoRoot "extension_versions"

function Get-ExtensionVersion {
  $manifestPath = Join-Path $extensionRoot "manifest.json"
  $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
  return [string]$manifest.version
}

function Assert-InRepo([string]$Path) {
  $resolved = [System.IO.Path]::GetFullPath($Path)
  if (-not $resolved.StartsWith($repoRoot.Path, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to operate outside the project folder: $resolved"
  }
  return $resolved
}

function Copy-ExtensionFiles([string]$From, [string]$To) {
  New-Item -ItemType Directory -Force -Path $To | Out-Null
  Get-ChildItem -LiteralPath $From -Force | Where-Object { $_.Name -ne "config.js" } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $To -Recurse -Force
  }
}

function Invoke-ExtensionReload {
  if (-not $ExtensionId) {
    Write-Host "No extension ID supplied. Reload skipped."
    return
  }
  $reloadUrl = "chrome-extension://$ExtensionId/reload.html"
  $chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  $chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $chrome) {
    Write-Host "Chrome was not found. Open this URL manually: $reloadUrl"
    return
  }
  Start-Process -FilePath $chrome -ArgumentList @($reloadUrl) -WindowStyle Hidden
  Write-Host "Opened extension reload URL: $reloadUrl"
}

New-Item -ItemType Directory -Force -Path $versionsRoot | Out-Null

switch ($Action) {
  "Snapshot" {
    if (-not $Version) { $Version = Get-ExtensionVersion }
    $target = Join-Path $versionsRoot "v$Version"
    Assert-InRepo $target | Out-Null
    if (Test-Path $target) {
      $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
      $target = Join-Path $versionsRoot "v$Version-$stamp"
    }
    Copy-ExtensionFiles -From $extensionRoot -To $target
    Set-Content -Path (Join-Path $versionsRoot "latest.txt") -Value (Split-Path $target -Leaf)
    Write-Host "Saved snapshot: $target"
  }
  "List" {
    Get-ChildItem -Path $versionsRoot -Directory | Sort-Object Name | ForEach-Object { $_.Name }
  }
  "Restore" {
    if (-not $Version) { throw "Use -Version 3.1.6 or -Version v3.1.6." }
    $folderName = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
    $source = Join-Path $versionsRoot $folderName
    if (-not (Test-Path $source)) { throw "Snapshot not found: $source" }
    Assert-InRepo $source | Out-Null
    Get-ChildItem -LiteralPath $extensionRoot -Force | Where-Object { $_.Name -ne "config.js" } | ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
    Copy-ExtensionFiles -From $source -To $extensionRoot
    Write-Host "Restored snapshot $folderName into extension folder."
    if ($ReloadAfter) { Invoke-ExtensionReload }
  }
  "Reload" {
    Invoke-ExtensionReload
  }
}
