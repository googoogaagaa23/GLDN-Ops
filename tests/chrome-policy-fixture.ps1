$ErrorActionPreference = 'Stop'
$policyScript = Join-Path $PSScriptRoot '../tools/install-chrome-policy.ps1'
$global:gldnPolicyFixtureValues = [ordered]@{ '1'='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;https://example.invalid/update'; '3'='cccccccccccccccccccccccccccccccc;https://example.invalid/update' }
$global:gldnPolicyFixtureWrites = 0

# Registry cmdlets are shadowed only in this fixture process; no Windows policy is changed.
function Test-Path { param($LiteralPath) return $true }
function Get-ItemProperty { param($LiteralPath) return [pscustomobject]$global:gldnPolicyFixtureValues }
function New-Item { param($Path, [switch]$Force) }
function New-ItemProperty {
  param($LiteralPath, $Name, $Value, $PropertyType)
  if ($global:gldnPolicyFixtureValues.Contains($Name)) { throw 'Attempted to overwrite an existing policy.' }
  $global:gldnPolicyFixtureValues[$Name] = $Value
  $global:gldnPolicyFixtureWrites++
}
function Assert-True($condition, $message) { if (-not $condition) { throw $message } }
function Expect-Failure([scriptblock]$action) {
  $failed = $false
  try { & $action | Out-Null } catch { $failed = $true }
  Assert-True $failed 'Expected operation to be rejected.'
}
$id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
$plan = (& $policyScript -ExtensionId $id | ConvertFrom-Json)
Assert-True ($global:gldnPolicyFixtureWrites -eq 0 -and $plan.plannedSlot -eq '2' -and -not $plan.policyPresent) ('Plan changed state or chose an occupied slot: ' + ($plan | ConvertTo-Json -Compress))
Expect-Failure { & $policyScript -Action Install -ExtensionId $id }
Assert-True ($global:gldnPolicyFixtureWrites -eq 0) 'Unconfirmed installation wrote policy.'
$installed = (& $policyScript -Action Install -ExtensionId $id -ConfirmPublishedStoreItem | ConvertFrom-Json)
Assert-True ($global:gldnPolicyFixtureWrites -eq 1 -and $installed.policyPresent -and -not $installed.chromeInstallationVerified) 'Installed policy was reported incorrectly.'
Assert-True ($global:gldnPolicyFixtureValues['1'].StartsWith('bbbb') -and $global:gldnPolicyFixtureValues['3'].StartsWith('cccc')) 'Unrelated policies changed.'
& $policyScript -Action Install -ExtensionId $id -ConfirmPublishedStoreItem | Out-Null
Assert-True ($global:gldnPolicyFixtureWrites -eq 1) 'Repeated installation should not write again.'
$global:gldnPolicyFixtureValues['2'] = "$id;https://example.invalid/unexpected"
$verify = (& $policyScript -Action Verify -ExtensionId $id | ConvertFrom-Json)
Assert-True ($verify.conflictingPolicy -and -not $verify.policyPresent) 'A mismatched update URL was reported as correct.'
Expect-Failure { & $policyScript -Action Install -ExtensionId $id -ConfirmPublishedStoreItem }
Assert-True ($global:gldnPolicyFixtureWrites -eq 1) 'Conflicting policy was overwritten.'
Write-Output 'Chrome policy fixtures passed: plan only, explicit publication gate, free slot, unrelated entries preserved, idempotence, conflict rejection, truthful verification.'
