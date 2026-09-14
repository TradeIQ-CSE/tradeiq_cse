/** Static and decorative: no animation, video, network request, or scroll-bound effect. */
export function AppBackdrop() {
  return <div className="app-shell-backdrop pointer-events-none absolute inset-0" aria-hidden />;
}
