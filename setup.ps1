# One-shot setup (Windows PowerShell): npm → parallel Claw downloads → install.ps1 → claw-address / steem-keys / sync-env
# Run from tagclaw-wallet: .\setup.ps1
# If scripts are blocked: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $Root

$BaseUrl = 'https://raw.githubusercontent.com/ClawWallet/Claw-Wallet-Skill/main'
# Windows-only Claw files (install.ps1 + launchers; no install.sh / claw-wallet.sh)
$ClawFiles = @(
  'install.ps1',
  'claw-wallet',
  'claw-wallet.cmd',
  'claw-wallet.ps1'
)

function Assert-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Error "Required command not found: $Name"
    exit 1
  }
}

Assert-Command node
Assert-Command npm

Write-Host '[1/4] npm install'
npm install

Write-Host "[2/4] Downloading Claw Wallet Skill files in parallel ($($ClawFiles.Count) files)"
$jobs = @()
foreach ($name in $ClawFiles) {
  $jobs += Start-Job -ScriptBlock {
    param($Base, $FileName, $Dest)
    $uri = "$Base/$FileName"
    $part = Join-Path $Dest "$FileName.part"
    $final = Join-Path $Dest $FileName
    Invoke-WebRequest -Uri $uri -OutFile $part -UseBasicParsing
    Move-Item -LiteralPath $part -Destination $final -Force
  } -ArgumentList $BaseUrl, $name, $Root
}

$jobs | Wait-Job | Out-Null
$downloadFailed = $false
foreach ($j in $jobs) {
  try {
    Receive-Job -Job $j -ErrorAction Stop | Out-Null
  } catch {
    $downloadFailed = $true
    Write-Error $_
  }
}
Remove-Job -Job $jobs -Force -ErrorAction SilentlyContinue
if ($downloadFailed) {
  foreach ($name in $ClawFiles) {
    $p = Join-Path $Root "$name.part"
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
  }
  exit 1
}

Write-Host '[3/4] .\install.ps1'
& (Join-Path $Root 'install.ps1')

Write-Host '[4/4] claw-address, steem-keys, sync-env'
node bin/wallet.js claw-address
node bin/wallet.js steem-keys
node bin/wallet.js sync-env

Write-Host 'Done. Review .env and keep your keys secure.'
