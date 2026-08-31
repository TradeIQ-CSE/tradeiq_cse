export function formatLKR(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Rs. 0.00';
  return `Rs. ${value.toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatSigned(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) return '0.00';
  return value.toLocaleString('en-LK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: 'exceptZero',
  });
}

export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0.00%';
  return `${formatSigned(value, 2)}%`;
}
