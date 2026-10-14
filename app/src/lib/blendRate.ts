// Current Blend v2 supply rate for the XLM reserve, computed from the pool's on-chain state (get_reserve + get_config)
// with Blend v2's interest-rate model. Read-only simulation; nothing is signed.
import { addr, readContract } from "./soroban";
import { PR } from "./propertyRoot";

type Reserve = {
  config: { util: number; max_util: number; r_base: number; r_one: number; r_two: number; r_three: number };
  data: { b_rate: bigint; d_rate: bigint; b_supply: bigint; d_supply: bigint; ir_mod: bigint; last_time: bigint };
};
const S7 = 1e7, S9 = 1e9, S12 = 1e12;

/** Pure Blend v2 model: returns utilization, borrow APR and supply APR (fractions). */
export function blendRates(r: Reserve, bstopRate7: number) {
  const c = r.config, d = r.data;
  const supplied = (Number(d.b_supply) * Number(d.b_rate)) / S12;
  const borrowed = (Number(d.d_supply) * Number(d.d_rate)) / S12;
  const util = supplied > 0 ? borrowed / supplied : 0;
  const target = c.util / S7, base = c.r_base / S7, one = c.r_one / S7, two = c.r_two / S7, three = c.r_three / S7, irMod = Number(d.ir_mod) / S9;
  const FIXED = 0.95;
  let borrowApr: number;
  if (util <= target) borrowApr = ((target > 0 ? util / target : 0) * one + base) * irMod;
  else if (util <= FIXED) borrowApr = (((util - target) / (FIXED - target)) * two + one + base) * irMod;
  else borrowApr = ((util - FIXED) / (1 - FIXED)) * three + (two + one + base) * irMod;
  const supplyApr = borrowApr * util * (1 - bstopRate7 / S7);
  return { util, borrowApr, supplyApr, lastTime: Number(d.last_time) };
}

export async function readBlendXlmRate() {
  const [res, cfg] = await Promise.all([
    readContract<Reserve>(PR.external.blendPool, "get_reserve", [addr(PR.external.xlmSac)]),
    readContract<{ bstop_rate: number }>(PR.external.blendPool, "get_config"),
  ]);
  return blendRates(res, Number(cfg.bstop_rate));
}

/** Compound an APR n times per year for `years`; returns balance series (one point per month) and final value. */
export function project(principal: number, apr: number, years: number, perYear: number) {
  const pts: number[] = [];
  for (let m = 0; m <= years * 12; m++) pts.push(principal * Math.pow(1 + apr / perYear, (perYear * m) / 12));
  return { pts, final: pts[pts.length - 1], apy: Math.pow(1 + apr / perYear, perYear) - 1 };
}
