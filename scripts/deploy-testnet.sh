#!/usr/bin/env bash
# Deploy PropertyRoot to Stellar TESTNET. Keys live only in the local stellar CLI keystore
# (~/.config/stellar/identity); nothing secret is written to this repo.
set -euo pipefail
NET=testnet
ADMIN=${ADMIN:-pr-admin}
APPRAISER=${APPRAISER:-pr-appraiser}
BLEND_POOL=${BLEND_POOL:-CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF}   # Blend v2 testnet pool (XLM reserve index 0)
REFLECTOR=${REFLECTOR:-CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63}   # Reflector testnet oracle (external CEX/DEX, XLM/USD)
LTV_BPS=${LTV_BPS:-5000}
RESERVE_XLM=${RESERVE_XLM:-9000}
W=target/wasm32v1-none/release
for k in "$ADMIN" "$APPRAISER"; do stellar keys address "$k" >/dev/null 2>&1 || stellar keys generate "$k" --network $NET --fund; done
A=$(stellar keys address "$ADMIN"); P=$(stellar keys address "$APPRAISER")
XLM=$(stellar contract id asset --asset native --network $NET)
for p in attestation-registry property-token property-vault blend-adapter; do stellar contract build --package propertyroot-$p >/dev/null; done
inv() { stellar contract invoke --network $NET --source-account "$ADMIN" "$@"; }
REG=$(stellar contract deploy --network $NET --source-account "$ADMIN" --wasm $W/propertyroot_attestation_registry.wasm -- --admin "$A" --appraiser "$P" --demo_mode true --demo_cap_usd 20000000000000)
TOKEN_HASH=$(stellar contract upload --network $NET --source-account "$ADMIN" --wasm $W/propertyroot_property_token.wasm)
ADAPTER=$(stellar contract deploy --network $NET --source-account "$ADMIN" --wasm $W/propertyroot_blend_adapter.wasm -- --admin "$A" --vault "$A" --pool "$BLEND_POOL" --asset "$XLM")
VAULT=$(stellar contract deploy --network $NET --source-account "$ADMIN" --wasm $W/propertyroot_property_vault.wasm -- --admin "$A" --registry "$REG" --token_wasm "$TOKEN_HASH" --oracle "$REFLECTOR" --xlm "$XLM" --adapter "$ADAPTER" --ltv_bps $LTV_BPS --max_price_age 1800 --require_verified true)
inv --id "$ADAPTER" -- set_vault --vault "$VAULT" >/dev/null
inv --id "$VAULT" -- fund_reserve --from "$A" --amount $((RESERVE_XLM * 10000000)) >/dev/null
cat > deployments/testnet.json <<JSON
{
  "network": "testnet",
  "warning": "TESTNET DEMO ONLY - UNAUDITED. pRT tokens are not legal title. Appraisal, title and KYC are simulated.",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "admin": "$A",
  "appraiser": "$P",
  "external": {
    "xlmSac": "$XLM",
    "blendPool": "$BLEND_POOL",
    "blendPoolNote": "Blend v2 testnet pool; XLM reserve (index 0) supplied with request_type 0",
    "reflector": "$REFLECTOR",
    "reflectorNote": "Reflector testnet oracle (SEP-40), asset Other(XLM), 14 decimals, USD base"
  },
  "contracts": {
    "attestationRegistry": "$REG",
    "propertyVault": "$VAULT",
    "blendAdapter": "$ADAPTER"
  },
  "propertyTokenWasmHash": "$TOKEN_HASH",
  "params": { "ltvBps": $LTV_BPS, "maxPriceAgeSecs": 1800, "demoMode": true, "demoCapUsd": 2000000, "requireVerified": true, "initialReserveXlm": $RESERVE_XLM },
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
cat deployments/testnet.json
