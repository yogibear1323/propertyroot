import { describe, expect, it } from "vitest";
import { makeRentCastProvider, normalizeAddress } from "../src/lib/valuation";
import { splitTokens } from "../src/lib/propertyRoot";

const res = (status: number, body?: unknown) => Promise.resolve(new Response(body ? JSON.stringify(body) : null, { status }));
const RC = { price: 250000, priceRangeLow: 195000, priceRangeHigh: 304000, subjectProperty: { formattedAddress: "5500 Grand Lake Dr, San Antonio, TX 78244" }, comparables: [{}, {}, {}] };
describe("rentcast provider", () => {
  it("not configured without proxy or key", async () => {
    const p = makeRentCastProvider({ proxy: "", key: () => "" });
    expect(p.configured()).toBe(false);
    await expect(p.estimate("1 Main St")).rejects.toMatchObject({ kind: "not-configured" });
  });
  it.each([[404, "not-found"], [401, "bad-key"], [429, "quota"], [503, "not-configured"], [500, "upstream"]])("%i -> %s", async (s, k) => {
    await expect(makeRentCastProvider({ proxy: "https://x", key: () => "", fetch: () => res(s) }).estimate("1 Main St")).rejects.toMatchObject({ kind: k });
  });
  it("network error", async () => {
    await expect(makeRentCastProvider({ proxy: "https://x", key: () => "", fetch: () => Promise.reject(new TypeError("x")) }).estimate("1 Main St")).rejects.toMatchObject({ kind: "network" });
  });
  it("own key calls RentCast directly with X-Api-Key", async () => {
    let url = "", hdr: Record<string, string> = {};
    const e = await makeRentCastProvider({ proxy: "https://x", key: () => "k123", fetch: (u, i) => { url = String(u); hdr = i!.headers as Record<string, string>; return res(200, RC); } }).estimate("5500 Grand Lake Dr, San Antonio, TX, 78244");
    expect(url.startsWith("https://api.rentcast.io/v1/avm/value?address=")).toBe(true);
    expect(hdr["X-Api-Key"]).toBe("k123");
    expect(e).toMatchObject({ source: "rentcast", value: 250000, low: 195000, high: 304000, comps: 3, via: "own-key" });
    expect(e.responseHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("normalizes addresses", () => expect(normalizeAddress(" 1  Main St., Phoenix ")).toBe("1 main st phoenix"));
});
describe("splitTokens", () => {
  it("by supply with remainder", () => expect(splitTokens(1000, { supply: 3 })).toEqual({ supply: 3, price: 333.33, remainder: 0.01 }));
  it("by price", () => expect(splitTokens(450000, { price: 100 })).toEqual({ supply: 4500, price: 100, remainder: 0 }));
  it("rejects bad input", () => {
    expect("error" in splitTokens(100, { supply: 1.5 })).toBe(true);
    expect("error" in splitTokens(100, { price: 101 })).toBe(true);
  });
});
