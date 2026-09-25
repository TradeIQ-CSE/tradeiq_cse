import { useEffect, useRef } from "react";
import { AppPanel } from "@/components/application/layout/application-layout";
import { RUN_REVEAL_MS } from "./useRunReveal";

const WIDTH = 720;
const HEIGHT = 180;

/**
 * A fixed, decorative line: a gentle climb with a few dips. It never uses the
 * run's own figures, so it can't be read as a preview of the result.
 */
const LINE = [
  [0, 150], [40, 142], [80, 146], [120, 128], [160, 134], [200, 118],
  [240, 122], [280, 104], [320, 112], [360, 96], [400, 100], [440, 82],
  [480, 90], [520, 72], [560, 78], [600, 58], [640, 64], [680, 44], [720, 36],
]
  .map(([x, y]) => `${x},${y}`)
  .join(" ");

/**
 * A short, purely decorative intro shown right after a run: a line draws left
 * to right while a percentage counts to 100%, then the results take over.
 *
 * Kept cheap on purpose. The results are already loaded, so nothing waits on
 * the network; the line is a fixed SVG uncovered by a CSS clip on the
 * compositor; and the only per-frame work is writing one number into a text
 * node — no React renders.
 */
export function RunReveal({ onDone }: { onDone: () => void }) {
  const percentRef = useRef<HTMLSpanElement>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / RUN_REVEAL_MS, 1);
      if (percentRef.current) {
        percentRef.current.textContent = `${Math.round(progress * 100)}%`;
      }
      if (progress < 1) frame = requestAnimationFrame(tick);
      else onDoneRef.current();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <AppPanel className="flex flex-col gap-4" aria-busy="true">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-headline-medium text-text-primary">
          Running your test
        </h2>
        <span
          ref={percentRef}
          className="text-title-2-medium tabular-nums text-text-primary"
          aria-hidden
        >
          0%
        </span>
      </div>
      <div className="h-48 rounded-2xl border border-border-button-default bg-background-secondary-default p-3">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="run-reveal-line h-full w-full overflow-visible"
          style={{ animationDuration: `${RUN_REVEAL_MS}ms` }}
          aria-hidden
        >
          <polyline
            points={LINE}
            fill="none"
            stroke="var(--color-chart-1)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <p className="sr-only" role="status">
        Running your test
      </p>
    </AppPanel>
  );
}

