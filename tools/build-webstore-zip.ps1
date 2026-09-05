param([string]$Version = '')
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$extensionRoot = Join-Path $repoRoot 'extension'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $extensionRoot 'manifest.json') | ConvertFrom-Json
if (-not $Version) { $Version = [string]$manifest.version }
if ($Version -cne [string]$manifest.version) { throw 'Requested and source versions do not match.' }
$stageRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot '.webstore-build\extension'))
if (-not $stageRoot.StartsWith($repoRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid staging directory.' }
if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
# Ship the complete top-level runtime, not an obsolete hand-maintained subset.
Get-ChildItem -LiteralPath $extensionRoot -File | Where-Object { $_.Extension -in @('.js','.json','.html','.css','.txt') -and $_.Name -ne 'config.js' } | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $stageRoot
}
Copy-Item -LiteralPath (Join-Path $extensionRoot 'icons') -Destination (Join-Path $stageRoot 'icons') -Recurse
foreach ($required in @('sniping-audit.js','sniping-review.js','ops-health-background.js','profit-backfill-background.js','ebay-profit-background.js')) {
  if (-not (Test-Path -LiteralPath (Join-Path $stageRoot $required))) { throw "Required runtime missing: $required" }
}
[IO.File]::WriteAllText((Join-Path $stageRoot 'deployment-channel.js'), "globalThis.GLDN_DEPLOYMENT_CHANNEL = 'webstore';`n")
foreach ($forbidden in @('key','update_url')) {
  if ($manifest.PSObject.Properties.Name -contains $forbidden) { throw "Store manifest must not contain $forbidden." }
}
# The Store channel exposes other-site tools through the toolbar, not an all-sites content script.
$broadHosts = @('http://*/*','https://*/*','*://*/*','<all_urls>')
$manifest.host_permissions = @($manifest.host_permissions | Where-Object { $_ -notin $broadHosts })
$manifest.content_scripts = @($manifest.content_scripts | Where-Object { @($_.matches | Where-Object { $_ -in $broadHosts }).Count -eq 0 })
$manifest | Add-Member -NotePropertyName optional_host_permissions -NotePropertyValue @('http://127.0.0.1/*') -Force
[IO.File]::WriteAllText((Join-Path $stageRoot 'manifest.json'), ($manifest | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
$config = Get-Content -Raw -LiteralPath (Join-Path $stageRoot 'config.example.js')
if ($config -match 'dashboardKey\s*:\s*["''][^"'']+["'']') { throw 'Public package contains a dashboard credential.' }
foreach ($script in (Get-ChildItem -LiteralPath $stageRoot -File -Filter '*.js')) {
  $text = Get-Content -Raw -LiteralPath $script.FullName
  foreach ($call in [regex]::Matches($text, 'importScripts\(([\s\S]*?)\)')) {
    foreach ($file in [regex]::Matches($call.Groups[1].Value, '["'']([^"'']+\.js)["'']')) {
      if (-not (Test-Path -LiteralPath (Join-Path $stageRoot $file.Groups[1].Value))) { throw "Missing runtime import: $($file.Groups[1].Value)" }
    }
  }
}
$dist = Join-Path $repoRoot 'dist'
New-Item -ItemType Directory -Path $dist -Force | Out-Null
$zip = Join-Path $dist "GLDN-Ops-webstore-v$Version.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path (Join-Path $stageRoot '*') -DestinationPath $zip -CompressionLevel Optimal
[pscustomobject]@{ ok=$true; zip=$zip; sha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash; submitted=$false; approved=$false } | ConvertTo-Json
