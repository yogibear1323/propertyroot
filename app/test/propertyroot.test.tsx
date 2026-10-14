import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { readFileSync, readdirSync } from "node:fs";
import { WalletProvider } from "../src/lib/wallet";
import Demo from "../src/pages/Demo";
import Landing from "../src/pages/Landing";
import App from "../src/App";
import { DEMO_CAP_USD, PR, bytes32, estimateYield, simulateAppraisal, workingCap } from "../src/lib/propertyRoot";
import { blendRates, project } from "../src/lib/blendRate";

const render = (el: React.ReactNode, path = "/") => renderToStaticMarkup(<WalletProvider><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></WalletProvider>);
describe("PropertyRoot logic", () => {
  it("simulated appraisal is deterministic, within ±8% of $/unit × size, and capped", () => {
    const a = simulateAppraisal({ address: "123 Mesa Verde Rd", type: "single-family", size: 2000 });
    expect(a).toEqual(simulateAppraisal({ address: "123 mesa verde rd ", type: "single-family", size: 2000 }));
    expect(a.value).toBeGreaterThanOrEqual(285 * 2000 * 0.92 - 100);
    expect(a.value).toBeLessThanOrEqual(285 * 2000 * 1.08 + 100);
    expect(a.titleVerified).toBe(true);
    expect(simulateAppraisal({ address: "x", type: "farmland", size: 10_000 }).value).toBe(DEMO_CAP_USD);
    expect(simulateAppraisal({ address: "", type: "condo", size: 900 }).titleVerified).toBe(false);
  });
  it("working value uses the deployed LTV", () => { expect(workingCap(300_000)).toBe(300_000 * PR.params.ltvBps / 10_000); });
  it("yield estimate compounds monthly and beats simple interest", () => {
    const r = estimateYield({ value: 400_000, ltvPct: 50, workPct: 50, aprPct: 6, years: 1 });
    expect(r.working).toBe(100_000);
    expect(r.earned).toBeCloseTo(100_000 * (Math.pow(1.005, 12) - 1), 4);
    expect(r.compoundBonus).toBeGreaterThan(0);
    expect(estimateYield({ value: 1, ltvPct: 50, workPct: 50, aprPct: 0, years: 3 }).earned).toBe(0);
  });
  it("deployment is testnet and points at Blend + Reflector", () => {
    expect(PR.network).toBe("testnet");
    for (const id of [PR.contracts.attestationRegistry, PR.contracts.propertyVault, PR.contracts.blendAdapter, PR.external.blendPool, PR.external.reflector]) expect(id).toMatch(/^C[A-Z2-7]{55}$/);
  });
});

describe("demo app (/app)", () => {
  const html = render(<Demo />);
  it("has disclaimers, the 3 steps, risks, waitlist and Freighter connect", () => {
    for (const t of ["not legal title", "Simulated", "This is lending yield", "Estimate only", "Appraise &amp; verify", "Tokenize", "Earn compounded lending yield", "Liquidation", "Join the waitlist", "Connect", "Nothing is sent anywhere"]) expect(html).toContain(t);
  });
});

describe("landing (/)", () => {
  const html = render(<Landing />);
  it("has hero, Launch App links to /app, all sections", () => {
    expect(html).toContain("Let its value grow");
    expect(html.match(/class="la-btn[^"]*" href="\/app"/g)?.length).toBeGreaterThanOrEqual(2);
    for (const t of ["How it works", "Built only on Stellar", "The demo in three screens", "Play with the numbers", "Honest fine print", "Where it could go", "Questions", "Join the waitlist", "plans, not promises", "Lending yield, not property yield", "Your property is earning", "Simulated estimate"]) expect(html).toContain(t);
    for (const id of [PR.contracts.propertyVault, PR.external.blendPool, PR.external.reflector]) expect(html).toContain(`https://stellar.expert/explorer/testnet/contract/${id}`);
  });
  it("header has a Launch App link", () => { expect(render(<App />)).toMatch(/<header class="pr-top">.*la-btn[^"]*" href="\/app"/s); });
});

describe("blend rate model + projection", () => {
  it("matches Blend v2 model on a known reserve", () => {
    const r = blendRates({ config: { util: 5e6, max_util: 9.5e6, r_base: 5000, r_one: 3e5, r_two: 2e6, r_three: 1e7 },
      data: { b_rate: 10n ** 12n, d_rate: 10n ** 12n, b_supply: 100n, d_supply: 25n, ir_mod: 10n ** 9n, last_time: 0n } }, 1e6);
    expect(r.util).toBeCloseTo(0.25);
    expect(r.borrowApr).toBeCloseTo(0.5 * 0.03 + 0.0005);
    expect(r.supplyApr).toBeCloseTo(r.borrowApr * 0.25 * 0.9);
  });
  it("compounds", () => { const p = project(1000, 0.12, 1, 12); expect(p.final).toBeCloseTo(1000 * 1.01 ** 12, 6); expect(p.pts).toHaveLength(13); });
});

describe("standalone", () => {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
  it("never references the exchange site or repo", () => {
    for (const f of [...walk("src"), "index.html", "vite.config.ts"]) if (!f.endsWith(".woff2")) expect(readFileSync(f, "utf8"), f).not.toMatch(/github\.io\/quasaria|yogibear1323\/quasaria\b|\/quasaria\//);
  });
  it("earthy CSS: no purple/neon", () => {
    for (const f of ["src/theme/propertyroot.css", "src/theme/landing.css", "src/theme/earth.css"]) {
      const css = readFileSync(f, "utf8").toLowerCase();
      for (const bad of ["#8b5cf6", "#6d28d9", "#d946ef", "#22d3ee", "#06b6d4", "magenta"]) expect(css, f).not.toContain(bad);
    }
  });
  it("encodes a sha256 hex as 32 raw bytes", () => { expect(bytes32("ab".repeat(32)).toXDR("base64")).toBe("AAAADQAAACCrq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urqw=="); });
});
