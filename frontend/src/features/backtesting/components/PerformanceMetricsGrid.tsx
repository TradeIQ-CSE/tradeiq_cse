import React from 'react';
import { BacktestResultResponse } from '../domain/types';
import { formatLKR, formatPercentage, formatSigned } from '../../../utils/format';

interface PerformanceMetricsGridProps {
  result: BacktestResultResponse;
}

export const PerformanceMetricsGrid: React.FC<PerformanceMetricsGridProps> = ({ result }) => {
  // Render totalReturnPct directly from backend API response (API single source of truth)
  const totalReturn = result.totalReturnPct;

  const tradeCount = result.tradeCount ?? result.trades?.length ?? 0;

  return (
    <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
      <div className="metric-card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em' }}>
          Total Return
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: totalReturn && totalReturn >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
          {totalReturn !== undefined ? formatPercentage(totalReturn) : '—'}
        </div>
      </div>

      <div className="metric-card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em' }}>
          Ending Equity
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: 'var(--text-heading)' }}>
          {result.finalEquity !== undefined ? formatLKR(result.finalEquity) : '—'}
        </div>
      </div>

      <div className="metric-card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em' }}>
          Max Drawdown
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: 'var(--negative)' }}>
          {result.maxDrawdownPct !== undefined ? `${formatSigned(result.maxDrawdownPct, 2)}%` : '—'}
        </div>
      </div>

      <div className="metric-card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em' }}>
          Volatility
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: 'var(--text-heading)' }}>
          {result.volatilityPct !== undefined ? `${result.volatilityPct.toFixed(2)}%` : '—'}
        </div>
      </div>

      <div className="metric-card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em' }}>
          Trade Count
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: 'var(--text-heading)' }}>
          {tradeCount}
        </div>
      </div>

      <div className="metric-card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em' }}>
          Win Rate
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: 'var(--text-heading)' }}>
          {result.winRatePct !== undefined ? `${result.winRatePct.toFixed(2)}%` : '—'}
        </div>
      </div>
    </div>
  );
};
