/**
 * Pure math for the illustrative "Tokenization flow" (HOUSE1 real estate share token) view.
 * No network access. Every number here is an estimate computed from the inputs on the page;
 * the 3% rate is an ASSUMPTION, never a live quote.
 */
export const VALUE = 500_000;
export const SHARES = 500_000;
export const ASSUMED_RATE = 3.0; // % APR, ASSUMED
export const MAX_LEND_PCT = 50;

export type Dest = "mortgage" | "income" | "bills" | "custom";
export type TokInputs = {
  deploy: number; mode: "assumed" | "live"; live: string; freq: number; years: number; xlm: number;
  dest: Dest; spM: number; spI: number; mbal: number; mrate: number; mterm: number;
};
export const DEFAULTS: TokInputs = { deploy: 50, mode: "assumed", live: "", freq: 12, years: 10, xlm: 0.25, dest: "mortgage", spM: 50, spI: 30, mbal: 300_000, mrate: 6.0, mterm: 25 };
export const BILLS: [string, number][] = [["Electricity", 180], ["Internet", 70], ["Water & sewer", 85], ["Home insurance (monthly share)", 125], ["Property tax (monthly escrow)", 320], ["Groceries", 450]];

export function calc(S: TokInputs) {
  const usingLive = S.mode === "live" && S.live !== "" && +S.live >= 0;
  const rate = usingLive ? +S.live : ASSUMED_RATE;
  const r = rate / 100, pct = Math.min(MAX_LEND_PCT, Math.max(0, S.deploy)), deployed = VALUE * pct / 100;
  const yearly = deployed * r, monthly = yearly / 12, f = S.freq, y = S.years;
  const comp = (t: number) => deployed * Math.pow(1 + r / f, f * t);
  const compTotal = comp(y), apy = Math.pow(1 + r / f, f) - 1;
  return { rate, usingLive, deployed, yearly, monthly, compTotal, compEarn: compTotal - deployed, apy,
    harvTotal: deployed + deployed * r * y, perShareYear: yearly / SHARES, perShareMonth: monthly / SHARES,
    xlmAmt: S.xlm > 0 ? deployed / S.xlm : 0, lentShares: SHARES * pct / 100 };
}
export function split(S: TokInputs) {
  if (S.dest === "mortgage") return { m: 1, i: 0, b: 0 };
  if (S.dest === "income") return { m: 0, i: 1, b: 0 };
  if (S.dest === "bills") return { m: 0, i: 0, b: 1 };
  const m = Math.min(1, S.spM / 100), i = Math.min(S.spI / 100, 1 - m);
  return { m, i, b: Math.max(0, 1 - m - i) };
}
export function mortgage(S: TokInputs, extra: number) {
  const P0 = Math.max(0, +S.mbal || 0), n = Math.max(1, Math.round((+S.mterm || 1) * 12)), r = (+S.mrate || 0) / 100 / 12;
  const pmt = r === 0 ? P0 / n : P0 * r / (1 - Math.pow(1 + r, -n));
  const run = (ex: number) => {
    let bal = P0, int = 0, k = 0, balAtT: number | null = null; const target = S.years * 12;
    while (bal > 0.005 && k < n + 1) { const i = bal * r; let pr = pmt - i + ex; if (pr > bal) pr = bal; bal -= pr; int += i; k++; if (k === target) balAtT = bal; }
    if (balAtT === null) balAtT = bal > 0.005 ? bal : 0;
    return { months: k, interest: int, balAtT };
  };
  return { pmt, base: run(0), withX: run(extra), P0, n };
}
export const ym = (m: number) => `${Math.floor(m / 12)} yr ${m % 12} mo`;
export const usd = (v: number, d = 0) => (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const num = (v: number, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
