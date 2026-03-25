#!/bin/bash
# claw wallet minimal installer for Linux/macOS
# Usage: first-time install (wallet init) | upgrade (CLAW_WALLET_SKIP_INIT=1, no wallet init)
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

OS_TYPE="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH_TYPE="$(uname -m)"

BINARY_NAME="clay-sandbox-linux-amd64"
if [ "$OS_TYPE" = "darwin" ]; then
    if [ "$ARCH_TYPE" = "arm64" ]; then
        BINARY_NAME="clay-sandbox-darwin-arm64"
    else
        BINARY_NAME="clay-sandbox-darwin-amd64"
    fi
fi

BINARY_URL="https://github.com/BitsLabSec/Claw_Wallet_Bin/raw/refs/heads/main/bin/$BINARY_NAME"
BINARY_TARGET="./clay-sandbox"

# --- Common: stop, download, start ---
if [ "${CLAW_WALLET_SKIP_STOP:-0}" != "1" ]; then
    "$SCRIPT_DIR/claw-wallet.sh" stop >/dev/null 2>&1 || true
fi

echo "Downloading sandbox binary from $BINARY_URL ..."
TMP_TARGET="${BINARY_TARGET}.download"
curl -L -o "$TMP_TARGET" "$BINARY_URL"
mv -f "$TMP_TARGET" "$BINARY_TARGET"

chmod +x "$BINARY_TARGET"
chmod +x "$SCRIPT_DIR/claw-wallet.sh" 2>/dev/null || true
chmod +x "$SCRIPT_DIR/claw-wallet" 2>/dev/null || true

"$SCRIPT_DIR/claw-wallet.sh" start

# --- First-time only: wallet init (skipped when upgrade passes CLAW_WALLET_SKIP_INIT=1) ---
do_wallet_init() {
    echo "Waiting for sandbox and initializing wallet ..."
    for i in $(seq 1 45); do
        if [ -f "$SCRIPT_DIR/.env.clay" ]; then
            CLAY_SANDBOX_URL="$(grep -E '^CLAY_SANDBOX_URL=' "$SCRIPT_DIR/.env.clay" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")"
            CLAY_AGENT_TOKEN="$(grep -E '^(CLAY_AGENT_TOKEN|AGENT_TOKEN)=' "$SCRIPT_DIR/.env.clay" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
            if [ -n "${CLAY_SANDBOX_URL:-}" ] && [ -n "${CLAY_AGENT_TOKEN:-}" ]; then
                if curl -s -f "${CLAY_SANDBOX_URL}/health" 2>/dev/null | grep -q '"status":"ok"'; then
                    if curl -s -X POST "${CLAY_SANDBOX_URL}/api/v1/wallet/init" \
                        -H "Authorization: Bearer ${CLAY_AGENT_TOKEN}" \
                        -H "Content-Type: application/json" \
                        -d '{}' 2>/dev/null | grep -qE '"uid"|"status"'; then
                        echo "Wallet initialized."
                    else
                        echo "Wallet init returned (may already exist)."
                    fi
                    return 0
                fi
            fi
        fi
        sleep 1
    done
    echo "Warning: .env.clay not ready after 45s. Run POST {CLAY_SANDBOX_URL}/api/v1/wallet/init manually. See SKILL.md."
}

if [ "${CLAW_WALLET_SKIP_INIT:-0}" != "1" ]; then
    do_wallet_init
fi

# --- Common: final messages ---
echo "Check .env.clay for CLAY_SANDBOX_URL and CLAY_AGENT_TOKEN (or AGENT_TOKEN)."
echo "HTTP clients (curl, agents) must call protected APIs with: Authorization: Bearer <same token>."
echo "The same value is duplicated in identity.json as agent_token. See SKILL.md section 'HTTP authentication (sandbox)'."
echo "Sandbox binary refreshed at: $BINARY_TARGET"

# Identity and config are persistent. To reset, delete .env.clay, identity.json and share3.json.