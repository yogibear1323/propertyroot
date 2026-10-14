# PropertyRoot — Stellar testnet demo (Quasaria)

> **TESTNET DEMO ONLY · UNAUDITED · NOT LEGAL TITLE.** Appraisal, title and KYC are simulated.
> Yield shown here is **Blend lending interest** paid by Blend borrowers, **not** rent or property appreciation.

PropertyRoot lets an owner put an appraised home or land value to work: an appraisal is attested on-chain,
an LTV-capped share of that value is minted as a SEP-41 token (`pRT-<id>`), and pRT put to work is matched with XLM
supplied to **Blend**, where interest compounds through Blend's bToken rate. Prices come from **Reflector**.
Everything on-chain is Stellar-native: Soroban contracts (Rust, soroban-sdk 28), SEP-41, SEP-40, Freighter, Stellar CLI/SDK.

Live demo UI: https://yogibear1323.github.io/quasaria/propertyroot

## Contracts (`contracts/`)
| Contract | What it does |
|---|---|
| `attestation-registry` | Records `{owner, value_usd, appraisal_hash, title/KYC flags, simulated, version}` per property. `attest` is signed by the appraiser key; `self_attest` is a demo-mode, capped ($2M) simulated appraisal signed by the owner's own wallet (used by the web demo, flagged `simulated: true`). |
| `property-token` | SEP-41 token `pRT-<id>` (7 dp, 1 pRT = 1 USD of LTV-capped value). Only the vault can mint. One instance per property, deployed by the vault. |
| `property-vault` | `tokenize` (deploys pRT-<id>, mints value × LTV, 50% on testnet), `revalue` (mints extra headroom on a higher attestation; records `over_cap` and blocks new deployments on a lower one), `xlm_price`/`usd_to_xlm` (Reflector XLM/USD with a staleness check), `put_to_work` (escrows pRT, supplies the USD-equivalent XLM from the demo liquidity reserve to Blend), `withdraw` (principal back to the reserve, interest to the owner, pRT returned). |
| `blend-adapter` | Supplies XLM to the Blend v2 pool (request type 0), share-price accounting (`share_price` = value / shares, value = bTokens × `b_rate`), withdraw (type 1). |

The **demo liquidity reserve** inside the vault stands in for a real lender or credit line: on testnet the admin funds it with friendbot XLM.
In production the working capital would come from a lender against the pRT collateral, which brings liquidation risk.

## Testnet deployment
See [`deployments/testnet.json`](deployments/testnet.json). External: Blend v2 testnet pool `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF` (XLM reserve), Reflector testnet oracle `CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63`.

## Build / test / deploy
```bash
stellar contract build --package propertyroot-property-token   # tests embed this wasm
cargo test -p propertyroot-tests                                 # flow, revalue, auth, stale oracle, share fairness
./scripts/deploy-testnet.sh                                      # keys stay in the local stellar CLI keystore
./scripts/e2e-testnet.sh                                         # friendbot owner through all 3 steps (log: e2e/testnet-run.log)
```

## Risks (demo disclosures)
- **Legal:** a token is not a deed. Real use needs a title-holding SPV/trust, licensed appraisers, KYC, and likely securities registration or exemption.
- **Appraisal:** values are opinions and go stale; downward revaluation blocks new deployments.
- **Oracle:** Reflector price errors or staleness change how much XLM is deployed; stale prices (> 30 min) are rejected.
- **Liquidation / lending:** Blend utilisation, bad debt or a pool exploit can delay or reduce withdrawals; Blend XLM rates are variable and currently low.
- **Smart contracts:** unaudited code.

## Logo concepts (`logo/`)
Roots growing from the base of the Quasaria Q into a house/land outline, clay → honey with a soft glow and moss accent.
`option-a-roots-house.svg` (used on the page), `option-b-roots-land.svg`, `option-c-house-in-roots.svg`.

## Website (`app/`)

Standalone Quasaria PropertyRoot site: landing page at `/` and the testnet demo app at `/app`.
Live: https://yogibear1323.github.io/propertyroot/ (demo: https://yogibear1323.github.io/propertyroot/app).
Vite + React, Freighter or a local testnet key, earthy theme. It reads `deployments`-equivalent config from
`app/src/config/propertyroot-testnet.json` and talks only to Stellar testnet RPC; no dependency on the exchange.

    cd app && npm ci && npm test && VITE_BASE=/propertyroot/ npm run build
