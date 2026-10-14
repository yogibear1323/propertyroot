import { useEffect, useRef, useState } from "react";

const BASE = import.meta.env.BASE_URL;
const SRC = `${BASE}media/propertyroot-sizzle-frost`;

/** Homepage sizzle: muted autoplay loop, click for sound. Under prefers-reduced-motion only the poster shows (no autoplay). */
export default function SizzleVideo() {
  const v = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)"); if (!m) return;
    const on = () => setReduced(m.matches); m.addEventListener?.("change", on); return () => m.removeEventListener?.("change", on);
  }, []);
  useEffect(() => { const el = v.current; if (!el) return; if (reduced) el.pause(); else el.play().catch(() => {}); }, [reduced]);
  const sound = () => {
    const el = v.current; if (!el) return;
    if (reduced) { el.controls = true; el.muted = false; setMuted(false); el.play().catch(() => {}); return; }
    el.muted = !el.muted; setMuted(el.muted); if (!el.muted) { el.currentTime = 0; el.play().catch(() => {}); }
  };
  return (
    <section className="la-sizzle" aria-label="PropertyRoot in 40 seconds">
      <div className="la-sizzle-frame">
        <video ref={v} data-testid="la-sizzle" muted loop playsInline autoPlay={!reduced} preload={reduced ? "none" : "metadata"}
          poster={`${SRC}-poster.jpg`} width={1280} height={720} onClick={sound}
          aria-label="PropertyRoot sizzle video: enter an address, see a demo Zillow estimate, record it on Stellar testnet, watch it compound, tokenize it">
          <source src={`${SRC}.webm`} type="video/webm" />
          <source src={`${SRC}.mp4`} type="video/mp4" />
        </video>
        <button type="button" className="la-sizzle-sound" onClick={sound} aria-pressed={!muted}>
          {reduced && muted ? "▶ Play with sound" : muted ? "🔇 Tap for sound" : "🔊 Sound on"}
        </button>
      </div>
      <p className="la-fine">Demo numbers only · Stellar testnet</p>
    </section>
  );
}
