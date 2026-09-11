// The non-component half of the paper-trading BoardUI surface. Kept apart
// from ui.tsx so that file exports components only — a module mixing the two
// breaks React Fast Refresh (and the lint rule that guards it).

/** Green/red for a signed figure, sharing the Markets screen's status tokens. */
export function toneClass(value: number): string {
  if (value > 0) return 'text-status-lime-text';
  if (value < 0) return 'text-status-rose-text';
  return 'text-text-primary';
}
