import yeti from "../assets/parka-yeti.svg";
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
      <img className="parka-yeti wb-yeti" src={yeti} alt="" />
    </div>
  );
}
