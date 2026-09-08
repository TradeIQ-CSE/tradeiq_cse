import React from 'react';
import { TradeLedgerEntry, FeeBreakdown } from '../domain/types';
import { formatLKR, formatSigned } from '../../../utils/format';

interface TradeLedgerTableProps {
  trades: TradeLedgerEntry[];
}

export const TradeLedgerTable: React.FC<TradeLedgerTableProps> = ({ trades }) => {
  if (!trades || trades.length === 0) {
    return (
      <div
        className="backtest-card"
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-secondary)',
        }}
      >
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>📜</div>
        <h4 style={{ margin: '0 0 4px', fontSize: '15px', color: 'var(--text-heading)' }}>
          No Trades Executed
        </h4>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
          The strategy completed successfully but generated no trades during the evaluated period.
        </p>
      </div>
    );
  }

  const renderFees = (fees: number | FeeBreakdown) => {
    if (typeof fees === 'number') {
      return formatLKR(fees);
    }
    return formatLKR(fees.total);
  };

  return (
    <div
      className="backtest-card"
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '20px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text-heading)' }}>
          Trade Execution Ledger ({trades.length} {trades.length === 1 ? 'trade' : 'trades'})
        </h3>
      </div>

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            minWidth: '650px',
            borderCollapse: 'collapse',
            fontSize: '13px',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              <th style={{ padding: '10px 12px' }}>Date</th>
              <th style={{ padding: '10px 12px' }}>Action</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Quantity</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Price</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Fees</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Proceeds / Cost</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Realized P/L</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, idx) => {
              const isBuy = trade.type === 'BUY';
              const netCash = trade.netCashFlow !== undefined
                ? trade.netCashFlow
                : isBuy
                  ? -1 * ((trade.grossValue || trade.executionPrice * trade.quantity) + (typeof trade.fees === 'number' ? trade.fees : trade.fees.total))
                  : (trade.grossValue || trade.executionPrice * trade.quantity) - (typeof trade.fees === 'number' ? trade.fees : trade.fees.total);

              return (
                <tr
                  key={trade.id || idx}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <td style={{ padding: '12px', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                    {trade.date}
                  </td>
                  <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: isBuy ? 'rgba(0, 212, 146, 0.15)' : 'rgba(255, 100, 103, 0.15)',
                        color: isBuy ? 'var(--positive)' : 'var(--negative)',
                      }}
                    >
                      {trade.type}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-primary)' }}>
                    {trade.quantity.toLocaleString('en-LK')}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-primary)' }}>
                    {formatLKR(trade.executionPrice)}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {renderFees(trade.fees)}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-primary)' }}>
                    {formatLKR(Math.abs(netCash))}
                  </td>
                  <td
                    style={{
                      padding: '12px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color:
                        trade.realizedPnl === undefined
                          ? 'var(--text-secondary)'
                          : trade.realizedPnl >= 0
                            ? 'var(--positive)'
                            : 'var(--negative)',
                    }}
                  >
                    {trade.realizedPnl !== undefined ? `${formatSigned(trade.realizedPnl, 2)} LKR` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
