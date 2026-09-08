import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { EquityCurvePoint } from '../domain/types';
import { formatLKR } from '../../../utils/format';

interface EquityCurveChartProps {
  data: EquityCurvePoint[];
}

export const EquityCurveChart: React.FC<EquityCurveChartProps> = ({ data }) => {
  const [showTableText, setShowTableText] = useState(false);

  if (!data || data.length === 0) {
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
          marginBottom: '24px',
        }}
      >
        No equity curve data available for this backtest run.
      </div>
    );
  }

  return (
    <div
      className="backtest-card"
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '20px',
        marginBottom: '24px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text-heading)' }}>
          Portfolio Equity Curve
        </h3>
        <button
          type="button"
          className="chip-btn"
          onClick={() => setShowTableText((prev) => !prev)}
          style={{ fontSize: '12px', cursor: 'pointer', padding: '4px 10px' }}
          aria-expanded={showTableText}
          aria-label="Toggle accessible data table view for equity curve"
        >
          {showTableText ? '📊 Hide Text Table' : '📄 View Text Equivalent'}
        </button>
      </div>

      <div style={{ width: '100%', height: 300, minWidth: 0, overflowX: 'auto' }}>
        <div style={{ width: '100%', height: '100%', minWidth: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent, #00d492)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--accent, #00d492)" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                stroke="var(--text-secondary)"
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                stroke="var(--text-secondary)"
                tick={{ fontSize: 11 }}
                tickFormatter={(val) => `Rs.${(val / 1000).toFixed(0)}k`}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-elevated, #1e293b)',
                  borderColor: 'var(--border-subtle, #334155)',
                  borderRadius: '6px',
                  color: 'var(--text-heading, #f8fafc)',
                  fontSize: '12px',
                }}
                formatter={(val: number) => [formatLKR(val), 'Total Equity']}
                labelFormatter={(label: string) => `Date: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="totalEquity"
                stroke="var(--accent, #00d492)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#equityGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Accessible Text Equivalent Table */}
      {showTableText && (
        <div
          style={{
            marginTop: '16px',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '12px',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Equity Curve Text Data Equivalent ({data.length} points)
          </div>
          <table
            style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}
            aria-label="Equity Curve Data Points Table"
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '6px' }}>Date</th>
                <th style={{ padding: '6px' }}>Total Equity</th>
                <th style={{ padding: '6px' }}>Cash</th>
              </tr>
            </thead>
            <tbody>
              {data.map((pt, idx) => (
                <tr key={pt.date || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '4px 6px', color: 'var(--text-primary)' }}>{pt.date}</td>
                  <td style={{ padding: '4px 6px', color: 'var(--accent-text)' }}>{formatLKR(pt.totalEquity)}</td>
                  <td style={{ padding: '4px 6px', color: 'var(--text-secondary)' }}>
                    {pt.cash !== undefined ? formatLKR(pt.cash) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
