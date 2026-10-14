# PropertyRoot valuation proxy (RentCast AVM)

The demo's "Get RentCast estimate" button uses RentCast's value estimate API:
`GET https://api.rentcast.io/v1/avm/value?address=Street, City, State, Zip` with header `X-Api-Key`.
Response fields used: `price`, `priceRangeLow`, `priceRangeHigh`, `comparables` (count), `subjectProperty.formattedAddress`.
Docs: https://developers.rentcast.io/reference/value-estimate

This Worker keeps the key server-side and exposes one route to the static site:
`GET /avm/value?address=...` → RentCast's JSON, unchanged (the app stores sha256 of it on chain).

- **CORS**: only `ALLOWED_ORIGINS` (default `https://yogibear1323.github.io`); other origins get 403.
- **Cache**: successful lookups are cached per normalized address for `CACHE_TTL` (30 days) via the Cache API, to save the free plan's 50 requests/month. `x-cache: HIT|MISS` shows which.
- **Own key pass-through**: a request header `X-RentCast-Key` is used instead of the secret (not cached, never logged). The app normally calls RentCast directly with a user's own key, since RentCast allows CORS (`Access-Control-Allow-Origin: *`, `X-Api-Key` allowed).

| status | meaning | app shows |
|---|---|---|
| 200 | estimate | price, low–high range, comparables count |
| 404 | address not found | "Address not found (404)" + manual entry |
| 401 | key rejected | "Bad API key (401)" |
| 429 | quota / rate limit | "Quota reached (429)" |
| 503 | no key on the Worker | "RentCast not connected yet" + own key / manual entry |
| 502 | RentCast error or unreachable | "Lookup failed" |

## Switch it on
1. Sign up at https://app.rentcast.io and choose the free **Developer** API plan (50 requests/month).
2. Create an API key at https://app.rentcast.io/app/api.
3. `cd proxy && npx wrangler login && npx wrangler secret put RENTCAST_API_KEY` (paste the key when asked).
4. `npx wrangler deploy` → note the URL, e.g. `https://propertyroot-valuation-proxy.<account>.workers.dev`.
5. Set `valuationProxyUrl` in `app/src/config/propertyroot-testnet.json` to that URL and merge a PR; Pages redeploys.

The URL isn't secret; the key is. Never put it in the app or this repo.
Local test: `npx wrangler dev` then `curl -H 'Origin: https://yogibear1323.github.io' 'http://localhost:8787/avm/value?address=5500 Grand Lake Dr, San Antonio, TX, 78244'`.
