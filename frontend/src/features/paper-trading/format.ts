// LKR currency formatting for the paper-trading UI. Locale is always a
// parameter, never hardcoded, matching features/markets/format.ts.

// Plain number + "LKR" prefix rather than `style: 'currency', currency: 'LKR'`:
// Intl's LKR currency formatting renders the "Rs" symbol in most locales
// (not "LKR"), which reads as ambiguous next to other Rs-denominated
// currencies in a dense table, and it fixes minimumFractionDigits at 2 with
// no built-in way to keep the sign handling this module also needs
// consistent with formatSignedMoney/formatPercent below.
export function formatMoney(value: number, locale: string): string {
  return `LKR ${value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatSignedMoney(value: number, locale: string): string {
  return `LKR ${value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  })}`;
}

export function formatPercent(value: number, locale: string): string {
  // Explicit sign so a gain reads "+1.22%" in every locale; Intl's
  // signDisplay handles the minus, which can be a locale-specific glyph.
  return `${value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  })}%`;
}

export function formatQuantity(value: number, locale: string): string {
  return value.toLocaleString(locale);
}

// `placed_at` (§6.2/§6.3) is the only timestamp (not a plain date) this
// feature renders — every other date field (fill_date, settlement_date,
// effective_date) is already a display-ready "YYYY-MM-DD" and is rendered
// verbatim elsewhere. This only localises the ISO string; it derives nothing.
export function formatDateTime(value: string, locale: string): string {
  return new Date(value).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Direction for the ▲/▼ non-colour indicator (colour alone must not carry the signal). */
export function changeDirection(value: number): 'up' | 'down' | 'flat' {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}
