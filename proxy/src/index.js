// PropertyRoot valuation proxy — Cloudflare Worker for the RentCast AVM.
// Holds RENTCAST_API_KEY as a Worker secret; the static site never sees it.
//   GET /avm/value?address=Street, City, State, Zip  ->  RentCast's JSON body, unchanged (so the app can hash it)
// Optional pass-through: a request header X-RentCast-Key is forwarded as X-Api-Key instead of the secret.
// (The app calls RentCast directly with a user's own key since RentCast allows CORS; this is a fallback.)
// Keys and headers are never logged. Successful responses are cached per normalized address
// (Cache API, CACHE_TTL seconds, default 30 days) to save the free plan's 50 calls/month.
const RENTCAST = "https://api.rentcast.io/v1/avm/value";

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get("origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "https://yogibear1323.github.io").split(",").map((s) => s.trim()).filter(Boolean);
    const ok = allowed.includes(origin);
    const cors = { "access-control-allow-origin": ok ? origin : allowed[0], "access-control-allow-methods": "GET,OPTIONS", "access-control-allow-headers": "x-rentcast-key", vary: "origin" };
    const out = (status, body, extra = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", ...extra } });
    if (req.method === "OPTIONS") return new Response(null, { status: ok ? 204 : 403, headers: cors });
    if (origin && !ok) return out(403, { error: "origin_not_allowed" });
    const url = new URL(req.url);
    if (url.pathname !== "/avm/value" || req.method !== "GET") return out(404, { error: "not_found" });
    const userKey = req.headers.get("x-rentcast-key") || "";
    const key = userKey || env.RENTCAST_API_KEY;
    if (!key) return out(503, { error: "not_configured" });
    const address = (url.searchParams.get("address") || "").trim();
    if (address.length < 5 || address.length > 200) return out(400, { error: "bad_address" });

    const norm = address.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
    const cacheKey = new Request(`https://cache.propertyroot.invalid/avm/value?a=${encodeURIComponent(norm)}`);
    const cache = caches.default;
    if (!userKey) { const hit = await cache.match(cacheKey); if (hit) return out(200, await hit.text(), { "x-cache": "HIT" }); }

    const q = new URL(RENTCAST); q.searchParams.set("address", address);
    let r;
    try { r = await fetch(q, { headers: { accept: "application/json", "X-Api-Key": key } }); } catch { return out(502, { error: "upstream_unreachable" }); }
    const text = await r.text();
    if (r.status === 401 || r.status === 403) return out(401, { error: "bad_key" });
    if (r.status === 429) return out(429, { error: "quota" });
    if (r.status === 404) return out(404, { error: "address_not_found" });
    if (!r.ok) return out(502, { error: "upstream", status: r.status });
    if (!userKey) {
      const ttl = Number(env.CACHE_TTL || 2592000);
      ctx.waitUntil(cache.put(cacheKey, new Response(text, { headers: { "cache-control": `max-age=${ttl}` } })));
    }
    return out(200, text, { "x-cache": "MISS" });
  },
};
