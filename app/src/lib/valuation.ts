/**
 * Pluggable property-value providers. The static site never holds an API token:
 * the Zillow/Bridge provider calls a small serverless proxy (see /proxy) which adds
 * the Bridge `access_token` server-side. If no proxy URL is configured the provider
 * reports `not-configured` and the UI offers a clearly-labelled manual value.
 * Values are never invented.
 */
import dep from "../config/propertyroot-testnet.json";

export type Estimate = { source: "zillow"; value: number; low?: number; high?: number; date?: string; zpid?: string; matchedAddress?: string };
export type ValuationErrorKind = "not-configured" | "not-found" | "rate-limited" | "network" | "upstream";
export class ValuationError extends Error { constructor(public kind: ValuationErrorKind, msg: string) { super(msg); } }

export interface ValueProvider { id: string; label: string; configured(): boolean; estimate(address: string, signal?: AbortSignal): Promise<Estimate> }

const PROXY = ((import.meta.env.VITE_VALUATION_PROXY_URL as string) || (dep as { valuationProxyUrl?: string }).valuationProxyUrl || "").replace(/\/$/, "");

export function makeZillowProvider(base = PROXY, f: typeof fetch = (...a) => fetch(...a)): ValueProvider {
  return {
    id: "zillow", label: "Zillow Zestimate (via Bridge)",
    configured: () => Boolean(base),
    async estimate(address, signal) {
      if (!base) throw new ValuationError("not-configured", "Zillow estimate not connected yet.");
      let r: Response;
      try { r = await f(`${base}/zestimate?address=${encodeURIComponent(address.trim())}`, { signal, headers: { accept: "application/json" } }); }
      catch (e) { if ((e as Error).name === "AbortError") throw e; throw new ValuationError("network", "Couldn't reach the estimate service. Check your connection and try again."); }
      if (r.status === 404) throw new ValuationError("not-found", "Zillow has no estimate for that address. Check the spelling or enter a value manually.");
      if (r.status === 429) throw new ValuationError("rate-limited", "Too many lookups right now. Wait a minute and try again.");
      if (r.status === 503) throw new ValuationError("not-configured", "Zillow estimate not connected yet.");
      if (!r.ok) throw new ValuationError("upstream", `The estimate service returned an error (${r.status}).`);
      const j = await r.json().catch(() => null) as Partial<Estimate> | null;
      if (!j || typeof j.value !== "number" || !(j.value > 0)) throw new ValuationError("not-found", "Zillow has no estimate for that address.");
      return { source: "zillow", value: j.value, low: num(j.low), high: num(j.high), date: j.date, zpid: j.zpid, matchedAddress: j.matchedAddress };
    },
  };
}
const num = (x: unknown) => (typeof x === "number" && x > 0 ? x : undefined);
export const zillow = makeZillowProvider();

/** Lowercase, collapse whitespace/punctuation so the same address hashes the same way. */
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
