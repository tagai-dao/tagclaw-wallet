# One-shot setup (Windows PowerShell): npm → download install.ps1 → install.ps1 → claw-address / steem-keys / sync-env
# Run from tagclaw-wallet: .\setup.ps1
# If scripts are blocked: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $Root

# Official skill distribution (same host as SKILL.md / install.ps1 in docs)
$BaseUrl = if ($env:CLAW_WALLET_SKILLS_BASE_URL) { $env:CLAW_WALLET_SKILLS_BASE_URL } else { 'https://www.clawwallet.cc/skills' }

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

Write-Host '[2/4] Downloading install.ps1'
$installPart = Join-Path $Root 'install.ps1.part'
$installFinal = Join-Path $Root 'install.ps1'
try {
  Invoke-WebRequest -Uri "$BaseUrl/install.ps1" -OutFile $installPart -UseBasicParsing
  Move-Item -LiteralPath $installPart -Destination $installFinal -Force
} catch {
  if (Test-Path -LiteralPath $installPart) { Remove-Item -LiteralPath $installPart -Force }
  Write-Error "Failed to download install.ps1. Check your network or CLAW_WALLET_SKILLS_BASE_URL."
  exit 1
}

Write-Host '[3/4] .\install.ps1'
& (Join-Path $Root 'install.ps1')

Write-Host '[4/4] claw-address, steem-keys, sync-env'
node bin/wallet.js claw-address
node bin/wallet.js steem-keys
node bin/wallet.js sync-env

Write-Host 'Done. Review .env and keep your keys secure.'
