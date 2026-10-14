import { useEffect, useRef, useState } from "react";
import { fmtUsd, readXlmPrice, LTV_BPS } from "../lib/propertyRoot";
import { project, readBlendXlmRate } from "../lib/blendRate";

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Animated count-up toward `value` (instant under reduced motion). */
function Count({ value, fmt }: { value: number; fmt: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced() || typeof requestAnimationFrame === "undefined") { setShown(value); from.current = value; return; }
    const a = from.current, t0 = performance.now();
    let id = 0;
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / 450), e = 1 - Math.pow(1 - k, 3); const v = a + (value - a) * e; setShown(v); from.current = v; if (k < 1) id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <>{fmt(shown)}</>;
}

function Area({ pts, principal }: { pts: number[]; principal: number }) {
  const W = 600, H = 200, P = 6, max = Math.max(...pts) * 1.02, min = principal * 0.98;
  const x = (i: number) => P + (i / Math.max(1, pts.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / Math.max(1e-9, max - min)) * (H - 2 * P);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg className="lc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Projected balance grows from ${fmtUsd(principal)} to ${fmtUsd(pts[pts.length - 1])}`} preserveAspectRatio="none">
      <defs><linearGradient id="lc-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e8a33d" stopOpacity=".55" /><stop offset="1" stopColor="#5e6b3c" stopOpacity=".08" /></linearGradient></defs>
      <path d={`${line}L${x(pts.length - 1)},${H - P}L${x(0)},${H - P}Z`} fill="url(#lc-g)" />
      <path d={line} fill="none" stroke="#b8603a" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Simulated live balance: accrues the working amount at `apy` continuously and re-renders every second
 *  (every 3 s, no glow pulse, under reduced motion). "Speed up time" maps 1 real second to 1 day or 1 month. */
function LiveTicker({ working, apy }: { working: number; apy: number }) {
  const [speed, setSpeed] = useState<"real" | "day" | "month">("real");
  const opened = useRef(Date.now());
  const simT = useRef(0); // simulated seconds elapsed since the page opened
  const last = useRef(Date.now());
  const [, force] = useState(0);
  const rate = Math.log(1 + Math.max(0, apy)) / (365 * 86400); // continuous per-second rate equivalent to the APY
  useEffect(() => {
    const k = speed === "real" ? 1 : speed === "day" ? 86400 : 86400 * 30.4375;
    last.current = Date.now();
    const id = setInterval(() => { const n = Date.now(); simT.current += ((n - last.current) / 1000) * k; last.current = n; force((x) => x + 1); }, reduced() ? 3000 : 1000);
    return () => clearInterval(id);
  }, [speed]);
  const bal = working * Math.exp(rate * simT.current);
  const since = bal - working;
  const today = working * (Math.exp(rate * 86400) - 1);
  const simDays = simT.current / 86400;
  const dec = working >= 1e6 ? 6 : 7;
  return (
    <div className="lt" data-testid="live-ticker" aria-label="Simulated live earnings">
      <div className="lt-head"><b>Your property is earning</b><span className="lt-tag">Simulated estimate</span></div>
      <div className={`lt-bal mono${reduced() ? "" : " glow"}`} aria-live="off">${bal.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}</div>
      <div className="lt-row">
        <div><span>Earned per day</span><b className="mono">${today.toFixed(4)}</b></div>
        <div><span>Since you opened this page</span><b className="mono">${since.toFixed(7)}</b></div>
        <div><span>Simulated time</span><b className="mono">{simDays < 1 ? `${Math.round(simT.current)} s` : `${simDays.toFixed(1)} days`}</b></div>
      </div>
      <fieldset className="lc-seg"><legend>Speed up time</legend>
        <button type="button" aria-pressed={speed === "real"} onClick={() => setSpeed("real")}>Real time</button>
        <button type="button" aria-pressed={speed === "day"} onClick={() => setSpeed("day")}>1 sec = 1 day</button>
        <button type="button" aria-pressed={speed === "month"} onClick={() => setSpeed("month")}>1 sec = 1 month</button>
        <button type="button" onClick={() => { simT.current = 0; opened.current = Date.now(); force((x) => x + 1); }}>Reset</button>
      </fieldset>
      <p className="muted pr-small">Simulated in your browser at the APY above. Nothing is deposited and no real interest is paid here; the demo app earns real testnet interest from Blend.</p>
    </div>
  );
}

const MAX_LTV = LTV_BPS / 100;

export default function LiveCalc() {
  const [value, setValue] = useState(400_000);
  const [ltv, setLtv] = useState(MAX_LTV);
  const [years, setYears] = useState(10);
  const [comp, setComp] = useState<"daily" | "monthly">("monthly");
  const [mode, setMode] = useState<"live" | "assumed">("assumed");
  const [assumed, setAssumed] = useState(3);
  const [blend, setBlend] = useState<{ supplyApr?: number; util?: number; err?: boolean }>({});
  const [px, setPx] = useState<{ usd?: number; ts?: number; err?: boolean }>({});

  useEffect(() => {
    let on = true;
    readBlendXlmRate().then((r) => on && setBlend(r), () => on && setBlend({ err: true }));
    readXlmPrice().then((p) => on && setPx(p), () => on && setPx({ err: true }));
    return () => { on = false; };
  }, []);

  const liveOk = blend.supplyApr !== undefined;
  const apr = mode === "live" ? (liveOk ? blend.supplyApr! : 0) : assumed / 100;
  const working = value * (ltv / 100);
  const perYear = comp === "daily" ? 365 : 12;
  const p = project(working, apr, years, perYear);
  const yearly = working * p.apy;
  const xlm = px.usd ? working / px.usd : undefined;
  const age = px.ts ? Math.max(0, Math.round(Date.now() / 1000 - px.ts)) : undefined;
  const pct = (n: number, d = 2) => `${(n * 100).toFixed(d)}%`;

  return (
    <div className="lc" data-testid="live-calc">
      <div className="lc-labels" role="note">
        <span>Estimate</span><span>Not guaranteed</span><span>Lending yield, not property yield</span><span>Testnet</span>
      </div>
      <div className="lc-grid">
        <form className="lc-in pr-card" onSubmit={(e) => e.preventDefault()} aria-label="Calculator inputs">
          <label>Property value
            <div className="lc-row"><span aria-hidden>$</span>
              <input className="pr-input" type="number" min={10000} max={5000000} step={1000} value={value} onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))} aria-label="Property value in US dollars" /></div>
            <input type="range" min={50000} max={2000000} step={5000} value={Math.min(2000000, value)} onChange={(e) => setValue(Number(e.target.value))} aria-label="Property value slider" />
          </label>
          <label>Share put to work: <b>{ltv}%</b> <small>(vault max {MAX_LTV}%)</small>
            <input type="range" min={5} max={MAX_LTV} step={1} value={ltv} onChange={(e) => setLtv(Number(e.target.value))} />
          </label>
          <label>Time horizon: <b>{years} {years === 1 ? "year" : "years"}</b>
            <input type="range" min={1} max={30} step={1} value={years} onChange={(e) => setYears(Number(e.target.value))} />
          </label>
          <fieldset className="lc-seg"><legend>Compounding</legend>
            {(["daily", "monthly"] as const).map((c) => <button type="button" key={c} aria-pressed={comp === c} onClick={() => setComp(c)}>{c === "daily" ? "Daily" : "Monthly"}</button>)}
          </fieldset>
          <fieldset className="lc-seg"><legend>Rate</legend>
            <button type="button" aria-pressed={mode === "live"} onClick={() => setMode("live")}>Live Blend rate</button>
            <button type="button" aria-pressed={mode === "assumed"} onClick={() => setMode("assumed")}>Assumed rate</button>
          </fieldset>
          {mode === "assumed" ? (
            <label>Assumed APR: <b>{assumed.toFixed(1)}%</b>
              <input type="range" min={0} max={12} step={0.1} value={assumed} onChange={(e) => setAssumed(Number(e.target.value))} />
            </label>
          ) : (
            <p className="lc-live" aria-live="polite">{liveOk
              ? <>Blend v2 testnet XLM supply APR right now: <b className="mono">{pct(blend.supplyApr!)}</b> at {pct(blend.util!, 1)} utilization. Computed from the pool's on-chain reserve and rate model.</>
              : blend.err ? "Couldn't read the Blend pool right now, so the rate shows as 0%." : "Reading the Blend pool…"}</p>
          )}
          <p className="lc-px">XLM/USD (Reflector): <b className="mono">{px.usd ? `$${px.usd.toFixed(4)}` : px.err ? "unavailable" : "reading…"}</b>{age !== undefined && <small> · updated {age < 120 ? `${age}s` : `${Math.round(age / 60)} min`} ago ({new Date(px.ts! * 1000).toLocaleTimeString()})</small>}</p>
        </form>

        <div className="lc-out pr-card">
          {working > 0 && <LiveTicker working={working} apy={p.apy} />}
          <dl aria-live="polite">
            <div><dt>Amount working</dt><dd className="mono"><Count value={working} fmt={(n) => fmtUsd(n)} /><small>{xlm !== undefined ? <> ≈ <Count value={xlm} fmt={(n) => `${Math.round(n).toLocaleString("en-US")} XLM`} /></> : " XLM price unavailable"}</small></dd></div>
            <div><dt>pRT minted</dt><dd className="mono"><Count value={working} fmt={(n) => `${Math.round(n).toLocaleString("en-US")} pRT`} /><small>1 pRT = $1 of appraised value</small></dd></div>
            <div><dt>APY used</dt><dd className="mono"><Count value={p.apy * 100} fmt={(n) => `${n.toFixed(2)}%`} /><small>{mode === "live" ? "live Blend rate" : "assumed"}, compounded {comp}</small></dd></div>
            <div><dt>Per year / per month</dt><dd className="mono"><Count value={yearly} fmt={(n) => fmtUsd(n)} /><small>≈ <Count value={yearly / 12} fmt={(n) => fmtUsd(n)} /> a month, first year</small></dd></div>
            <div className="lc-big"><dt>Balance after {years} {years === 1 ? "year" : "years"}</dt><dd className="mono"><Count value={p.final} fmt={(n) => fmtUsd(n)} /><small>+<Count value={p.final - working} fmt={(n) => fmtUsd(n)} /> earned</small></dd></div>
            <div><dt>Effective yield on full property value</dt><dd className="mono"><Count value={value ? (yearly / value) * 100 : 0} fmt={(n) => `${n.toFixed(2)}%`} /><small>per year</small></dd></div>
          </dl>
          <Area pts={p.pts} principal={working} />
          <p className="muted pr-small">Estimate only, not guaranteed. Yield comes from Blend borrowers' interest, not from the property. Rates change constantly. Testnet, no real money.</p>
        </div>
      </div>
    </div>
  );
}
