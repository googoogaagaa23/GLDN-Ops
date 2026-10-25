$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRoot=Join-Path $repo ('.test-tmp\order-router-'+[guid]::NewGuid().ToString('N'))
$InstallRoot=Join-Path $testRoot 'Install'
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
function Resolve-GldnExtensionRequestTarget { param($ExtensionId,$FallbackInstallRoot) if($ExtensionId -cne ('a'*32)){throw 'Unrecognized extension'};return @{} }
function Get-GldnChromeUserDataRoot { return (Join-Path $testRoot 'Chrome Profiles') }
foreach($name in @('Profile 2','Profile 7','Profile 8')) { New-Item -ItemType Directory -Path (Join-Path (Get-GldnChromeUserDataRoot) $name) -Force | Out-Null }
. (Join-Path $repo 'tools\gldn-order-links.ps1')
$script:OrderLinksDataRoot=Join-Path $testRoot 'Persistent data'
$script:launches=@()
function Start-Process { param($FilePath,$ArgumentList,$WindowStyle) $script:launches+=,[pscustomobject]@{exe=$FilePath;arguments=$ArgumentList;windowStyle=$WindowStyle} }
function Check($Condition,$Message){if(-not $Condition){throw $Message}}
function Reject($Action,$Message){$rejected=$false;try{& $Action | Out-Null}catch{$rejected=$true};Check $rejected $Message}
$id='a'*32
$null=Set-OrderLinksMapping @{label='TIFF';profileDirectory='Profile 7';supplierEmail='tiff@example.com'} $id
$null=Set-OrderLinksMapping @{label='M8';profileDirectory='Profile 8';supplierEmail='m8@example.com'} $id
Reject { Set-OrderLinksMapping @{label='BAD';profileDirectory='..\Profile 7'} $id } 'Traversal profile accepted'
Reject { Set-OrderLinksMapping @{label='BAD';profileDirectory='Profile 404'} $id } 'Missing profile accepted'
Reject { Set-OrderLinksMapping @{label='BAD';profileDirectory='Profile 2';supplierEmail='tiff@example.com'} $id } 'Duplicate supplier email accepted'
Reject { Get-OrderLinksConfig ('b'*32) } 'Unrecognized extension accepted'
$null=Remember-OrderLink @{orderId='10-00000-00001';amazonOrderId='112-1234567-1234567';profileLabel='TIFF';supplierEmail='tiff@example.com'} $id
Check ((Get-OrderLink @{orderId='10-00000-00001'} $id).record.amazonOrderId -ceq '112-1234567-1234567') 'Exact link not retained'
Reject { Remember-OrderLink @{orderId='10-00000-00001';amazonOrderId='112-0000000-0000000'} $id } 'Conflicting saved order replaced'
Reject { Open-OrderLink @{profileLabel='TIFF';supplierEmail='m8@example.com';amazonOrderId='112-1234567-1234567'} $id } 'Conflicting account opened'
Reject { Open-OrderLink @{profileLabel='TIFF';supplierEmail='unknown@example.com';amazonOrderId='112-1234567-1234567'} $id } 'Unknown conflicting email opened'
Reject { Open-OrderLink @{profileLabel='Unknown';amazonOrderId='112-1234567-1234567'} $id } 'Missing mapping opened current profile'
Reject { Open-OrderLink @{profileLabel='TIFF';profileDirectory='Profile 7';amazonOrderId='112-1234567-1234567" --incognito'} $id } 'Command-line injection accepted'
Reject { Open-OrderLink @{profileLabel='TIFF';profileDirectory='Profile 8';amazonOrderId='112-1234567-1234567'} $id } 'Changed mapping opened another profile'
Check ($script:launches.Count -eq 0) 'Rejected requests launched Chrome'
$result=Open-OrderLink @{profileLabel='TIFF';profileDirectory='Profile 7';amazonOrderId='112-1234567-1234567'} $id
Check ($result.profileDirectory -ceq 'Profile 7' -and -not $result.verifiedSignedIn) 'Routing claimed sign-in proof'
Check ($script:launches.Count -eq 1 -and $script:launches[0].arguments.Count -eq 3) 'Wrong launch arguments'
Check ($script:launches[0].arguments[0] -ceq '--profile-directory="Profile 7"') 'Spaced profile lost its quotes'
Check ($script:launches[0].arguments[2] -ceq 'https://www.amazon.com/your-orders/order-details?orderID=112-1234567-1234567') 'Wrong Amazon order URL'
Check ($script:launches[0].windowStyle -ceq 'Hidden') 'Helper opened a visible helper window'
$result=Open-OrderLink @{profileLabel='TIFF';profileDirectory='Profile 7';asin='B012345678'} $id
Check (-not $result.exactOrder -and $result.url -ceq 'https://www.amazon.com/your-orders/search?search=B012345678') 'Search labeled as exact order'
$oldRoot=$InstallRoot;$InstallRoot=Join-Path $testRoot 'Replacement install';New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
Check ((Get-OrderLinksConfig $id).mappings.Count -eq 2) 'Helper reinstall lost profile mappings'
Write-Output 'PASS: same-computer profile routing, exact IDs, quoted directories, conflict guards, no arbitrary URLs, durable local mappings, and no real browser launch.'
