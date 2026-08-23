param(
  [ValidateSet("Serve", "Status", "Update", "Versions", "Rollback")]
  [string]$Action = "Serve",
  [string]$InstallRoot = "",
  [string]$MetadataUrl = "",
  [string]$MetadataPath = "",
  [string]$SourceZipPath = "",
  [string]$SnapshotId = "",
  [int]$Port = 39417,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "gldn-update-core.ps1")

$defaultRoot = Get-GldnDefaultInstallRoot
$configPath = Join-Path $defaultRoot "updater.json"
if (Test-Path -LiteralPath $configPath) {
  try { $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json } catch { $config = $null }
} else {
  $config = $null
}
if (-not $InstallRoot) { $InstallRoot = if ($config.installRoot) { [string]$config.installRoot } else { $defaultRoot } }
if (-not $MetadataUrl) { $MetadataUrl = if ($config.metadataUrl) { [string]$config.metadataUrl } else { $script:GldnDefaultMetadataUrl } }
if ($config.port -and $Port -eq 39417) { $Port = [int]$config.port }
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)

function ConvertTo-AgentJson {
  param($Value)
  return ($Value | ConvertTo-Json -Depth 10 -Compress)
}

function New-AgentControlToken {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Initialize-AgentControlConfig {
  $path = Join-Path $InstallRoot "updater.json"
  if (Test-Path -LiteralPath $path) {
    try { $value = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json } catch { $value = $null }
  } else {
    $value = $null
  }
  if (-not $value) {
    $value = [pscustomobject]@{
      schemaVersion = 3
      installRoot = $InstallRoot
      extensionRoot = (Join-Path $InstallRoot "extension")
      metadataUrl = $MetadataUrl
      port = $Port
    }
  }
  if (-not [string]$value.controlToken) {
    $value | Add-Member -NotePropertyName controlToken -NotePropertyValue (New-AgentControlToken) -Force
  }
  $value | Add-Member -NotePropertyName schemaVersion -NotePropertyValue 3 -Force
  New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
  $value | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding UTF8
  return [string]$value.controlToken
}

$script:AgentControlToken = Initialize-AgentControlConfig
$script:AgentControlCommands = @()
$script:AgentControlResults = @{}
$script:AgentControlAllowedHosts = @("ebay.com", "amazon.com", "poshmark.com", "ecomsniper.io")
$script:AgentControlStateKeys = @(
  "settingsSchemaVersion",
  "computerLabel",
  "ebayAccountLabel",
  "gldnUiOpacity",
  "gldnUiTheme",
  "move99AccountSettings",
  "dashboardConfigurationStatus",
  "dashboardQueueSummary",
  "pendingMove99Run",
  "ebayPolicyListingScanState",
  "ebayPolicyListingAudit",
  "pendingPolicyListingEndReview",
  "lastPolicyListingEndResult",
  "pendingMarkShippedRun",
  "pendingSellerLevelScan",
  "pendingEbaySnapshotScan",
  "pendingReviewMonthlyLimits",
  "pendingAmazonSubscribeSaveRun",
  "lastAmazonSubscribeSaveResult",
  "poshmarkProfitBackfill",
  "lastSellerLevelCheck",
  "latestAccountHealth",
  "lastEbaySalesSnapshot",
  "latestEbaySnapshot",
  "lastListingLimitCheck",
  "latestListingStatus",
  "lastPoshmarkStats",
  "latestPoshmarkStats",
  "latestPoshmarkVisibleSales",
  "latestMarketplaceProfit",
  "ebayMonthlyProfit",
  "amazonProfileLabel",
  "orderPlacementAuditAmazonScan",
  "lastPreparedNote",
  "gldnErrorLog"
)

function Get-AgentExtensionId {
  param([string]$Origin, [string]$HeaderExtensionId = "")
  $originExtensionId = ""
  if ($Origin -match '^chrome-extension://([a-p]{32})/?$') { $originExtensionId = [string]$Matches[1] }
  if ($HeaderExtensionId -and $HeaderExtensionId -notmatch '^[a-p]{32}$') {
    throw "Invalid GLDN Ops extension ID header."
  }
  if ($originExtensionId -and $HeaderExtensionId -and $originExtensionId -cne $HeaderExtensionId) {
    throw "Updater extension identity did not match the request origin."
  }
  if ($originExtensionId) { return $originExtensionId }
  if ($HeaderExtensionId) { return $HeaderExtensionId }
  return ""
}

function Add-AgentTargetMetadata {
  param($Value, $Target)
  $configuredExtensionRoot = [System.IO.Path]::GetFullPath((Join-Path $InstallRoot "extension"))
  $targetExtensionRoot = [System.IO.Path]::GetFullPath([string]$Target.extensionRoot)
  $targetMatchesConfiguredInstallRoot = $targetExtensionRoot.TrimEnd('\').Equals(
    $configuredExtensionRoot.TrimEnd('\'),
    [StringComparison]::OrdinalIgnoreCase
  )
  $Value | Add-Member -NotePropertyName targetSource -NotePropertyValue ([string]$Target.source) -Force
  $Value | Add-Member -NotePropertyName extensionId -NotePropertyValue ([string]$Target.extensionId) -Force
  $Value | Add-Member -NotePropertyName extensionRoot -NotePropertyValue $targetExtensionRoot -Force
  $Value | Add-Member -NotePropertyName configuredExtensionRoot -NotePropertyValue $configuredExtensionRoot -Force
  $Value | Add-Member -NotePropertyName targetMatchesConfiguredInstallRoot -NotePropertyValue $targetMatchesConfiguredInstallRoot -Force
  $Value | Add-Member -NotePropertyName profileDirectories -NotePropertyValue @($Target.profileDirectories) -Force
  $Value | Add-Member -NotePropertyName controlBridge -NotePropertyValue "profile2-safe-v1" -Force
  return $Value
}

function Assert-AgentProfile2Target {
  param([string]$ExtensionId)
  $target = Resolve-GldnExtensionRequestTarget -ExtensionId $ExtensionId -FallbackInstallRoot $InstallRoot
  $profiles = @($target.profileDirectories)
  if ($profiles.Count -ne 1 -or [string]$profiles[0] -cne "Profile 2") {
    throw "Local control is locked to the single signed-in Chrome Profile 2 extension instance."
  }
  return $target
}

function Test-AgentAllowedHost {
  param([string]$HostName)
  $hostValue = ([string]$HostName).Trim().TrimEnd('.').ToLowerInvariant()
  foreach ($domain in $script:AgentControlAllowedHosts) {
    if ($hostValue -eq $domain -or $hostValue.EndsWith(".$domain", [StringComparison]::Ordinal)) { return $true }
  }
  return $false
}

function ConvertTo-AgentControlPayload {
  param([string]$Action, $Payload)
  $value = if ($Payload) { $Payload } else { [pscustomobject]@{} }
  switch ($Action) {
    "inspect-session" { return [pscustomobject]@{} }
    "reset-state" { return [pscustomobject]@{} }
    "reload-extension" { return [pscustomobject]@{} }
    "inspect-tab" {
      $tabId = [int]$value.tabId
      if ($tabId -le 0) { throw "A valid Chrome tab ID is required." }
      return [pscustomobject]@{ tabId = $tabId }
    }
    "inspect-amazon-subscribe-save" {
      $tabId = if ($null -ne $value.tabId) { [int]$value.tabId } else { 0 }
      $url = ""
      if ([string]$value.url) {
        try { $uri = [System.Uri]([string]$value.url) } catch { throw "The exact Subscribe & Save URL is invalid." }
        if ($uri.Scheme -cne "https" -or -not (Test-AgentAllowedHost $uri.DnsSafeHost) -or $uri.AbsolutePath -notmatch '^/(?:gp/subscribe-and-save/manager/viewsubscriptions|auto-deliveries/)') {
          throw "Subscribe & Save inspection is limited to Amazon's subscription manager."
        }
        $url = $uri.AbsoluteUri
      }
      return [pscustomobject]@{ tabId = $tabId; url = $url }
    }
    "inspect-ebay-variations" {
      $tabId = if ($null -ne $value.tabId) { [int]$value.tabId } else { 0 }
      if ($tabId -le 0) { throw "A valid Chrome tab ID is required." }
      $url = ""
      if ([string]$value.url) {
        try { $uri = [System.Uri]([string]$value.url) } catch { throw "The exact Active Listings URL is invalid." }
        if ($uri.Scheme -cne "https" -or $uri.DnsSafeHost -notmatch '(^|\.)ebay\.com$' -or $uri.AbsolutePath -notmatch '^/sh/lst/active(?:/|$)') {
          throw "Variation inspection is limited to eBay Seller Hub Active Listings."
        }
        $url = $uri.AbsoluteUri
      }
      return [pscustomobject]@{ tabId = $tabId; url = $url }
    }
    "prepare-variation-end-review" {
      $itemIds = @($value.itemIds | ForEach-Object { ([string]$_).Trim() })
      $uniqueItemIds = @($itemIds | Select-Object -Unique)
      if ($itemIds.Count -lt 1 -or
          $itemIds.Count -gt 200 -or
          $uniqueItemIds.Count -ne $itemIds.Count -or
          @($itemIds | Where-Object { $_ -notmatch '^\d{9,15}$' }).Count) {
        throw "Variation review requires 1 to 200 unique eBay parent item numbers."
      }
      $selectedTotal = [int]$value.selectedTotal
      if ($selectedTotal -lt $itemIds.Count) {
        throw "The selected variation total cannot be less than the exact batch count."
      }
      $reportName = ([string]$value.reportName).Trim()
      $reportFingerprint = ([string]$value.reportFingerprint).Trim()
      if ($reportName.Length -gt 260 -or $reportFingerprint.Length -gt 200) {
        throw "Variation report metadata is too long."
      }
      return [pscustomobject]@{
        itemIds = $itemIds
        selectedTotal = $selectedTotal
        reportName = $reportName
        reportFingerprint = $reportFingerprint
      }
    }
    "close-tab" {
      $tabId = [int]$value.tabId
      if ($tabId -le 0) { throw "A valid Chrome tab ID is required." }
      return [pscustomobject]@{ tabId = $tabId }
    }
    "open-extension-page" {
      $page = ([string]$value.page).Trim().ToLowerInvariant()
      if ($page -notin @("popup", "onboarding", "guide", "variations", "policyaudit", "preflight")) {
        throw "The requested GLDN Ops page is not on the approved page list."
      }
      return [pscustomobject]@{ page = $page; active = $value.active -ne $false }
    }
    "open-dashboard" {
      return [pscustomobject]@{ active = $value.active -ne $false }
    }
    "extension-action" {
      $extensionAction = ([string]$value.action).Trim().ToLowerInvariant()
      if ($extensionAction -notin @("health-check", "dashboard-test", "dashboard-retry", "dashboard-setup", "variation-scan", "policy-listing-scan", "listing-preflight-proof", "ecomsniper-handoff-proof", "sync-ebay-monthly-profit", "start-ebay-amazon-resolution", "set-amazon-profile-label", "seed-order-placement-audit", "start-order-placement-audit-amazon", "read-order-placement-audit", "resume-order-placement-audit-amazon")) {
        throw "The requested GLDN Ops action is not on the approved action list."
      }
      if ($extensionAction -eq "set-amazon-profile-label") {
        $amazonProfileLabel = ([string]$value.amazonProfileLabel).Trim()
        if ($amazonProfileLabel -cnotmatch '^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$') {
          throw "The Amazon profile label must contain 1 to 64 letters, numbers, spaces, periods, underscores, or hyphens."
        }
        return [pscustomobject]@{
          action = $extensionAction
          amazonProfileLabel = $amazonProfileLabel
        }
      }
      if ($extensionAction -in @("start-ebay-amazon-resolution", "seed-order-placement-audit", "start-order-placement-audit-amazon", "read-order-placement-audit")) {
        $monthKey = ([string]$value.monthKey).Trim()
        if ($monthKey -cnotmatch '^\d{4}-(?:0[1-9]|1[0-2])$') {
          throw "The requested monthly GLDN Ops action requires a valid YYYY-MM month."
        }
        return [pscustomobject]@{
          action = $extensionAction
          monthKey = $monthKey
        }
      }
      if ($extensionAction -eq "sync-ebay-monthly-profit") {
        $confirmationToken = ([string]$value.confirmationToken).Trim()
        if ($confirmationToken -cnotmatch '^APPROVE SYNC EBAY \d{4}-(?:0[1-9]|1[0-2]) [1-9]\d*$') {
          throw "Monthly eBay profit sync requires the exact month and live-count approval token."
        }
        return [pscustomobject]@{
          action = $extensionAction
          confirmationToken = $confirmationToken
        }
      }
      return [pscustomobject]@{ action = $extensionAction }
    }
    "open-url" {
      $raw = [string]$value.url
      try { $uri = [System.Uri]$raw } catch { throw "The control URL is invalid." }
      if ($uri.Scheme -cne "https" -or -not (Test-AgentAllowedHost $uri.DnsSafeHost)) {
        throw "Local control can only open approved HTTPS marketplace pages."
      }
      return [pscustomobject]@{
        url = $uri.AbsoluteUri
        reuse = $value.reuse -ne $false
        active = $value.active -ne $false
      }
    }
    "navigate-tab" {
      $tabId = [int]$value.tabId
      if ($tabId -le 0) { throw "A valid Chrome tab ID is required." }
      $raw = [string]$value.url
      try { $uri = [System.Uri]$raw } catch { throw "The control URL is invalid." }
      if ($uri.Scheme -cne "https" -or -not (Test-AgentAllowedHost $uri.DnsSafeHost)) {
        throw "Local control can only navigate to approved HTTPS marketplace pages."
      }
      return [pscustomobject]@{ tabId = $tabId; url = $uri.AbsoluteUri; active = $value.active -ne $false }
    }
    "focus-tab" {
      $tabId = [int]$value.tabId
      if ($tabId -le 0) { throw "A valid Chrome tab ID is required." }
      return [pscustomobject]@{ tabId = $tabId }
    }
    "reload-tab" {
      $tabId = [int]$value.tabId
      if ($tabId -le 0) { throw "A valid Chrome tab ID is required." }
      return [pscustomobject]@{ tabId = $tabId }
    }
    "inspect-page" {
      $tabId = if ($null -ne $value.tabId) { [int]$value.tabId } else { 0 }
      $platform = ([string]$value.platform).Trim().ToLowerInvariant()
      if ($platform -notin @("", "ebay", "poshmark", "amazon", "ecomsniper")) {
        throw "The requested inspection platform is not supported."
      }
      return [pscustomobject]@{ tabId = $tabId; platform = $platform }
    }
    "inspect-move99" {
      $tabId = if ($null -ne $value.tabId) { [int]$value.tabId } else { 0 }
      return [pscustomobject]@{ tabId = $tabId }
    }
    "inspect-move99-final-review" {
      $tabId = if ($null -ne $value.tabId) { [int]$value.tabId } else { 0 }
      $expectedCount = if ($null -ne $value.expectedCount) { [int]$value.expectedCount } else { 0 }
      $workspaceId = ([string]$value.workspaceId).Trim()
      $confirmationToken = ([string]$value.confirmationToken).Trim()
      if ($tabId -le 0 -or $expectedCount -le 0 -or -not $workspaceId) {
        throw "The exact Move .99 final-review tab, count, and workspace are required."
      }
      if ($confirmationToken -cne "APPROVE SUBMIT $expectedCount") {
        throw "Move .99 final-review inspection requires the exact approved Submit token."
      }
      return [pscustomobject]@{
        tabId = $tabId
        url = [string]$value.url
        expectedCount = $expectedCount
        workspaceId = $workspaceId
        confirmationToken = $confirmationToken
      }
    }
    "approve-move99-final-review" {
      $tabId = if ($null -ne $value.tabId) { [int]$value.tabId } else { 0 }
      $expectedCount = if ($null -ne $value.expectedCount) { [int]$value.expectedCount } else { 0 }
      $workspaceId = ([string]$value.workspaceId).Trim()
      $confirmationToken = ([string]$value.confirmationToken).Trim()
      if ($tabId -le 0 -or $expectedCount -le 0 -or -not $workspaceId) {
        throw "The exact Move .99 final-review tab, count, and workspace are required."
      }
      if ($confirmationToken -cne "APPROVE SUBMIT $expectedCount") {
        throw "Move .99 final-review approval requires the exact approved Submit token."
      }
      return [pscustomobject]@{
        tabId = $tabId
        url = [string]$value.url
        expectedCount = $expectedCount
        workspaceId = $workspaceId
        confirmationToken = $confirmationToken
      }
    }
    "read-state" {
      $keys = @($value.keys | ForEach-Object { [string]$_ } | Where-Object { $_ -in $script:AgentControlStateKeys } | Select-Object -Unique)
      if (-not $keys.Count) { throw "No approved GLDN Ops state keys were requested." }
      return [pscustomobject]@{ keys = $keys }
    }
    "read-ebay-profit-review" {
      $status = ([string]$value.status).Trim().ToLowerInvariant()
      if ($status -notin @("all", "exact", "unresolved")) {
        throw "eBay profit review status must be all, exact, or unresolved."
      }
      $offset = if ($null -ne $value.offset) { [int]$value.offset } else { 0 }
      $limit = if ($null -ne $value.limit) { [int]$value.limit } else { 50 }
      if ($offset -lt 0 -or $offset -gt 5000 -or $limit -lt 1 -or $limit -gt 100) {
        throw "eBay profit review pagination is outside the allowed range."
      }
      return [pscustomobject]@{ status = $status; offset = $offset; limit = $limit }
    }
    "read-profit-backfill-review" {
      $status = ([string]$value.status).Trim().ToLowerInvariant()
      if ($status -notin @("all", "exact", "unresolved")) {
        throw "Profit backfill review status must be all, exact, or unresolved."
      }
      $offset = if ($null -ne $value.offset) { [int]$value.offset } else { 0 }
      $limit = if ($null -ne $value.limit) { [int]$value.limit } else { 50 }
      if ($offset -lt 0 -or $offset -gt 5000 -or $limit -lt 1 -or $limit -gt 100) {
        throw "Profit backfill review pagination is outside the allowed range."
      }
      return [pscustomobject]@{ status = $status; offset = $offset; limit = $limit }
    }
    "page-action" {
      $platform = ([string]$value.platform).Trim().ToLowerInvariant()
      $pageAction = ([string]$value.action).Trim().ToLowerInvariant()
      $allowed = @{
        ebay = @("show-panel", "mark-shipped", "approve-mark-shipped-review", "approve-ebay-mark-shipped-confirmation", "cancel-mark-shipped-review", "seller-level", "save-seller-level-review", "sales-snapshot", "save-sales-snapshot-review", "listing-limits", "save-listing-limits-review", "prepare-order-note", "start-monthly-profit", "start-move99-scan", "start-move99-reverse-scan", "apply-saved-move99", "approve-move99-submit")
        poshmark = @("posh-stats", "posh-profit", "visible-sales", "save-visible-sales-review", "historical-profit", "start-historical-profit-month", "resume-historical-profit", "approve-historical-profit-review")
        amazon = @("review-copy", "sniping-seller-review", "sniping-winner-review", "subscribe-save-scan", "subscribe-save-show-review", "approve-subscribe-save", "approve-historical-profit-review")
      }
      if (-not $allowed.ContainsKey($platform) -or $pageAction -notin $allowed[$platform]) {
        throw "The requested page action is not on the safe review-only allowlist."
      }
      $tabId = if ($null -ne $value.tabId) { [int]$value.tabId } else { 0 }
      $waitMs = if ($null -ne $value.waitMs) { [Math]::Max(0, [Math]::Min(15000, [int]$value.waitMs)) } else { 2500 }
      $url = ""
      if ([string]$value.url) {
        try { $uri = [System.Uri]([string]$value.url) } catch { throw "The exact page-action URL is invalid." }
        if ($uri.Scheme -cne "https" -or -not (Test-AgentAllowedHost $uri.DnsSafeHost)) {
          throw "Page actions can recover only an exact approved HTTPS URL."
        }
        $url = $uri.AbsoluteUri
      }
      $confirmationToken = ([string]$value.confirmationToken).Trim()
      $monthKey = ([string]$value.monthKey).Trim()
      if ($pageAction -eq "start-historical-profit-month" -and $monthKey -cnotmatch '^\d{4}-(?:0[1-9]|1[0-2])$') {
        throw "Historical-profit month start requires a valid YYYY-MM month."
      }
      if ($pageAction -eq "start-monthly-profit" -and $monthKey -cnotmatch '^\d{4}-(?:0[1-9]|1[0-2])$') {
        throw "Monthly eBay profit start requires a valid YYYY-MM month."
      }
      if ($pageAction -eq "approve-mark-shipped-review" -and $confirmationToken -cnotmatch '^APPROVE MARK SHIPPED [1-9]\d*$') {
        throw "Mark as Shipped approval requires the exact live-count confirmation token."
      }
      if ($pageAction -eq "approve-ebay-mark-shipped-confirmation" -and $confirmationToken -cnotmatch '^APPROVE EBAY CONTINUE [1-9]\d*$') {
        throw "eBay Continue approval requires the exact live-count confirmation token."
      }
      if ($pageAction -eq "approve-move99-submit" -and $confirmationToken -cnotmatch '^APPROVE SUBMIT [1-9]\d*$') {
        throw "Move .99 Submit approval requires the exact live-count confirmation token."
      }
      if ($pageAction -eq "approve-subscribe-save" -and $confirmationToken -cnotmatch '^APPROVE CANCEL SUBSCRIPTIONS [1-9]\d*$') {
        throw "Subscribe & Save approval requires the exact live-count confirmation token."
      }
      if ($pageAction -eq "save-visible-sales-review" -and $confirmationToken -cnotmatch '^APPROVE SAVE VISIBLE SALES [1-9]\d*$') {
        throw "Visible-sales save requires the exact live-count confirmation token."
      }
      if ($pageAction -eq "approve-historical-profit-review" -and $confirmationToken -cnotmatch '^APPROVE (?:SYNC POSHMARK \d{4}-(?:0[1-9]|1[0-2])|RESOLVE (?:POSHMARK|EBAY) COSTS) [1-9]\d*$') {
        throw "Historical-profit save requires the exact month and live-count confirmation token."
      }
      return [pscustomobject]@{
        platform = $platform
        action = $pageAction
        tabId = $tabId
        url = $url
        waitMs = $waitMs
        confirmationToken = $confirmationToken
        monthKey = $monthKey
      }
    }
    default { throw "The requested local-control action is not allowed." }
  }
}

function Clear-AgentControlHistory {
  $cutoff = [DateTimeOffset]::UtcNow.AddMinutes(-30)
  $script:AgentControlCommands = @($script:AgentControlCommands | Where-Object {
    try { [DateTimeOffset]::Parse([string]$_.createdAt) -ge $cutoff } catch { $false }
  })
  foreach ($key in @($script:AgentControlResults.Keys)) {
    $entry = $script:AgentControlResults[$key]
    try {
      if ([DateTimeOffset]::Parse([string]$entry.completedAt) -lt $cutoff) { $script:AgentControlResults.Remove($key) }
    } catch {
      $script:AgentControlResults.Remove($key)
    }
  }
}

function Add-AgentControlCommand {
  param($Body)
  $extensionId = [string]$Body.extensionId
  if ($extensionId -notmatch '^[a-p]{32}$') { throw "A valid Profile 2 GLDN Ops extension ID is required." }
  [void](Assert-AgentProfile2Target -ExtensionId $extensionId)
  $action = ([string]$Body.action).Trim().ToLowerInvariant()
  $payload = ConvertTo-AgentControlPayload -Action $action -Payload $Body.payload
  Clear-AgentControlHistory
  $command = [pscustomobject]@{
    id = [guid]::NewGuid().ToString("N")
    extensionId = $extensionId
    action = $action
    payload = $payload
    status = "queued"
    attempts = 0
    createdAt = [DateTime]::UtcNow.ToString("o")
    dispatchedAt = ""
    expiresAt = [DateTime]::UtcNow.AddMinutes(5).ToString("o")
  }
  $script:AgentControlCommands += $command
  return [pscustomobject]@{ ok = $true; commandId = $command.id; status = $command.status; expiresAt = $command.expiresAt }
}

function Get-AgentNextControlCommand {
  param([string]$ExtensionId)
  [void](Assert-AgentProfile2Target -ExtensionId $ExtensionId)
  Clear-AgentControlHistory
  $now = [DateTimeOffset]::UtcNow
  $command = $null
  foreach ($candidate in $script:AgentControlCommands) {
    if ([string]$candidate.extensionId -cne [string]$ExtensionId) { continue }
    if ([DateTimeOffset]::Parse([string]$candidate.expiresAt) -le $now) { continue }
    if ([string]$candidate.status -eq "queued") {
      $command = $candidate
      break
    }
    $retryDispatch = ([string]$candidate.status -eq "dispatched") `
      -and ([int]$candidate.attempts -lt 3) `
      -and ([DateTimeOffset]::Parse([string]$candidate.dispatchedAt) -lt $now.AddSeconds(-30))
    if ($retryDispatch) {
      $command = $candidate
      break
    }
  }
  if (-not $command) { return [pscustomobject]@{ ok = $true; command = $null } }
  $command.status = "dispatched"
  $command.attempts = [int]$command.attempts + 1
  $command.dispatchedAt = $now.ToString("o")
  return [pscustomobject]@{
    ok = $true
    command = [pscustomobject]@{
      id = $command.id
      action = $command.action
      payload = $command.payload
      attempt = $command.attempts
      createdAt = $command.createdAt
      expiresAt = $command.expiresAt
    }
  }
}

function Complete-AgentControlCommand {
  param($Body, [string]$ExtensionId)
  [void](Assert-AgentProfile2Target -ExtensionId $ExtensionId)
  $commandId = [string]$Body.commandId
  if ($commandId -notmatch '^[a-f0-9]{32}$') { throw "The local-control command ID is invalid." }
  $command = $script:AgentControlCommands | Where-Object { $_.id -ceq $commandId -and $_.extensionId -ceq $ExtensionId } | Select-Object -First 1
  if (-not $command) { throw "The local-control command was not found or expired." }
  $completedAt = [DateTime]::UtcNow.ToString("o")
  $command.status = if ($Body.ok -eq $true) { "completed" } else { "failed" }
  $entry = [pscustomobject]@{
    ok = $true
    commandId = $commandId
    commandOk = $Body.ok -eq $true
    status = $command.status
    result = $Body.result
    error = [string]$Body.error
    completedAt = $completedAt
  }
  $script:AgentControlResults[$commandId] = $entry
  return [pscustomobject]@{ ok = $true; commandId = $commandId; status = $command.status }
}

function Get-AgentQueryValue {
  param([System.Uri]$Uri, [string]$Name)
  foreach ($part in $Uri.Query.TrimStart('?').Split('&', [System.StringSplitOptions]::RemoveEmptyEntries)) {
    $pair = $part.Split('=', 2)
    if ([System.Net.WebUtility]::UrlDecode($pair[0]) -ceq $Name) {
      if ($pair.Count -gt 1) { return [System.Net.WebUtility]::UrlDecode($pair[1]) }
      return ""
    }
  }
  return ""
}

function Get-AgentControlResult {
  param([string]$CommandId)
  Clear-AgentControlHistory
  if ($CommandId -notmatch '^[a-f0-9]{32}$') { throw "The local-control command ID is invalid." }
  if ($script:AgentControlResults.ContainsKey($CommandId)) { return $script:AgentControlResults[$CommandId] }
  $command = $script:AgentControlCommands | Where-Object { $_.id -ceq $CommandId } | Select-Object -First 1
  if (-not $command) { throw "The local-control command was not found or expired." }
  return [pscustomobject]@{ ok = $true; commandId = $CommandId; status = $command.status; pending = $true }
}

function Invoke-AgentAction {
  param(
    [string]$Name,
    $Body = $null,
    [switch]$Refresh,
    [string]$RequestOrigin = "",
    [string]$RequestExtensionId = ""
  )
  $extensionId = Get-AgentExtensionId -Origin $RequestOrigin -HeaderExtensionId $RequestExtensionId
  $target = Resolve-GldnExtensionRequestTarget -ExtensionId $extensionId -FallbackInstallRoot $InstallRoot
  $targetRoot = [string]$target.installRoot
  $result = switch ($Name) {
    "Status" { Get-GldnUpdaterStatus -InstallRoot $targetRoot -MetadataUrl $MetadataUrl -Refresh:$Refresh }
    "Update" {
      Invoke-GldnExtensionUpdate -InstallRoot $targetRoot -MetadataUrl $MetadataUrl -MetadataPath $MetadataPath -SourceZipPath $SourceZipPath -Force:$Force
    }
    "Versions" {
      [pscustomobject]@{ ok = $true; versions = @(Get-GldnSnapshots $targetRoot) | Select-Object id, version, reason, createdAt }
    }
    "Rollback" {
      $requestedId = if ($Body -and $Body.snapshotId) { [string]$Body.snapshotId } else { $SnapshotId }
      Invoke-GldnExtensionRollback -InstallRoot $targetRoot -SnapshotId $requestedId
    }
    default { throw "Unknown updater action: $Name" }
  }
  return Add-AgentTargetMetadata -Value $result -Target $target
}

if ($Action -ne "Serve") {
  try {
    $result = Invoke-AgentAction -Name $Action -Refresh:($Action -eq "Status")
    ConvertTo-AgentJson $result
    exit 0
  } catch {
    ConvertTo-AgentJson ([pscustomobject]@{ ok = $false; error = $_.Exception.Message })
    exit 1
  }
}

function Read-HttpRequest {
  param([System.Net.Sockets.TcpClient]$Client)
  $stream = $Client.GetStream()
  $stream.ReadTimeout = 15000
  $buffer = New-Object byte[] 8192
  $memory = [System.IO.MemoryStream]::new()
  $headerEnd = -1
  while ($headerEnd -lt 0 -and $memory.Length -lt 65536) {
    $read = $stream.Read($buffer, 0, $buffer.Length)
    if ($read -le 0) { break }
    $memory.Write($buffer, 0, $read)
    $text = [System.Text.Encoding]::UTF8.GetString($memory.ToArray())
    $headerEnd = $text.IndexOf("`r`n`r`n", [StringComparison]::Ordinal)
  }
  if ($headerEnd -lt 0) { throw "Invalid HTTP request." }
  $allBytes = $memory.ToArray()
  $headerText = [System.Text.Encoding]::UTF8.GetString($allBytes, 0, $headerEnd)
  $lines = $headerText -split "`r`n"
  $requestLine = $lines[0] -split " "
  if ($requestLine.Count -lt 2) { throw "Invalid HTTP request line." }
  $headers = @{}
  foreach ($line in ($lines | Select-Object -Skip 1)) {
    $separator = $line.IndexOf(':')
    if ($separator -gt 0) {
      $headers[$line.Substring(0, $separator).Trim().ToLowerInvariant()] = $line.Substring($separator + 1).Trim()
    }
  }
  $contentLength = 0
  if ($headers.ContainsKey("content-length")) { $contentLength = [int]$headers["content-length"] }
  if ($contentLength -gt 1048576) { throw "Updater request body is too large." }
  $bodyOffset = $headerEnd + 4
  $bodyBytes = [System.IO.MemoryStream]::new()
  if ($allBytes.Length -gt $bodyOffset) {
    $bodyBytes.Write($allBytes, $bodyOffset, $allBytes.Length - $bodyOffset)
  }
  while ($bodyBytes.Length -lt $contentLength) {
    $read = $stream.Read($buffer, 0, [Math]::Min($buffer.Length, $contentLength - $bodyBytes.Length))
    if ($read -le 0) { break }
    $bodyBytes.Write($buffer, 0, $read)
  }
  $bodyText = if ($contentLength) { [System.Text.Encoding]::UTF8.GetString($bodyBytes.ToArray(), 0, $contentLength) } else { "" }
  return [pscustomobject]@{
    method = $requestLine[0].ToUpperInvariant()
    target = $requestLine[1]
    headers = $headers
    body = $bodyText
    stream = $stream
  }
}

function Send-HttpJson {
  param($Request, [int]$StatusCode, $Value)
  $statusText = switch ($StatusCode) { 200 { "OK" } 400 { "Bad Request" } 403 { "Forbidden" } 404 { "Not Found" } 409 { "Conflict" } default { "Internal Server Error" } }
  $json = ConvertTo-AgentJson $Value
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $origin = [string]$Request.headers["origin"]
  $allowOrigin = if ($origin -match '^chrome-extension://[a-p]{32}$') { $origin } else { "null" }
  $header = @(
    "HTTP/1.1 $StatusCode $statusText",
    "Content-Type: application/json; charset=utf-8",
    "Content-Length: $($bytes.Length)",
    "Cache-Control: no-store",
    "Access-Control-Allow-Origin: $allowOrigin",
    "Access-Control-Allow-Headers: Content-Type, X-GLDN-Updater, X-GLDN-Extension-Id",
    "Access-Control-Allow-Methods: GET, POST, OPTIONS",
    "Connection: close",
    "",
    ""
  ) -join "`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Request.stream.Write($headerBytes, 0, $headerBytes.Length)
  $Request.stream.Write($bytes, 0, $bytes.Length)
  $Request.stream.Flush()
}

function Test-AgentRequestAllowed {
  param($Request)
  $origin = [string]$Request.headers["origin"]
  $extensionId = [string]$Request.headers["x-gldn-extension-id"]
  if ($Request.method -eq "OPTIONS") {
    return $origin -match '^chrome-extension://[a-p]{32}/?$'
  }
  if ([string]$Request.headers["x-gldn-updater"] -ne "1") { return $false }
  if ($extensionId -notmatch '^[a-p]{32}$') { return $false }
  if ($origin) {
    if ($origin -notmatch '^chrome-extension://([a-p]{32})/?$') { return $false }
    return [string]$Matches[1] -ceq $extensionId
  }
  return [string]$Request.headers["sec-fetch-site"] -eq "none" -and [string]$Request.headers["sec-fetch-mode"] -eq "cors"
}

function Test-AgentOperatorRequestAllowed {
  param($Request)
  if ([string]$Request.headers["origin"]) { return $false }
  $token = [string]$Request.headers["x-gldn-control"]
  return $token.Length -ge 40 -and $token -ceq $script:AgentControlToken
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
$agentPidPath = Join-Path $InstallRoot "updater-agent.pid"
$currentProcess = Get-Process -Id $PID
[pscustomobject]@{
  schemaVersion = 1
  processId = $PID
  processStartTimeUtc = $currentProcess.StartTime.ToUniversalTime().ToString("o")
  installRoot = $InstallRoot
  agentPath = [System.IO.Path]::GetFullPath($PSCommandPath)
  port = $Port
} | ConvertTo-Json | Set-Content -LiteralPath $agentPidPath -Encoding UTF8
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $request = Read-HttpRequest $client
      $uri = [System.Uri]("http://127.0.0.1:$Port" + $request.target)
      $route = "$($request.method) $($uri.AbsolutePath)"
      $operatorRoute = $route -in @("POST /v1/control/commands", "GET /v1/control/results")
      $allowed = if ($operatorRoute) { Test-AgentOperatorRequestAllowed $request } else { Test-AgentRequestAllowed $request }
      if (-not $allowed) {
        Send-HttpJson $request 403 ([pscustomobject]@{ ok = $false; error = "Updater request was not authorized." })
        continue
      }
      if ($request.method -eq "OPTIONS") {
        Send-HttpJson $request 200 ([pscustomobject]@{ ok = $true })
        continue
      }
      $body = if ($request.body) { $request.body | ConvertFrom-Json } else { $null }
      switch ($route) {
        "GET /v1/status" {
          $refresh = $uri.Query -match '(^|[?&])refresh=1(&|$)'
          Send-HttpJson $request 200 (Invoke-AgentAction -Name "Status" -Refresh:$refresh -RequestOrigin ([string]$request.headers["origin"]) -RequestExtensionId ([string]$request.headers["x-gldn-extension-id"]))
        }
        "GET /v1/versions" { Send-HttpJson $request 200 (Invoke-AgentAction -Name "Versions" -RequestOrigin ([string]$request.headers["origin"]) -RequestExtensionId ([string]$request.headers["x-gldn-extension-id"])) }
        "POST /v1/update" { Send-HttpJson $request 200 (Invoke-AgentAction -Name "Update" -Body $body -RequestOrigin ([string]$request.headers["origin"]) -RequestExtensionId ([string]$request.headers["x-gldn-extension-id"])) }
        "POST /v1/rollback" { Send-HttpJson $request 200 (Invoke-AgentAction -Name "Rollback" -Body $body -RequestOrigin ([string]$request.headers["origin"]) -RequestExtensionId ([string]$request.headers["x-gldn-extension-id"])) }
        "POST /v1/control/commands" { Send-HttpJson $request 200 (Add-AgentControlCommand -Body $body) }
        "GET /v1/control/next" { Send-HttpJson $request 200 (Get-AgentNextControlCommand -ExtensionId ([string]$request.headers["x-gldn-extension-id"])) }
        "POST /v1/control/results" { Send-HttpJson $request 200 (Complete-AgentControlCommand -Body $body -ExtensionId ([string]$request.headers["x-gldn-extension-id"])) }
        "GET /v1/control/results" { Send-HttpJson $request 200 (Get-AgentControlResult -CommandId (Get-AgentQueryValue -Uri $uri -Name "commandId")) }
        default { Send-HttpJson $request 404 ([pscustomobject]@{ ok = $false; error = "Updater endpoint not found." }) }
      }
    } catch {
      try { Send-HttpJson $request 500 ([pscustomobject]@{ ok = $false; error = $_.Exception.Message }) } catch {}
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
  if (Test-Path -LiteralPath $agentPidPath) {
    try {
      $pidRecord = Get-Content -Raw -LiteralPath $agentPidPath | ConvertFrom-Json
      if ([int]$pidRecord.processId -eq $PID) {
        Remove-Item -LiteralPath $agentPidPath -Force
      }
    } catch {}
  }
}
