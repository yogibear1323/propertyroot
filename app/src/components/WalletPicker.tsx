import { useEffect, useState } from "react";
import { useWallet } from "../lib/wallet";
import { listWallets, type WalletOption } from "../lib/walletKit";

/** Frost-styled wallet picker (Stellar testnet). Lists the kit's wallets plus Lumexo as "coming soon". */
export default function WalletPicker() {
  const w = useWallet();
  const [list, setList] = useState<WalletOption[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { listWallets().then(setList).catch((e) => setErr(String(e?.message ?? e))); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && w.closePicker(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [w]);
  return (
    <div className="wp-scrim" role="presentation" onClick={w.closePicker}>
      <div className="wp-card" role="dialog" aria-modal="true" aria-label="Choose a Stellar wallet" onClick={(e) => e.stopPropagation()}>
        <div className="wp-head"><h3>Connect a wallet</h3><button className="wp-x" aria-label="Close" onClick={w.closePicker}>×</button></div>
        <p className="wp-sub">Stellar <b>testnet</b> only. Switch your wallet to Testnet before signing.</p>
        {err && <p className="pr-msg err">Couldn't load wallets: {err}</p>}
        <ul className="wp-list">
          {!list && !err && <li className="muted">Checking installed wallets…</li>}
          {list?.map((o) => (
            <li key={o.id}>
              <button className="wp-item" disabled={w.connecting} onClick={() => w.connectWith(o)} data-wallet={o.id}>
                <img src={o.icon} alt="" width={28} height={28} />
                <span className="wp-name">{o.name}</span>
                <span className={`wp-tag${o.isAvailable ? " ok" : ""}`}>{o.isAvailable ? (w.walletId === o.id ? "Connected" : "Ready") : "Not installed"}</span>
              </button>
            </li>
          ))}
          <li>
            <div className="wp-item soon" aria-disabled="true">
              <span className="wp-dot" aria-hidden>L</span>
              <span className="wp-name">Lumexo <small>coming soon</small></span>
              <span className="wp-tag">No dapp connect yet</span>
            </div>
          </li>
        </ul>
        {w.error && <p className="pr-msg err" role="alert">{w.error}</p>}
        <p className="wp-foot muted">Lumexo is a Stellar web wallet but doesn't offer a browser extension or connect API yet. You can use any wallet above, or a testnet key.</p>
        <button className="pr-btn ghost" onClick={() => { w.closePicker(); w.openModal(); }}>Use a testnet key instead</button>
      </div>
    </div>
  );
}
