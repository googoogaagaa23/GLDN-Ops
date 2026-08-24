param(
  [Parameter(Mandatory = $true)]
  [string]$DecisionFile
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$rulesPath = Join-Path $repoRoot "extension\listing-preflight-rules.json"
$payload = Get-Content -Raw -LiteralPath $DecisionFile | ConvertFrom-Json

if ([int]$payload.schemaVersion -ne 1) { throw "Unsupported decision-file schema." }
$decisions = @($payload.decisions)
if (-not $decisions.Count) { throw "The decision file contains no reviewed candidates." }

$existing = if (Test-Path -LiteralPath $rulesPath) {
  Get-Content -Raw -LiteralPath $rulesPath | ConvertFrom-Json
} else {
  [pscustomobject]@{ schemaVersion = 1; rules = @() }
}

$byKey = @{}
foreach ($rule in @($existing.rules)) {
  $ruleSourceType = ([string]$rule.sourceType).Trim().ToLowerInvariant()
  if (-not $ruleSourceType) { $ruleSourceType = 'official-ebay' }
  $key = "$(([string]$rule.type).ToLowerInvariant()):$(([string]$rule.value).ToLowerInvariant()):$ruleSourceType"
  $byKey[$key] = $rule
}

$accepted = 0
foreach ($decision in $decisions) {
  $action = ([string]$decision.decision).Trim().ToLowerInvariant()
  if ($action -eq "ignore") { continue }
  if ($action -notin @("review", "block")) { throw "Invalid reviewed action: $action" }
  $type = ([string]$decision.type).Trim().ToLowerInvariant()
  $value = ([string]$decision.value).Trim()
  $reason = ([string]$decision.reason).Trim()
  $reviewedBy = ([string]$decision.reviewedBy).Trim()
  $reviewedAt = ([string]$decision.reviewedAt).Trim()
  $sourceType = ([string]$decision.sourceType).Trim().ToLowerInvariant()
  $evidenceUrls = @($decision.evidenceUrls | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })

  if ($type -notin @("asin", "brand", "keyword")) { throw "Invalid rule type: $type" }
  if ($type -eq "asin" -and $value -notmatch '^[A-Z0-9]{10}$') { throw "Invalid ASIN rule: $value" }
  if ($type -ne "asin" -and ($value.Length -lt 2 -or $value.Length -gt 120)) { throw "Invalid $type rule value." }
  if ($reason.Length -lt 10) { throw "Every shared rule needs a clear review reason." }
  if (-not $reviewedBy) { throw "Every shared rule needs a reviewer." }
  if (-not $reviewedAt) { throw "Every shared rule needs a review date." }
  if ($sourceType -notin @('official-ebay', 'profile2-discord', 'profile2-telegram')) {
    throw "Every shared rule needs sourceType official-ebay, profile2-discord, or profile2-telegram."
  }
  if ($sourceType -ne 'official-ebay' -and $action -ne 'review') {
    throw "Community research may publish Review rules only. Hard Block rules require separate official eBay evidence."
  }
  if (-not $evidenceUrls.Count) { throw "Every shared rule needs at least one exact source URL." }

  $invalidEvidence = if ($sourceType -eq 'official-ebay') {
    @($evidenceUrls | Where-Object {
      $_ -notmatch '^https://(?:www\.)?ebay\.com/help/' -and
      $_ -notmatch '^https://(?:www\.)?ebay\.com/sellercenter/' -and
      $_ -notmatch '^https://ocsnext\.ebay\.com/help/'
    })
  } elseif ($sourceType -eq 'profile2-discord') {
    @($evidenceUrls | Where-Object { $_ -notmatch '^https://discord\.com/channels/\d{15,22}/\d{15,22}/\d{15,22}$' })
  } else {
    @($evidenceUrls | Where-Object {
      $_ -notmatch '^https://t\.me/(?:s/)?[A-Za-z0-9_]{5,}/\d+$'
    })
  }
  if ($invalidEvidence.Count) {
    throw "Rule '$value' has evidence that does not match sourceType '$sourceType'."
  }

  $normalizedValue = if ($type -eq "asin") { $value.ToUpperInvariant() } else { $value }
  $key = "$type`:$($normalizedValue.ToLowerInvariant()):$sourceType"
  $hashBytes = [Text.Encoding]::UTF8.GetBytes($key)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $id = -join ($sha.ComputeHash($hashBytes)[0..9] | ForEach-Object { $_.ToString("x2") }) }
  finally { $sha.Dispose() }
  $byKey[$key] = [ordered]@{
    id = $id
    type = $type
    value = $normalizedValue
    action = $action
    reason = $reason
    reviewedBy = $reviewedBy
    reviewedAt = $reviewedAt
    source = if ($sourceType -eq 'official-ebay') {
      'official-ebay-policy-reviewed'
    } elseif ($sourceType -eq 'profile2-discord') {
      'profile2-discord-reviewed'
    } else {
      'profile2-telegram-reviewed'
    }
    sourceType = $sourceType
    authority = if ($sourceType -eq 'official-ebay') {
      'eBay'
    } elseif ($sourceType -eq 'profile2-discord') {
      'EcomSniper Discord community report'
    } else {
      'EcomSniper Telegram community report'
    }
    evidenceUrls = $evidenceUrls
  }
  $accepted += 1
}

$rules = @($byKey.Values | Sort-Object @{ Expression = { $_.type } }, @{ Expression = { $_.value } })
$output = [ordered]@{
  schemaVersion = 1
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  sourceGeneratedAt = [string]$payload.sourceGeneratedAt
  ruleCount = $rules.Count
  rules = $rules
}
$json = ($output | ConvertTo-Json -Depth 10) + [Environment]::NewLine
[IO.File]::WriteAllText($rulesPath, $json, (New-Object Text.UTF8Encoding($false)))
Write-Host "Published $accepted reviewed decision(s). Shared preflight now contains $($rules.Count) rule(s)." -ForegroundColor Green
Write-Host $rulesPath
