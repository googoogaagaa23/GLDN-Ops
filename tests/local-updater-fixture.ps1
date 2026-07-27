$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $repoRoot "tools\gldn-update-core.ps1")

$testRoot = Join-Path $env:TEMP ("gldn-updater-fixture-" + [guid]::NewGuid().ToString("N"))
$installRoot = Join-Path $testRoot "GLDN Ops"
$sourceRoot = Join-Path $testRoot "source-v2"
$zipPath = Join-Path $testRoot "v2.zip"
$metadataPath = Join-Path $testRoot "latest.json"
$badMetadataPath = Join-Path $testRoot "bad.json"
$loadedRoot = Join-Path $testRoot "loaded-copy"
$chromeUserData = Join-Path $testRoot "Chrome User Data"
$extensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
$agentProcess = $null
$priorChromeUserData = $env:GLDN_CHROME_USER_DATA

function New-FixtureExtension([string]$Root, [string]$Version, [string]$Marker) {
  New-Item -ItemType Directory -Force -Path $Root | Out-Null
  @{ manifest_version = 3; name = "GLDN Ops"; version = $Version; background = @{ service_worker = "background.js" } } |
    ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $Root "manifest.json") -Encoding UTF8
  foreach ($file in @("background.js", "popup.html", "popup.js", "foundation.js", "shared.js")) {
    Set-Content -LiteralPath (Join-Path $Root $file) -Value "fixture-$Marker-$file" -Encoding UTF8
  }
}

try {
  New-Item -ItemType Directory -Force -Path (Join-Path $installRoot "extension") | Out-Null
  New-FixtureExtension (Join-Path $installRoot "extension") "1.0.0" "old"
  Set-Content -LiteralPath (Join-Path $installRoot "extension\config.js") -Value "private-dashboard-setting" -Encoding UTF8
  New-FixtureExtension $sourceRoot "1.1.0" "new"
  Compress-Archive -Path (Join-Path $sourceRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal
  $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
  @{ version = "1.1.0"; url = "https://invalid.example/fixture.zip"; sha256 = $hash } |
    ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding UTF8

  $update = Invoke-GldnExtensionUpdate -InstallRoot $installRoot -MetadataPath $metadataPath -SourceZipPath $zipPath
  if (-not $update.ok -or -not $update.updated -or $update.currentVersion -ne "1.1.0") { throw "Fixture update did not complete." }
  if ((Get-GldnManifestVersion (Join-Path $installRoot "extension")) -ne "1.1.0") { throw "Fixture did not install v1.1.0." }
  if ((Get-Content -Raw -LiteralPath (Join-Path $installRoot "extension\config.js")).Trim() -ne "private-dashboard-setting") {
    throw "Fixture update did not preserve config.js."
  }
  if (@(Get-GldnSnapshots $installRoot).Count -ne 1) { throw "Fixture update did not create one rollback snapshot." }

  $rollback = Invoke-GldnExtensionRollback -InstallRoot $installRoot
  if (-not $rollback.ok -or $rollback.currentVersion -ne "1.0.0") { throw "Fixture rollback did not restore v1.0.0." }
  if ((Get-Content -Raw -LiteralPath (Join-Path $installRoot "extension\config.js")).Trim() -ne "private-dashboard-setting") {
    throw "Fixture rollback did not preserve the saved config."
  }

  @{ version = "1.1.0"; url = "https://invalid.example/fixture.zip"; sha256 = ("0" * 64) } |
    ConvertTo-Json | Set-Content -LiteralPath $badMetadataPath -Encoding UTF8
  $checksumRejected = $false
  try {
    Invoke-GldnExtensionUpdate -InstallRoot $installRoot -MetadataPath $badMetadataPath -SourceZipPath $zipPath -Force | Out-Null
  } catch {
    $checksumRejected = $_.Exception.Message -match "checksum"
  }
  if (-not $checksumRejected) { throw "Fixture did not reject a bad checksum." }
  if ((Get-GldnManifestVersion (Join-Path $installRoot "extension")) -ne "1.0.0") { throw "Bad checksum changed the installed runtime." }

  New-FixtureExtension (Join-Path $loadedRoot "extension") "0.9.0" "loaded-old"
  $profileRoot = Join-Path $chromeUserData "Profile 2"
  New-Item -ItemType Directory -Force -Path $profileRoot | Out-Null
  $settings = @{}
  $settings[$extensionId] = @{ path = (Join-Path $loadedRoot "extension"); location = 4; disable_reasons = 0 }
  @{ extensions = @{ settings = $settings } } | ConvertTo-Json -Depth 8 |
    Set-Content -LiteralPath (Join-Path $profileRoot "Secure Preferences") -Encoding UTF8
  $env:GLDN_CHROME_USER_DATA = $chromeUserData

  $resolvedTarget = Resolve-GldnExtensionRequestTarget -ExtensionId $extensionId -FallbackInstallRoot $installRoot
  if ($resolvedTarget.installRoot -ne $loadedRoot -or $resolvedTarget.profileDirectories -notcontains "Profile 2") {
    throw "Loaded-folder resolver did not select the Chrome profile extension path."
  }
  $unknownRejected = $false
  try { Resolve-GldnExtensionRequestTarget -ExtensionId ("b" * 32) -FallbackInstallRoot $installRoot | Out-Null } catch { $unknownRejected = $true }
  if (-not $unknownRejected) { throw "Loaded-folder resolver accepted an unknown extension ID." }

  $secondRoot = Join-Path $testRoot "second-loaded-copy"
  New-FixtureExtension (Join-Path $secondRoot "extension") "0.8.0" "ambiguous"
  $secondProfile = Join-Path $chromeUserData "Profile 3"
  New-Item -ItemType Directory -Force -Path $secondProfile | Out-Null
  $secondSettings = @{}
  $secondSettings[$extensionId] = @{ path = (Join-Path $secondRoot "extension"); location = 4; disable_reasons = 0 }
  @{ extensions = @{ settings = $secondSettings } } | ConvertTo-Json -Depth 8 |
    Set-Content -LiteralPath (Join-Path $secondProfile "Secure Preferences") -Encoding UTF8
  $ambiguityRejected = $false
  try { Resolve-GldnExtensionRequestTarget -ExtensionId $extensionId -FallbackInstallRoot $installRoot | Out-Null } catch { $ambiguityRejected = $_.Exception.Message -match "more than one" }
  if (-not $ambiguityRejected) { throw "Loaded-folder resolver did not reject ambiguous extension paths." }
  Remove-Item -LiteralPath $secondProfile -Recurse -Force

  $port = Get-Random -Minimum 41000 -Maximum 49000
  $agentPath = Join-Path $repoRoot "tools\gldn-update-agent.ps1"
  $agentArguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Action Serve -InstallRoot "{1}" -MetadataPath "{2}" -SourceZipPath "{3}" -Port {4}' -f $agentPath, $installRoot, $metadataPath, $zipPath, $port
  $agentProcess = Start-Process -FilePath (Join-Path $PSHOME "powershell.exe") -ArgumentList $agentArguments -WindowStyle Hidden -PassThru
  $agentReady = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 150
    try {
      $status = Invoke-RestMethod -Uri "http://127.0.0.1:$port/v1/status" -Headers @{ "X-GLDN-Updater" = "1"; "X-GLDN-Extension-Id" = $extensionId; Origin = "chrome-extension://$extensionId" } -TimeoutSec 2
      if ($status.ok -and $status.currentVersion -eq "0.9.0" -and $status.targetSource -eq "chrome-profile") { $agentReady = $true; break }
    } catch {}
  }
  if (-not $agentReady) { throw "Loopback updater agent fixture did not answer." }
  $serviceWorkerStatus = Invoke-RestMethod -Uri "http://127.0.0.1:$port/v1/status" -Headers @{
    "X-GLDN-Updater" = "1"
    "X-GLDN-Extension-Id" = $extensionId
    "Sec-Fetch-Site" = "none"
    "Sec-Fetch-Mode" = "cors"
  } -TimeoutSec 2
  if (-not $serviceWorkerStatus.ok -or $serviceWorkerStatus.extensionId -ne $extensionId) {
    throw "Loopback updater did not accept the no-Origin Chrome extension service-worker request."
  }
  $webOriginRejected = $false
  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$port/v1/status" -Headers @{
      "X-GLDN-Updater" = "1"
      "X-GLDN-Extension-Id" = $extensionId
      Origin = "https://example.com"
    } -TimeoutSec 2 | Out-Null
  } catch {
    $webOriginRejected = $true
  }
  if (-not $webOriginRejected) { throw "Loopback updater accepted an ordinary website origin." }

  $agentConfig = Get-Content -Raw -LiteralPath (Join-Path $installRoot "updater.json") | ConvertFrom-Json
  $controlToken = [string]$agentConfig.controlToken
  if ($controlToken.Length -lt 40) { throw "Loopback updater did not create a local-control token." }
  $operatorHeaders = @{ "X-GLDN-Control" = $controlToken }
  $queuedControl = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/v1/control/commands" `
    -Headers $operatorHeaders -ContentType "application/json" `
    -Body (@{ extensionId = $extensionId; action = "inspect-session"; payload = @{} } | ConvertTo-Json -Compress) -TimeoutSec 2
  $nextControl = Invoke-RestMethod -Uri "http://127.0.0.1:$port/v1/control/next" -Headers @{
    "X-GLDN-Updater" = "1"
    "X-GLDN-Extension-Id" = $extensionId
    Origin = "chrome-extension://$extensionId"
  } -TimeoutSec 2
  if ($nextControl.command.id -ne $queuedControl.commandId -or $nextControl.command.action -ne "inspect-session") {
    throw "Profile 2 did not receive the queued safe-control command. Queued=$($queuedControl | ConvertTo-Json -Depth 6 -Compress) Next=$($nextControl | ConvertTo-Json -Depth 6 -Compress)"
  }
  $controlCompletion = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/v1/control/results" -Headers @{
    "X-GLDN-Updater" = "1"
    "X-GLDN-Extension-Id" = $extensionId
    Origin = "chrome-extension://$extensionId"
  } -ContentType "application/json" -Body (@{
    commandId = $queuedControl.commandId
    ok = $true
    result = @{ profileLock = "Profile 2"; runtimeVersion = "fixture" }
  } | ConvertTo-Json -Depth 5 -Compress) -TimeoutSec 2
  $controlResult = Invoke-RestMethod -Uri "http://127.0.0.1:$port/v1/control/results?commandId=$($queuedControl.commandId)" `
    -Headers $operatorHeaders -TimeoutSec 2
  if (-not $controlCompletion.ok -or -not $controlResult.commandOk -or $controlResult.result.profileLock -ne "Profile 2") {
    throw "Loopback control result did not complete its round trip."
  }
  $unsafeControlRejected = $false
  try {
    Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/v1/control/commands" `
      -Headers $operatorHeaders -ContentType "application/json" `
      -Body (@{ extensionId = $extensionId; action = "submit"; payload = @{} } | ConvertTo-Json -Compress) -TimeoutSec 2 | Out-Null
  } catch {
    $unsafeControlRejected = $true
  }
  if (-not $unsafeControlRejected) { throw "Loopback control accepted an unsafe arbitrary action." }
  $missingTokenRejected = $false
  try {
    Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/v1/control/commands" `
      -ContentType "application/json" `
      -Body (@{ extensionId = $extensionId; action = "inspect-session"; payload = @{} } | ConvertTo-Json -Compress) -TimeoutSec 2 | Out-Null
  } catch {
    $missingTokenRejected = $true
  }
  if (-not $missingTokenRejected) { throw "Loopback control accepted an operator request without its token." }

  $agentUpdate = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/v1/update" -Headers @{ "X-GLDN-Updater" = "1"; "X-GLDN-Extension-Id" = $extensionId; Origin = "chrome-extension://$extensionId" } -ContentType "application/json" -Body "{}" -TimeoutSec 20
  if (-not $agentUpdate.updated -or (Get-GldnManifestVersion (Join-Path $loadedRoot "extension")) -ne "1.1.0") {
    throw "Loopback updater did not update the folder loaded by Chrome."
  }
  if ((Get-GldnManifestVersion (Join-Path $installRoot "extension")) -ne "1.0.0") {
    throw "Loopback updater changed the configured fallback instead of the loaded Chrome folder."
  }

  [pscustomobject]@{
    updateInstalled = "1.1.0"
    configPreserved = $true
    rollbackRestored = "1.0.0"
    checksumRejectedWithoutMutation = $true
    loopbackAgent = $true
    chromeLoadedFolderResolved = $true
    unknownExtensionRejected = $true
    ambiguousExtensionRejected = $true
    serviceWorkerRequestAccepted = $true
    websiteOriginRejected = $true
    profile2ControlRoundTrip = $true
    unsafeControlRejected = $true
    missingControlTokenRejected = $true
    noAdminRequired = $true
    pass = $true
  } | ConvertTo-Json -Compress
} finally {
  $env:GLDN_CHROME_USER_DATA = $priorChromeUserData
  if ($agentProcess -and -not $agentProcess.HasExited) { Stop-Process -Id $agentProcess.Id -Force }
  if (Test-Path -LiteralPath $testRoot) {
    $resolved = [System.IO.Path]::GetFullPath($testRoot)
    $tempPrefix = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
    if ($resolved.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
  }
}
