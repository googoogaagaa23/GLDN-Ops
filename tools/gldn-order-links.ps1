$script:OrderLinksDataRoot=Join-Path $env:LOCALAPPDATA 'GLDN Ops Data\Order Links'
function Get-OrderLinksPath([string]$ExtensionId) {
  if ($ExtensionId -notmatch '^[a-p]{32}$') { throw 'Invalid extension identity.' }
  $null = Resolve-GldnExtensionRequestTarget -ExtensionId $ExtensionId -FallbackInstallRoot $InstallRoot
  New-Item -ItemType Directory -Path $script:OrderLinksDataRoot -Force | Out-Null
  return (Join-Path $script:OrderLinksDataRoot "order-links-$ExtensionId.json")
}
function Read-OrderLinks([string]$ExtensionId) {
  $path = Get-OrderLinksPath $ExtensionId
  if (-not (Test-Path -LiteralPath $path)) { return [pscustomobject]@{ schemaVersion=1; mappings=@(); orders=@() } }
  $value = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
  if ($value.schemaVersion -ne 1) { throw 'Order-link settings could not be read. Nothing was opened.' }
  return $value
}
function Save-OrderLinks($Value,[string]$ExtensionId) {
  $path = Get-OrderLinksPath $ExtensionId
  ConvertTo-Json -InputObject $Value -Depth 8 | Set-Content -LiteralPath "$path.tmp" -Encoding UTF8
  Move-Item -LiteralPath "$path.tmp" -Destination $path -Force
}
function Get-OrderLinksProfiles {
  $root = Get-GldnChromeUserDataRoot
  $profiles = @()
  foreach ($directory in (Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | Where-Object Name -Match '^(Default|Profile(?: \d+)?)$')) {
    $name = $directory.Name
    try { $prefs=Get-Content -Raw -LiteralPath (Join-Path $directory.FullName 'Preferences') | ConvertFrom-Json; if ($prefs.profile.name) { $name=[string]$prefs.profile.name } } catch { }
    $profiles += [pscustomobject]@{ profileDirectory=$directory.Name; name=$name }
  }
  return @($profiles)
}
function Get-OrderLinksConfig([string]$ExtensionId) {
  $value=Read-OrderLinks $ExtensionId
  return [pscustomobject]@{ ok=$true; capability='order-links-v1'; profiles=@(Get-OrderLinksProfiles); mappings=@($value.mappings) }
}
function Set-OrderLinksMapping($Body,[string]$ExtensionId) {
  $value=Read-OrderLinks $ExtensionId
  $label=([string]$Body.label).Trim().ToUpperInvariant()
  $profile=[string]$Body.profileDirectory
  $email=([string]$Body.supplierEmail).Trim().ToLowerInvariant()
  if (-not $label -or $label.Length -gt 80 -or $label -match '[\x00-\x1f]') { throw 'Enter a valid Amazon profile label.' }
  if ($profile -notmatch '^(Default|Profile(?: \d+)?)$' -or @((Get-OrderLinksProfiles) | Where-Object profileDirectory -CEQ $profile).Count -ne 1) { throw 'Choose an existing Chrome profile on this computer.' }
  if ($email -and ($email.Length -gt 254 -or $email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$')) { throw 'Enter a valid supplier email or leave it blank.' }
  if (@($value.mappings | Where-Object { $_.label -cne $label -and $_.profileDirectory -ceq $profile }).Count) { throw 'This Chrome profile already has a different Amazon label.' }
  if ($email -and @($value.mappings | Where-Object { $_.label -cne $label -and $_.supplierEmail -ieq $email }).Count) { throw 'This supplier email already belongs to a different mapping.' }
  $value.mappings=@($value.mappings | Where-Object label -CNE $label)+@([pscustomobject]@{label=$label;profileDirectory=$profile;supplierEmail=$email})
  Save-OrderLinks $value $ExtensionId
  return Get-OrderLinksConfig $ExtensionId
}
function Remember-OrderLink($Body,[string]$ExtensionId) {
  $value=Read-OrderLinks $ExtensionId
  if ([string]$Body.orderId -notmatch '^\d{2}-\d{5}-\d{5}$' -or [string]$Body.amazonOrderId -notmatch '^\d{3}-\d{7}-\d{7}$') { throw 'Exact marketplace and Amazon order IDs are required.' }
  $record=[pscustomobject]@{orderId=[string]$Body.orderId;amazonOrderId=[string]$Body.amazonOrderId; supplierEmail=([string]$Body.supplierEmail).Trim().ToLowerInvariant();profileLabel=([string]$Body.profileLabel).Trim().ToUpperInvariant();source='trackerbot-exact-ebay-order';capturedAt=[DateTime]::UtcNow.ToString('o')}
  if ($record.profileLabel.Length -gt 80 -or $record.supplierEmail.Length -gt 254 -or ($record.supplierEmail -and $record.supplierEmail -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$')) { throw 'The supplier identity could not be verified.' }
  $existing=@($value.orders | Where-Object orderId -CEQ $record.orderId)
  if (@($existing | Where-Object { $_.amazonOrderId -cne $record.amazonOrderId -or ($_.supplierEmail -and $record.supplierEmail -and $_.supplierEmail -ine $record.supplierEmail) }).Count) { throw 'The saved Amazon order conflicts with Trackerbot. Review the records manually.' }
  $value.orders=@($value.orders | Where-Object orderId -CNE $record.orderId)+@($record)
  if ($value.orders.Count -gt 10000) { $value.orders=@($value.orders | Select-Object -Last 10000) }
  Save-OrderLinks $value $ExtensionId
  return [pscustomobject]@{ok=$true;record=$record}
}
function Get-OrderLink($Body,[string]$ExtensionId) {
  if ([string]$Body.orderId -notmatch '^\d{2}-\d{5}-\d{5}$') { throw 'An exact eBay order ID is required.' }
  $value=Read-OrderLinks $ExtensionId
  return [pscustomobject]@{ok=$true;record=(@($value.orders | Where-Object orderId -CEQ ([string]$Body.orderId)) | Select-Object -First 1)}
}
function Open-OrderLink($Body,[string]$ExtensionId) {
  $value=Read-OrderLinks $ExtensionId
  $label=([string]$Body.profileLabel).Trim().ToUpperInvariant()
  $email=([string]$Body.supplierEmail).Trim().ToLowerInvariant()
  $named=@($value.mappings | Where-Object { $label -and $_.label -ceq $label })
  $emailed=@($value.mappings | Where-Object { $email -and $_.supplierEmail -ieq $email })
  if ($named.Count -gt 1 -or $emailed.Count -gt 1 -or ($named.Count -eq 1 -and $emailed.Count -eq 1 -and $named[0].profileDirectory -cne $emailed[0].profileDirectory)) { throw 'The note and supplier email conflict. Nothing was opened.' }
  if ($named.Count -eq 1 -and $email -and $named[0].supplierEmail -and $named[0].supplierEmail -ine $email) { throw 'The Trackerbot supplier email differs from the saved profile email. Nothing was opened.' }
  $mapping=if ($named.Count -eq 1) { $named[0] } elseif ($emailed.Count -eq 1) { $emailed[0] } else { $null }
  if (-not $mapping) { throw 'Save the Amazon label to Chrome profile mapping on this computer first.' }
  if ([string]$Body.profileDirectory -cne $mapping.profileDirectory) { throw 'The profile mapping changed during this lookup. Nothing was opened. Try again.' }
  if (@((Get-OrderLinksProfiles) | Where-Object profileDirectory -CEQ $mapping.profileDirectory).Count -ne 1) { throw 'The mapped Chrome profile no longer exists.' }
  $order=[string]$Body.amazonOrderId
  $asin=[string]$Body.asin
  if ($order) {
    if ($order -notmatch '^\d{3}-\d{7}-\d{7}$') { throw 'Invalid Amazon order ID.' }
    $url="https://www.amazon.com/your-orders/order-details?orderID=$order"
  } else {
    if ($asin -notmatch '^[A-Z0-9]{10}$') { throw 'One exact ASIN is needed to search purchase history.' }
    $url="https://www.amazon.com/your-orders/search?search=$asin"
  }
  $root=Get-GldnChromeUserDataRoot
  $candidates=if ($root -match '\\Chrome SxS\\') { @((Join-Path $env:LOCALAPPDATA 'Google\Chrome SxS\Application\chrome.exe')) } else { @((Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),(Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),(Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')) }
  $chrome=$candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if (-not $chrome) { throw 'Google Chrome was not found on this computer.' }
  $arguments=@(('--profile-directory="{0}"' -f $mapping.profileDirectory),('--user-data-dir="{0}"' -f $root),$url)
  Start-Process -FilePath $chrome -ArgumentList $arguments -WindowStyle Hidden
  return [pscustomobject]@{ok=$true;requested=$true;profileLabel=$mapping.label;profileDirectory=$mapping.profileDirectory;url=$url;exactOrder=[bool]$order;verifiedSignedIn=$false}
}
