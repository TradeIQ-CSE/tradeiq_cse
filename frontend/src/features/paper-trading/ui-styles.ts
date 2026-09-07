// The non-component half of the paper-trading BoardUI surface. Kept apart
// from ui.tsx so that file exports components only — a module mixing the two
// breaks React Fast Refresh (and the lint rule that guards it).

/**
 * Shared field shell, matching BoardUI's Input tokens.
 *
 * Plain <input>/<select> rather than BoardUI's <Input>: the symbol field is a
 * hand-wired combobox (aria-activedescendant over a custom listbox) and the
 * ticket relies on native form semantics for required/min/step validation,
 * both of which React Aria's TextField would take over. Same reasoning as the
 * Markets table using a plain <table> instead of the Table collection.
 */
// The resting ring is deliberately visible rather than BoardUI's transparent
// one: in dark mode background/tertiary/default and background/primary/default
// are both slate-800, so a field sitting inside a Card would otherwise be
// invisible until hovered. border/button/default is the same edge the
// secondary Button and the Markets filters use.
export const fieldShell =
  'w-full rounded-2lg bg-background-tertiary-default px-3 py-2 text-body-regular text-text-primary ' +
  'ring-1 ring-inset ring-border-button-default outline-none transition-[background-color,box-shadow] ' +
  'placeholder:text-text-tertiary hover:ring-2 hover:ring-border-button-hover ' +
  'focus:ring-2 focus:ring-border-button-active ' +
  'disabled:cursor-not-allowed disabled:bg-input-disabled-background disabled:text-input-disabled-text';

/** Green/red for a signed figure, sharing the Markets screen's status tokens. */
export function toneClass(value: number): string {
  if (value > 0) return 'text-status-lime-text';
  if (value < 0) return 'text-status-rose-text';
  return 'text-text-primary';
}
