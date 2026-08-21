/**
 * Formats a number as Sri Lankan Rupees (LKR) with 'Rs.' notation.
 */
export function formatLKR(n: number, includeDecimals = true): string {
  const formatted = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0,
  });
  return `${n < 0 ? "-" : ""}Rs. ${formatted}`;
}

/**
 * Prepends a '+' sign for positive numbers and formatting.
 */
export function formatSigned(n: number, decimals = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Formats a decimal/percentage number with sign and percentage symbol.
 */
export function formatPercentage(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}
