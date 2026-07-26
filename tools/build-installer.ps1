$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$distRoot = Join-Path $repoRoot "dist"
$buildRoot = Join-Path $repoRoot ".installer-build"
$setupExe = Join-Path $distRoot "GLDN-Ops-Setup.exe"
$launcherSource = Join-Path $repoRoot "installer\SetupLauncher.cs"
$installerScript = Join-Path $repoRoot "install-latest.ps1"
$bootstrapScript = Join-Path $repoRoot "bootstrap-install.ps1"
$assemblyInfo = Join-Path $buildRoot "AssemblyInfo.cs"
$manifest = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "extension\manifest.json") | ConvertFrom-Json
$assemblyVersion = ([string]$manifest.version + ".0").Split('.')[0..3] -join '.'

New-Item -ItemType Directory -Force -Path $distRoot, $buildRoot | Out-Null

$assemblySource = @"
using System.Reflection;
[assembly: AssemblyTitle("GLDN Ops Setup")]
[assembly: AssemblyDescription("Visible GLDN Ops local installer")]
[assembly: AssemblyCompany("GLDN Ops")]
[assembly: AssemblyProduct("GLDN Ops")]
[assembly: AssemblyVersion("$assemblyVersion")]
[assembly: AssemblyFileVersion("$assemblyVersion")]
"@
[System.IO.File]::WriteAllText($assemblyInfo, $assemblySource, [System.Text.UTF8Encoding]::new($false))

$compilerPaths = @(
  (Join-Path $env:SystemRoot "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
  (Join-Path $env:SystemRoot "Microsoft.NET\Framework\v4.0.30319\csc.exe")
)
$compiler = $compilerPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) { throw "The Windows .NET compiler was not found." }

& $compiler /nologo /target:winexe /optimize+ "/out:$setupExe" "/resource:$installerScript,InstallLatest.ps1" "/resource:$bootstrapScript,BootstrapInstall.ps1" $assemblyInfo $launcherSource
if ($LASTEXITCODE -ne 0) { throw "The Windows Setup launcher did not compile." }

if (-not (Test-Path $setupExe)) {
  throw "Installer build did not create $setupExe"
}

Write-Host "Built installer:"
Write-Host "  $setupExe"
