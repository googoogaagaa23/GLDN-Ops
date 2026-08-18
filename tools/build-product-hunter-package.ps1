param(
  [string]$OutputDirectory = ""
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $projectRoot 'product-hunter-extension'
$mainExtension = Join-Path $projectRoot 'extension'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot 'dist' }

$manifestPath = Join-Path $source 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'Product Hunter manifest is missing.' }

# Keep the standalone package on the same reviewed rule revision as GLDN Ops.
Copy-Item -LiteralPath (Join-Path $mainExtension 'listing-preflight-core.js') -Destination (Join-Path $source 'policy-core.js') -Force
Copy-Item -LiteralPath (Join-Path $mainExtension 'listing-preflight-rules.json') -Destination (Join-Path $source 'policy-rules.json') -Force

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$required = @(
  'manifest.json', 'background.js', 'hunter-core.js', 'amazon-content.js', 'ebay-content.js', 'policy-core.js', 'policy-rules.json',
  'dashboard.html', 'dashboard.css', 'dashboard.js', 'popup.html', 'popup.css', 'popup.js', 'README.md',
  'icons\icon16.png', 'icons\icon32.png', 'icons\icon48.png', 'icons\icon128.png'
)
foreach ($relative in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $source $relative))) { throw "Required Product Hunter file is missing: $relative" }
}

$forbiddenPermissions = @('debugger', 'scripting', 'nativeMessaging')
foreach ($permission in $forbiddenPermissions) {
  if ($manifest.permissions -contains $permission) { throw "Forbidden Product Hunter permission: $permission" }
}
$hostPermissions = @($manifest.host_permissions)
if ($hostPermissions.Count -ne 2 -or
    $hostPermissions[0] -ne 'https://*.amazon.com/*' -or
    $hostPermissions[1] -ne 'https://*.ebay.com/*') {
  throw 'Product Hunter must have only the Amazon and eBay host permissions.'
}

$rules = Get-Content -Raw -LiteralPath (Join-Path $source 'policy-rules.json') | ConvertFrom-Json
if ($rules.rules.Count -lt 175 -or $rules.ruleCount -ne $rules.rules.Count) { throw 'Reviewed policy rule pack is incomplete.' }

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$baseName = "GLDN-Product-Hunter-v$($manifest.version)"
$zipPath = Join-Path $OutputDirectory "$baseName.zip"
$hashPath = Join-Path $OutputDirectory "$baseName.sha256.txt"
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
if (Test-Path -LiteralPath $hashPath) { Remove-Item -LiteralPath $hashPath -Force }
Compress-Archive -Path (Join-Path $source '*') -DestinationPath $zipPath -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath $hashPath -Value "$hash  $baseName.zip" -Encoding ascii

[pscustomobject]@{
  Name = $manifest.name
  Version = $manifest.version
  Rules = $rules.rules.Count
  Package = $zipPath
  SHA256 = $hash
}
