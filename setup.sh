#!/usr/bin/env bash
# One-shot setup: npm install → download install.sh → install.sh → claw-address / sync-env
# Run from the tagclaw-wallet directory: bash setup.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# Official skill distribution (same host as SKILL.md / install.sh in docs)
BASE_URL="${CLAW_WALLET_SKILLS_BASE_URL:-https://www.clawwallet.cc/skills}"

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

echo "[2/4] Downloading install.sh"
if ! curl -fsSL "${BASE_URL}/install.sh" -o "${ROOT}/install.sh.part"; then
  echo "Failed to download install.sh. Check your network or BASE_URL." >&2
  rm -f "${ROOT}/install.sh.part"
  exit 1
fi
mv "${ROOT}/install.sh.part" "${ROOT}/install.sh"
chmod +x install.sh

echo "[3/4] bash install.sh"
bash install.sh

echo "[4/4] claw-address, sync-env"
node bin/wallet.js claw-address
# sync-env derives Steem keys and writes them into .env; it deliberately does
# NOT print key material to stdout to avoid leaking private keys to the terminal
# or install logs. Use `node bin/wallet.js steem-keys` manually if you need the
# raw values outside the install flow.
node bin/wallet.js sync-env

echo "Done. Keys are in .env (chmod 600). Keep them secure."
