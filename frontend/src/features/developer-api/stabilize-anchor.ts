/** Reconcile one pending anchor while lazy table/font layout settles.
 * Bounded to four seconds; any deliberate reader interaction cancels it.
 * No observer or scrolling remains after completion/unmount.
 */
export function stabilizeAnchor(id: string, root: HTMLElement): () => void {
  const started = performance.now();
  let stableSince = started;
  let previousGeometry = '';
  let frame = 0;
  let stopped = false;
  let fontsReady = !document.fonts;
  if (document.fonts) void document.fonts.ready.then(() => { fontsReady = true; });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchmove', stop);
    window.removeEventListener('pointerdown', stop);
    window.removeEventListener('keydown', keydown);
  };
  const keydown = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab'].includes(event.key)) stop();
  };
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchmove', stop, { passive: true });
  window.addEventListener('pointerdown', stop, { passive: true });
  window.addEventListener('keydown', keydown);
  const tick = (now: number) => {
    if (stopped) return;
    if (now - started >= 4000) { stop(); return; }
    const target = document.getElementById(id);
    if (target) {
      const geometry = `${root.scrollHeight}:${root.getBoundingClientRect().height}:${target.offsetTop}:${window.innerWidth}`;
      if (geometry !== previousGeometry) { previousGeometry = geometry; stableSince = now; }
      const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      const top = target.getBoundingClientRect().top;
      if (Math.abs(top - margin) > 2) {
        target.scrollIntoView({ block: 'start', behavior: 'instant' });
        stableSince = now;
      }
      // A minimum settling window catches React Aria's post-mount collections;
      // wait for fonts as well, then stop once the layout has stayed stable.
      if (fontsReady && now - started >= 1000 && now - stableSince >= 150) { stop(); return; }
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return stop;
}
