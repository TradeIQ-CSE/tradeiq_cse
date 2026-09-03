import '@testing-library/jest-dom/vitest';
// i18next initialises synchronously on import, and main.tsx renders with no
// I18nextProvider — components reach the singleton directly. Importing it
// once here mirrors production.
import i18n, { DEFAULT_LANGUAGE } from '../i18n';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';

// --- window.matchMedia -----------------------------------------------------
// antd's Grid.useBreakpoint() (used by AppShell) subscribes through
// matchMedia, and jsdom has no implementation at all. Model a real viewport
// width so both "max-width" and "min-width" queries resolve consistently,
// default to a desktop width, and let tests flip to mobile.

type ChangeListener = (event: MediaQueryListEvent) => void;

const DESKTOP_WIDTH = 1280;
const MOBILE_WIDTH = 375;

let viewportWidth = DESKTOP_WIDTH;
const liveQueries = new Set<MockMediaQueryList>();

function queryMatchesWidth(query: string, width: number): boolean {
  const maxWidth = query.match(/max-width:\s*([\d.]+)px/);
  const minWidth = query.match(/min-width:\s*([\d.]+)px/);
  if (maxWidth) return width <= parseFloat(maxWidth[1]);
  if (minWidth) return width >= parseFloat(minWidth[1]);
  return false;
}

class MockMediaQueryList {
  media: string;
  onchange: ChangeListener | null = null;
  private listeners = new Set<ChangeListener>();

  constructor(query: string) {
    this.media = query;
  }

  get matches(): boolean {
    return queryMatchesWidth(this.media, viewportWidth);
  }

  addListener(listener: ChangeListener) {
    this.listeners.add(listener);
  }
  removeListener(listener: ChangeListener) {
    this.listeners.delete(listener);
  }
  addEventListener(_type: string, listener: ChangeListener) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: string, listener: ChangeListener) {
    this.listeners.delete(listener);
  }
  dispatchEvent(): boolean {
    return true;
  }

  notify() {
    const event = { matches: this.matches, media: this.media } as MediaQueryListEvent;
    this.listeners.forEach((listener) => listener(event));
    this.onchange?.(event);
  }
}

window.matchMedia = ((query: string) => {
  const mql = new MockMediaQueryList(query);
  liveQueries.add(mql);
  return mql as unknown as MediaQueryList;
}) as typeof window.matchMedia;

/** Force the mobile viewport width and notify every live matchMedia query. */
export function setMobileViewport(): void {
  viewportWidth = MOBILE_WIDTH;
  liveQueries.forEach((mql) => mql.notify());
}

/** Restore the default desktop viewport width. */
export function setDesktopViewport(): void {
  viewportWidth = DESKTOP_WIDTH;
  liveQueries.forEach((mql) => mql.notify());
}

// --- ResizeObserver ---------------------------------------------------------
// recharts' ResponsiveContainer needs one; jsdom has none.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// --- MSW lifecycle -----------------------------------------------------------
// Fail loudly on an unhandled request: that is what stops a test silently
// passing against a real network call.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// --- per-test cleanup ---------------------------------------------------------
afterEach(async () => {
  cleanup();
  // Vitest isolates each test file, so the i18next singleton does not survive
  // a file boundary. Within a file it does: Sidebar and LandingNav render
  // language buttons wired to changeLanguage, so a test that clicks one would
  // otherwise carry that language into the next test.
  if (i18n.language !== DEFAULT_LANGUAGE.code) {
    await i18n.changeLanguage(DEFAULT_LANGUAGE.code);
  }
  // i18n writes tradeiq.language on every languageChanged event, so clear
  // storage after resetting the language, not before.
  localStorage.clear();
  setDesktopViewport();
});
