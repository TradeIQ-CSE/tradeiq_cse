import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** Long enough to read as "working", short enough never to feel like a wait. */
export const RUN_REVEAL_MS = 2400;

/** True when the viewer has asked their device for less motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Whether to play the intro: only straight after the user pressed Run (the
 * navigation carries `justRan`), never on a reload, a revisit or with reduced
 * motion. `finish` drops the flag from history so a reload shows results
 * directly.
 */
export function useRunReveal() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { justRan?: boolean } | null;
  const [playing, setPlaying] = useState(
    () => state?.justRan === true && !prefersReducedMotion(),
  );

  const finish = useCallback(() => {
    setPlaying(false);
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: { ...(location.state as object | null), justRan: false },
    });
  }, [location.pathname, location.search, location.state, navigate]);

  return { playing, finish };
}
