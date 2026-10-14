/**
 * Pluggable property-value providers. Default: RentCast AVM (GET /v1/avm/value, X-Api-Key).
 * Two ways to reach it, neither ships a key in the static site:
 *   1. the serverless proxy in /proxy (holds RENTCAST_API_KEY as a Worker secret, caches per address);
 *   2. "Use my own RentCast key": the user's key lives in sessionStorage only and the browser
 *      calls api.rentcast.io directly (RentCast sends Access-Control-Allow-Origin: * and allows X-Api-Key).
 * Values are never invented; with neither configured the UI offers a clearly-labelled manual value.
 */
import dep from "../config/propertyroot-testnet.json";

export type Estimate = { source: "rentcast"; value: number; low?: number; high?: number; comps?: number; matchedAddress?: string; responseHash: string; via: "proxy" | "own-key" };
export type ValuationErrorKind = "not-configured" | "not-found" | "bad-key" | "quota" | "network" | "upstream";
export class ValuationError extends Error { constructor(public kind: ValuationErrorKind, msg: string) { super(msg); } }
export interface ValueProvider { id: string; label: string; configured(): boolean; estimate(address: string, signal?: AbortSignal): Promise<Estimate> }

export const RENTCAST_URL = "https://api.rentcast.io/v1/avm/value";
const PROXY = ((import.meta.env.VITE_VALUATION_PROXY_URL as string) || (dep as { valuationProxyUrl?: string }).valuationProxyUrl || "").replace(/\/$/, "");
const KEY = "propertyroot.rentcast.key";

const ss = () => { try { return sessionStorage; } catch { return null; } };
export const ownKey = { get: () => ss()?.getItem(KEY) || "", set: (k: string) => ss()?.setItem(KEY, k.trim()), clear: () => ss()?.removeItem(KEY) };

async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function makeRentCastProvider(opts: { proxy?: string; key?: () => string; fetch?: typeof fetch } = {}): ValueProvider {
  const proxy = opts.proxy ?? PROXY, key = opts.key ?? ownKey.get, f = opts.fetch ?? ((...a) => fetch(...a));
  return {
    id: "rentcast", label: "RentCast value estimate",
    configured: () => Boolean(key() || proxy),
    async estimate(address, signal) {
      const k = key();
      if (!k && !proxy) throw new ValuationError("not-configured", "RentCast not connected yet.");
      const q = `address=${encodeURIComponent(address.trim())}`;
      let r: Response;
      try {
        r = k ? await f(`${RENTCAST_URL}?${q}`, { signal, headers: { accept: "application/json", "X-Api-Key": k } })
              : await f(`${proxy}/avm/value?${q}`, { signal, headers: { accept: "application/json" } });
      } catch (e) { if ((e as Error).name === "AbortError") throw e; throw new ValuationError("network", "Couldn't reach RentCast. Check your connection and try again."); }
      if (r.status === 404) throw new ValuationError("not-found", "RentCast couldn't find that address. Use the full format: Street, City, State, Zip.");
      if (r.status === 401 || r.status === 403) throw new ValuationError("bad-key", k ? "RentCast rejected your API key. Check it in your RentCast dashboard." : "The proxy's RentCast key was rejected.");
      if (r.status === 429) throw new ValuationError("quota", "RentCast quota or rate limit reached (the free plan has 50 lookups a month). Try later or use your own key.");
      if (r.status === 503 && !k) throw new ValuationError("not-configured", "RentCast not connected yet.");
      if (!r.ok) throw new ValuationError("upstream", `RentCast returned an error (${r.status}).`);
      const text = await r.text();
      let j: { price?: number; priceRangeLow?: number; priceRangeHigh?: number; comparables?: unknown[]; subjectProperty?: { formattedAddress?: string } } | null = null;
      try { j = JSON.parse(text); } catch { /* */ }
      if (!j || typeof j.price !== "number" || !(j.price > 0)) throw new ValuationError("not-found", "RentCast has no value estimate for that address.");
      return { source: "rentcast", value: j.price, low: num(j.priceRangeLow), high: num(j.priceRangeHigh), comps: Array.isArray(j.comparables) ? j.comparables.length : undefined,
        matchedAddress: j.subjectProperty?.formattedAddress, responseHash: await sha256Hex(text), via: k ? "own-key" : "proxy" };
    },
  };
}
const num = (x: unknown) => (typeof x === "number" && x > 0 ? x : undefined);
export const rentcast = makeRentCastProvider();
export const proxyConfigured = () => Boolean(PROXY);

export const normalizeAddress = (a: string) => a.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();

/** Address suggestions from Photon (OpenStreetMap). US-only; keyless and CORS-enabled. */
export async function suggestAddresses(q: string, signal?: AbortSignal): Promise<string[]> {
  if (q.trim().length < 4) return [];
  const r = await fetch(`https://photon.komoot.io/api/?limit=5&lang=en&layer=house&q=${encodeURIComponent(q)}`, { signal });
  if (!r.ok) return [];
  const j = await r.json() as { features?: { properties: Record<string, string> }[] };
  const out = (j.features ?? []).filter((f) => f.properties.countrycode === "US").map(({ properties: p }) =>
    [[p.housenumber, p.street].filter(Boolean).join(" "), p.city, [p.state, p.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", "));
  return [...new Set(out)].filter((s) => /\d/.test(s));
}
