$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $repoRoot "tools\gldn-update-core.ps1")

$testRoot = Join-Path $env:TEMP ("gldn-updater-fixture-" + [guid]::NewGuid().ToString("N"))
$installRoot = Join-Path $testRoot "GLDN Ops"
$sourceRoot = Join-Path $testRoot "source-v2"
$zipPath = Join-Path $testRoot "v2.zip"
$metadataPath = Join-Path $testRoot "latest.json"
$badMetadataPath = Join-Path $testRoot "bad.json"
$agentProcess = $null
$previousChromeUserData = $env:GLDN_CHROME_USER_DATA

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

  Set-Content -LiteralPath (Join-Path $installRoot "extension\config.js") -Value "newer-private-dashboard-setting" -Encoding UTF8
  $rollback = Invoke-GldnExtensionRollback -InstallRoot $installRoot
  if (-not $rollback.ok -or $rollback.currentVersion -ne "1.0.0") { throw "Fixture rollback did not restore v1.0.0." }
  if ((Get-Content -Raw -LiteralPath (Join-Path $installRoot "extension\config.js")).Trim() -ne "newer-private-dashboard-setting") {
    throw "Fixture rollback did not preserve the latest saved config."
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

  $port = Get-Random -Minimum 41000 -Maximum 49000
  $fixtureExtensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  $chromeUserDataRoot = Join-Path $testRoot "Chrome User Data"
  $profileRoot = Join-Path $chromeUserDataRoot "Profile 2"
  New-Item -ItemType Directory -Force -Path $profileRoot | Out-Null
  @{
    extensions = @{
      settings = @{
        $fixtureExtensionId = @{
          location = 4
          path = (Join-Path $installRoot "extension")
        }
      }
    }
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $profileRoot "Secure Preferences") -Encoding UTF8
  $securePreferencesPath = Join-Path $profileRoot "Secure Preferences"
  $securePreferencesHash = (Get-FileHash -LiteralPath $securePreferencesPath -Algorithm SHA256).Hash
  $env:GLDN_CHROME_USER_DATA = $chromeUserDataRoot
  $agentPath = Join-Path $repoRoot "tools\gldn-update-agent.ps1"
  $agentArguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Action Serve -InstallRoot "{1}" -Port {2}' -f $agentPath, $installRoot, $port
  $agentProcess = Start-Process -FilePath (Join-Path $PSHOME "powershell.exe") -ArgumentList $agentArguments -WindowStyle Hidden -PassThru
  $agentReady = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 150
    try {
      $status = Invoke-RestMethod -Uri "http://127.0.0.1:$port/v1/status" -Headers @{
        "X-GLDN-Updater" = "1"
        "X-GLDN-Extension-Id" = $fixtureExtensionId
        Origin = "chrome-extension://$fixtureExtensionId"
      } -TimeoutSec 2
      if ($status.ok -and $status.currentVersion -eq "1.0.0") { $agentReady = $true; break }
    } catch {}
  }
  if (-not $agentReady) { throw "Loopback updater agent fixture did not answer." }
  if ($status.targetMatchesConfiguredInstallRoot -ne $true) {
    throw "Updater did not identify the shared stable extension folder."
  }
  if ([System.IO.Path]::GetFullPath([string]$status.configuredExtensionRoot) -ne [System.IO.Path]::GetFullPath((Join-Path $installRoot "extension"))) {
    throw "Updater reported the wrong shared stable extension folder."
  }
  if ((Get-FileHash -LiteralPath $securePreferencesPath -Algorithm SHA256).Hash -ne $securePreferencesHash) {
    throw "Updater modified Chrome Secure Preferences."
  }

  $separateInstallRoot = Join-Path $testRoot "Separate Loaded Copy"
  $separateExtensionRoot = Join-Path $separateInstallRoot "extension"
  New-FixtureExtension $separateExtensionRoot "2.0.0" "separate"
  @{
    extensions = @{
      settings = @{
        $fixtureExtensionId = @{
          location = 4
          path = $separateExtensionRoot
        }
      }
    }
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $securePreferencesPath -Encoding UTF8
  $separatePreferencesHash = (Get-FileHash -LiteralPath $securePreferencesPath -Algorithm SHA256).Hash
  $separateStatus = Invoke-RestMethod -Uri "http://127.0.0.1:$port/v1/status" -Headers @{
    "X-GLDN-Updater" = "1"
    "X-GLDN-Extension-Id" = $fixtureExtensionId
    Origin = "chrome-extension://$fixtureExtensionId"
  } -TimeoutSec 2
  if (-not $separateStatus.ok -or $separateStatus.currentVersion -ne "2.0.0") {
    throw "Updater did not follow the exact separately loaded extension folder."
  }
  if ($separateStatus.targetMatchesConfiguredInstallRoot -ne $false) {
    throw "Updater falsely identified a separate loaded folder as the shared stable folder."
  }
  if ([System.IO.Path]::GetFullPath([string]$separateStatus.extensionRoot) -ne [System.IO.Path]::GetFullPath($separateExtensionRoot)) {
    throw "Updater reported the wrong separately loaded extension folder."
  }
  if ((Get-FileHash -LiteralPath $securePreferencesPath -Algorithm SHA256).Hash -ne $separatePreferencesHash) {
    throw "Updater modified Chrome Secure Preferences during separate-folder discovery."
  }

  [pscustomobject]@{
    updateInstalled = "1.1.0"
    configPreserved = $true
    rollbackRestored = "1.0.0"
    checksumRejectedWithoutMutation = $true
    chromeProfileMetadataReadOnly = $true
    loopbackAgent = $true
    stableTargetReported = $true
    separateTargetWarningReported = $true
    noAdminRequired = $true
    pass = $true
  } | ConvertTo-Json -Compress
} finally {
  if ($agentProcess -and -not $agentProcess.HasExited) { Stop-Process -Id $agentProcess.Id -Force }
  $env:GLDN_CHROME_USER_DATA = $previousChromeUserData
  if (Test-Path -LiteralPath $testRoot) {
    $resolved = [System.IO.Path]::GetFullPath($testRoot)
    $tempPrefix = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
    if ($resolved.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
  }
}
