export function formatPrice(value: number): string {
  return value.toFixed(2);
}

export function formatSigned(value: number, decimals: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}`;
}

export function formatVolume(value: number): string {
  return value.toLocaleString('en-US');
}

export type MarketCapBand = 'Large' | 'Mid' | 'Small';

// Bands per docs/api/endpoint-catalogue-v0.md §6.
export function marketCapBand(
  sharesOutstanding: number | null,
  price: number | null,
): MarketCapBand | null {
  if (sharesOutstanding === null || price === null) return null;
  const cap = sharesOutstanding * price;
  if (cap >= 20_000_000_000) return 'Large';
  if (cap >= 5_000_000_000) return 'Mid';
  return 'Small';
}
