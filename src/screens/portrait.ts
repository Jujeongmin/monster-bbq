import { useEffect, useState } from "react";

// The game is landscape only (one 16:9 frame). A phone held upright would shrink it to a thin strip, so it
// asks to be turned (RotatePrompt) and the hunt and the night wait meanwhile (mobile pass, user 2026-10-21).
export const isPortraitTouch = (w: number, h: number, touch: boolean): boolean => touch && h > w;

const touchScreen = () => typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0 || new URLSearchParams(location.search).has("touch"));

export function usePortrait(): boolean {
  const read = () => typeof window !== "undefined" && isPortraitTouch(window.innerWidth, window.innerHeight, touchScreen());
  const [portrait, setPortrait] = useState(read);
  useEffect(() => {
    const on = () => setPortrait(read());
    addEventListener("resize", on);
    addEventListener("orientationchange", on);
    return () => {
      removeEventListener("resize", on);
      removeEventListener("orientationchange", on);
    };
  }, []);
  return portrait;
}
