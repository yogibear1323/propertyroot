import SizzleVideo from "../components/SizzleVideo";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LaunchApp } from "../App";
import { expertContract } from "../lib/config";
import { LTV_BPS, PR, fromStroop, readNextId, readReserve, readSharePrice, readXlmPrice } from "../lib/propertyRoot";
import { Waitlist } from "./Demo";
import LiveCalc from "./LiveCalc";
import "../theme/propertyroot.css";
import "../theme/landing.css";

const BASE = import.meta.env.BASE_URL;
const LOGO = `${BASE}brand/option-a-roots-house.svg`;

/** Adds .in when a section scrolls into view (CSS animates it; reduced motion shows it immediately). */
function Reveal({ children, className = "", id, label }: { children: React.ReactNode; className?: string; id?: string; label?: string }) {
  const r = useRef<HTMLElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = r.current;
    if (!el || typeof IntersectionObserver === "undefined") { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0, rootMargin: "0px 0px -40px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <section ref={r} id={id} aria-label={label} className={`la-sec reveal${on ? " in" : ""} ${className}`}>{children}</section>;
}

function LiveStats() {
  const [s, setS] = useState<{ price?: number; ts?: number; share?: number; reserve?: number; props?: number; err?: boolean }>({});
  useEffect(() => {
    let on = true;
    Promise.allSettled([readXlmPrice(), readSharePrice(), readReserve(), readNextId()]).then(([p, sh, r, n]) => {
      if (!on) return;
      setS({
        price: p.status === "fulfilled" ? p.value.usd : undefined, ts: p.status === "fulfilled" ? p.value.ts : undefined,
        share: sh.status === "fulfilled" ? Number(sh.value) / 1e7 : undefined,
        reserve: r.status === "fulfilled" ? fromStroop(r.value) : undefined,
        props: n.status === "fulfilled" ? Number(n.value) : undefined,
        err: [p, sh, r, n].every((x) => x.status === "rejected"),
      });
    });
    return () => { on = false; };
  }, []);
  const v = (x: string | undefined) => x ?? (s.err ? "unavailable" : "reading…");
  return (
    <div className="la-stats" data-testid="la-stats" aria-live="polite">
      <div><span>XLM/USD from Reflector</span><b className="mono">{v(s.price ? `$${s.price.toFixed(4)}` : undefined)}</b><small>{s.ts ? `oracle time ${new Date(s.ts * 1000).toLocaleTimeString()}` : "read from the vault contract"}</small></div>
      <div><span>Blend vault share price</span><b className="mono">{v(s.share ? s.share.toFixed(7) : undefined)}</b><small>XLM per share · grows as interest compounds</small></div>
      <div><span>Properties attested</span><b className="mono">{v(s.props !== undefined ? String(Math.max(0, s.props - 1)) : undefined)}</b><small>registry next_id − 1 (demo records)</small></div>
      <div><span>Demo liquidity reserve</span><b className="mono">{v(s.reserve !== undefined ? `${Math.round(s.reserve).toLocaleString("en-US")} XLM` : undefined)}</b><small>stands in for a lender</small></div>
      {s.err && <p className="la-note">Couldn't reach Stellar testnet RPC right now. Nothing is shown in place of real numbers.</p>}
    </div>
  );
}

const STEPS = [
  { t: "Appraise & verify", b: "An appraiser values the home or land, and title and identity are checked off-chain. A hash of the appraisal goes on Stellar as an attestation.", tag: "Simulated in the demo" },
  { t: "Tokenize to pRT", b: `A Soroban vault mints a pRT token (SEP-41) for up to ${LTV_BPS / 100}% of the appraised value. New appraisals move the cap up or down.`, tag: "Soroban + SEP-41" },
  { t: "Earn via Blend", b: "Put pRT to work: matched XLM, priced by Reflector, is supplied to Blend lending. Borrowers pay interest, and it compounds into your vault share.", tag: "Blend v2 + Reflector" },
];

const TECH = [
  { n: "Soroban contracts", b: "Attestation registry, property vault and Blend adapter, written in Rust.", id: PR.contracts.propertyVault },
  { n: "pRT · SEP-41 token", b: "One token contract per property, minted by the vault up to the LTV cap.", id: PR.contracts.attestationRegistry, idLabel: "Registry" },
  { n: "Blend v2 lending", b: "The adapter supplies XLM to Blend's testnet pool and tracks shares.", id: PR.external.blendPool },
  { n: "Reflector oracle", b: "SEP-40 XLM/USD price. Prices older than 30 minutes are rejected.", id: PR.external.reflector },
  { n: "Freighter wallet", b: "Connect Freighter on Testnet, or use a local testnet key in your browser.", href: "https://www.freighter.app/" },
];

const SHOTS = [
  { f: "step1.png", c: "1 · Attest a simulated appraisal" },
  { f: "step2.png", c: "2 · Mint your pRT token" },
  { f: "step3.png", c: "3 · Earn in Blend, then withdraw with interest" },
];

const FAQ = [
  ["Is this real property or real money?", "No. It runs on Stellar testnet, where XLM has no value. The appraisal, title check and KYC are simulated, and a pRT token is not a deed."],
  ["Where does the yield come from?", "From Blend borrowers paying interest on the XLM supplied to the pool. The property itself doesn't produce it. Rates are variable and right now they're close to zero on testnet."],
  ["Why only Stellar?", "Everything on-chain uses Stellar: Soroban contracts, SEP-41 tokens, Blend, Reflector and Freighter. Only the legal title and the appraisal live off-chain, because no blockchain can do those."],
  ["What do I need to try it?", "A testnet account with a little XLM for fees. Friendbot funds one for free, and the app can create one for you."],
  ["Is the code open?", "Yes. The contracts, deployment file and this site are in the public propertyroot repo on GitHub."],
];

export default function Landing() {
  return (
    <div className="pr-page la">
      <section className="la-hero" aria-labelledby="la-h1">
        <div className="la-orbs" aria-hidden="true"><i /><i /><i /></div>
        <img src={LOGO} alt="PropertyRoot logo: roots growing into a small house" className="la-logo" width={168} height={168} />
        <div className="la-hero-copy">
          <div className="kicker">Quasaria PropertyRoot · Stellar testnet</div>
          <h1 id="la-h1">Your home has roots.<br /><span>Let its value grow.</span></h1>
          <p>PropertyRoot puts the value of a home or land to work on Stellar. Tokenize the appraised value, supply it to Blend lending, and watch interest compound, all in a few clicks on testnet.</p>
          <div className="la-ctas"><LaunchApp big /><Link to="/app" className="la-ghost">Try the testnet demo</Link></div>
          <p className="la-fine">Demo only · unaudited · not legal title</p>
        </div>
      </section>
      <SizzleVideo />

      <Reveal label="What PropertyRoot is" className="la-what">
        <h2>Real estate value, put to work</h2>
        <p className="la-lead">Most property value just sits there. PropertyRoot records an appraisal on Stellar, turns part of that value into a token you hold, and lets that token earn lending yield, without selling the property.</p>
      </Reveal>

      <Reveal id="how" label="How it works">
        <h2>How it works</h2>
        <ol className="la-steps">
          {STEPS.map((s, i) => (
            <li key={s.t} style={{ ["--d" as string]: `${i * 140}ms` }}>
              <span className="la-n" aria-hidden="true">{i + 1}</span>
              <h3>{s.t}</h3><p>{s.b}</p><small>{s.tag}</small>
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal id="tech" label="The tech">
        <h2>Built only on Stellar</h2>
        <p className="la-lead">Live numbers below are read straight from the testnet contracts and Reflector each time you load the page.</p>
        <LiveStats />
        <div className="la-tech">
          {TECH.map((t) => (
            <div key={t.n} className="pr-card">
              <h3>{t.n}</h3><p>{t.b}</p>
              {t.id && <a className="mono la-id" href={expertContract(t.id)} target="_blank" rel="noreferrer">{t.idLabel ?? "Contract"} {t.id.slice(0, 6)}…{t.id.slice(-4)} ↗</a>}
              {t.href && <a className="la-id" href={t.href} target="_blank" rel="noreferrer">freighter.app ↗</a>}
            </div>
          ))}
        </div>
        <p className="muted pr-small">Blend adapter <a className="mono" href={expertContract(PR.contracts.blendAdapter)} target="_blank" rel="noreferrer">{PR.contracts.blendAdapter.slice(0, 6)}…{PR.contracts.blendAdapter.slice(-4)} ↗</a> · all links open stellar.expert (testnet)</p>
      </Reveal>

      <Reveal label="Demo walkthrough">
        <h2>The demo in three screens</h2>
        <div className="la-shots">
          {SHOTS.map((s) => (
            <figure key={s.f}><img src={`${BASE}shots/${s.f}`} alt={`Demo screenshot: ${s.c}`} loading="lazy" width={800} height={500} /><figcaption>{s.c}</figcaption></figure>
          ))}
        </div>
        <div className="la-ctas center"><LaunchApp label="Open the demo" /></div>
      </Reveal>

      <Reveal label="Yield calculator">
        <h2>Play with the numbers <small>(estimate)</small></h2>
        <p className="la-lead">Change the inputs and everything updates as you type. Switch to the live Blend rate to see what the testnet pool pays right now.</p>
        <LiveCalc />
      </Reveal>

      <Reveal label="Risks" className="la-risk">
        <h2>Honest fine print</h2>
        <ul>
          <li><b>Demo only, not legal title.</b> A token is not a deed. A real version needs a trust or company holding title, licensed appraisers, KYC and likely securities approval.</li>
          <li><b>Simulated steps.</b> Appraisal, title and KYC are simulated here, and the matched XLM comes from a demo reserve capped per deposit.</li>
          <li><b>Lending risk.</b> Blend can have high utilization, bad debt or bugs, and a real loan against pRT could be liquidated if values fall.</li>
          <li><b>Oracle risk.</b> A wrong Reflector price would misprice deposits, even with the 30-minute staleness check.</li>
          <li><b>Unaudited.</b> The contracts haven't been audited. Testnet only.</li>
        </ul>
      </Reveal>

      <Reveal label="Roadmap">
        <h2>Where it could go</h2>
        <ol className="la-road">
          <li className="now"><b>Now</b><span>Testnet demo: attest, tokenize, earn through Blend with Reflector prices.</span></li>
          <li><b>Planned</b><span>Independent security audit of the Soroban contracts.</span></li>
          <li><b>Planned</b><span>A legal and title partner to hold property in trust and handle real appraisals and KYC.</span></li>
          <li><b>Planned</b><span>Real lending liquidity instead of the demo reserve.</span></li>
        </ol>
        <p className="muted pr-small">These are plans, not promises. Dates depend on the audit, legal review and regulators.</p>
      </Reveal>

      <Reveal id="faq" label="FAQ">
        <h2>Questions</h2>
        <div className="la-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      </Reveal>

      <Reveal label="Waitlist">
        <h2>Join the waitlist</h2>
        <p className="la-lead">Saved only in this browser. Nothing is sent anywhere.</p>
        <Waitlist />
      </Reveal>

      <section className="la-final" aria-label="Launch the app">
        <h2>Ready to grow some roots?</h2>
        <p>Run the whole flow on Stellar testnet in about two minutes.</p>
        <LaunchApp big />
      </section>
    </div>
  );
}
