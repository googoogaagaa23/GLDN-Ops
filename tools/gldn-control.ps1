param(
  [ValidateSet("Inspect", "Open", "Navigate", "Focus", "ReloadTab", "InspectTab", "InspectTutorialVideo", "InspectAmazonSubscribeSave", "InspectEbayVariations", "CloseTab", "InspectPage", "InspectMove99", "InspectMove99FinalReview", "ApproveMove99FinalReview", "PrepareVariationEndReview", "OpenExtension", "OpenDashboard", "ExtensionAction", "ReadState", "ReadEbayProfitReview", "ReadProfitBackfillReview", "PageAction", "ResetState", "ReloadExtension")]
  [string]$Action = "Inspect",
  [string]$Url = "",
  [ValidateSet("", "ebay", "poshmark", "amazon", "ecomsniper")]
  [string]$Platform = "",
  [string]$PageAction = "",
  [string]$ConfirmationToken = "",
  [string]$MonthKey = "",
  [int]$ExpectedCount = 0,
  [string]$WorkspaceId = "",
  [string[]]$ItemIds = @(),
  [string]$ItemIdsFile = "",
  [int]$SelectedTotal = 0,
  [string]$ReportName = "",
  [string]$ReportFingerprint = "",
  [ValidateSet("", "popup", "onboarding", "guide", "variations", "policyaudit", "preflight")]
  [string]$ExtensionPage = "",
  [ValidateSet("", "health-check", "dashboard-test", "dashboard-retry", "dashboard-setup", "variation-scan", "policy-listing-scan", "listing-preflight-proof", "ecomsniper-handoff-proof", "sync-ebay-monthly-profit", "start-ebay-amazon-resolution")]
  [string]$ExtensionAction = "",
  [int]$TabId = 0,
  [string[]]$Keys = @(),
  [ValidateSet("all", "exact", "unresolved")]
  [string]$ReviewStatus = "all",
  [int]$Offset = 0,
  [int]$Limit = 50,
  [int]$WaitSeconds = 90,
  [switch]$Background,
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
      return [pscustomobject]@{ action = "open-url"; payload = [pscustomobject]@{ url = $Url; reuse = $true; active = -not $Background.IsPresent } }
    }
    "Navigate" {
      if ($TabId -le 0) { throw "Navigate requires -TabId." }
      if (-not $Url) { throw "Navigate requires -Url." }
      return [pscustomobject]@{ action = "navigate-tab"; payload = [pscustomobject]@{ tabId = $TabId; url = $Url; active = -not $Background.IsPresent } }
    }
    "Focus" {
      if ($TabId -le 0) { throw "Focus requires -TabId." }
      return [pscustomobject]@{ action = "focus-tab"; payload = [pscustomobject]@{ tabId = $TabId } }
    }
    "ReloadTab" {
      if ($TabId -le 0) { throw "ReloadTab requires -TabId." }
      return [pscustomobject]@{ action = "reload-tab"; payload = [pscustomobject]@{ tabId = $TabId } }
    }
    "InspectTab" {
      if ($TabId -le 0) { throw "InspectTab requires -TabId." }
      return [pscustomobject]@{ action = "inspect-tab"; payload = [pscustomobject]@{ tabId = $TabId } }
    }
    "InspectTutorialVideo" {
      return [pscustomobject]@{
        action = "inspect-tutorial-video"
        payload = [pscustomobject]@{ tabId = $TabId; url = $Url }
      }
    }
    "InspectAmazonSubscribeSave" {
      return [pscustomobject]@{
        action = "inspect-amazon-subscribe-save"
        payload = [pscustomobject]@{ tabId = $TabId; url = $Url }
      }
    }
    "InspectEbayVariations" {
      if ($TabId -le 0) { throw "InspectEbayVariations requires -TabId." }
      return [pscustomobject]@{
        action = "inspect-ebay-variations"
        payload = [pscustomobject]@{ tabId = $TabId; url = $Url }
      }
    }
    "CloseTab" {
      if ($TabId -le 0) { throw "CloseTab requires -TabId." }
      return [pscustomobject]@{ action = "close-tab"; payload = [pscustomobject]@{ tabId = $TabId } }
    }
    "InspectPage" {
      return [pscustomobject]@{ action = "inspect-page"; payload = [pscustomobject]@{ tabId = $TabId; platform = $Platform } }
    }
    "InspectMove99" {
      return [pscustomobject]@{ action = "inspect-move99"; payload = [pscustomobject]@{ tabId = $TabId } }
    }
    "InspectMove99FinalReview" {
      if ($TabId -le 0 -or $ExpectedCount -le 0 -or -not $WorkspaceId -or -not $ConfirmationToken) {
        throw "InspectMove99FinalReview requires -TabId, -ExpectedCount, -WorkspaceId, and -ConfirmationToken."
      }
      return [pscustomobject]@{
        action = "inspect-move99-final-review"
        payload = [pscustomobject]@{
          tabId = $TabId
          url = $Url
          expectedCount = $ExpectedCount
          workspaceId = $WorkspaceId
          confirmationToken = $ConfirmationToken
        }
      }
    }
    "ApproveMove99FinalReview" {
      if ($TabId -le 0 -or $ExpectedCount -le 0 -or -not $WorkspaceId -or -not $ConfirmationToken) {
        throw "ApproveMove99FinalReview requires -TabId, -ExpectedCount, -WorkspaceId, and -ConfirmationToken."
      }
      return [pscustomobject]@{
        action = "approve-move99-final-review"
        payload = [pscustomobject]@{
          tabId = $TabId
          url = $Url
          expectedCount = $ExpectedCount
          workspaceId = $WorkspaceId
          confirmationToken = $ConfirmationToken
        }
      }
    }
    "PrepareVariationEndReview" {
      $resolvedItemIds = @($ItemIds | ForEach-Object { [string]$_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
      if ($ItemIdsFile) {
        $itemIdsPath = [System.IO.Path]::GetFullPath($ItemIdsFile)
        if (-not (Test-Path -LiteralPath $itemIdsPath -PathType Leaf)) {
          throw "PrepareVariationEndReview could not find -ItemIdsFile."
        }
        try {
          $fileValue = Get-Content -Raw -LiteralPath $itemIdsPath | ConvertFrom-Json
        } catch {
          throw "PrepareVariationEndReview requires -ItemIdsFile to contain a JSON array or an object with itemIds."
        }
        $fileIds = if ($fileValue.PSObject.Properties.Name -contains "itemIds") { @($fileValue.itemIds) } else { @($fileValue) }
        $resolvedItemIds += @($fileIds | ForEach-Object { [string]$_ })
      }
      $resolvedItemIds = @($resolvedItemIds | ForEach-Object { $_.Trim() } | Where-Object { $_ })
      $uniqueItemIds = @($resolvedItemIds | Select-Object -Unique)
      if ($resolvedItemIds.Count -lt 1 -or
          $resolvedItemIds.Count -gt 200 -or
          $uniqueItemIds.Count -ne $resolvedItemIds.Count -or
          @($resolvedItemIds | Where-Object { $_ -notmatch '^\d{9,15}$' }).Count) {
        throw "PrepareVariationEndReview requires 1 to 200 unique eBay parent item numbers."
      }
      $resolvedSelectedTotal = if ($SelectedTotal -gt 0) { $SelectedTotal } else { $resolvedItemIds.Count }
      if ($resolvedSelectedTotal -lt $resolvedItemIds.Count) {
        throw "PrepareVariationEndReview -SelectedTotal cannot be less than the batch count."
      }
      return [pscustomobject]@{
        action = "prepare-variation-end-review"
        payload = [pscustomobject]@{
          itemIds = $resolvedItemIds
          selectedTotal = $resolvedSelectedTotal
          reportName = $ReportName
          reportFingerprint = $ReportFingerprint
        }
      }
    }
    "OpenExtension" {
      if (-not $ExtensionPage) { throw "OpenExtension requires -ExtensionPage." }
      return [pscustomobject]@{
        action = "open-extension-page"
        payload = [pscustomobject]@{ page = $ExtensionPage; active = -not $Background.IsPresent }
      }
    }
    "OpenDashboard" {
      return [pscustomobject]@{
        action = "open-dashboard"
        payload = [pscustomobject]@{ active = -not $Background.IsPresent }
      }
    }
    "ExtensionAction" {
      if (-not $ExtensionAction) { throw "ExtensionAction requires -ExtensionAction." }
      if ($ExtensionAction -eq "start-ebay-amazon-resolution" -and $MonthKey -cnotmatch '^\d{4}-(?:0[1-9]|1[0-2])$') {
        throw "start-ebay-amazon-resolution requires -MonthKey YYYY-MM."
      }
      return [pscustomobject]@{
        action = "extension-action"
        payload = [pscustomobject]@{ action = $ExtensionAction; confirmationToken = $ConfirmationToken; monthKey = $MonthKey }
      }
    }
    "ReadState" {
      $requestedKeys = if ($Keys.Count) { $Keys } else { @(
        "settingsSchemaVersion",
        "computerLabel",
        "ebayAccountLabel",
        "gldnUiOpacity",
        "gldnUiTheme",
        "move99AccountSettings",
        "dashboardConfigurationStatus",
        "dashboardQueueSummary",
        "pendingMove99Run",
        "pendingVariationEndReview",
        "lastVariationEndResult",
        "ebayPolicyListingScanState",
        "ebayPolicyListingAudit",
        "pendingPolicyListingEndReview",
        "lastPolicyListingEndResult",
        "pendingMarkShippedRun",
        "pendingSellerLevelScan",
        "pendingEbaySnapshotScan",
        "pendingReviewMonthlyLimits",
        "latestAccountHealth",
        "latestEbaySnapshot",
        "latestListingStatus",
        "latestPoshmarkStats",
        "latestPoshmarkVisibleSales",
        "latestMarketplaceProfit",
        "ebayMonthlyProfit",
        "poshmarkProfitBackfill",
        "gldnErrorLog"
      ) }
      $requestedKeys = @($requestedKeys | ForEach-Object { [string]$_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
      return [pscustomobject]@{ action = "read-state"; payload = [pscustomobject]@{ keys = $requestedKeys } }
    }
    "ReadEbayProfitReview" {
      if ($Offset -lt 0 -or $Offset -gt 5000) { throw "ReadEbayProfitReview -Offset must be between 0 and 5000." }
      if ($Limit -lt 1 -or $Limit -gt 100) { throw "ReadEbayProfitReview -Limit must be between 1 and 100." }
      return [pscustomobject]@{
        action = "read-ebay-profit-review"
        payload = [pscustomobject]@{ status = $ReviewStatus; offset = $Offset; limit = $Limit }
      }
    }
    "ReadProfitBackfillReview" {
      if ($Offset -lt 0 -or $Offset -gt 5000) { throw "ReadProfitBackfillReview -Offset must be between 0 and 5000." }
      if ($Limit -lt 1 -or $Limit -gt 100) { throw "ReadProfitBackfillReview -Limit must be between 1 and 100." }
      return [pscustomobject]@{
        action = "read-profit-backfill-review"
        payload = [pscustomobject]@{ status = $ReviewStatus; offset = $Offset; limit = $Limit }
      }
    }
    "PageAction" {
      if (-not $Platform -or -not $PageAction) { throw "PageAction requires -Platform and -PageAction." }
      return [pscustomobject]@{
        action = "page-action"
        payload = [pscustomobject]@{
          tabId = $TabId
          platform = $Platform
          action = $PageAction
          url = $Url
          waitMs = 3500
          confirmationToken = $ConfirmationToken
          monthKey = $MonthKey
        }
      }
    }
    "ResetState" { return [pscustomobject]@{ action = "reset-state"; payload = [pscustomobject]@{} } }
    "ReloadExtension" { return [pscustomobject]@{ action = "reload-extension"; payload = [pscustomobject]@{} } }
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
