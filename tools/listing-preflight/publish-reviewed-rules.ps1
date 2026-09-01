param(
  [Parameter(Mandatory = $true)]
  [string]$DecisionFile
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$rulesPath = Join-Path $repoRoot "extension\listing-preflight-rules.json"
$hunterRulesPath = Join-Path $repoRoot "product-hunter-extension\policy-rules.json"
$payload = Get-Content -Raw -LiteralPath $DecisionFile | ConvertFrom-Json

if ([int]$payload.schemaVersion -notin @(1, 2)) { throw "Unsupported decision-file schema." }
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
  $ruleAllOf = @($rule.allOf | ForEach-Object { ([string]$_).Trim().ToLowerInvariant() } | Where-Object { $_ }) -join ','
  $ruleAnyOf = @($rule.anyOf | ForEach-Object { ([string]$_).Trim().ToLowerInvariant() } | Where-Object { $_ }) -join ','
  $ruleNoneOf = @($rule.noneOf | ForEach-Object { ([string]$_).Trim().ToLowerInvariant() } | Where-Object { $_ }) -join ','
  $key = "$(([string]$rule.type).ToLowerInvariant()):$(([string]$rule.value).ToLowerInvariant()):$ruleAllOf`:$ruleAnyOf`:$ruleNoneOf`:$ruleSourceType"
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
  $allOf = @($decision.allOf | ForEach-Object { ([string]$_).Trim().ToLowerInvariant() } | Where-Object { $_ } | Select-Object -Unique)
  $anyOf = @($decision.anyOf | ForEach-Object { ([string]$_).Trim().ToLowerInvariant() } | Where-Object { $_ } | Select-Object -Unique)
  $noneOf = @($decision.noneOf | ForEach-Object { ([string]$_).Trim().ToLowerInvariant() } | Where-Object { $_ } | Select-Object -Unique)
  $policyTopic = ([string]$decision.policyTopic).Trim()
  $evidenceKind = ([string]$decision.evidenceKind).Trim()
  $operatorRuleId = ([string]$decision.operatorRuleId).Trim().ToUpperInvariant()
  $evidenceUrls = @($decision.evidenceUrls | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })

  if ($type -notin @("asin", "brand", "keyword", "compound")) { throw "Invalid rule type: $type" }
  if ($type -eq "asin" -and $value -notmatch '^[A-Z0-9]{10}$') { throw "Invalid ASIN rule: $value" }
  if ($type -ne "asin" -and ($value.Length -lt 2 -or $value.Length -gt 120)) { throw "Invalid $type rule value." }
  if ($type -eq 'compound' -and -not $allOf.Count -and -not $anyOf.Count) { throw "Compound rules need allOf or anyOf phrases." }
  if ($reason.Length -lt 10) { throw "Every shared rule needs a clear review reason." }
  if (-not $reviewedBy) { throw "Every shared rule needs a reviewer." }
  if (-not $reviewedAt) { throw "Every shared rule needs a review date." }
  if ($sourceType -notin @('official-ebay', 'gldn-operator', 'profile2-discord', 'profile2-telegram')) {
    throw "Every shared rule needs sourceType official-ebay, gldn-operator, profile2-discord, or profile2-telegram."
  }
  if ($sourceType -in @('profile2-discord', 'profile2-telegram') -and $action -ne 'review') {
    throw "Community research may publish Review rules only. Hard Block rules require separate official eBay evidence."
  }
  if ($sourceType -eq 'gldn-operator' -and ($action -ne 'block' -or $operatorRuleId -notin @('GLDN-NO-PESTICIDES', 'GLDN-NO-AEROSOL-SPRAY-CANS'))) {
    throw "GLDN operator rules must be one of the two approved no-list Blocks."
  }
  if (-not $evidenceUrls.Count) { throw "Every shared rule needs at least one exact source URL." }

  $invalidEvidence = if ($sourceType -in @('official-ebay', 'gldn-operator')) {
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
  $key = "$type`:$($normalizedValue.ToLowerInvariant()):$($allOf -join ',')`:$($anyOf -join ',')`:$($noneOf -join ',')`:$sourceType"
  $hashBytes = [Text.Encoding]::UTF8.GetBytes($key)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $id = -join ($sha.ComputeHash($hashBytes)[0..9] | ForEach-Object { $_.ToString("x2") }) }
  finally { $sha.Dispose() }
  $publishedRule = [ordered]@{
    id = $id
    type = $type
    value = $normalizedValue
    allOf = $allOf
    anyOf = $anyOf
    noneOf = $noneOf
    action = $action
    reason = $reason
    policyTopic = $policyTopic
    evidenceKind = if ($evidenceKind) { $evidenceKind } elseif ($action -eq 'block') { 'explicit-prohibition' } else { 'conditional-review' }
    reviewedBy = $reviewedBy
    reviewedAt = $reviewedAt
    source = if ($sourceType -eq 'official-ebay') {
      'official-ebay-policy-reviewed'
    } elseif ($sourceType -eq 'gldn-operator') {
      'gldn-operator-reviewed'
    } elseif ($sourceType -eq 'profile2-discord') {
      'profile2-discord-reviewed'
    } else {
      'profile2-telegram-reviewed'
    }
    sourceType = $sourceType
    authority = if ($sourceType -eq 'official-ebay') {
      'eBay'
    } elseif ($sourceType -eq 'gldn-operator') {
      'GLDN Ops operator rule'
    } elseif ($sourceType -eq 'profile2-discord') {
      'EcomSniper Discord community report'
    } else {
      'EcomSniper Telegram community report'
    }
    evidenceUrls = $evidenceUrls
  }
  if ($sourceType -eq 'gldn-operator') { $publishedRule.operatorRuleId = $operatorRuleId }
  $byKey[$key] = $publishedRule
  $accepted += 1
}

$rules = @($byKey.Values | Sort-Object @{ Expression = { $_.type } }, @{ Expression = { $_.value } })
$clearanceEvidenceUrls = @(
  'https://www.ebay.com/help/policies/prohibited-restricted-items/prohibited-restricted-items?id=4207',
  'https://www.ebay.com/help/policies/prohibited-restricted-items/counterfeit-item-policy?id=4276',
  'https://www.ebay.com/help/policies/listing-policies/selling-policies/intellectual-property-vero-program?id=4349',
  'https://www.ebay.com/help/policies/listing-policies/search-browse-manipulation-policy?id=4243',
  'https://www.ebay.com/help/policies/prohibited-restricted-items/product-safety-policy?id=4300'
)
$clearancePolicy = [ordered]@{
  id = 'gldn-keyword-policy-check'
  version = if ([string]$payload.clearanceVersion) { [string]$payload.clearanceVersion } else { '2026-08-31.1' }
  mode = 'keyword-blocklist'
  reviewedAt = '2026-08-31'
  maxAgeDays = 45
  reason = 'Classify supplied product text by reviewed prohibited-item and restricted-item keywords. A brand name alone does not stop an item, and a no-match result is not eBay approval.'
  evidenceUrls = $clearanceEvidenceUrls
}

$policyCoverage = if ($null -ne $payload.policyCoverage) {
  $payload.policyCoverage
} elseif ($null -ne $existing.policyCoverage) {
  $existing.policyCoverage
} else {
  $null
}
$output = [ordered]@{
  schemaVersion = 2
  version = if ([string]$payload.version) { [string]$payload.version } else { '2026-08-30.1' }
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  sourceGeneratedAt = if ([string]$payload.sourceGeneratedAt) { [string]$payload.sourceGeneratedAt } else { [string]$existing.sourceGeneratedAt }
  ruleCount = $rules.Count
  policyCoverage = $policyCoverage
  clearancePolicy = $clearancePolicy
  rules = $rules
}
$json = ($output | ConvertTo-Json -Depth 10) + [Environment]::NewLine
[IO.File]::WriteAllText($rulesPath, $json, (New-Object Text.UTF8Encoding($false)))
[IO.File]::WriteAllText($hunterRulesPath, $json, (New-Object Text.UTF8Encoding($false)))
Write-Host "Published $accepted reviewed decision(s). Shared preflight now contains $($rules.Count) rule(s)." -ForegroundColor Green
Write-Host $rulesPath
Write-Host $hunterRulesPath
