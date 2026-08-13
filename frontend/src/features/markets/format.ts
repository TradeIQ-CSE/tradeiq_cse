export function formatPrice(value: number, locale: string): string {
  return value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatSigned(
  value: number,
  decimals: number,
  locale: string,
): string {
  // Explicit sign so a gain reads "+1.22" in every locale; Intl's
  // signDisplay handles the minus, which can be a locale-specific glyph.
  return value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: 'exceptZero',
  });
}

export function formatVolume(value: number, locale: string): string {
  return value.toLocaleString(locale);
}

export function formatCount(value: number, locale: string): string {
  return value.toLocaleString(locale);
}

/** Band key, not a label — the caller translates it (markets.cap.*). */
export type MarketCapBand = 'large' | 'mid' | 'small';

// Thresholds per docs/api/endpoint-catalogue-v0.md §6.
export function marketCapBand(
  sharesOutstanding: number | null,
  price: number | null,
): MarketCapBand | null {
  if (sharesOutstanding === null || price === null) return null;
  const cap = sharesOutstanding * price;
  if (cap >= 20_000_000_000) return 'large';
  if (cap >= 5_000_000_000) return 'mid';
  return 'small';
}
