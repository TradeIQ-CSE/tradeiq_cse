/** Semantic presentation shared by market, portfolio, and trading figures. */
export function financialToneClass(value: number): string {
  if (value > 0) return 'text-status-lime-text';
  if (value < 0) return 'text-status-rose-text';
  return 'text-text-primary';
}

/** Direction stays readable when colour is unavailable or indistinguishable. */
export function FinancialDirectionGlyph({
  direction,
}: {
  direction: 'up' | 'down' | 'flat';
}) {
  if (direction === 'flat') return null;

  return (
    <span aria-hidden="true" className="mr-1">
      {direction === 'up' ? '▲' : '▼'}
    </span>
  );
}
