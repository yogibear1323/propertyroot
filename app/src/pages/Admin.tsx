/**
 * PropertyRoot back office (testnet). Sidebar shell with six sections, all reading
 * live testnet data: the valuation log contract, Horizon tx history for the
 * connected account, the vault/oracle feeds and Blend's supply rate.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useWallet } from "../lib/wallet";
import { fmtUsd, readAllValuations, readReserve, readXlmPrice, usdFrom7, VALUATION_LOG_ID, PR, type Tokenization, type Valuation } from "../lib/propertyRoot";
import { readBlendXlmRate } from "../lib/blendRate";
import { zillow } from "../lib/valuation";
import { HORIZON_URL } from "../lib/config";

type Row = { id: number; v: Valuation; t: Tokenization | null };
const short = (a: string, n = 5) => `${a.slice(0, n)}…${a.slice(-4)}`;
const xp = (kind: "tx" | "contract" | "account", id: string) => `https://stellar.expert/explorer/testnet/${kind}/${id}`;
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const I = {
  dash: "M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z",
  reg: "M4 4h16v4H4zm0 6h16v4H4zm0 6h16v4H4z",
  rec: "M12 2 3 7v10l9 5 9-5V7zm0 2.3L18.7 8 12 11.7 5.3 8z",
  tok: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m1 15h-2v-2h2zm0-4h-2V7h2z",
  wal: "M3 6h15a3 3 0 0 1 3 3v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm13 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M3 6l12-3v3",
  set: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m9 4-2.2-.7.5-2.2-1.9-1.1-1.6 1.6-2-1L13 4h-2l-.8 2.6-2 1-1.6-1.6-1.9 1.1.5 2.2L3 12l2.2.7-.5 2.2 1.9 1.1 1.6-1.6 2 1L11 20h2l.8-2.6 2-1 1.6 1.6 1.9-1.1-.5-2.2z",
};
const Ico = ({ d }: { d: string }) => <svg className="bo-ico" viewBox="0 0 24 24" aria-hidden><path d={d} fill="currentColor" /></svg>;
const NAV = [
  { to: "", label: "Dashboard", d: I.dash }, { to: "registry", label: "Property registry", d: I.reg }, { to: "records", label: "On-chain records", d: I.rec },
  { to: "tokens", label: "Tokenized assets", d: I.tok }, { to: "wallets", label: "Wallet connections", d: I.wal }, { to: "settings", label: "Settings", d: I.set },
];

function QLogo() {
  return <svg className="bo-q" viewBox="0 0 40 40" aria-hidden><defs><radialGradient id="bq" cx="50%" cy="40%"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#cfe2ff" /></radialGradient></defs>
    <circle cx="19" cy="19" r="12" fill="none" stroke="url(#bq)" strokeWidth="4" /><path d="M24 24l8 8" stroke="url(#bq)" strokeWidth="4.5" strokeLinecap="round" /></svg>;
}

function useValuations() {
  const [rows, setRows] = useState<Row[] | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => readAllValuations().then((r) => { setRows(r); setErr(null); }).catch((e) => setErr(String(e?.message ?? e))), []);
  useEffect(() => { load(); const i = setInterval(load, 30_000); return () => clearInterval(i); }, [load]);
  return { rows, err, load };
}
function useRate() {
  const [r, setR] = useState<{ apr: number; label: string }>({ apr: 0.03, label: "demo rate 3.00%" });
  useEffect(() => { readBlendXlmRate().then((b) => b.supplyApr > 0 && setR({ apr: b.supplyApr, label: `Blend XLM supply ${(b.supplyApr * 100).toFixed(2)}%` })).catch(() => {}); }, []);
  return r;
}
function useNow() { const [n, setN] = useState(Date.now() / 1000); useEffect(() => { const i = setInterval(() => setN(Date.now() / 1000), reduced() ? 5000 : 1000); return () => clearInterval(i); }, []); return n; }
const live = (P: number, ts: number, apr: number, now: number) => P * Math.exp(apr * Math.max(0, now - ts) / 31_557_600);

const Card = ({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) => <section className={`bo-card${wide ? " wide" : ""}`}><h3>{title}</h3>{children}</section>;
const Empty = ({ children }: { children: ReactNode }) => <p className="bo-empty">{children}</p>;

function Dashboard({ q }: { q: ReturnType<typeof useValuations> }) {
  const w = useWallet(); const rate = useRate(); const now = useNow();
  const [feed, setFeed] = useState<{ px?: number; res?: number }>({});
  useEffect(() => { Promise.allSettled([readXlmPrice(), readReserve()]).then(([p, r]) => setFeed({ px: p.status === "fulfilled" ? p.value.usd : undefined, res: r.status === "fulfilled" ? Number(r.value) / 1e7 : undefined })); }, []);
  const rows = q.rows ?? [];
  const total = rows.reduce((s, r) => s + usdFrom7(r.v.value_usd), 0);
  const liveTotal = rows.reduce((s, r) => s + live(usdFrom7(r.v.value_usd), Number(r.v.timestamp), rate.apr, now), 0);
  const mine = w.address ? rows.filter((r) => r.v.owner === w.address).length : 0;
  return <div className="bo-grid">
    <Card title="Recorded valuations"><b className="bo-kpi mono">{q.rows ? rows.length : "…"}</b><small>{w.address ? `${mine} from your wallet` : "connect a wallet to see yours"}</small></Card>
    <Card title="Total recorded value"><b className="bo-kpi mono">{fmtUsd(total)}</b><small>{rows.filter((r) => String(r.v.source) === "zillow").length} zillow · {rows.filter((r) => String(r.v.source) === "manual").length} manual</small></Card>
    <Card title="Live compounding (estimate)"><b className="bo-kpi mono">{fmtUsd(liveTotal, 2)}</b><small>{rate.label} · testnet demo</small></Card>
    <Card title="Tokenized"><b className="bo-kpi mono">{rows.filter((r) => r.t).length}</b><small>valuations with a recorded split</small></Card>
    <Card title="XLM/USD (Reflector)"><b className="bo-kpi mono">{feed.px ? `$${feed.px.toFixed(4)}` : "—"}</b></Card>
    <Card title="Vault reserve"><b className="bo-kpi mono">{feed.res !== undefined ? `${Math.round(feed.res).toLocaleString()} XLM` : "—"}</b></Card>
    {q.err && <Card title="Read error" wide><p className="pr-msg err">{q.err}</p></Card>}
  </div>;
}

function Registry({ q }: { q: ReturnType<typeof useValuations> }) {
  const w = useWallet(); const [onlyMine, setOnlyMine] = useState(false);
  const rows = (q.rows ?? []).filter((r) => !onlyMine || r.v.owner === w.address);
  return <Card title="Property registry · valuation log" wide>
    <div className="bo-bar"><a href={xp("contract", VALUATION_LOG_ID)} target="_blank" rel="noreferrer" className="mono">{short(VALUATION_LOG_ID, 6)}</a>
      <label><input type="checkbox" checked={onlyMine} disabled={!w.address} onChange={(e) => setOnlyMine(e.target.checked)} /> Only my wallet</label>
      <button className="pr-btn ghost sm" onClick={q.load}>Refresh</button></div>
    {!q.rows ? <Empty>Reading from testnet…</Empty> : !rows.length ? <Empty>No valuations recorded yet. Use “Administer on chain” in the demo.</Empty> :
      <div className="bo-table-wrap"><table className="bo-table"><thead><tr><th>#</th><th>Value</th><th>Source</th><th>Address hash</th><th>Owner</th><th>Recorded</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td>{r.id}</td><td className="mono">{fmtUsd(usdFrom7(r.v.value_usd))}</td><td><span className={`vf-pill ${String(r.v.source)}`}>{String(r.v.source)}</span></td>
          <td className="mono">{hex(r.v.address_hash).slice(0, 12)}…</td><td><a className="mono" href={xp("account", r.v.owner)} target="_blank" rel="noreferrer">{short(r.v.owner)}</a></td>
          <td>{new Date(Number(r.v.timestamp) * 1000).toLocaleString()}</td></tr>)}
      </tbody></table></div>}
  </Card>;
}

type HTx = { hash: string; created_at: string; successful: boolean; operation_count: number; memo?: string };
function Records() {
  const w = useWallet(); const [txs, setTxs] = useState<HTx[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!w.address) return; setTxs(null);
    fetch(`${HORIZON_URL}/accounts/${w.address}/transactions?order=desc&limit=20`).then((r) => r.status === 404 ? { _embedded: { records: [] } } : r.json())
      .then((j) => setTxs(j._embedded?.records ?? [])).catch((e) => setErr(String(e)));
  }, [w.address]);
  return <Card title="On-chain records · your testnet transactions" wide>
    {!w.address ? <Empty>Connect a wallet to list its testnet transactions. <button className="pr-btn sm" onClick={() => w.connect()}>Connect wallet</button></Empty> :
      err ? <p className="pr-msg err">Horizon error: {err}</p> : !txs ? <Empty>Loading from Horizon…</Empty> : !txs.length ? <Empty>No transactions on this account yet.</Empty> :
      <div className="bo-table-wrap"><table className="bo-table"><thead><tr><th>Transaction</th><th>When</th><th>Ops</th><th>Status</th></tr></thead><tbody>
        {txs.map((t) => <tr key={t.hash}><td><a className="mono" href={xp("tx", t.hash)} target="_blank" rel="noreferrer">{t.hash.slice(0, 14)}…</a></td><td>{new Date(t.created_at).toLocaleString()}</td><td>{t.operation_count}</td><td>{t.successful ? "✓ success" : "✗ failed"}</td></tr>)}
      </tbody></table></div>}
  </Card>;
}

function Tokens({ q }: { q: ReturnType<typeof useValuations> }) {
  const rate = useRate(); const now = useNow();
  const rows = (q.rows ?? []).filter((r) => r.t);
  return <Card title="Tokenized assets" wide>
    {!q.rows ? <Empty>Reading from testnet…</Empty> : !rows.length ? <Empty>No tokenizations recorded yet. Use “Continue to tokenize” after administering a value.</Empty> :
      <div className="bo-table-wrap"><table className="bo-table"><thead><tr><th>#</th><th>Supply</th><th>Price / token</th><th>Live value / token</th><th>Tokenized total</th></tr></thead><tbody>
        {rows.map((r) => { const P = usdFrom7(r.v.value_usd), price = usdFrom7(r.t!.price_usd), bal = live(P, Number(r.v.timestamp), rate.apr, now);
          return <tr key={r.id}><td>{r.id}</td><td className="mono">{Number(r.t!.supply).toLocaleString()}</td><td className="mono">{fmtUsd(price, 2)}</td><td className="mono">{fmtUsd(price * bal / P, 6)}</td><td className="mono">{fmtUsd(price * Number(r.t!.supply), 2)}</td></tr>; })}
      </tbody></table><p className="bo-empty">Live value is an estimate ({rate.label}, continuous), testnet demo.</p></div>}
  </Card>;
}

function Wallets() {
  const w = useWallet();
  return <Card title="Wallet connections" wide>
    {w.address ? <div className="bo-wallet"><div><small>Connected</small><b className="mono">{short(w.address, 8)}</b><small>{w.walletId ? `via ${w.walletId}` : w.kind === "local" ? "in-app testnet key" : ""} · testnet</small></div>
      <a href={xp("account", w.address)} target="_blank" rel="noreferrer">View on stellar.expert</a>
      <button className="pr-btn ghost sm" onClick={() => w.connect()}>Switch wallet</button><button className="pr-btn ghost sm" onClick={() => w.disconnect()}>Disconnect</button></div>
      : <Empty>No wallet connected. <button className="pr-btn sm" onClick={() => w.connect()}>Connect wallet</button></Empty>}
    <p className="bo-empty">Supported via Stellar Wallets Kit: Freighter, LOBSTR, xBull, Albedo, Rabet, Hana, Scopuly. Lumexo: coming soon (no dapp connect API yet). The wallet choice is kept in this tab's sessionStorage only.</p>
  </Card>;
}

function Settings() {
  const [rm, setRm] = useState(reduced());
  useEffect(() => { const m = matchMedia("(prefers-reduced-motion: reduce)"); const f = () => setRm(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return <Card title="Settings" wide><dl className="bo-dl">
    <div><dt>Network</dt><dd><span className="vf-pill">testnet</span> {PR.networkPassphrase}</dd></div>
    <div><dt>Zillow proxy</dt><dd>{zillow.configured() ? <span className="vf-pill zillow">configured</span> : <span className="vf-pill off">not connected yet</span>} {zillow.configured() ? "" : "add a Bridge token to the Worker and set valuationProxyUrl"}</dd></div>
    <div><dt>Reduced motion</dt><dd>{rm ? "On (system setting): tickers update every 5 s, no glow or snow." : "Off: follows your system setting."}</dd></div>
    <div><dt>Contracts</dt><dd className="mono">{Object.entries({ ...PR.contracts }).map(([k, v]) => <div key={k}>{k}: <a href={xp("contract", v as string)} target="_blank" rel="noreferrer">{short(v as string, 6)}</a></div>)}</dd></div>
  </dl></Card>;
}

export default function Admin() {
  const q = useValuations();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("propertyroot.sidebar") === "1");
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  useEffect(() => setDrawer(false), [loc.pathname]);
  useEffect(() => { localStorage.setItem("propertyroot.sidebar", collapsed ? "1" : "0"); }, [collapsed]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);
  const title = NAV.find((n) => loc.pathname.replace(/\/$/, "").endsWith(n.to ? `/admin/${n.to}` : "/admin"))?.label ?? "Dashboard";
  return <div className={`bo${collapsed ? " collapsed" : ""}${drawer ? " open" : ""}`}>
    <aside className="bo-side" id="bo-side" aria-label="Back office">
      <div className="bo-brand"><QLogo /><span className="bo-label"><b>PropertyRoot</b><small>Back office · testnet</small></span></div>
      <nav><ul>{NAV.map((n) => <li key={n.label}><NavLink end to={n.to ? `/app/admin/${n.to}` : "/app/admin"} className={({ isActive }) => `bo-link${isActive ? " active" : ""}`} title={n.label} onClick={() => setDrawer(false)}><Ico d={n.d} /><span className="bo-label">{n.label}</span></NavLink></li>)}</ul></nav>
      <NavLink end to="/app" className="bo-link bo-back" title="Back to demo"><Ico d="M15 6l-6 6 6 6" /><span className="bo-label">Back to demo</span></NavLink>
      <button className="bo-collapse" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-controls="bo-side" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? "»" : "«"}</button>
    </aside>
    {drawer && <div className="bo-scrim" onClick={() => setDrawer(false)} />}
    <div className="bo-main">
      <div className="bo-head"><button className="bo-burger" aria-label="Open menu" aria-expanded={drawer} aria-controls="bo-side" onClick={() => setDrawer(true)}>☰</button><h2>{title}</h2><span className="vf-pill off">Testnet demo</span></div>
      <Routes>
        <Route index element={<Dashboard q={q} />} />
        <Route path="registry" element={<Registry q={q} />} />
        <Route path="records" element={<Records />} />
        <Route path="tokens" element={<Tokens q={q} />} />
        <Route path="wallets" element={<Wallets />} />
        <Route path="settings" element={<Settings />} />
      </Routes>
    </div>
  </div>;
}
