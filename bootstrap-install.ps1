param(
  [string]$InstallRoot = "$env:LOCALAPPDATA\GLDN Ops",
  [string]$DashboardSetupCode = "",
  [string]$ProfileDirectory = "",
  [string]$SourceZipPath = "",
  [string]$ReleaseMetadataPath = "",
  [string]$PrivateExtensionZipPath = "",
  [switch]$SkipChromeOpen,
  [switch]$SkipUpdaterStart
)

$ErrorActionPreference = "Stop"

$repoZip = "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/dist/GLDN-Ops-latest.zip"
$tempRoot = Join-Path $env:TEMP ("gldn-ops-install-" + [guid]::NewGuid().ToString("N"))
$zipPath = Join-Path $tempRoot "GLDN-Ops-main.zip"
$extractRoot = Join-Path $tempRoot "extract"
$resolvedInstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$userRoot = [System.IO.Path]::GetFullPath($env:USERPROFILE).TrimEnd('\') + '\'
if (-not $resolvedInstallRoot.StartsWith($userRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Install folder must be inside this Windows user folder: $env:USERPROFILE"
}

function Find-Chrome {
  $paths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  return $paths | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
}

function New-LocalConfig([string]$ExtensionRoot, [string]$SetupCode) {
  $example = Join-Path $ExtensionRoot "config.example.js"
  $config = Join-Path $ExtensionRoot "config.js"
  if (Test-Path -LiteralPath $config) { return }
  $text = Get-Content -Raw -LiteralPath $example
  if ($SetupCode) {
    $escaped = $SetupCode.Replace('\', '\\').Replace('"', '\"')
    $text = $text -replace 'dashboardKey:\s*"[^"]*"', ('dashboardKey: "' + $escaped + '"')
  }
  [System.IO.File]::WriteAllText($config, $text, [System.Text.UTF8Encoding]::new($false))
}

function Stop-GldnUpdaterForInstall([string]$TargetInstallRoot) {
  $agentPath = [System.IO.Path]::GetFullPath((Join-Path $TargetInstallRoot "tools\gldn-update-agent.ps1"))
  $matches = @()
  try {
    $matches = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" | Where-Object {
      $commandLine = [string]$_.CommandLine
      $commandLine.IndexOf($agentPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $commandLine -match '(?i)-Action\s+Serve(?:\s|$)'
    })
  } catch {
    Write-Warning "The existing GLDN Ops updater could not be inspected: $($_.Exception.Message)"
  }

  $pidPath = Join-Path $TargetInstallRoot "updater-agent.pid"
  if (Test-Path -LiteralPath $pidPath) {
    try {
      $pidRecord = Get-Content -Raw -LiteralPath $pidPath | ConvertFrom-Json
      $recordedInstallRoot = [System.IO.Path]::GetFullPath([string]$pidRecord.installRoot)
      $recordedAgentPath = [System.IO.Path]::GetFullPath([string]$pidRecord.agentPath)
      $process = Get-Process -Id ([int]$pidRecord.processId) -ErrorAction Stop
      $recordedStart = [datetime]::Parse([string]$pidRecord.processStartTimeUtc).ToUniversalTime()
      $actualStart = $process.StartTime.ToUniversalTime()
      if ($recordedInstallRoot -ieq [System.IO.Path]::GetFullPath($TargetInstallRoot) -and
          $recordedAgentPath -ieq $agentPath -and
          [Math]::Abs(($actualStart - $recordedStart).TotalSeconds) -lt 2) {
        $matches += [pscustomobject]@{ ProcessId = $process.Id }
      }
    } catch {
      Write-Warning "The existing GLDN Ops updater PID record could not be verified: $($_.Exception.Message)"
    }
  }

  $matches = @($matches | Sort-Object ProcessId -Unique)

  foreach ($process in $matches) {
    Write-Host "Stopping the existing GLDN Ops updater before installation..."
    Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction Stop
  }

  foreach ($process in $matches) {
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      if (-not (Get-Process -Id ([int]$process.ProcessId) -ErrorAction SilentlyContinue)) { break }
      Start-Sleep -Milliseconds 100
    }
    if (Get-Process -Id ([int]$process.ProcessId) -ErrorAction SilentlyContinue) {
      throw "The existing GLDN Ops updater did not stop. Close it and run Setup again."
    }
  }
  if ($matches.Count -and (Test-Path -LiteralPath $pidPath)) {
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  }
}

New-Item -ItemType Directory -Force -Path $tempRoot, $extractRoot | Out-Null
try {
  if ($SourceZipPath) {
    $resolvedSourceZip = (Resolve-Path -LiteralPath $SourceZipPath).Path
    Write-Host "Using local GLDN Ops release package: $resolvedSourceZip"
    Copy-Item -LiteralPath $resolvedSourceZip -Destination $zipPath -Force
  } else {
    Write-Host "Downloading GLDN Ops..."
    Invoke-WebRequest -Uri $repoZip -OutFile $zipPath
  }
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot -Force
  $sourceManifest = Get-ChildItem -LiteralPath $extractRoot -Recurse -File -Filter "manifest.json" |
    Where-Object { $_.FullName -match '[\\/]extension[\\/]manifest\.json$' } |
    Select-Object -First 1
  if (-not $sourceManifest) { throw "The downloaded ZIP does not contain GLDN Ops." }
  $sourceRoot = Split-Path (Split-Path $sourceManifest.FullName -Parent) -Parent
  $sourceCheck = Join-Path $sourceRoot "tools\universal-release-check.ps1"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $sourceCheck
  if ($LASTEXITCODE -ne 0) { throw "The downloaded GLDN Ops files did not pass validation." }

  $savedConfig = $null
  if (Test-Path -LiteralPath (Join-Path $resolvedInstallRoot "extension\config.js")) {
    $savedConfig = Get-Content -Raw -LiteralPath (Join-Path $resolvedInstallRoot "extension\config.js")
  }
  if (Test-Path -LiteralPath $resolvedInstallRoot) {
    Stop-GldnUpdaterForInstall $resolvedInstallRoot
    $backup = "$resolvedInstallRoot.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    if (-not $backup.StartsWith($userRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe backup path: $backup" }
    $moved = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      try {
        Move-Item -LiteralPath $resolvedInstallRoot -Destination $backup -ErrorAction Stop
        $moved = $true
        break
      } catch [System.IO.IOException] {
        Start-Sleep -Milliseconds 100
      }
    }
    if (-not $moved) { throw "The previous GLDN Ops folder is still in use. Close it and run Setup again." }
    Write-Host "Previous install backed up to: $backup"
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $resolvedInstallRoot -Parent) | Out-Null
  Copy-Item -LiteralPath $sourceRoot -Destination $resolvedInstallRoot -Recurse

  $extensionRoot = Join-Path $resolvedInstallRoot "extension"
  if ($savedConfig) {
    [System.IO.File]::WriteAllText((Join-Path $extensionRoot "config.js"), $savedConfig, [System.Text.UTF8Encoding]::new($false))
  } elseif ($DashboardSetupCode) {
    New-LocalConfig $extensionRoot $DashboardSetupCode
  } else {
    Write-Host "Dashboard setup stays in each Chrome profile and is preserved across extension updates."
    Write-Host "Use Setup > Connect Dashboard once in a new Chrome profile."
  }

  $updaterInstaller = Join-Path $resolvedInstallRoot "tools\install-update-agent.ps1"
  if (-not (Test-Path -LiteralPath $updaterInstaller)) {
    throw "The GLDN Ops package is missing its automatic updater installer."
  }
  $updaterArguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $updaterInstaller, "-InstallRoot", $resolvedInstallRoot)
  if ($SkipUpdaterStart) { $updaterArguments += @("-SkipStart", "-SkipStartupShortcut") }
  & powershell.exe @updaterArguments
  if ($LASTEXITCODE -ne 0) { throw "The GLDN Ops automatic updater did not install." }

  $chrome = if ($SkipChromeOpen -or -not $ProfileDirectory) { $null } else { Find-Chrome }
  if ($chrome) {
    $chromeArgs = @()
    if ($ProfileDirectory) {
      $chromeArgs += ('--profile-directory="{0}"' -f ($ProfileDirectory -replace '"', '\"'))
    }
    $chromeArgs += "chrome://extensions"
    Start-Process -FilePath $chrome -ArgumentList $chromeArgs
  } elseif (-not $SkipChromeOpen -and -not $ProfileDirectory) {
    Write-Host "Chrome was not opened because no profile directory was supplied. Open chrome://extensions in the intended signed-in profile."
  }

  Write-Host ""
  Write-Host "GLDN Ops is ready at:"
  Write-Host "  $resolvedInstallRoot"
  Write-Host ""
  Write-Host "One-time Chrome step for each fresh profile:"
  Write-Host "  1. Turn on Developer mode"
  Write-Host "  2. Click Load unpacked"
  Write-Host "  3. Select $extensionRoot"
  Write-Host "  4. Open GLDN Ops and choose only the computer number/name"
  Write-Host ""
  Write-Host "After that, use Update & Reload inside GLDN Ops. The verified updater runs automatically with Windows."
  Write-Host "Fresh profiles that use this exact folder see the same installed version."
  Write-Host "Existing GLDN Ops profiles must keep their current loaded folder; Update & Reload discovers and updates it in place so Chrome identity and saved settings remain intact."
  Write-Host "No Git, Node.js, Chrome policy, Web Store approval, or marketplace click helper is required."
} finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
