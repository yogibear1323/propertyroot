/**
 * PropertyRoot back office → "Tokenization flow": an ILLUSTRATIVE, static walk-through of how a house deed could become a
 * regulated real estate share token on Stellar (asset HOUSE1) and how lending yield (Blend, priced by Reflector) could be
 * routed. No network calls, no wallets, no keys. All addresses are fake placeholders; the 3% rate is ASSUMED.
 * (The live testnet demo elsewhere in this app is separate: it records a valuation and mints a SEP-41 pRT vault token.)
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ASSUMED_RATE, BILLS, DEFAULTS, MAX_LEND_PCT, SHARES, VALUE, calc, mortgage, num, split, usd, ym, type Dest, type TokInputs } from "../lib/tokenizationModel";

const ISS = "GEXAMPLEISSUER…PLACEHOLDER", DIST = "GEXAMPLEDISTRIBUTION…PLACEHOLDER", OWN = "GEXAMPLEHOMEOWNER…PLACEHOLDER";
const TRE = "CEXAMPLEVAULT…PLACEHOLDER", POOL = "CEXAMPLEBLENDPOOL…PLACEHOLDER", ORA = "CEXAMPLEREFLECTOR…PLACEHOLDER";
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const Code = ({ children }: { children: ReactNode }) => <code className="tk-code">{children}</code>;
const Chip = ({ children, warn }: { children: ReactNode; warn?: boolean }) => <span className={`tk-chip${warn ? " warn" : ""}`}>{children}</span>;

const G: Record<string, string> = {
  deed: "M6 2h9l5 5v15H6zm8 1.5V8h4.5M9 12h8M9 15h8M9 18h5",
  spv: "M3 21h18M5 21V10m4 11V10m6 11V10m4 11V10M2 10l10-7 10 7z",
  hex: "M12 2 3 7v10l9 5 9-5V7zm0 6v8m-4-6 4 2 4-2",
  wallet: "M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm0 0 12-4v4m3 6.5h.01",
  bank: "M3 10 12 4l9 6M5 10v8m4-8v8m6-8v8m4-8v8M3 21h18",
  coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v10m3-7.5c0-1-1.3-1.8-3-1.8s-3 .8-3 1.8 1.3 1.6 3 1.9 3 .9 3 1.9-1.3 1.8-3 1.8-3-.8-3-1.8",
};
const Gl = ({ k }: { k: string }) => <svg className="tk-gl" viewBox="0 0 24 24" aria-hidden><path d={G[k]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

type Stage = { glyph: string; title: string; sub: ReactNode; loc: "OFF-CHAIN" | "STELLAR TESTNET" | "mix" };
const DEST_LABEL: Record<Dest, string> = { mortgage: "Pay down mortgage", income: "Passive income", bills: "Bills / anything", custom: "Custom split" };

export default function Tokenization() {
  const [S, setS] = useState<TokInputs>(DEFAULTS);
  const [step, setStep] = useState(0);
  const [play, setPlay] = useState(() => !reduced());
  const [tab, setTab] = useState<"asset" | "issuer" | "txs" | "toml">("asset");
  const set = <K extends keyof TokInputs>(k: K, v: TokInputs[K]) => setS((s) => ({ ...s, [k]: v }));
  const c = useMemo(() => calc(S), [S]);
  const sp = useMemo(() => split(S), [S]);
  const mAmt = c.monthly * sp.m, iAmt = c.monthly * sp.i, bAmt = c.monthly * sp.b;

  useEffect(() => { if (!play) return; const t = setInterval(() => setStep((s) => (s + 1) % 6), 3800); return () => clearInterval(t); }, [play]);
  const go = (i: number) => { setPlay(false); setStep((i + 6) % 6); };

  const stage6: [string, string, Stage["loc"]] = {
    mortgage: ["Yield → mortgage paydown", `≈${usd(mAmt)}/mo extra principal via the servicer (off-chain)`, "mix"],
    income: ["Yield → owner wallet", `≈${usd(iAmt)}/mo paid to the owner's non-custodial wallet`, "STELLAR TESTNET"],
    bills: ["Yield → bills bucket", `≈${usd(bAmt)}/mo for bills & spending`, "mix"],
    custom: ["Yield split", `${Math.round(sp.m * 100)}% mortgage · ${Math.round(sp.i * 100)}% income · ${Math.round(sp.b * 100)}% bills`, "mix"],
  }[S.dest] as [string, string, Stage["loc"]];
  const stages: Stage[] = [
    { glyph: "deed", title: "Deed, title & appraisal", sub: <>Legal title review + independent appraisal: <b>$500,000</b></>, loc: "OFF-CHAIN" },
    { glyph: "spv", title: "SPV holds the deed", sub: <>Deed sits in an SPV (LLC/trust) with a custodian; equity = <b>500,000 shares</b></>, loc: "OFF-CHAIN" },
    { glyph: "hex", title: "Record value & issue shares", sub: <>Value recorded on testnet; <Code>HOUSE1</Code> regulated asset + Soroban vault</>, loc: "STELLAR TESTNET" },
    { glyph: "wallet", title: "Mint to owner wallet", sub: <>KYC'd owner trusts + is authorized; shares land in a <b>non-custodial</b> wallet</>, loc: "STELLAR TESTNET" },
    { glyph: "bank", title: "Lend via Blend", sub: <>Up to <b>50%</b> supplied to a Blend pool; Reflector prices it (incl. XLM)</>, loc: "STELLAR TESTNET" },
    { glyph: "coin", title: stage6[0], sub: stage6[1], loc: stage6[2] },
  ];
  const destLine = { mortgage: "Yield pays extra principal on the mortgage (servicer integration is off-chain and not real here).", income: "Yield is paid to the owner's non-custodial wallet as passive income.", bills: "Yield goes to a spend bucket for bills or anything the homeowner chooses.", custom: "Yield is split across mortgage paydown, passive income and bills." }[S.dest];
  const detail: [string, ReactNode[]][] = [
    ["1 · Deed, title review & appraisal (off-chain)", ["A title company / attorney confirms who owns the property and that title is clear of problem liens.", <>An independent appraiser values the home: <b>$500,000</b> in this example (illustrative).</>, "These are the only inputs that cannot be proven on-chain. They stay off-chain; only a hash of the documents and the appraised value are recorded later."]],
    ["2 · Legal wrapper: SPV holds the deed (off-chain)", ["The deed is transferred to a single-purpose legal entity (an LLC/trust, the SPV). A custodian/trustee holds it.", <>The SPV's equity is divided into <b>500,000 shares</b> (reference $1.00 each, illustrative). Holders' rights come from the operating agreement.</>, "Securities, property and tax rules decide who may buy the shares and how they are offered."]],
    ["3 · Record the value on Stellar testnet and issue the share token", [<>A <b>Soroban vault contract</b> records the property's value, appraisal date and document hash.</>, <>An <b>issuer account</b> creates asset <Code>HOUSE1</Code> (made-up code). Issuer flags: <Code>AUTH_REQUIRED</Code>, <Code>AUTH_REVOCABLE</Code>, <Code>AUTH_CLAWBACK_ENABLED</Code>.</>, <><b>SEP-8</b> approval server + <b>SEP-24</b>/SEP-12 KYC gate who can hold and transfer the shares. The asset's <Code>stellar.toml</Code> (SEP-1) advertises it.</>]],
    ["4 · Mint to the owner's non-custodial wallet", [<>The owner passes KYC, opens a <b>trustline</b> to <Code>HOUSE1</Code>, and the issuer authorizes it.</>, "500,000 shares move issuer → distribution account → owner wallet. The share register ties the wallet to the holder.", "Wallets: Freighter, LOBSTR, xBull, Scopuly. The app never holds private keys. Testnet only."]],
    ["5 · Lend up to 50% through Blend", [<>Up to 50% of the recorded value (<b>{usd(c.deployed)}</b> of $500,000) is supplied to a <b>Blend</b> lending pool to earn borrower interest.</>, <><b>Reflector</b> price feeds (SEP-40 <Code>lastprice</Code>) value the position, including XLM conversion.</>, <>Compounds on the frequency you choose. Rate: Blend's variable rate, or an <b>ASSUMED 3%</b>.</>, <><b>Yield comes from lending, not rent.</b> Risks: smart-contract bugs, oracle errors, liquidation shortfalls, withdrawal liquidity, rate swings.</>]],
    [`6 · ${stage6[0]}`, [destLine, <><b>Reporting:</b> the SPV publishes holder statements and tax documents; on-chain payments are visible to anyone with the address.</>, <><b>Redemption / secondary:</b> shares are redeemed through the SPV or traded only between authorized holders (Stellar DEX offers or an anchor), subject to SEP-8 approval and legal limits.</>]],
  ];
  const packetLeft = `${((step + 0.5) / 6) * 100}%`;

  return <div className="tk">
    <div className="tk-disclaimer" role="note">
      <b>Illustrative concept only.</b> No real property, no real tokens and no real issuer exist here. Nothing on this page is an offer, solicitation or investment advice. Every number is an <b>estimate</b> or an <b>ASSUMED</b> input. Real tokenized real estate is subject to securities, property, lending and tax law in your jurisdiction. Everything shown is a Stellar <b>testnet</b> concept; addresses and hashes are obviously fake placeholders; no wallets or keys are used on this page. This is separate from the live testnet demo (which records a valuation and mints a SEP-41 <Code>pRT</Code> vault token).
    </div>

    <section className="bo-card wide tk-hero">
      <h3>Property tokenization flow</h3>
      <h4>From house deed to real estate share token to lending yield</h4>
      <p>A <b>$500,000</b> example home <Chip warn>illustrative</Chip> is held by an SPV. The SPV's equity is divided into <b>500,000 shares</b>, each represented 1:1 by a Stellar <b>real estate share token</b> (asset code <Code>HOUSE1</Code>, a made-up code). The property's value is recorded on Stellar testnet, and up to <b>50%</b> of it is put to work in <b>Blend</b> lending pools. <b>The yield comes from lending interest, not from rent and not from the house itself.</b></p>
      <ul className="tk-pills">
        <li className="off">Off-chain: title + appraisal, SPV legal wrapper, mortgage servicer</li>
        <li className="on">On Stellar testnet: share token, Soroban vault, Blend supply, Reflector (SEP-40) pricing</li>
        <li className="wal">Non-custodial wallets: Freighter · LOBSTR · xBull · Scopuly (the app never holds keys)</li>
      </ul>
    </section>

    <section className="bo-card wide" aria-label="Pipeline">
      <div className="tk-head"><h3>Pipeline · 6 stages</h3>
        <div className="tk-ctl"><button className="pr-btn ghost sm" aria-pressed={play} onClick={() => setPlay((p) => !p)}>{play ? "❚❚ Pause" : "▶ Play"}</button>
          <button className="pr-btn ghost sm" aria-label="Previous step" onClick={() => go(step - 1)}>◂</button><button className="pr-btn ghost sm" aria-label="Next step" onClick={() => go(step + 1)}>▸</button></div></div>
      <div className="tk-pipe" role="list">
        {stages.map((s, i) => <div key={i} role="listitem" tabIndex={0} className={`tk-stage${i === step ? " active" : ""}${i < step ? " done" : ""}`} aria-current={i === step ? "step" : undefined}
          onClick={() => go(i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(i); } }}>
          <span className="tk-no">{i + 1}</span><Gl k={s.glyph} /><h5>{s.title}</h5><p>{s.sub}</p>
          <span className={`tk-loc ${s.loc === "OFF-CHAIN" ? "off" : s.loc === "mix" && S.dest !== "income" ? "mix" : "on"}`}>{s.loc === "mix" ? (S.dest === "income" ? "STELLAR TESTNET" : S.dest === "custom" ? "ON + OFF-CHAIN" : "ON → OFF-CHAIN") : s.loc}</span></div>)}
        <i className="tk-packet" style={{ left: packetLeft }} aria-hidden />
      </div>
      <div className="tk-detail" aria-live="polite"><h5>{detail[step][0]}</h5><ul>{detail[step][1].map((x, i) => <li key={i}>{x}</li>)}</ul></div>
    </section>

    <div className="tk-two stack">
      <section className="bo-card">
        <h3>$500K worked example <Chip warn>estimate · illustrative</Chip></h3>
        <div className="tk-form">
          <label className="tk-f"><span>Share of value lent <em>(max {MAX_LEND_PCT}%)</em></span><input type="range" min={0} max={MAX_LEND_PCT} step={1} value={S.deploy} onChange={(e) => set("deploy", +e.target.value)} aria-label="Share of value lent" /><output>{S.deploy}%</output></label>
          <div className="tk-f"><span>Interest rate</span>
            <div className="tk-seg" role="group" aria-label="Rate source"><button className={S.mode === "assumed" ? "on" : ""} aria-pressed={S.mode === "assumed"} onClick={() => set("mode", "assumed")}>ASSUMED {ASSUMED_RATE.toFixed(2)}%</button><button className={S.mode === "live" ? "on" : ""} aria-pressed={S.mode === "live"} onClick={() => set("mode", "live")}>Blend live rate (manual)</button></div></div>
          {S.mode === "live" && <>
            <label className="tk-f"><span>Live rate you read from Blend testnet</span><input type="number" min={0} max={50} step={0.01} placeholder="e.g. read from the Blend app" value={S.live} onChange={(e) => set("live", e.target.value)} /><output>% APR</output></label>
            <p className="tk-note">This view is <b>not connected to Blend</b> and never invents a live rate. Type the supply APR you read yourself; leave it empty to fall back to the assumed 3%. Blend rates are variable (utilization-based).</p></>}
          <label className="tk-f"><span>Compounding frequency</span><select value={S.freq} onChange={(e) => set("freq", +e.target.value)}><option value={365}>Daily</option><option value={52}>Weekly</option><option value={12}>Monthly</option><option value={4}>Quarterly</option><option value={1}>Annually</option></select></label>
          <label className="tk-f"><span>Timeframe</span><input type="range" min={1} max={30} step={1} value={S.years} onChange={(e) => set("years", +e.target.value)} aria-label="Timeframe in years" /><output>{S.years} yrs</output></label>
          <label className="tk-f"><span>Reflector XLM/USD price <em>(placeholder)</em></span><input type="number" min={0.01} step={0.01} value={S.xlm} onChange={(e) => set("xlm", +e.target.value || 0)} /><output>USD <Chip warn>not a quote</Chip></output></label>
        </div>
        <div className="tk-tiles">
          <Tile l="Share tokens minted" v={`${num(SHARES)} HOUSE1`} s="1:1 with SPV shares · est." />
          <Tile l="Value lent (max 50%)" v={usd(c.deployed)} s={`${num(c.lentShares)} shares-worth · not lent: ${usd(VALUE - c.deployed)}`} />
          <Tile hl l="Est. per month" v={usd(c.monthly)} s={`${c.usingLive ? `MANUAL ${c.rate.toFixed(2)}%` : "ASSUMED 3.00%"} · simple`} />
          <Tile hl l="Est. per year" v={usd(c.yearly)} s="gross, before fees/tax" />
          <Tile l="Effective APY" v={`${(c.apy * 100).toFixed(3)}%`} s={`compounded ${({ 365: "daily", 52: "weekly", 12: "monthly", 4: "quarterly", 1: "annually" } as Record<number, string>)[S.freq]}`} />
          <Tile hl l={`Compounded, ${S.years} yr`} v={usd(c.compTotal)} s={`+${usd(c.compEarn)} est. interest`} />
          <Tile l="Per-share yield / yr" v={`$${c.perShareYear.toFixed(4)}`} s={`${(c.perShareYear / (VALUE / SHARES) * 100).toFixed(2)}% of $1.00 ref. share`} />
          <Tile l="Per-share / month" v={`$${c.perShareMonth.toFixed(5)}`} s="yield ÷ 500,000 shares" />
          <Tile l="Lent amount in XLM" v={`${num(c.xlmAmt)} XLM`} s={`@ $${(+S.xlm).toFixed(2)} placeholder (Reflector SEP-40 in concept)`} />
        </div>
        <Chart S={S} c={c} />
        <p className="tk-fine">Estimates only. Gross interest on the lent amount; excludes Blend/SPV fees, network fees, taxes, borrower defaults, bad debt and rate changes. Rates are variable and can fall to zero or the principal can lose value.</p>
      </section>

      <section className="bo-card">
        <h3>Yield destination <Chip warn>illustrative</Chip></h3>
        <p className="tk-lede">The homeowner holds the real estate share tokens, so the lending yield is theirs. Pick where the harvested yield goes. It updates the numbers and pipeline stage 6 live.</p>
        <div className="tk-seg wide" role="radiogroup" aria-label="Yield destination">
          {(["mortgage", "income", "bills", "custom"] as Dest[]).map((d, i) => <button key={d} role="radio" aria-checked={S.dest === d} className={S.dest === d ? "on" : ""} onClick={() => { set("dest", d); go(5); }}>{["①", "②", "③", "④"][i]} {DEST_LABEL[d]}</button>)}
        </div>
        {S.dest === "custom" && <div className="tk-form tk-split">
          <label className="tk-f"><span>Mortgage</span><input type="range" min={0} max={100} value={S.spM} aria-label="Mortgage share" onChange={(e) => { const m = +e.target.value; setS((s) => ({ ...s, spM: m, spI: Math.min(s.spI, 100 - m) })); }} /><output>{S.spM}%</output></label>
          <label className="tk-f"><span>Passive income</span><input type="range" min={0} max={100} value={S.spI} aria-label="Passive income share" onChange={(e) => { const i = +e.target.value; setS((s) => ({ ...s, spI: i, spM: Math.min(s.spM, 100 - i) })); }} /><output>{S.spI}%</output></label>
          <div className="tk-f"><span>Bills / spend (rest)</span><div className="tk-splitbar"><i style={{ width: `${sp.m * 100}%`, background: "#9cc8f0" }} /><i style={{ width: `${sp.i * 100}%`, background: "#e3ecf8" }} /><i style={{ width: `${sp.b * 100}%`, background: "#fcd34d" }} /></div><output>{Math.round(sp.b * 100)}%</output></div>
        </div>}
        <div className="tk-dest">
          {sp.m > 0 && <Mortgage S={S} mAmt={mAmt} />}
          {sp.i > 0 && <div className="tk-block"><h6>② Passive income to wallet <Chip warn>estimate</Chip></h6><div className="tk-kv">
            <KV k="Payout / month" v={usd(iAmt, 2)} /><KV k="Payout / year" v={usd(iAmt * 12, 2)} /><KV k="Per share / year (on payout)" v={`$${(iAmt * 12 / SHARES).toFixed(5)}`} />
            <KV k="Destination" v={OWN} mono /><KV k="Paid as" v="EXUSD (placeholder stablecoin) · Stellar payment" /></div>
            <p className="tk-fine">Non-custodial: you hold the keys in Freighter, LOBSTR, xBull or Scopuly. The app never sees them. Taxes not modeled.</p></div>}
          {sp.b > 0 && <Bills bAmt={bAmt} />}
          {sp.m + sp.i + sp.b === 0 && <div className="tk-block">Nothing allocated. Move a slider.</div>}
        </div>
        <details className="tk-assume" open><summary>ASSUMED mortgage terms (editable, fictional)</summary>
          <div className="tk-form">
            <label className="tk-f"><span>Remaining balance</span><input type="number" min={1000} step={1000} value={S.mbal} onChange={(e) => set("mbal", +e.target.value)} /><output>USD</output></label>
            <label className="tk-f"><span>Mortgage rate</span><input type="number" min={0} max={20} step={0.05} value={S.mrate} onChange={(e) => set("mrate", +e.target.value)} /><output>% APR</output></label>
            <label className="tk-f"><span>Remaining term</span><input type="number" min={1} max={40} step={1} value={S.mterm} onChange={(e) => set("mterm", +e.target.value)} /><output>years</output></label>
          </div>
          <p className="tk-fine">Mortgage servicing, the lender and any extra-principal payments happen off-chain with a real servicer; this view does not connect to one. Prepayment terms, taxes and escrow are not modeled.</p></details>
      </section>
    </div>

    <div className="tk-two">
      <section className="bo-card">
        <h3>How the share token works on Stellar</h3>
        <div className="tk-acc">
          <div><h5>Share register &amp; legal wrapper (off-chain)</h5><p>The SPV's operating agreement says its equity is divided into 500,000 shares and that each share is represented 1:1 by the <Code>HOUSE1</Code> asset. The share register ties each verified holder to a wallet address. Which record legally governs (the ledger or an off-chain register) depends on the jurisdiction and the documents. Title and appraisal remain off-chain.</p></div>
          <div><h5>Issuer &amp; distribution accounts</h5><p>An <b>issuer account</b> creates the asset; a separate <b>distribution account</b> holds the minted supply and sends it to holders. Holders opt in with a <b>trustline</b> (<Code>change_trust</Code>). The issuer sets <Code>AUTH_REQUIRED</Code> (approve each holder first), <Code>AUTH_REVOCABLE</Code> (freeze/limit) and <Code>AUTH_CLAWBACK_ENABLED</Code> (recover tokens for legal or compliance reasons; it requires revocable). Because the issuer must keep these powers, it cannot be locked, so it needs multisig and governance.</p></div>
          <div><h5>Compliance: SEP-8, SEP-24 (and SEP-10/12)</h5><p><b>SEP-8 regulated assets</b>: an approval server checks and signs each transfer (holder limits, lock-ups, sanctions screening). <b>SEP-24</b> gives an interactive web flow where an anchor/issuer can run KYC and funding; <b>SEP-12</b> is the KYC data API and <b>SEP-10</b> proves wallet ownership. The asset's <Code>stellar.toml</Code> (SEP-1) advertises these.</p></div>
          <div><h5>Soroban vault, Blend &amp; Reflector</h5><p>A <b>Soroban vault contract</b> tracks the recorded property value and the share supply, and uses the asset's SEP-41-style token interface (the Stellar Asset Contract). It supplies up to 50% of the value to a <b>Blend</b> pool (a <Code>submit</Code> call with a supply request) to earn borrower interest, and reads <b>Reflector</b> oracle prices (SEP-40 <Code>lastprice</Code>) to value positions, including XLM conversion.</p></div>
          <div><h5>Where the yield comes from, and the risks</h5><p><b>Lending interest.</b> Borrowers in the Blend pool pay interest; lenders earn a variable share. Not rent. Risks: smart-contract bugs, oracle errors, borrower liquidation shortfalls / bad debt, liquidity limits on withdrawal, rate swings, regulatory change, and the fact that a house cannot itself be lent: real funds would need to back whatever is supplied.</p></div>
        </div>
      </section>
      <section className="bo-card">
        <h3>Mock Stellar view <Chip warn>fake · testnet concept</Chip></h3>
        <div className="tk-seg" role="tablist">{([["asset", "Asset"], ["issuer", "Issuer flags"], ["txs", "Transactions"], ["toml", "stellar.toml"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
        <Mock tab={tab} S={S} c={c} sp={sp} />
        <p className="tk-fine">Mock UI, not a block explorer. Addresses and hashes are placeholders and do not exist on any network.</p>
      </section>
    </div>

    <section className="bo-card wide">
      <h3>Share register <Chip warn>illustrative</Chip></h3>
      <div className="bo-table-wrap"><table className="bo-table"><thead><tr><th>Holder</th><th>Wallet (placeholder)</th><th>KYC</th><th>Trustline</th><th>HOUSE1 shares</th><th>% of SPV</th><th>Note</th></tr></thead><tbody>
        <tr><td>Homeowner (example)</td><td className="mono">{OWN}</td><td><span className="vf-pill">verified</span></td><td><span className="vf-pill">authorized</span></td><td className="mono">500,000</td><td className="mono">100.00%</td><td>Non-custodial wallet (e.g. Freighter / LOBSTR / xBull / Scopuly); app holds no keys</td></tr>
        <tr><td>Distribution account</td><td className="mono">{DIST}</td><td>n/a</td><td><span className="vf-pill">authorized</span></td><td className="mono">0</td><td className="mono">0.00%</td><td>Holds supply only transiently during minting</td></tr>
      </tbody></table></div>
      <p className="tk-fine">If other verified holders were added, yield would be distributed pro rata per share. Of the 500,000 shares, <b>250,000</b> (50%) represent value the vault lends; the other 250,000 are not lent.</p>
    </section>
  </div>;
}

const Tile = ({ l, v, s, hl }: { l: string; v: string; s: string; hl?: boolean }) => <div className={`tk-tile${hl ? " hl" : ""}`}><label>{l}</label><b className="mono">{v}</b><small>{s}</small></div>;
const KV = ({ k, v, mono, cls }: { k: string; v: ReactNode; mono?: boolean; cls?: string }) => <div><span>{k}</span><b className={`${mono ? "mono " : ""}${cls ?? ""}`}>{v}</b></div>;

function Mortgage({ S, mAmt }: { S: TokInputs; mAmt: number }) {
  const mg = mortgage(S, mAmt), saved = mg.base.months - mg.withX.months;
  return <div className="tk-block"><h6>① Mortgage paydown <Chip warn>assumed terms</Chip></h6><div className="tk-kv">
    <KV k="Extra principal / month" v={usd(mAmt)} /><KV k="Extra principal / year" v={usd(mAmt * 12)} /><KV k="Scheduled payment (P&I)" v={`${usd(mg.pmt)}/mo`} />
    <KV k="Payoff without extra" v={ym(mg.base.months)} /><KV k="Payoff with extra" v={ym(mg.withX.months)} cls="pos" /><KV k="Time saved" v={saved > 0 ? ym(saved) : "none"} cls="pos" />
    <KV k="Interest saved (est.)" v={usd(mg.base.interest - mg.withX.interest)} cls="pos" /><KV k={`Balance after ${S.years} yr`} v={<>{usd(mg.withX.balAtT)} <small>vs {usd(mg.base.balAtT)}</small></>} /></div>
    <div className="tk-bar" title="share of the original term remaining"><i style={{ width: `${Math.max(2, mg.withX.months / mg.base.months * 100)}%` }} /></div>
    <p className="tk-fine">Payments to the servicer happen off-chain. The {usd(mg.P0)} balance, {(+S.mrate).toFixed(2)}% rate and {S.mterm}-yr term are ASSUMED, not a real loan.</p></div>;
}
function Bills({ bAmt }: { bAmt: number }) {
  let left = bAmt;
  const rows = BILLS.map(([n, a]) => { const cov = Math.min(a, left); left -= cov; return { n, a, cov }; });
  return <div className="tk-block"><h6>③ Bills / spend bucket <Chip warn>example bills</Chip></h6>
    <div className="tk-kv"><KV k="Available per month" v={usd(bAmt, 2)} /><KV k="Left over after the list" v={usd(Math.max(0, left), 2)} /></div>
    {rows.map((r) => <div className="tk-bill" key={r.n}><span>{r.n}</span><b className="mono">{usd(r.cov)} / {usd(r.a)}</b><div className="tk-bar"><i style={{ width: `${r.a ? r.cov / r.a * 100 : 0}%` }} /></div></div>)}
    <p className="tk-fine">Illustrative bill amounts. The homeowner decides where it goes; a real payout would go to a bank/card via an anchor off-ramp, or stay in the wallet.</p></div>;
}

function Chart({ S, c }: { S: TokInputs; c: ReturnType<typeof calc> }) {
  const W = 620, H = 260, L = 74, R = 22, T = 16, B = 34;
  const maxY = Math.max(c.compTotal, c.harvTotal, c.deployed * 1.02, 1), minY = c.deployed * 0.98;
  const X = (t: number) => L + (t / Math.max(1, S.years)) * (W - L - R), Y = (v: number) => T + (1 - (v - minY) / Math.max(1e-9, maxY - minY)) * (H - T - B);
  const path = (f: (t: number) => number) => Array.from({ length: 81 }, (_, k) => { const t = S.years * k / 80; return `${k ? "L" : "M"}${X(t).toFixed(1)},${Y(f(t)).toFixed(1)}`; }).join("");
  const comp = (t: number) => c.deployed * Math.pow(1 + c.rate / 100 / S.freq, S.freq * t), harv = (t: number) => c.deployed + c.deployed * c.rate / 100 * t;
  const step = Math.max(1, Math.ceil(S.years / 8)); const ticks: number[] = []; for (let t = 0; t <= S.years; t += step) ticks.push(t);
  const key = `${S.deploy}-${S.freq}-${S.years}-${S.mode}-${S.live}`;
  return <div className="tk-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Illustrative growth of the lent amount over ${S.years} years: ${usd(c.deployed)} grows to ${usd(c.compTotal)} compounded or ${usd(c.harvTotal)} if yield is paid out`}>
      {[0, 1, 2, 3, 4].map((i) => { const v = minY + (maxY - minY) * i / 4, y = Y(v); return <g key={i}><line x1={L} x2={W - R} y1={y} y2={y} stroke="rgba(170,190,220,.18)" /><text x={4} y={y + 4} className="tk-ax">{usd(v)}</text></g>; })}
      {ticks.map((t) => <text key={t} x={Math.min(X(t) - 10, W - 40)} y={H - 12} className="tk-ax">yr {t}</text>)}
      <path d={path(() => c.deployed)} fill="none" stroke="#8fa6c8" strokeDasharray="5 4" strokeWidth="1.5" />
      <path d={path(harv)} fill="none" stroke="#9cc8f0" strokeWidth="2" />
      <path key={key} className="tk-draw" d={path(comp)} fill="none" stroke="#f2f6fc" strokeWidth="2.6" pathLength={1} />
      <text x={Math.max(L, X(S.years) - 92)} y={Y(c.compTotal) - 8} className="tk-ax hi">{usd(c.compTotal)}</text>
      <text x={Math.max(L, X(S.years) - 92)} y={Y(c.harvTotal) + 16} className="tk-ax blue">{usd(c.harvTotal)}</text>
      <text x={L + 6} y={T + 10} className="tk-ax">ESTIMATE · ILLUSTRATIVE · {c.usingLive ? "manual" : "ASSUMED"} {c.rate.toFixed(2)}%</text>
    </svg>
    <div className="tk-legend"><span><i style={{ background: "#f2f6fc" }} />Fully compounded (yield reinvested)</span><span><i style={{ background: "#9cc8f0" }} />Harvested (yield paid out, no compounding)</span><span><i style={{ background: "#8fa6c8" }} />Principal lent</span></div>
  </div>;
}

function Mock({ tab, S, c, sp }: { tab: string; S: TokInputs; c: ReturnType<typeof calc>; sp: ReturnType<typeof split> }) {
  const row = (a: string, b: string) => <div className="row" key={a}><span>{a}</span><span>{b}</span></div>;
  const tx = (n: number, h: string, ops: string[]) => <div className="tx" key={n}><div className="h"><span>#{n} · hash 0000…EXAMPLE{n}</span><span>TESTNET · fake · {h}</span></div>{ops.map((o, i) => <div className="op" key={i}>{o}</div>)}</div>;
  const harvest = S.dest === "mortgage" ? ["invoke vault.harvest() → blend_pool.submit(Withdraw interest)", `payment vault → anchor-account EXUSD ${num(c.monthly * sp.m, 2)} · memo:'SERVICER-REF-EXAMPLE'`, "off-chain anchor/SEP-24 withdrawal → servicer applies as extra principal (not real)"]
    : S.dest === "income" ? ["invoke vault.harvest() → blend_pool.submit(Withdraw interest)", `payment vault → ${OWN} EXUSD ${num(c.monthly * sp.i, 2)}`]
    : S.dest === "bills" ? ["invoke vault.harvest() → blend_pool.submit(Withdraw interest)", `payment vault → ${OWN} EXUSD ${num(c.monthly * sp.b, 2)} · memo:'BILLS'`, "off-chain owner spends via bank/card off-ramp (illustrative)"]
    : ["invoke vault.harvest() → blend_pool.submit(Withdraw interest)", `payment ${num(c.monthly * sp.i, 2)} EXUSD → owner · payment ${num(c.monthly * sp.b, 2)} EXUSD → bills bucket`, `payment ${num(c.monthly * sp.m, 2)} EXUSD → anchor-account (servicer, off-chain)`];
  if (tab === "asset") return <div className="tk-mock"><h6>HOUSE1 · real estate share token</h6>{[["Network", "Stellar TESTNET (concept)"], ["Asset code", "HOUSE1 (made up)"], ["Asset type", "credit_alphanum12"], ["Issuer", ISS], ["Represents", "500,000 shares of EXAMPLE HOUSE 1 SPV LLC (fictional)"], ["Reference value", "$1.00 / share (illustrative)"], ["Circulating supply", "500,000.0000000"], ["Holders", "1 (homeowner)"], ["Regulated (SEP-8)", "yes · approval server: example.invalid"], ["Clawback", "enabled (compliance)"], ["Vault (Soroban)", TRE], ["Blend pool", POOL], ["Price oracle (SEP-40)", ORA], ["Lent now", `${usd(c.deployed)} (${Math.min(50, S.deploy)}% of value)`]].map(([a, b]) => row(a, b))}</div>;
  if (tab === "issuer") return <div className="tk-mock"><h6>Issuer account flags</h6>{row("Account", ISS)}{row("home_domain", "house1.example.invalid")}
    <div className="flag"><i />AUTH_REQUIRED (0x1) · issuer must approve each trustline</div><div className="flag"><i />AUTH_REVOCABLE (0x2) · issuer can freeze / limit a trustline</div><div className="flag"><i />AUTH_CLAWBACK_ENABLED (0x8) · needs revocable; compliance recovery</div><div className="flag"><i className="off" />AUTH_IMMUTABLE (0x4) · NOT set (it would remove these controls)</div>
    {row("Signers", "multisig 2-of-3 (concept)")}<p className="tk-fine">set_options flags = 0x1 | 0x2 | 0x8 = 11. An issuer that keeps these powers cannot be locked, so key custody and governance matter.</p></div>;
  if (tab === "txs") return <div className="tk-mock">
    {tx(1, "setup", [`create_account ${ISS}`, `create_account ${DIST} (testnet: funded by Friendbot)`])}
    {tx(2, "flags", [`set_options ${ISS} set_flags=11 home_domain=house1.example.invalid`])}
    {tx(3, "trust", [`change_trust ${OWN} → HOUSE1:${ISS} limit 500000`, `set_trust_line_flags issuer authorizes ${OWN} (AUTHORIZED)`])}
    {tx(4, "mint", [`payment ${ISS} → ${DIST} 500000 HOUSE1`, `payment ${DIST} → ${OWN} 500000 HOUSE1`])}
    {tx(5, "record", [`invoke ${TRE} record_property(value=500000, appraisal_hash=0xEXAMPLE)`])}
    {tx(6, "price", [`invoke ${ORA} lastprice(Asset::Other('XLM')) → PriceData{price (÷10^decimals()), timestamp}`])}
    {tx(7, "lend", [`invoke ${TRE} allocate(${num(c.deployed)}) → ${POOL} submit(requests=[{SupplyCollateral, asset=EXUSD, amount}])`])}
    {tx(8, "harvest", harvest)}</div>;
  return <div className="tk-mock"><pre>{`[DOCUMENTATION]
ORG_NAME="Example House 1 SPV LLC (FICTIONAL)"

[[CURRENCIES]]
code="HOUSE1"
issuer="${ISS}"
name="Example House 1 share (fictional)"
desc="Illustrative real estate share token. Not an offer."
anchor_asset_type="realestate"
is_asset_anchored=false
regulated=true
approval_server="https://approval.example.invalid/tx-approve"
approval_criteria="KYC + holder limits + lock-up (illustrative)"

TRANSFER_SERVER_SEP0024="https://anchor.example.invalid/sep24"`}</pre></div>;
}
