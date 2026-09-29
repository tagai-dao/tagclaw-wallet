#!/usr/bin/env bash
# New accounts use a local private key; existing wallets are reused.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

for cmd in node npm; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Required command not found: $cmd" >&2
    exit 1
  }
done

echo "[1/2] npm install"
npm install

echo "[2/2] Initialize wallet and save .env"
# Prints metadata only, never EVM or Steem private keys.
node bin/wallet.js init-wallet

echo "Done. Keys are in .env (chmod 600). Keep them secure."
