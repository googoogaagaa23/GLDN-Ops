param([string]$ProfileDirectory = "")

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$extensionRoot = Join-Path $repoRoot "extension"

function Find-ChromeExe {
  $command = Get-Command "chrome.exe" -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $candidates = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe")
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe")
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) { return $candidate }
  }
  return $null
}

function Open-ChromePage([string]$Url) {
  if (-not $ProfileDirectory) {
    Write-Host "Chrome was not opened because no profile directory was supplied. Open this in the intended signed-in profile: $Url"
    return
  }
  $chrome = Find-ChromeExe
  if ($chrome) {
    $arguments = @()
    if ($ProfileDirectory) {
      $arguments += ('--profile-directory="{0}"' -f ($ProfileDirectory -replace '"', '\"'))
    }
    $arguments += $Url
    Start-Process -FilePath $chrome -ArgumentList $arguments
  } else {
    Write-Host "Chrome was not found automatically. Open this manually: $Url"
  }
}

& (Join-Path $PSScriptRoot "universal-release-check.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "Install check failed. Fix the extension files before loading GLDN Ops."
}

Write-Host ""
Write-Host "GLDN Ops install check complete."
Write-Host ""
Write-Host "Chrome extension folder to load:"
Write-Host "  $extensionRoot"
Write-Host ""
Write-Host "Next Chrome steps for each Chrome profile:"
Write-Host "  1. Open chrome://extensions"
Write-Host "  2. Turn on Developer mode"
Write-Host "  3. Click Load unpacked"
Write-Host "  4. Select the extension folder shown above"
Write-Host "  5. Open the GLDN Ops popup and choose the computer for that Chrome profile"
Write-Host "  6. Save the dashboard setup code once, then run Test Connection"
Write-Host ""

Open-ChromePage "chrome://extensions"

Write-Host "After the one-time Load unpacked step, GLDN Ops can discover and reload this exact folder automatically."
Write-Host "No Chrome policy, Chrome Web Store approval, Git, Node.js, or Windows click helper is required."

& (Join-Path $PSScriptRoot "local-extension-manager.ps1") -Action Status

Write-Host ""
Write-Host "Install setup complete."
