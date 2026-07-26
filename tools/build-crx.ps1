param([string]$Version = "")

$ErrorActionPreference = "Stop"
Write-Warning "CRX/policy distribution is retired. Building the supported local unpacked package instead."
& (Join-Path $PSScriptRoot "build-local-package.ps1") -Version $Version
exit $LASTEXITCODE
