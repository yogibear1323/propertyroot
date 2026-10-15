import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Tokenization from "../src/pages/Tokenization";
import { DEFAULTS, calc, mortgage, split } from "../src/lib/tokenizationModel";

describe("Tokenization flow (illustrative HOUSE1)", () => {
  it("$500K example at the ASSUMED 3% with 50% lent = $7,500/yr, $625/mo", () => {
    const c = calc(DEFAULTS);
    expect(c.deployed).toBe(250_000); expect(c.rate).toBe(3); expect(c.usingLive).toBe(false);
    expect(c.yearly).toBeCloseTo(7_500, 6); expect(c.monthly).toBeCloseTo(625, 6);
  });
  it("never lends more than 50% and never invents a live rate", () => {
    expect(calc({ ...DEFAULTS, deploy: 90 }).deployed).toBe(250_000);
    expect(calc({ ...DEFAULTS, mode: "live", live: "" }).rate).toBe(3);
    expect(calc({ ...DEFAULTS, mode: "live", live: "4.25" }).rate).toBe(4.25);
  });
  it("yield destinations sum to 100% and extra principal shortens the mortgage", () => {
    for (const d of ["mortgage", "income", "bills", "custom"] as const) { const s = split({ ...DEFAULTS, dest: d }); expect(s.m + s.i + s.b).toBeCloseTo(1, 9); }
    const c = calc(DEFAULTS), m = mortgage(DEFAULTS, c.monthly);
    expect(m.withX.months).toBeLessThan(m.base.months); expect(m.withX.interest).toBeLessThan(m.base.interest);
  });
  it("renders the 6 stages, the disclaimer, fake addresses and the three destinations", () => {
    const h = renderToStaticMarkup(<Tokenization />);
    expect(h).toContain("Illustrative concept only"); expect(h).toContain("HOUSE1"); expect(h).toContain("ASSUMED");
    expect(h.match(/class="tk-stage/g)?.length).toBe(6);
    expect(h).toContain("Pay down mortgage"); expect(h).toContain("Passive income"); expect(h).toContain("Bills / anything");
    expect(h).toContain("GEXAMPLEISSUER"); expect(h).not.toMatch(/\bG[A-Z2-7]{55}\b/);
  });
});
