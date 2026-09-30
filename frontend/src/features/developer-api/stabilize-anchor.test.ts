import { afterEach, describe, expect, it, vi } from 'vitest';
import { stabilizeAnchor } from './stabilize-anchor';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });
function layout() {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  document.body.innerHTML = '<main id="reference-main"><section id="get-ohlcv"></section></main>';
  const root = document.getElementById('reference-main')!;
  const target = document.getElementById('get-ohlcv')!;
  let top = 2000;
  const scroll = vi.fn(() => { top = 112; });
  target.scrollIntoView = scroll;
  vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => ({ top }) as DOMRect);
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ scrollMarginTop: '112px' } as CSSStyleDeclaration);
  return { root, scroll, lateLayout: () => { top = 2300; } };
}
describe('pending reference anchor layout reconciliation', () => {
  it('corrects post-mount table layout, then releases its animation frames', () => {
    const state = layout();
    stabilizeAnchor('get-ohlcv', state.root);
    vi.advanceTimersByTime(100);
    expect(state.scroll).toHaveBeenCalledTimes(1);
    state.lateLayout();
    vi.advanceTimersByTime(200);
    expect(state.scroll).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('stops immediately on deliberate user scrolling instead of fighting the reader', () => {
    const state = layout();
    stabilizeAnchor('get-ohlcv', state.root);
    vi.advanceTimersByTime(100);
    window.dispatchEvent(new WheelEvent('wheel'));
    state.lateLayout();
    vi.advanceTimersByTime(5000);
    expect(state.scroll).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds missing anchors and removes pending work on unmount', () => {
    const state = layout();
    const cleanup = stabilizeAnchor('missing', state.root);
    vi.advanceTimersByTime(100);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
    stabilizeAnchor('missing', state.root);
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
