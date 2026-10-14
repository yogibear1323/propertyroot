import { Link, Route, Routes } from "react-router-dom";
import { useWallet } from "./lib/wallet";
import AccountModal from "./pages/AccountModal";
import Demo from "./pages/Demo";
import WalletPicker from "./components/WalletPicker";
import Landing from "./pages/Landing";

const LOGO = `${import.meta.env.BASE_URL}brand/option-a-roots-house.svg`;

export function Sprout() {
  return (
    <svg className="la-sprout" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 22V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path className="la-leaf l" d="M12 13C8 13 5.5 10.5 5.5 6.5 9.5 6.5 12 9 12 13Z" fill="currentColor" />
      <path className="la-leaf r" d="M12 11c0-4 2.5-6.5 6.5-6.5 0 4-2.5 6.5-6.5 6.5Z" fill="currentColor" />
      <path className="la-root" d="M12 22c-2 0-3.5 1-4.5 1.5M12 22c2 0 3.5 1 4.5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** The primary "Launch App" pill: a real link to /app (router Link renders <a href>). */
export function LaunchApp({ big = false, label = "Launch App" }: { big?: boolean; label?: string }) {
  return <Link to="/app" className={`la-btn${big ? " big" : ""}`}><Sprout /><span>{label}</span></Link>;
}

function Header({ app }: { app?: boolean }) {
  return (
    <header className="pr-top">
      <Link to="/" className="pr-brand" aria-label="Quasaria PropertyRoot home">
        <img src={LOGO} alt="" width={34} height={34} /><span><b>PropertyRoot</b><small>by Quasaria</small></span>
      </Link>
      <nav aria-label="Main">
        {!app && <><a href="#how">How it works</a><a href="#tech">Tech</a><a href="#faq">FAQ</a></>}
        {app ? <Link to="/" className="pr-navlink">← Overview</Link> : <LaunchApp />}
      </nav>
    </header>
  );
}

export default function App() {
  const w = useWallet();
  return (
    <div className="pr-shell">
      <a className="skip" href="#main">Skip to content</a>
      <Routes>
        <Route path="/app" element={<><Header app /><main id="main" className="pr-main"><Demo /></main></>} />
        <Route path="*" element={<><Header /><main id="main"><Landing /></main></>} />
      </Routes>
      {w.error && !w.modalOpen && !w.pickerOpen && <div className="pr-banner pr-err" role="alert">{w.error}</div>}
      {w.modalOpen && <AccountModal />}
      {w.pickerOpen && <WalletPicker />}
      <footer className="pr-foot">Quasaria PropertyRoot · Stellar testnet demo · unaudited · not legal title · <a href="https://github.com/yogibear1323/propertyroot">source</a></footer>
    </div>
  );
}
