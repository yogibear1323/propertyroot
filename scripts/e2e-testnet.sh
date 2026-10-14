#!/usr/bin/env bash
# End-to-end testnet run through all 3 steps with a fresh friendbot-funded owner.
set -euo pipefail
D=deployments/testnet.json
j() { python3 -c "import json;print(json.load(open('$D'))$1)"; }
REG=$(j "['contracts']['attestationRegistry']"); VAULT=$(j "['contracts']['propertyVault']"); AD=$(j "['contracts']['blendAdapter']")
OWNER=${OWNER:-pr-e2e-owner-$(date +%s)}
stellar keys generate "$OWNER" --network testnet --fund >/dev/null
O=$(stellar keys address "$OWNER")
inv() { local who=$1; shift; stellar contract invoke --network testnet --source-account "$who" "$@" 2>&1 | grep -vE "^(ℹ️|🌎|🔗|✅|📅)"; }
NEXT=$(inv "$OWNER" --id "$REG" --send=no -- next_id | tr -d '"')
HASH=$(printf '%s' "demo-appraisal|$O|123 Mesa Verde Rd, Sedona AZ|single-family|2100 sqft|350000" | sha256sum | cut -d' ' -f1)
echo "owner $O  property_id $NEXT  appraisal_hash $HASH"
echo "== 1. appraise & verify (appraiser key signs; simulated title/KYC)"
inv pr-appraiser --id "$REG" -- attest --property_id "$NEXT" --owner "$O" --value_usd 3500000000000 --appraisal_hash "$HASH" --title_verified true --kyc_verified true
inv "$OWNER" --id "$REG" --send=no -- get --property_id "$NEXT"
echo "== 2. tokenize (50% LTV -> 175,000 pRT)"
TOK=$(inv "$OWNER" --id "$VAULT" -- tokenize --owner "$O" --property_id "$NEXT" | tr -d '"'); echo "token $TOK"
inv "$OWNER" --id "$TOK" --send=no -- symbol; inv "$OWNER" --id "$TOK" --send=no -- balance --id "$O"
echo "== Reflector XLM/USD"; inv "$OWNER" --id "$VAULT" --send=no -- xlm_price
echo "== 3. put 200 pRT to work in Blend"
inv "$OWNER" --id "$VAULT" -- put_to_work --owner "$O" --property_id "$NEXT" --prt_amount 2000000000
inv "$OWNER" --id "$AD" --send=no -- state
inv "$OWNER" --id "$VAULT" --send=no -- position --property_id "$NEXT"
echo "== wait ${WAIT:-90}s for Blend interest to accrue"; sleep "${WAIT:-90}"
inv "$OWNER" --id "$VAULT" --send=no -- position --property_id "$NEXT"
echo "== withdraw (principal -> reserve, interest -> owner, pRT back)"
inv "$OWNER" --id "$VAULT" -- withdraw --owner "$O" --property_id "$NEXT"
inv "$OWNER" --id "$TOK" --send=no -- balance --id "$O"
inv "$OWNER" --id "$VAULT" --send=no -- property --property_id "$NEXT"
echo "== also: simulated self-attestation path used by the web demo"
N2=$(inv "$OWNER" --id "$REG" --send=no -- next_id | tr -d '"')
inv "$OWNER" --id "$REG" -- self_attest --property_id "$N2" --owner "$O" --value_usd 2500000000000 --appraisal_hash "$HASH"
inv "$OWNER" --id "$VAULT" -- tokenize --owner "$O" --property_id "$N2"
inv "$OWNER" --id "$VAULT" -- put_to_work --owner "$O" --property_id "$N2" --prt_amount 500000000
inv "$OWNER" --id "$VAULT" --send=no -- position --property_id "$N2"
echo "E2E OK"
