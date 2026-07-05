param(
  [switch]$Machine
)

$ErrorActionPreference = "Stop"

$extensionId = "pakkpebfmneoedaaknfdlbkclheekefb"
$updateUrl = "https://raw.githubusercontent.com/googoogaagaa23/GLDN-Ops/main/dist/update.xml"
$value = "$extensionId;$updateUrl"

if ($Machine) {
  $root = "HKLM:\Software\Policies\Google\Chrome\ExtensionInstallForcelist"
} else {
  $root = "HKCU:\Software\Policies\Google\Chrome\ExtensionInstallForcelist"
}

New-Item -Path $root -Force | Out-Null
New-ItemProperty -Path $root -Name "1" -Value $value -PropertyType String -Force | Out-Null

Write-Host "Chrome policy installed:"
Write-Host "  $value"
Write-Host ""
Write-Host "Restart Chrome completely, then open chrome://policy and click Reload policies."
Write-Host "The extension should install automatically in Chrome profiles on this Windows account."
