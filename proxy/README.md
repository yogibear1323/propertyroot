# PropertyRoot valuation proxy (Zillow Zestimate via Bridge)

Zillow's old public API (GetZestimate / GetSearchResults / GetDeepSearchResults) is retired.
Zestimates are now licensed through **Bridge Interactive** (Zillow Group data) and need an
approved application and an access token.

Endpoint used: `GET https://api.bridgedataoutput.com/api/v2/zestimates_v2/zestimates?access_token=…&address="…"`
(also supports `zpid.in=` and `apn=`). Docs: https://bridgedataoutput.com/docs/platform/API/zg-data

This Worker keeps the token server-side and exposes one route to the static site:

`GET /zestimate?address=123 Main St, Phoenix, AZ` → `{ value, low, high, date, zpid, matchedAddress }`

| status | meaning | app shows |
|---|---|---|
| 200 | estimate found | Zestimate, range, date |
| 404 | no Zestimate for the address | "Address not found" + manual entry |
| 429 | rate limited | "Rate limited" |
| 503 | `BRIDGE_TOKEN` missing / rejected | "Zillow estimate not connected yet" + manual entry |
| 502 | Bridge error / unreachable | "Lookup failed" |

## Switch it on
1. Apply for Zestimate access: register at https://bridgedataoutput.com/zgdata and request the Zestimates dataset (Zillow reviews and approves; commercial use, Zillow Data Terms apply: https://bridgedataoutput.com/zillowterms).
2. Copy the **Server Token / access_token** from the Bridge dashboard.
3. Deploy: `cd proxy && npx wrangler login && npx wrangler secret put BRIDGE_TOKEN && npx wrangler deploy`.
4. Put the Worker URL (e.g. `https://propertyroot-valuation-proxy.<you>.workers.dev`) in `app/src/config/propertyroot-testnet.json` → `valuationProxyUrl` (or a `VITE_VALUATION_PROXY_URL` build var) and merge; Pages redeploys.

The URL isn't secret; the token is. Never put the token in the app or this repo.

Local test: `npx wrangler dev` then `curl 'http://localhost:8787/zestimate?address=...'`.
