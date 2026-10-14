/**
 * Base value → administer on chain → live compounding → token split.
 * Every number shown after administration is read back from the testnet valuation-log contract.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "../lib/wallet";
import { fmtUsd, readTokenization, readValuation, recordTokenization, recordValuation, sha256Hex, splitTokens, usdFrom7, VALUATION_LOG_ID, type Tokenization, type Valuation } from "../lib/propertyRoot";
import { normalizeAddress, suggestAddresses, ValuationError, rentcast, ownKey, type Estimate } from "../lib/valuation";
import { readBlendXlmRate } from "../lib/blendRate";

const KEY = "propertyroot.valuation.v1";
const DEMO_APR = 0.03;
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const txLink = (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`;
type Tx = { state: "idle" | "pending" | "ok" | "err"; hash?: string; text?: string };
type Base = { value: number; source: "rentcast" | "manual"; est?: Estimate };

export default function ValuationFlow({ onRecorded }: { onRecorded?: (v: { value: number; address: string; hash: string }) => void }) {
  const w = useWallet();
  const [address, setAddress] = useState("");
  const [sugs, setSugs] = useState<string[]>([]);
  const [look, setLook] = useState<{ state: "idle" | "loading" | "done" | "err"; err?: ValuationError }>({ state: "idle" });
  const [base, setBase] = useState<Base | null>(null);
  const [manual, setManual] = useState("");
  const [tx, setTx] = useState<Tx>({ state: "idle" });
  const [vid, setVid] = useState<number | null>(() => { try { return JSON.parse(localStorage.getItem(KEY) || "null")?.id ?? null; } catch { return null; } });
  const [onchain, setOnchain] = useState<Valuation | null>(null);
  const [tok, setTok] = useState<Tokenization | null>(null);
  const [readErr, setReadErr] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [, bump] = useState(0);
  const configured = rentcast.configured();

  // Autocomplete (debounced)
  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(() => suggestAddresses(address, ac.signal).then(setSugs).catch(() => setSugs([])), 300);
    return () => { clearTimeout(t); ac.abort(); };
  }, [address]);

  // Read back from chain
  useEffect(() => {
    if (!vid) return;
    let alive = true;
    const load = () => Promise.all([readValuation(vid), readTokenization(vid)])
      .then(([v, t]) => { if (alive) { setOnchain(v); setTok(t ?? null); setReadErr(null); } })
      .catch((e) => alive && setReadErr(String(e?.message ?? e)));
    load(); const i = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(i); };
  }, [vid, tx.state]);

  const lookup = async () => {
    setBase(null); setTx({ state: "idle" });
    if (!configured) { setLook({ state: "err", err: new ValuationError("not-configured", "RentCast not connected yet.") }); return; }
    setLook({ state: "loading" });
    try { const est = await rentcast.estimate(address); setBase({ value: est.value, source: "rentcast", est }); setLook({ state: "done" }); }
    catch (e) { setLook({ state: "err", err: e instanceof ValuationError ? e : new ValuationError("network", String(e)) }); }
  };
  const useManual = () => {
    const v = Math.round(Number(manual.replace(/[$,\s]/g, "")) * 100) / 100;
    if (!(v >= 1)) return;
    setBase({ value: v, source: "manual" }); setTx({ state: "idle" });
  };

  const administer = async () => {
    if (!base) return;
    if (!w.address) { w.connect(); return; }
    setTx({ state: "pending" });
    try {
      const hash = await sha256Hex(normalizeAddress(address));
      const r = await recordValuation(w.address, w.sign, hash, base.value, base.source, base.est?.responseHash);
      const id = Number(r.result);
      localStorage.setItem(KEY, JSON.stringify({ id }));
      setVid(id);
      setTx({ state: "ok", hash: r.hash });
      onRecorded?.({ value: base.value, address, hash });
    } catch (e) {
      const m = (e as Error).message || String(e);
      setTx({ state: "err", text: /cancel|reject|denied|declin/i.test(m) ? "You rejected the signature in your wallet. Nothing was recorded." : m });
    }
  };

  const errCopy = look.err && {
    "not-configured": "Add your own RentCast key below, or connect the proxy. For this demo you can also enter a value manually; it is labelled manual on chain.",
    "not-found": look.err.message, "bad-key": look.err.message, quota: look.err.message, network: look.err.message, upstream: look.err.message,
  }[look.err.kind];

  return (
    <div className="vf" data-testid="valuation-flow">
      <div className="vf-row">
        <label className="vf-addr">Property address
          <input list="vf-sugs" value={address} placeholder="123 Mesa Verde Rd, Sedona, AZ 86336" autoComplete="street-address"
            onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === "Enter" && address.trim().length >= 5 && lookup()} />
          <datalist id="vf-sugs">{sugs.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <button className="pr-btn" disabled={address.trim().length < 5 || look.state === "loading"} onClick={lookup}>{look.state === "loading" ? "Looking up…" : "Get RentCast estimate"}</button>
      </div>
      {!configured && look.state === "idle" && <p className="vf-note"><span className="vf-pill off">RentCast not connected yet</span> Add your own RentCast key, or the lookup switches on once the proxy has a key.</p>}
      <OwnKeyBox onChange={() => bump((x) => x + 1)} />

      {look.state === "err" && (
        <div className={`vf-card ${look.err?.kind === "not-configured" ? "off" : "err"}`} role="status" data-testid={`vf-${look.err?.kind}`}>
          <b>{({ "not-configured": "RentCast not connected yet", "not-found": "Address not found (404)", "bad-key": "Bad API key (401)", quota: "Quota reached (429)", network: "Network error", upstream: "Lookup failed" } as const)[look.err?.kind ?? "upstream"]}</b>
          <p>{errCopy}</p>
          <div className="vf-row">
            <label>Manual value (USD, demo)<input inputMode="decimal" placeholder="e.g. 450000" value={manual} onChange={(e) => setManual(e.target.value)} /></label>
            <button className="pr-btn ghost" disabled={!(Number(manual.replace(/[$,\s]/g, "")) >= 1)} onClick={useManual}>Use manual value</button>
          </div>
        </div>
      )}

      {base && (
        <div className="vf-card ok">
          <div className="vf-base">
            <span className={`vf-pill ${base.source}`}>{base.source === "rentcast" ? "RentCast estimate" : "Manual value (demo)"}</span>
            <b className="mono vf-big">{fmtUsd(base.value)}</b>
            {base.est?.low && base.est?.high && <small>Range {fmtUsd(base.est.low)} – {fmtUsd(base.est.high)}</small>}
                        {base.est?.comps !== undefined && <small>{base.est.comps} comparable{base.est.comps === 1 ? "" : "s"} · via {base.est.via === "own-key" ? "your key" : "proxy"}</small>}
            {base.est?.matchedAddress && <small>Matched: {base.est.matchedAddress}</small>}
          </div>
          {tx.state !== "ok" && <button className="pr-btn" disabled={tx.state === "pending"} onClick={administer}>{tx.state === "pending" ? "Waiting for wallet / testnet…" : w.address ? "Administer on chain" : "Connect wallet to administer"}</button>}
          <p className="muted vf-small">Records sha256(address), the value, source <code>{base.source}</code>{base.est ? " and sha256 of the RentCast response" : ""} on the testnet valuation log <code>{VALUATION_LOG_ID.slice(0, 6)}…</code>. Your plain address is never stored on chain.</p>
          {tx.state === "pending" && <p className="pr-msg" role="status">Pending: confirm in your wallet, then the transaction is submitted to Stellar testnet…</p>}
          {tx.state === "err" && <p className="pr-msg err" role="alert">Not recorded: {tx.text}</p>}
          {tx.state === "ok" && <p className="pr-msg ok" role="status">Recorded on testnet. <a href={txLink(tx.hash!)} target="_blank" rel="noreferrer">tx {tx.hash!.slice(0, 10)}… on stellar.expert</a></p>}
        </div>
      )}

      {vid && readErr && !onchain && <p className="pr-msg err">Couldn't read valuation #{vid} from chain: {readErr}</p>}
      {vid && onchain && <LiveValue v={onchain} id={vid} tok={tok} onTokenize={() => setSplitOpen(true)} />}
      {vid && onchain && splitOpen && !tok && <SplitForm id={vid} value={usdFrom7(onchain.value_usd)} onDone={(t) => { setTok(t); setSplitOpen(false); }} />}
    </div>
  );
}

function useRate() {
  const [r, setR] = useState<{ apr: number; label: string }>({ apr: DEMO_APR, label: "demo rate (3.0% APR)" });
  useEffect(() => { readBlendXlmRate().then((b) => { if (b.supplyApr > 0) setR({ apr: b.supplyApr, label: `Blend testnet XLM supply APR ${(b.supplyApr * 100).toFixed(2)}%` }); }).catch(() => {}); }, []);
  return r;
}

/** Continuous compounding P·e^(r·t), t from the on-chain timestamp. Ticks every second (5 s under reduced motion). */
function LiveValue({ v, id, tok, onTokenize }: { v: Valuation; id: number; tok: Tokenization | null; onTokenize: () => void }) {
  const P = usdFrom7(v.value_usd), t0 = Number(v.timestamp), rate = useRate();
  const [now, setNow] = useState(() => Date.now() / 1000);
  const pts = useRef<number[]>([]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now() / 1000), reduced() ? 5000 : 1000); return () => clearInterval(i); }, []);
  const yrs = Math.max(0, now - t0) / 31_557_600;
  const bal = P * Math.exp(rate.apr * yrs);
  pts.current = [...pts.current, bal].slice(-60);
  const spark = useMemo(() => {
    const a = pts.current; if (a.length < 2) return "";
    const lo = Math.min(...a), hi = Math.max(...a), span = hi - lo || 1;
    return a.map((y, i) => `${(i / (a.length - 1)) * 120},${28 - ((y - lo) / span) * 26}`).join(" ");
  }, [bal]); // eslint-disable-line react-hooks/exhaustive-deps
  const supply = tok ? Number(tok.supply) : 0, price = tok ? usdFrom7(tok.price_usd) : 0;
  return (
    <div className="vf-live" data-testid="live-compounding">
      <div className="vf-live-head"><b>Valuation #{id} · live compounding</b><span className="vf-pill off">Testnet demo · estimate</span></div>
      <dl className="vf-grid">
        <div><dt>Principal (on chain)</dt><dd className="mono">{fmtUsd(P, 2)}</dd><small>source <code>{String(v.source)}</code> · {new Date(t0 * 1000).toLocaleString()}</small></div>
        <div><dt>Live balance</dt><dd className={`mono vf-big${reduced() ? "" : " glow"}`}>{fmtUsd(bal, 4)}</dd>
          <svg className="vf-spark" viewBox="0 0 120 30" aria-hidden><polyline points={spark} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></div>
        <div><dt>Earned to date</dt><dd className="mono">{fmtUsd(bal - P, 4)}</dd></div>
        <div><dt>Rate</dt><dd className="mono">{(rate.apr * 100).toFixed(2)}%</dd><small>{rate.label}, continuous</small></div>
        {tok && <>
          <div><dt>Token supply (on chain)</dt><dd className="mono">{supply.toLocaleString("en-US")}</dd></div>
          <div><dt>Price per token</dt><dd className="mono">{fmtUsd(price, 2)}</dd></div>
          <div><dt>Live value per token</dt><dd className="mono">{fmtUsd((price * bal) / P, 6)}</dd><small>price × balance ÷ principal</small></div>
        </>}
      </dl>
      <p className="muted vf-small">Illustration only: balance = principal × e^(rate × time since the on-chain timestamp). No yield is actually paid by the valuation log.</p>
      {!tok && <button className="pr-btn" onClick={onTokenize}>Continue to tokenize</button>}
    </div>
  );
}

function SplitForm({ id, value, onDone }: { id: number; value: number; onDone: (t: Tokenization) => void }) {
  const w = useWallet();
  const [mode, setMode] = useState<"supply" | "price">("supply");
  const [input, setInput] = useState("1000");
  const [tx, setTx] = useState<Tx>({ state: "idle" });
  const n = Number(input);
  const r = mode === "supply" ? splitTokens(value, { supply: Number.isFinite(n) ? n : NaN }) : splitTokens(value, { price: n });
  const submit = async () => {
    if ("error" in r || !w.address) { if (!w.address) w.connect(); return; }
    setTx({ state: "pending" });
    try {
      const res = await recordTokenization(w.address, w.sign, id, r.supply, r.price);
      setTx({ state: "ok", hash: res.hash });
      onDone(await readTokenization(id) ?? { valuation_id: BigInt(id), supply: BigInt(r.supply), price_usd: BigInt(Math.round(r.price * 1e7)), timestamp: 0n });
    } catch (e) { const m = (e as Error).message; setTx({ state: "err", text: /cancel|reject|denied|declin/i.test(m) ? "You rejected the signature. Nothing was recorded." : m }); }
  };
  return (
    <div className="vf-card ok" data-testid="split-form">
      <b>Split {fmtUsd(value, 2)} into tokens</b>
      <div className="vf-seg" role="radiogroup">
        <button className={mode === "supply" ? "on" : ""} onClick={() => { setMode("supply"); setInput("1000"); }}>Set token count</button>
        <button className={mode === "price" ? "on" : ""} onClick={() => { setMode("price"); setInput("100"); }}>Set price per token</button>
      </div>
      <label>{mode === "supply" ? "Number of tokens (whole)" : "Price per token (USD)"}<input inputMode={mode === "supply" ? "numeric" : "decimal"} value={input} onChange={(e) => setInput(e.target.value)} /></label>
      {"error" in r ? <p className="pr-msg err">{r.error}</p> :
        <p className="mono">{r.supply.toLocaleString("en-US")} tokens × {fmtUsd(r.price, 2)} = {fmtUsd(r.supply * r.price, 2)} · remainder {fmtUsd(r.remainder, 2)} not tokenized</p>}
      <button className="pr-btn" disabled={"error" in r || tx.state === "pending"} onClick={submit}>{tx.state === "pending" ? "Waiting for wallet / testnet…" : "Record tokenization on chain"}</button>
      {tx.state === "err" && <p className="pr-msg err" role="alert">Not recorded: {tx.text}</p>}
      {tx.state === "ok" && <p className="pr-msg ok">Recorded. <a href={txLink(tx.hash!)} target="_blank" rel="noreferrer">tx {tx.hash!.slice(0, 10)}…</a></p>}
    </div>
  );
}

/** "Use my own RentCast key": stored in sessionStorage only (cleared when the tab closes), sent straight to api.rentcast.io. */
export function OwnKeyBox({ onChange }: { onChange?: () => void }) {
  const [has, setHas] = useState(() => Boolean(ownKey.get()));
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  if (has) return <p className="vf-note" data-testid="own-key-set"><span className="vf-pill rentcast">Your RentCast key</span> in use for this tab only. <button className="pr-btn ghost sm" onClick={() => { ownKey.clear(); setHas(false); onChange?.(); }}>Remove key</button></p>;
  if (!open) return <p className="vf-note"><button className="pr-btn ghost sm" style={{ marginLeft: 0 }} onClick={() => setOpen(true)}>Use my own RentCast key</button></p>;
  return <div className="vf-row vf-key">
    <label>RentCast API key<input type="password" autoComplete="off" spellCheck={false} value={v} placeholder="from app.rentcast.io/app/api" onChange={(e) => setV(e.target.value)} /></label>
    <button className="pr-btn" disabled={v.trim().length < 10} onClick={() => { ownKey.set(v); setV(""); setHas(true); setOpen(false); onChange?.(); }}>Save for this tab</button>
    <small className="muted">Kept in sessionStorage only and sent directly to api.rentcast.io. Never sent to us or stored on chain.</small>
  </div>;
}
