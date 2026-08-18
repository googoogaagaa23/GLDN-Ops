$ErrorActionPreference = "Continue"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$manifestPath = Join-Path $repoRoot "extension\manifest.json"
$configPath = Join-Path $repoRoot "extension\config.js"
$extensionRoot = (Resolve-Path (Join-Path $repoRoot "extension")).Path
$ecomSniperId = "eohieelgcgopcnjjjanjgfjdaifolokm"

function Write-Result([string]$Name, [bool]$Ok, [string]$Detail = "") {
  $status = if ($Ok) { "OK" } else { "CHECK" }
  Write-Host ("[{0}] {1}{2}" -f $status, $Name, $(if ($Detail) { " - $Detail" } else { "" }))
}

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

function Get-ConfigValue([string]$Text, [string]$Name) {
  $match = [regex]::Match($Text, "$Name\s*:\s*[""']([^""']+)[""']")
  if ($match.Success) { return $match.Groups[1].Value }
  return ""
}

function Test-Dashboard {
  $configSource = if (Test-Path $configPath) { $configPath } else { Join-Path $repoRoot "extension\config.example.js" }
  if (-not (Test-Path $configSource)) {
    Write-Result "Dashboard config" $false "extension config source is missing"
    return
  }
  $configText = Get-Content -LiteralPath $configSource -Raw
  $url = Get-ConfigValue $configText "dashboardUrl"
  $key = Get-ConfigValue $configText "dashboardKey"
  if (-not $url) {
    Write-Result "Dashboard config" $false "dashboard URL missing"
    return
  }
  if (-not $key) {
    Write-Result "Dashboard URL" $true "built in; setup code is stored per Chrome profile and must be tested from the popup"
    return
  }
  try {
    $payload = @{ action = "ping"; key = $key; source = "diagnose"; sentAt = (Get-Date).ToString("o") } | ConvertTo-Json -Compress
    $response = Invoke-RestMethod -Uri $url -Method Post -ContentType "text/plain;charset=utf-8" -Body $payload -TimeoutSec 15
    Write-Result "Dashboard connection" ([bool]$response.ok) $(if ($response.ok) { $response.message } else { $response.error })
  } catch {
    Write-Result "Dashboard connection" $false $_.Exception.Message
  }
}

function Scan-ChromeProfiles {
  $chromeRoot = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
  if (-not (Test-Path $chromeRoot)) {
    Write-Result "Chrome profiles" $false "Chrome user data folder not found"
    return
  }

  $profileNames = @{}
  $localState = Join-Path $chromeRoot "Local State"
  if (Test-Path -LiteralPath $localState) {
    try {
      $state = Get-Content -Raw -LiteralPath $localState | ConvertFrom-Json
      foreach ($property in $state.profile.info_cache.PSObject.Properties) { $profileNames[$property.Name] = [string]$property.Value.name }
    } catch {}
  }

  $rows = @()
  Get-ChildItem -LiteralPath $chromeRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName "Secure Preferences") } |
    ForEach-Object {
      $secure = Get-Content -LiteralPath (Join-Path $_.FullName "Secure Preferences") -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
      $gldnId = ""
      $ecomFound = $false
      foreach ($property in $secure.extensions.settings.PSObject.Properties) {
        $path = [string]$property.Value.path
        if ($path) {
          try {
            if ([System.IO.Path]::GetFullPath($path).TrimEnd('\').Equals($extensionRoot.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) { $gldnId = $property.Name }
          } catch {}
        }
        if ($property.Name -eq $ecomSniperId) { $ecomFound = $true }
      }
      $rows += [pscustomobject]@{
        Profile = $(if ($profileNames.ContainsKey($_.Name)) { $profileNames[$_.Name] } else { $_.Name })
        Directory = $_.Name
        GLDN = if ($gldnId) { $gldnId } else { "no" }
        EcomSniper = if ($ecomFound) { "yes" } else { "no" }
      }
    }

  if (-not $rows.Count) {
    Write-Result "Chrome profiles" $false "no profile Preferences files found"
    return
  }

  Write-Host ""
  Write-Host "Chrome profile extension scan:"
  $rows | Sort-Object Profile | Format-Table -AutoSize

  $gldnCount = @($rows | Where-Object { $_.GLDN -ne "no" }).Count
  Write-Result "GLDN installed in at least one Chrome profile" ($gldnCount -gt 0) "$gldnCount profile(s)"
}

Write-Host "GLDN Ops diagnostic"
Write-Host "Repo: $repoRoot"
Write-Host ""

if (Test-Path $manifestPath) {
  try {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    Write-Result "Extension manifest" $true ("version " + $manifest.version)
  } catch {
    Write-Result "Extension manifest" $false $_.Exception.Message
  }
} else {
  Write-Result "Extension manifest" $false "missing extension\manifest.json"
}

$chrome = Find-ChromeExe
$gitCommand = Get-Command "git.exe" -ErrorAction SilentlyContinue
Write-Result "Chrome installed" ([bool]$chrome) $(if ($chrome) { $chrome } else { "not found" })
Write-Result "Git available" ([bool]$gitCommand) $(if ($gitCommand) { "updates can use Git" } else { "updates will use ZIP fallback" })

Test-Dashboard
Write-Result "EcomSniper click mode" $true "store-safe manual Extract Sellers detection"
Scan-ChromeProfiles

Write-Host ""
Write-Host "If a local test Chrome profile shows GLDN=no, open that profile, go to chrome://extensions, and load:"
Write-Host "  $(Join-Path $repoRoot "extension")"
