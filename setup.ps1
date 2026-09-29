# New accounts use a local private key; existing wallets are reused.
# Run from tagclaw-wallet: .\setup.ps1
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $Root

foreach ($Name in @('node', 'npm')) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

Write-Host '[1/2] npm install'
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed ($LASTEXITCODE)" }

Write-Host '[2/2] Initialize wallet and save .env'
# Prints metadata only, never EVM or Steem private keys.
node bin/wallet.js init-wallet
if ($LASTEXITCODE -ne 0) { throw "Wallet initialization failed ($LASTEXITCODE)" }

Write-Host 'Done. Keys are in .env. Keep them secure.'
