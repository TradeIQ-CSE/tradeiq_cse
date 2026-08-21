/**
 * Classifies a number's trend as positive, negative, or flat.
 */
export function classifyTrend(n: number): "positive" | "negative" | "flat" {
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "flat";
}
