[CmdletBinding()]
param(
  [string]$MainZipPath = '',
  [string]$ProductHunterZipPath = '',
  [string]$ProductHunterSidecarPath = '',
  [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$distRoot = Join-Path $repoRoot 'dist'
if (-not $OutputDirectory) { $OutputDirectory = $distRoot }
$outputRoot = [System.IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory))
$workBase = [System.IO.Path]::GetFullPath((Join-Path $env:TEMP 'GLDN Research Workstation Builder'))
$workRoot = Join-Path $workBase ([guid]::NewGuid().ToString('N'))

function Resolve-ExistingFile([string]$Path, [string]$Label) {
  if (-not $Path) { throw "$Label path was not supplied." }
  $resolved = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path)
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) { throw "$Label is not a file: $resolved" }
  return $resolved
}

function Get-Hash([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Test-PathWithin([string]$Child, [string]$Parent) {
  $childFull = [System.IO.Path]::GetFullPath($Child).TrimEnd('\')
  $parentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\')
  return $childFull.StartsWith($parentFull + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Assert-SafeWorkPath([string]$Path) {
  $full = [System.IO.Path]::GetFullPath($Path)
  if (-not (Test-PathWithin $full $workBase)) { throw "Unsafe builder work path: $full" }
  return $full
}

function Get-PackageExtension([string]$ExtractRoot, [string]$ExpectedName, [switch]$RequireFullBundle) {
  $matches = @(Get-ChildItem -LiteralPath $ExtractRoot -Recurse -File -Filter 'manifest.json' | ForEach-Object {
    try {
      $manifest = Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json
      if ([string]$manifest.name -eq $ExpectedName) {
        [pscustomobject]@{ Manifest = $manifest; ManifestPath = $_.FullName; ExtensionRoot = $_.Directory.FullName }
      }
    } catch {}
  })
  if ($matches.Count -ne 1) { throw "Expected exactly one $ExpectedName manifest; found $($matches.Count)." }
  $match = $matches[0]
  if ($RequireFullBundle) {
    if ((Split-Path $match.ExtensionRoot -Leaf) -ine 'extension') {
      throw 'The main input must be a full GLDN Ops local bundle.'
    }
    $bundleRoot = Split-Path $match.ExtensionRoot -Parent
    foreach ($required in @('tools\install-update-agent.ps1', 'extension\listing-preflight-rules.json')) {
      if (-not (Test-Path -LiteralPath (Join-Path $bundleRoot $required) -PathType Leaf)) {
        throw "The main local bundle is missing $required."
      }
    }
  }
  return $match
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
  [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}

$sourceMainManifest = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'extension\manifest.json') | ConvertFrom-Json
$sourceHunterManifest = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'product-hunter-extension\manifest.json') | ConvertFrom-Json
$sourceMainVersion = [string]$sourceMainManifest.version
$sourceHunterVersion = [string]$sourceHunterManifest.version
if (-not $sourceMainVersion -or -not $sourceHunterVersion) { throw 'Source extension versions are unavailable.' }

if (-not $MainZipPath) {
  $MainZipPath = Join-Path $distRoot "GLDN-Ops-local-v$sourceMainVersion.zip"
  if (-not (Test-Path -LiteralPath $MainZipPath -PathType Leaf)) {
    throw "The exact current main package is missing: $MainZipPath"
  }
}
if (-not $ProductHunterZipPath) {
  $ProductHunterZipPath = Join-Path $distRoot "GLDN-Product-Hunter-v$sourceHunterVersion.zip"
  if (-not (Test-Path -LiteralPath $ProductHunterZipPath -PathType Leaf)) {
    throw "The exact current Product Hunter package is missing: $ProductHunterZipPath"
  }
}
$MainZipPath = Resolve-ExistingFile $MainZipPath 'Main package'
$ProductHunterZipPath = Resolve-ExistingFile $ProductHunterZipPath 'Product Hunter package'

if (-not $ProductHunterSidecarPath) {
  $ProductHunterSidecarPath = [System.IO.Path]::ChangeExtension($ProductHunterZipPath, '.sha256.txt')
}
$ProductHunterSidecarPath = Resolve-ExistingFile $ProductHunterSidecarPath 'Product Hunter SHA-256 sidecar'

$mainHash = Get-Hash $MainZipPath
$hunterHash = Get-Hash $ProductHunterZipPath
$sidecarDeclaredHash = ((Get-Content -Raw -LiteralPath $ProductHunterSidecarPath).Trim() -split '\s+')[0].ToUpperInvariant()
if ($sidecarDeclaredHash -notmatch '^[A-F0-9]{64}$' -or $sidecarDeclaredHash -ne $hunterHash) {
  throw 'The Product Hunter SHA-256 sidecar does not match its ZIP.'
}

New-Item -ItemType Directory -Force -Path $workRoot | Out-Null
try {
  $inspectionRoot = Assert-SafeWorkPath (Join-Path $workRoot 'inspect')
  $mainInspect = Join-Path $inspectionRoot 'main'
  $hunterInspect = Join-Path $inspectionRoot 'hunter'
  New-Item -ItemType Directory -Force -Path $mainInspect, $hunterInspect | Out-Null
  Expand-Archive -LiteralPath $MainZipPath -DestinationPath $mainInspect -Force
  Expand-Archive -LiteralPath $ProductHunterZipPath -DestinationPath $hunterInspect -Force
  $mainPackage = Get-PackageExtension $mainInspect 'GLDN Ops' -RequireFullBundle
  $hunterPackage = Get-PackageExtension $hunterInspect 'GLDN Product Hunter'
  $mainVersion = [string]$mainPackage.Manifest.version
  $hunterVersion = [string]$hunterPackage.Manifest.version
  if (-not $mainVersion -or -not $hunterVersion) { throw 'A package version is missing.' }

  if (-not $MainZipPath -or -not $ProductHunterZipPath) { throw 'Resolved package paths are unavailable.' }
  if ($MainZipPath -like (Join-Path $distRoot 'GLDN-Ops-local-v*.zip') -and $mainVersion -ne $sourceMainVersion) {
    throw "Main package v$mainVersion does not match source v$sourceMainVersion."
  }
  if ($ProductHunterZipPath -like (Join-Path $distRoot 'GLDN-Product-Hunter-v*.zip') -and $hunterVersion -ne $sourceHunterVersion) {
    throw "Product Hunter package v$hunterVersion does not match source v$sourceHunterVersion."
  }

  $bundleName = "GLDN-Research-Workstation-v$mainVersion"
  $bundleRoot = Assert-SafeWorkPath (Join-Path $workRoot $bundleName)
  $bundleDist = Join-Path $bundleRoot 'dist'
  $bundleTools = Join-Path $bundleRoot 'tools'
  $bundleDocs = Join-Path $bundleRoot 'docs'
  $bundleMainVersionRoot = Join-Path $bundleRoot 'extension'
  $bundleHunterVersionRoot = Join-Path $bundleRoot 'product-hunter-extension'
  New-Item -ItemType Directory -Force -Path $bundleDist, $bundleTools, $bundleDocs, $bundleMainVersionRoot, $bundleHunterVersionRoot | Out-Null

  # Normalize portable filenames so the bundled launcher can resolve the exact
  # versions from the two minimal manifests even when source paths were renamed.
  $mainName = "GLDN-Ops-local-v$mainVersion.zip"
  $hunterName = "GLDN-Product-Hunter-v$hunterVersion.zip"
  $hunterSidecarName = [System.IO.Path]::ChangeExtension($hunterName, '.sha256.txt')
  $stagedMain = Join-Path $bundleDist $mainName
  $stagedHunter = Join-Path $bundleDist $hunterName
  $stagedHunterSidecar = Join-Path $bundleDist $hunterSidecarName
  Copy-Item -LiteralPath $MainZipPath -Destination $stagedMain -Force
  Copy-Item -LiteralPath $ProductHunterZipPath -Destination $stagedHunter -Force
  Write-Utf8NoBom $stagedHunterSidecar ("{0}  {1}`r`n" -f $hunterHash.ToLowerInvariant(), $hunterName)

  $installerSource = Join-Path $repoRoot 'tools\install-research-workstation.ps1'
  $launcherSource = Join-Path $repoRoot 'tools\Install-GLDN-Research-Workstation.cmd'
  $docSource = Join-Path $repoRoot 'docs\RESEARCH_WORKSTATION_SETUP.md'
  foreach ($requiredSource in @($installerSource, $launcherSource, $docSource)) {
    if (-not (Test-Path -LiteralPath $requiredSource -PathType Leaf)) { throw "Portable bundle source is missing: $requiredSource" }
  }
  $stagedInstaller = Join-Path $bundleTools 'install-research-workstation.ps1'
  $stagedLauncher = Join-Path $bundleTools 'Install-GLDN-Research-Workstation.cmd'
  $stagedDoc = Join-Path $bundleDocs 'RESEARCH_WORKSTATION_SETUP.md'
  Copy-Item -LiteralPath $installerSource -Destination $stagedInstaller -Force
  Copy-Item -LiteralPath $launcherSource -Destination $stagedLauncher -Force
  Copy-Item -LiteralPath $docSource -Destination $stagedDoc -Force

  $minimalMainManifest = [ordered]@{ manifest_version = 3; name = 'GLDN Ops'; version = $mainVersion }
  $minimalHunterManifest = [ordered]@{ manifest_version = 3; name = 'GLDN Product Hunter'; version = $hunterVersion }
  $stagedMainVersionManifest = Join-Path $bundleMainVersionRoot 'manifest.json'
  $stagedHunterVersionManifest = Join-Path $bundleHunterVersionRoot 'manifest.json'
  Write-Utf8NoBom $stagedMainVersionManifest ($minimalMainManifest | ConvertTo-Json)
  Write-Utf8NoBom $stagedHunterVersionManifest ($minimalHunterManifest | ConvertTo-Json)

  $manifestEntries = @(
    [ordered]@{ path = "dist/$mainName"; sha256 = (Get-Hash $stagedMain) },
    [ordered]@{ path = "dist/$hunterName"; sha256 = (Get-Hash $stagedHunter) },
    [ordered]@{ path = "dist/$hunterSidecarName"; sha256 = (Get-Hash $stagedHunterSidecar) },
    [ordered]@{ path = 'tools/install-research-workstation.ps1'; sha256 = (Get-Hash $stagedInstaller) },
    [ordered]@{ path = 'tools/Install-GLDN-Research-Workstation.cmd'; sha256 = (Get-Hash $stagedLauncher) },
    [ordered]@{ path = 'docs/RESEARCH_WORKSTATION_SETUP.md'; sha256 = (Get-Hash $stagedDoc) },
    [ordered]@{ path = 'extension/manifest.json'; sha256 = (Get-Hash $stagedMainVersionManifest) },
    [ordered]@{ path = 'product-hunter-extension/manifest.json'; sha256 = (Get-Hash $stagedHunterVersionManifest) }
  )
  $releaseManifest = [ordered]@{
    schemaVersion = 1
    version = $mainVersion
    productHunterVersion = $hunterVersion
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    scope = 'portable local workstation setup; not published; not remote deployment'
    files = $manifestEntries
  }
  $stagedReleaseManifest = Join-Path $bundleDist "release-manifest-v$mainVersion.json"
  Write-Utf8NoBom $stagedReleaseManifest ($releaseManifest | ConvertTo-Json -Depth 5)

  Write-Host 'Running the staged installer in Plan mode before packaging...'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stagedInstaller `
    -Mode Plan `
    -MainZipPath $stagedMain `
    -ProductHunterZipPath $stagedHunter `
    -ReleaseManifestPath $stagedReleaseManifest `
    -ExpectedMainVersion $mainVersion `
    -ExpectedProductHunterVersion $hunterVersion
  if ($LASTEXITCODE -ne 0) { throw 'Portable workstation staged Plan validation failed.' }

  New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
  $outputZip = Join-Path $outputRoot "$bundleName.zip"
  if (Test-Path -LiteralPath $outputZip) {
    if (-not (Test-PathWithin $outputZip $outputRoot)) { throw "Unsafe output replacement path: $outputZip" }
    Remove-Item -LiteralPath $outputZip -Force
  }
  Compress-Archive -Path $bundleRoot -DestinationPath $outputZip -CompressionLevel Optimal
  if (-not (Test-Path -LiteralPath $outputZip -PathType Leaf)) { throw 'Portable workstation ZIP was not created.' }

  [pscustomobject]@{
    ok = $true
    name = $bundleName
    mainVersion = $mainVersion
    productHunterVersion = $hunterVersion
    mainSha256 = $mainHash
    productHunterSha256 = $hunterHash
    package = $outputZip
    packageSha256 = (Get-Hash $outputZip)
    stagedPlanValidated = $true
    published = $false
  } | ConvertTo-Json -Depth 4
} finally {
  if (Test-Path -LiteralPath $workRoot) {
    $safeWorkRoot = Assert-SafeWorkPath $workRoot
    Remove-Item -LiteralPath $safeWorkRoot -Recurse -Force
  }
}
