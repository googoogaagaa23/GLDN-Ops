param(
  [ValidateSet('Plan', 'Install', 'Verify')][string]$Action = 'Plan',
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [switch]$Machine,
  [switch]$ConfirmPublishedStoreItem
)
$ErrorActionPreference = 'Stop'
$updateUrl = 'https://clients2.google.com/service/update2/crx'
$value = "$ExtensionId;$updateUrl"
$root = if ($Machine) { 'HKLM:\Software\Policies\Google\Chrome\ExtensionInstallForcelist' } else { 'HKCU:\Software\Policies\Google\Chrome\ExtensionInstallForcelist' }
$entries = if (Test-Path -LiteralPath $root) { Get-ItemProperty -LiteralPath $root } else { $null }
$properties = @($entries.PSObject.Properties | Where-Object { $_.Name -match '^\d+$' })
$existing = $properties | Where-Object { ([string]$_.Value).Split(';')[0] -ceq $ExtensionId } | Select-Object -First 1
$slot = 1
while ($properties.Name -contains [string]$slot) { $slot++ }
if ($Action -eq 'Install') {
  if (-not $ConfirmPublishedStoreItem) { throw 'Confirm the exact extension ID is published in the Chrome Web Store before applying policy.' }
  if ($existing -and [string]$existing.Value -cne $value) { throw 'This extension already has a different update policy. Review it explicitly; it was not overwritten.' }
  if (-not $existing) {
    New-Item -Path $root -Force | Out-Null
    New-ItemProperty -LiteralPath $root -Name ([string]$slot) -Value $value -PropertyType String | Out-Null
  }
  $readback = Get-ItemProperty -LiteralPath $root
  if (-not (@($readback.PSObject.Properties.Value) -contains $value)) { throw 'The written policy did not read back correctly.' }
}
[pscustomobject]@{
  action = $Action; policyPath = $root; extensionId = $ExtensionId
  updateUrl = $updateUrl; policyPresent = [bool](($existing -and [string]$existing.Value -ceq $value) -or $Action -eq 'Install')
  conflictingPolicy = [bool]($existing -and [string]$existing.Value -cne $value)
  plannedSlot = if ($existing) { $existing.Name } else { [string]$slot }
  chromeInstallationVerified = $false
  nextStep = 'Verify chrome://policy and chrome://extensions in each intended profile. A policy entry is not proof of installation.'
} | ConvertTo-Json
