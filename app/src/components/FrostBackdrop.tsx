import yeti from "../assets/yeti-cutout.webp";
import yetiBg from "../assets/yeti-cutout-lg.webp";
/** Frost backdrop (shared Quasaria look): stormy starry sky, snowy mountain range, gentle falling snow (off under
 *  reduced motion), frost Stellar coins and a parka yeti standing on the snow. Decorative; aria-hidden. */
export default function FrostBackdrop() {
  return (
    <div className="world-bg frost-layer" aria-hidden="true">
      <div className="wb-sky" />
      <div className="wb-stars" />
      <div className="wb-mtn" />
      <div className="wb-snow"><i /><i /><i /></div>
      <div className="wb-coins"><i /><i /><i /><i /><i /><i /></div>
      <div className="wb-yeti-photo" style={{ backgroundImage: `url(${yetiBg})` }} />
      <img className="parka-yeti wb-yeti" src={yeti} alt="" />
    </div>
  );
}
