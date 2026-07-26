param([string]$Version = "")

$ErrorActionPreference = "Stop"

Write-Warning "Private dashboard credentials are no longer embedded in extension packages. Building the credential-free package instead."
& (Join-Path $PSScriptRoot "build-extension-package.ps1") -Version $Version
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
