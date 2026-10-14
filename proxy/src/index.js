// PropertyRoot valuation proxy — Cloudflare Worker.
// Holds the Bridge (Zillow Group data) access token server-side; the static site never sees it.
// GET /zestimate?address=...  ->  { value, low, high, date, zpid, matchedAddress }
// Errors: 400 bad input, 404 no estimate, 429 rate limited, 503 not configured, 502 upstream.
const BRIDGE = "https://api.bridgedataoutput.com/api/v2/zestimates_v2/zestimates";

export default {
  async fetch(req, env) {
    const origin = req.headers.get("origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "https://yogibear1323.github.io").split(",").map((s) => s.trim());
    const cors = { "access-control-allow-origin": allowed.includes(origin) ? origin : allowed[0], "access-control-allow-methods": "GET,OPTIONS", vary: "origin", "content-type": "application/json" };
    const out = (status, body) => new Response(JSON.stringify(body), { status, headers: cors });
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    if (url.pathname !== "/zestimate" || req.method !== "GET") return out(404, { error: "not_found" });
    if (!env.BRIDGE_TOKEN) return out(503, { error: "not_configured" });
    const address = (url.searchParams.get("address") || "").trim();
    if (address.length < 5 || address.length > 200) return out(400, { error: "bad_address" });

    // Optional per-IP rate limit via a Workers Rate Limiting binding named RATE_LIMITER.
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: req.headers.get("cf-connecting-ip") || "anon" });
      if (!success) return out(429, { error: "rate_limited" });
    }

    const q = new URL(BRIDGE);
    q.searchParams.set("access_token", env.BRIDGE_TOKEN);
    q.searchParams.set("address", `"${address.replace(/"/g, "")}"`);
    q.searchParams.set("limit", "1");
    let r;
    try { r = await fetch(q, { headers: { accept: "application/json" } }); } catch { return out(502, { error: "upstream_unreachable" }); }
    if (r.status === 429) return out(429, { error: "rate_limited" });
    if (r.status === 401 || r.status === 403) return out(503, { error: "not_configured", detail: "token rejected or dataset not approved" });
    if (!r.ok) return out(502, { error: "upstream", status: r.status });
    const j = await r.json().catch(() => null);
    const z = j && Array.isArray(j.bundle) ? j.bundle[0] : null;
    if (!z || !(Number(z.zestimate) > 0)) return out(404, { error: "no_estimate" });
    return out(200, {
      value: Number(z.zestimate),
      low: Number(z.lowPercent) && Number(z.zestimate) ? Math.round(z.zestimate * (1 - z.lowPercent / 100)) : z.lowZestimate ?? undefined,
      high: Number(z.highPercent) && Number(z.zestimate) ? Math.round(z.zestimate * (1 + z.highPercent / 100)) : z.highZestimate ?? undefined,
      date: z.timestamp || z.date || undefined,
      zpid: z.zpid ? String(z.zpid) : undefined,
      matchedAddress: z.address || undefined,
    });
  },
};
