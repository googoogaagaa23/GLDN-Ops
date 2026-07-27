param(
  [ValidateSet("Inspect", "Open", "Focus", "ReloadTab", "InspectPage", "ReadState", "PageAction")]
  [string]$Action = "Inspect",
  [string]$Url = "",
  [ValidateSet("", "ebay", "poshmark", "amazon", "ecomsniper")]
  [string]$Platform = "",
  [string]$PageAction = "",
  [int]$TabId = 0,
  [string[]]$Keys = @(),
  [int]$WaitSeconds = 90,
  [switch]$NoWait
)

$ErrorActionPreference = "Stop"

function Get-GldnControlConfiguration {
  $defaultRoot = Join-Path $env:LOCALAPPDATA "GLDN Ops"
  $defaultConfigPath = Join-Path $defaultRoot "updater.json"
  if (-not (Test-Path -LiteralPath $defaultConfigPath)) {
    throw "GLDN Ops updater setup is missing. Run the one-time GLDN Ops installer."
  }
  $defaultConfig = Get-Content -Raw -LiteralPath $defaultConfigPath | ConvertFrom-Json
  $installRoot = [System.IO.Path]::GetFullPath([string]$defaultConfig.installRoot)
  $runtimeConfigPath = Join-Path $installRoot "updater.json"
  $runtimeConfig = if (Test-Path -LiteralPath $runtimeConfigPath) {
    Get-Content -Raw -LiteralPath $runtimeConfigPath | ConvertFrom-Json
  } else {
    $defaultConfig
  }
  $token = [string]$runtimeConfig.controlToken
  if ($token.Length -lt 40) {
    throw "The installed updater does not have the Profile 2 control token yet. Restart the GLDN Ops updater once."
  }
  return [pscustomobject]@{
    installRoot = $installRoot
    port = if ($runtimeConfig.port) { [int]$runtimeConfig.port } else { 39417 }
    token = $token
  }
}

function Get-Profile2GldnExtension {
  $profileRoot = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data\Profile 2"
  $preferencesPath = Join-Path $profileRoot "Secure Preferences"
  if (-not (Test-Path -LiteralPath $preferencesPath)) {
    throw "Chrome Profile 2 was not found."
  }
  $preferences = Get-Content -Raw -LiteralPath $preferencesPath | ConvertFrom-Json
  $matches = @()
  foreach ($property in $preferences.extensions.settings.PSObject.Properties) {
    $entry = $property.Value
    if ([int]$entry.location -ne 4) { continue }
    $root = [Environment]::ExpandEnvironmentVariables([string]$entry.path)
    if (-not $root -or -not [System.IO.Path]::IsPathRooted($root)) { continue }
    $manifestPath = Join-Path $root "manifest.json"
    if (-not (Test-Path -LiteralPath $manifestPath)) { continue }
    try { $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json } catch { continue }
    if ([string]$manifest.name -ne "GLDN Ops") { continue }
    $matches += [pscustomobject]@{
      extensionId = [string]$property.Name
      extensionRoot = [System.IO.Path]::GetFullPath($root)
      version = [string]$manifest.version
    }
  }
  if ($matches.Count -ne 1) {
    throw "Local control requires exactly one unpacked GLDN Ops instance in signed-in Chrome Profile 2."
  }
  return $matches[0]
}

function ConvertTo-ControlRequest {
  param([string]$Name)
  switch ($Name) {
    "Inspect" { return [pscustomobject]@{ action = "inspect-session"; payload = [pscustomobject]@{} } }
    "Open" {
      if (-not $Url) { throw "Open requires -Url." }
      return [pscustomobject]@{ action = "open-url"; payload = [pscustomobject]@{ url = $Url; reuse = $true; active = $true } }
    }
    "Focus" {
      if ($TabId -le 0) { throw "Focus requires -TabId." }
      return [pscustomobject]@{ action = "focus-tab"; payload = [pscustomobject]@{ tabId = $TabId } }
    }
    "ReloadTab" {
      if ($TabId -le 0) { throw "ReloadTab requires -TabId." }
      return [pscustomobject]@{ action = "reload-tab"; payload = [pscustomobject]@{ tabId = $TabId } }
    }
    "InspectPage" {
      return [pscustomobject]@{ action = "inspect-page"; payload = [pscustomobject]@{ tabId = $TabId; platform = $Platform } }
    }
    "ReadState" {
      $requestedKeys = if ($Keys.Count) { $Keys } else { @(
        "computerLabel",
        "ebayAccountLabel",
        "pendingMove99Run",
        "pendingMarkShippedRun",
        "pendingSellerLevelScan",
        "pendingEbaySnapshotScan",
        "pendingReviewMonthlyLimits",
        "poshmarkProfitBackfill",
        "gldnErrorLog"
      ) }
      return [pscustomobject]@{ action = "read-state"; payload = [pscustomobject]@{ keys = $requestedKeys } }
    }
    "PageAction" {
      if (-not $Platform -or -not $PageAction) { throw "PageAction requires -Platform and -PageAction." }
      return [pscustomobject]@{
        action = "page-action"
        payload = [pscustomobject]@{ tabId = $TabId; platform = $Platform; action = $PageAction; waitMs = 3500 }
      }
    }
  }
}

$config = Get-GldnControlConfiguration
$extension = Get-Profile2GldnExtension
$expectedRoot = [System.IO.Path]::GetFullPath((Join-Path $config.installRoot "extension"))
if ($extension.extensionRoot -ine $expectedRoot) {
  throw "Profile 2 is loading a different GLDN Ops folder. Local control stopped instead of using the wrong copy."
}

$request = ConvertTo-ControlRequest -Name $Action
$body = [pscustomobject]@{
  extensionId = $extension.extensionId
  action = $request.action
  payload = $request.payload
} | ConvertTo-Json -Depth 8 -Compress
$baseUrl = "http://127.0.0.1:$($config.port)/v1/control"
$headers = @{ "X-GLDN-Control" = $config.token }
$queued = Invoke-RestMethod -Method Post -Uri "$baseUrl/commands" -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 5
if ($NoWait) {
  $queued | ConvertTo-Json -Depth 8 -Compress
  exit 0
}

$deadline = [DateTime]::UtcNow.AddSeconds([Math]::Max(5, [Math]::Min(300, $WaitSeconds)))
do {
  Start-Sleep -Milliseconds 500
  $result = Invoke-RestMethod -Method Get -Uri "$baseUrl/results?commandId=$($queued.commandId)" -Headers $headers -TimeoutSec 5
  if (-not $result.pending) {
    $result | ConvertTo-Json -Depth 12 -Compress
    if ($result.commandOk -ne $true) { exit 1 }
    exit 0
  }
} while ([DateTime]::UtcNow -lt $deadline)

throw "Profile 2 did not answer local-control command $($queued.commandId) before the timeout."
