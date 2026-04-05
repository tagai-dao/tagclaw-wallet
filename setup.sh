#!/usr/bin/env bash
# One-shot setup: npm install → parallel Claw Skill downloads → install.sh → claw-address / steem-keys / sync-env
# Run from the tagclaw-wallet directory: bash setup.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BASE_URL="https://raw.githubusercontent.com/ClawWallet/Claw-Wallet-Skill/main"
# Unix-only Claw files (parallel, one HTTP request each); .part avoids truncated files on failure
CLAW_FILES=(
  install.sh
  claw-wallet
  claw-wallet.sh
)

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

need_cmd node
need_cmd npm
need_cmd curl

echo "[1/4] npm install"
npm install

n="${#CLAW_FILES[@]}"
echo "[2/4] Downloading Claw Wallet Skill files in parallel (${n} files)"
pids=()
for f in "${CLAW_FILES[@]}"; do
  (
    curl -fsSL "${BASE_URL}/${f}" -o "${ROOT}/${f}.part" && mv "${ROOT}/${f}.part" "${ROOT}/${f}"
  ) &
  pids+=($!)
done
failed=0
for pid in "${pids[@]}"; do
  wait "$pid" || failed=1
done
if (( failed )); then
  echo "Failed to download Claw files. Check your network or BASE_URL." >&2
  rm -f "${CLAW_FILES[@]/%/.part}"
  exit 1
fi

chmod +x install.sh claw-wallet claw-wallet.sh 2>/dev/null || true

echo "[3/4] bash install.sh"
bash install.sh

echo "[4/4] claw-address, steem-keys, sync-env"
node bin/wallet.js claw-address
node bin/wallet.js steem-keys
node bin/wallet.js sync-env

echo "Done. Review .env and keep your keys secure."
