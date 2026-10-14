const BASE = import.meta.env.BASE_URL;

/** Click-to-play explainer in the frosted frame (no autoplay; plays with sound when the user presses play). */
export default function ExplainerVideo({ name, title, testId }: { name: string; title: string; testId: string }) {
  const src = `${BASE}media/${name}`;
  return (
    <div className="la-sizzle la-explainer">
      <div className="la-sizzle-frame">
        <video data-testid={testId} controls playsInline preload="none" poster={`${src}-poster.jpg`} width={1280} height={720} aria-label={title}>
          <source src={`${src}.webm`} type="video/webm" />
          <source src={`${src}.mp4`} type="video/mp4" />
        </video>
      </div>
      <p className="la-fine">Demo numbers only · Stellar testnet · non-custodial</p>
    </div>
  );
}
