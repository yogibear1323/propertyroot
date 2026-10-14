import { describe, expect, it } from "vitest";
import { makeZillowProvider, ValuationError, normalizeAddress } from "../src/lib/valuation";
import { splitTokens } from "../src/lib/propertyRoot";

const res = (status: number, body?: unknown) => Promise.resolve(new Response(body ? JSON.stringify(body) : null, { status }));
describe("zillow provider", () => {
  it("not configured without proxy", async () => {
    const p = makeZillowProvider("");
    expect(p.configured()).toBe(false);
    await expect(p.estimate("1 Main St")).rejects.toMatchObject({ kind: "not-configured" });
  });
  it.each([[404, "not-found"], [429, "rate-limited"], [503, "not-configured"], [500, "upstream"]])("%i -> %s", async (s, k) => {
    await expect(makeZillowProvider("https://x", () => res(s)).estimate("1 Main St")).rejects.toMatchObject({ kind: k });
  });
  it("network error", async () => {
    await expect(makeZillowProvider("https://x", () => Promise.reject(new TypeError("fail"))).estimate("1 Main St")).rejects.toBeInstanceOf(ValuationError);
  });
  it("returns the estimate as-is", async () => {
    const e = await makeZillowProvider("https://x", () => res(200, { value: 512300, low: 480000, high: 540000, date: "2026-10-01" })).estimate("1 Main St");
    expect(e).toMatchObject({ source: "zillow", value: 512300, low: 480000, high: 540000 });
  });
  it("normalizes addresses", () => expect(normalizeAddress(" 1  Main St., Phoenix ")).toBe("1 main st phoenix"));
});
describe("splitTokens", () => {
  it("by supply with remainder", () => expect(splitTokens(1000, { supply: 3 })).toEqual({ supply: 3, price: 333.33, remainder: 0.01 }));
  it("by price", () => expect(splitTokens(450000, { price: 100 })).toEqual({ supply: 4500, price: 100, remainder: 0 }));
  it("rejects bad input", () => {
    expect("error" in splitTokens(100, { supply: 1.5 })).toBe(true);
    expect("error" in splitTokens(100, { price: 0 })).toBe(true);
    expect("error" in splitTokens(100, { price: 101 })).toBe(true);
  });
});
