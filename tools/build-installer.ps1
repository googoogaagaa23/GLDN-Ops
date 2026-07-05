$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$installerRoot = Join-Path $repoRoot "installer"
$distRoot = Join-Path $repoRoot "dist"
$buildRoot = Join-Path $repoRoot ".installer-build"
$setupExe = Join-Path $distRoot "GLDN-Ops-Setup.exe"
$sedPath = Join-Path $buildRoot "GLDN-Ops-Setup.sed"

New-Item -ItemType Directory -Force -Path $distRoot, $buildRoot | Out-Null

Copy-Item -LiteralPath (Join-Path $installerRoot "run-install.cmd") -Destination (Join-Path $buildRoot "run-install.cmd") -Force
Copy-Item -LiteralPath (Join-Path $repoRoot "install-latest.ps1") -Destination (Join-Path $buildRoot "install-latest.ps1") -Force

$sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3

[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$setupExe
FriendlyName=GLDN Ops Setup
AppLaunched=run-install.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles

[Strings]
FILE0=run-install.cmd
FILE1=install-latest.ps1

[SourceFiles]
SourceFiles0=$buildRoot

[SourceFiles0]
%FILE0%=
%FILE1%=
"@

Set-Content -LiteralPath $sedPath -Value $sed -Encoding ASCII

$iexpress = Join-Path $env:SystemRoot "System32\iexpress.exe"
if (-not (Test-Path $iexpress)) {
  throw "IExpress was not found at $iexpress"
}

& $iexpress /N /Q $sedPath

for ($i = 0; $i -lt 10 -and -not (Test-Path $setupExe); $i++) {
  Start-Sleep -Milliseconds 500
}

if (-not (Test-Path $setupExe)) {
  throw "Installer build did not create $setupExe"
}

Write-Host "Built installer:"
Write-Host "  $setupExe"
