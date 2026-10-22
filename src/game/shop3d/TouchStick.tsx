import { useRef, useState } from "react";
import { floatStick } from "../joystick";
import { IDLE_STICK_ALPHA, PAD_ALPHA, PAD_SCALE, type PadPrefs } from "../padPrefs";

// The shop's touch stick, by day and by night (user 2026-10-22, after Dave the Diver mobile's invisible
// stick): faint at its home inward of the notebook; a thumb anywhere in the bottom-left part of the shop
// brings it there. Left and right only (the shop is one aisle). onMove gets -1..1, null when let go.
// In the 960x540 layer's pixels; one art pixel is two layer pixels at the normal size.
const HOME = { x: 180, y: 448 };
const ZONE = { left: 0, top: 300, width: 440, height: 240 };
const DISH = 96;
const KNOB = { w: 36, h: 34 };
const TRAVEL = 30;

export function TouchStick({ prefs, onMove }: { prefs: PadPrefs; onMove: (v: number | null) => void }) {
  const f = PAD_SCALE[prefs.size];
  const half = (DISH * f) / 2;
  const [held, setHeld] = useState<{ x: number; y: number } | null>(null);
  const [push, setPush] = useState(0);
  const zone = useRef<HTMLDivElement>(null);
  // the pointer in layer pixels (the layer is scaled to fit the screen)
  const at = (e: React.PointerEvent) => {
    const box = zone.current!.getBoundingClientRect();
    const k = box.width / ZONE.width;
    return { x: ZONE.left + (e.clientX - box.left) / k, y: ZONE.top + (e.clientY - box.top) / k };
  };
  const move = (e: React.PointerEvent, centre: { x: number }) => {
    const dx = (at(e).x - centre.x) / (TRAVEL * f);
    const v = Math.abs(dx) < 0.25 ? 0 : Math.max(-1, Math.min(1, dx));
    setPush(v);
    onMove(v);
  };
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    // the picture is 960 wide or more (layerFit): its HUD box is that wide, unscaled
    const centre = floatStick(at(e), half, zone.current!.parentElement!.offsetWidth, 540, ZONE.top - half);
    setHeld(centre);
    move(e, centre);
  };
  const up = () => (setHeld(null), setPush(0), onMove(null));
  const centre = held ?? HOME;
  const alpha = PAD_ALPHA[prefs.alpha] * (held ? 1 : IDLE_STICK_ALPHA);
  return (
    <>
      <div ref={zone} className="s3-stick-zone" style={ZONE} onPointerDown={down} onPointerMove={(e) => held && e.buttons && move(e, held)} onPointerUp={up} onPointerCancel={up} />
      <div className="s3-stick" style={{ left: centre.x - half, top: centre.y - half, width: DISH * f, height: DISH * f, opacity: alpha }}>
        <div className="s3-knob" style={{ left: half - (KNOB.w * f) / 2, top: half - (KNOB.h * f) / 2, width: KNOB.w * f, height: KNOB.h * f, transform: `translateX(${push * TRAVEL * f}px)` }} />
      </div>
    </>
  );
}

// The shop's action button at the pad's size and shade (shop3d.css reads --pad).
export const padButton = (prefs: PadPrefs): React.CSSProperties => ({ ["--pad" as string]: PAD_SCALE[prefs.size], opacity: PAD_ALPHA[prefs.alpha] });
