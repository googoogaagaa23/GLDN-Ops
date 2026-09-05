$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$InstallRoot = Join-Path $repo ('.test-tmp\pairing-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
function New-AgentControlToken { return ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')) }
function Resolve-GldnExtensionRequestTarget { param($ExtensionId,$FallbackInstallRoot) return [pscustomobject]@{profileDirectories=@('Profile 2','Profile 3')} }
. (Join-Path $repo 'tools\gldn-control-pairing.ps1')
function Check($Condition, $Message) { if (-not $Condition) { throw $Message } }
function Reject($Action, $Message) { $rejected=$false; try { & $Action | Out-Null } catch { $rejected=$true }; Check $rejected $Message }
$extensionId = 'a' * 32
$first = Start-AgentPairing @{installationId=[guid]::NewGuid().ToString()} $extensionId
$second = Start-AgentPairing @{installationId=[guid]::NewGuid().ToString()} $extensionId
Reject { Assert-AgentProfileBinding $extensionId $first.token } 'Unapproved request was trusted'
Reject { Approve-AgentPairing @{code=$first.code;profileDirectory='Default'} } 'Absent profile was accepted'
$null = Approve-AgentPairing @{code=$first.code;profileDirectory='Profile 2'}
$null = Approve-AgentPairing @{code=$second.code;profileDirectory='Profile 3'}
Check ((Assert-AgentProfileBinding $extensionId $first.token).profileDirectory -ceq 'Profile 2') 'Wrong profile selected'
Check ((Assert-AgentProfileBinding $extensionId $second.token).profileDirectory -ceq 'Profile 3') 'Second profile rejected'
Reject { Assert-AgentProfileBinding ('b' * 32) $first.token } 'Wrong extension accepted'
Reject { Assert-AgentProfileBinding $extensionId ('c' * 64) } 'Wrong token accepted'
Reject { Get-AgentPairingStatus @{code=$first.code;token=$second.token} $extensionId } 'Pair status leaked across profiles'
Reject { Approve-AgentPairing @{code=$first.code;profileDirectory='Profile 3'} } 'Pairing code reused'
$status = Get-AgentPairingStatus @{code=$first.code;token=$first.token} $extensionId
Check $status.approved 'Approved state missing'
$serialized = Get-Content -Raw -LiteralPath $script:AgentBindingsPath
Check (-not $serialized.Contains($first.token)) 'Plain control credential persisted to agent bindings'
$null = Remove-AgentPairing $extensionId $first.token
Reject { Assert-AgentProfileBinding $extensionId $first.token } 'Revoked token accepted'
Check ((Assert-AgentProfileBinding $extensionId $second.token).profileDirectory -ceq 'Profile 3') 'Revocation damaged another profile'
Write-Output 'PASS: explicit pairing, shared extension ID, exact profile isolation, wrong-token rejection, one-time approval, hashed persistence, and selective revocation.'
