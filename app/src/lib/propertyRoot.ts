/**
 * PropertyRoot testnet demo helpers. Pure logic here (appraisal simulation, yield
 * estimate) so it can be unit-tested; chain calls go through lib/soroban.
 * Everything is TESTNET ONLY. Appraisal, title and KYC are simulated.
 */
import { nativeToScVal } from "@stellar/stellar-sdk";
import dep from "../config/propertyroot-testnet.json";
import { addr, i128, invokeContract, readContract, u64 } from "./soroban";

export const PR = dep;
export const STROOP = 10_000_000;
export const LTV_BPS = dep.params.ltvBps;
export const DEMO_CAP_USD = dep.params.demoCapUsd;

export type PropertyType = "single-family" | "townhouse" | "condo" | "farmland" | "raw-land";
export const TYPES: { id: PropertyType; label: string; perUnit: number; unit: "sqft" | "acre" }[] = [
  { id: "single-family", label: "Single-family home", perUnit: 285, unit: "sqft" },
  { id: "townhouse", label: "Townhouse", perUnit: 255, unit: "sqft" },
  { id: "condo", label: "Condo", perUnit: 240, unit: "sqft" },
  { id: "farmland", label: "Farmland", perUnit: 9_500, unit: "acre" },
  { id: "raw-land", label: "Raw land", perUnit: 4_200, unit: "acre" },
];

export type PropertyInput = { address: string; type: PropertyType; size: number };

/** Small deterministic hash (FNV-1a) so the same input always gets the same simulated appraisal. */
function fnv(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }

/** SIMULATED appraisal: $/unit by type × size, ±8% deterministic "local market" factor, capped at the demo cap. */
export function simulateAppraisal(p: PropertyInput) {
  const t = TYPES.find((x) => x.id === p.type) ?? TYPES[0];
  const size = Math.max(0, Number(p.size) || 0);
  const factor = 0.92 + (fnv(`${p.address.trim().toLowerCase()}|${p.type}`) % 1601) / 10_000; // 0.92..1.08
  const raw = Math.round((t.perUnit * size * factor) / 100) * 100;
  const value = Math.min(raw, DEMO_CAP_USD);
  return { value, capped: raw > DEMO_CAP_USD, factor, unit: t.unit, titleVerified: size > 0 && p.address.trim().length >= 5, kycVerified: true };
}

export const workingCap = (valueUsd: number, ltvBps = LTV_BPS) => (valueUsd * ltvBps) / 10_000;

/** ESTIMATE: compounded lending yield on the portion put to work. Monthly compounding. */
export function estimateYield(o: { value: number; ltvPct: number; workPct: number; aprPct: number; years: number; xlmUsd?: number }) {
  const working = o.value * (o.ltvPct / 100) * (o.workPct / 100);
  const n = Math.round(o.years * 12);
  const r = o.aprPct / 100 / 12;
  const series: number[] = [];
  let v = working;
  for (let i = 0; i <= n; i++) { series.push(v - working); v *= 1 + r; }
  const earned = series[series.length - 1] ?? 0;
  const simple = working * (o.aprPct / 100) * o.years;
  return { working, earned, simple, compoundBonus: earned - simple, series, apy: (Math.pow(1 + r, 12) - 1) * 100 };
}

export async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const bytes32 = (hex: string) => nativeToScVal(Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16))), { type: "bytes" });
const usd7 = (usd: number) => i128(BigInt(Math.round(usd * 100)) * 100_000n);

export type Attestation = { owner: string; value_usd: bigint; appraisal_hash: unknown; title_verified: boolean; kyc_verified: boolean; simulated: boolean; version: number; timestamp: bigint };
export type Property = { owner: string; token: string; value_usd: bigint; minted: bigint; over_cap: bigint; prt_working: bigint; principal_xlm: bigint; shares: bigint; yield_paid_xlm: bigint; att_version: number };
export type Position = { property: Property; value_xlm: bigint; accrued_yield_xlm: bigint; share_price: bigint };

const C = dep.contracts;
export const readNextId = () => readContract<bigint>(C.attestationRegistry, "next_id");
export const readAttestation = (id: number) => readContract<Attestation>(C.attestationRegistry, "get", [u64(id)]);
export const readTokenized = (id: number) => readContract<boolean>(C.propertyVault, "is_tokenized", [u64(id)]);
export const readPosition = (id: number) => readContract<Position>(C.propertyVault, "position", [u64(id)]);
export const readXlmPrice = async () => { const [p, d, ts] = await readContract<[bigint, number, bigint]>(C.propertyVault, "xlm_price"); return { usd: Number(p) / 10 ** d, ts: Number(ts) }; };
export const readReserve = () => readContract<bigint>(C.propertyVault, "reserve");
export const readSharePrice = () => readContract<bigint>(C.blendAdapter, "share_price");
export const readPrtBalance = (token: string, who: string) => readContract<bigint>(token, "balance", [addr(who)]);

type Sign = (x: string) => Promise<string>;
export const selfAttest = (owner: string, sign: Sign, id: number, valueUsd: number, hashHex: string) =>
  invokeContract(owner, sign, C.attestationRegistry, "self_attest", [u64(id), addr(owner), usd7(valueUsd), bytes32(hashHex)]);
export const tokenize = (owner: string, sign: Sign, id: number) => invokeContract(owner, sign, C.propertyVault, "tokenize", [addr(owner), u64(id)]);
export const putToWork = (owner: string, sign: Sign, id: number, prtUsd: number) => invokeContract(owner, sign, C.propertyVault, "put_to_work", [addr(owner), u64(id), usd7(prtUsd)]);
export const withdrawPosition = (owner: string, sign: Sign, id: number) => invokeContract(owner, sign, C.propertyVault, "withdraw", [addr(owner), u64(id)]);

export const fmtUsd = (n: number, d = 0) => `$${n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d })}`;
export const fromStroop = (v: bigint | number) => Number(v) / STROOP;
export const STORE_KEY = "propertyroot.demo.v1";
export const WAITLIST_KEY = "propertyroot.waitlist.v1";

// ---- Valuation log (record_valuation / record_tokenization) ----
export type Valuation = { owner: string; address_hash: Uint8Array; value_usd: bigint; source: string; response_hash?: Uint8Array; timestamp: bigint };
export type Tokenization = { valuation_id: bigint; supply: bigint; price_usd: bigint; timestamp: bigint };
const VL = (dep.contracts as Record<string, string>).valuationLog;
export const VALUATION_LOG_ID = VL;
const VL_OLD = (dep.contracts as Record<string, string>).valuationLogLegacy;
export const VALUATION_LOG_LEGACY_ID = VL_OLD;
const ZERO32 = "0".repeat(64);
export const recordValuation = (owner: string, sign: Sign, addressHashHex: string, valueUsd: number, source: "rentcast" | "manual", responseHashHex = ZERO32) =>
  invokeContract(owner, sign, VL, "record_valuation", [addr(owner), bytes32(addressHashHex), usd7(valueUsd), nativeToScVal(source, { type: "symbol" }), bytes32(responseHashHex)]);
export const recordTokenization = (owner: string, sign: Sign, valuationId: number, supply: number, priceUsd: number) =>
  invokeContract(owner, sign, VL, "record_tokenization", [addr(owner), u64(valuationId), i128(BigInt(supply)), usd7(priceUsd)]);
export const readValuation = (id: number, c = VL) => readContract<Valuation>(c, "get", [u64(id)]);
export const readTokenization = (id: number, c = VL) => readContract<Tokenization | null>(c, "tokenization", [u64(id)]);
export const usdFrom7 = (v: bigint) => Number(v) / STROOP;

/** Split a value into whole tokens. Give either `supply` or `price` (USD, cents precision). */
export function splitTokens(value: number, by: { supply?: number; price?: number }) {
  const cents = Math.floor(value * 100);
  if (by.supply !== undefined) {
    const supply = by.supply;
    if (!Number.isInteger(supply) || supply < 1) return { error: "Token count must be a whole number of at least 1." } as const;
    const priceCents = Math.floor(cents / supply);
    if (priceCents < 1) return { error: "That many tokens would price each below $0.01." } as const;
    return { supply, price: priceCents / 100, remainder: (cents - priceCents * supply) / 100 } as const;
  }
  const p = Math.round((by.price ?? 0) * 100);
  if (!(p >= 1)) return { error: "Price per token must be at least $0.01." } as const;
  const supply = Math.floor(cents / p);
  if (supply < 1) return { error: "Price per token can't be more than the recorded value." } as const;
  return { supply, price: p / 100, remainder: (cents - supply * p) / 100 } as const;
}
export const readValuationNextId = (c = VL) => readContract<bigint>(c, "next_id");
async function readLog(c: string, legacy: boolean, max: number) {
  const next = Number(await readValuationNextId(c));
  const ids = Array.from({ length: Math.max(0, Math.min(max, next - 1)) }, (_, i) => next - 1 - i);
  const rows = await Promise.all(ids.map(async (id) => {
    const [v, t] = await Promise.all([readValuation(id, c).catch(() => null), readTokenization(id, c).catch(() => null)]);
    return v ? { id, v, t: t ?? null, legacy } : null;
  }));
  return rows.filter(Boolean) as { id: number; v: Valuation; t: Tokenization | null; legacy: boolean }[];
}
/** Every valuation (+ tokenization) on the current log, then the read-only legacy (v1) log; newest first. */
export async function readAllValuations(max = 50) {
  const [cur, old] = await Promise.all([readLog(VL, false, max), VL_OLD ? readLog(VL_OLD, true, max).catch(() => []) : Promise.resolve([])]);
  return [...cur, ...old];
}
