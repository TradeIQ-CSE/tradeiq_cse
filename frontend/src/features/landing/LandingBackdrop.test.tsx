import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingBackdrop } from './LandingBackdrop';

let reportVisibility: (visible: boolean) => void;

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) {
      reportVisibility = (visible) => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    observe() { reportVisibility(true); }
    disconnect() {}
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LandingBackdrop', () => {
  it('starts muted and looping, with both browser formats available', () => {
    const { container } = render(<LandingBackdrop />);
    const video = container.querySelector('video')!;
    expect(video.autoplay).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.querySelectorAll('source')).toHaveLength(2);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pause background video' })).toBeInTheDocument();
  });

  it('respects a manual pause when the hero returns to view', () => {
    render(<LandingBackdrop />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause background video' }));
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    act(() => { reportVisibility(false); reportVisibility(true); });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play background video' }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('uses the still image without requesting video for reduced motion', () => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ ...media, matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const { container } = render(<LandingBackdrop />);
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute('src', '/media/market-backdrop.jpg');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
