param(
  [string]$ConfigPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $ConfigPath) {
  $ConfigPath = Join-Path $repoRoot "extension\config.js"
}

if (-not (Test-Path $ConfigPath)) {
  throw "Extension config not found: $ConfigPath"
}

$configText = Get-Content $ConfigPath -Raw
$urlMatch = [regex]::Match($configText, 'dashboardUrl\s*:\s*["'']([^"'']+)["'']')
$keyMatch = [regex]::Match($configText, 'dashboardKey\s*:\s*["'']([^"'']+)["'']')

if (-not $urlMatch.Success -or -not $keyMatch.Success) {
  throw "Dashboard URL/key are missing from extension config."
}

$body = @{
  key = $keyMatch.Groups[1].Value
  action = "contractTest"
} | ConvertTo-Json -Compress

$response = Invoke-RestMethod -Uri $urlMatch.Groups[1].Value -Method Post -ContentType "text/plain;charset=utf-8" -Body $body -TimeoutSec 30
if (-not $response.ok) {
  throw "Live dashboard contract failed: $($response.error)"
}

$checked = @($response.checkedActions)
$required = @("sellerLevel", "accountLimits", "markShipped", "poshmarkStats", "ebaySnapshot", "marketplaceProfit")
$missing = @()
foreach ($action in $required) {
  if ($checked -notcontains $action) { $missing += $action }
}
if ($missing.Count) {
  throw "Live dashboard contract missing checks: $($missing -join ', ')"
}

Write-Host (@{
  ok = $true
  message = $response.message
  checkedActions = $checked
  checkedAt = $response.checkedAt
} | ConvertTo-Json -Depth 5)
