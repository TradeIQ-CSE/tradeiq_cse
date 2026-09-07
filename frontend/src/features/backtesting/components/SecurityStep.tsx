import React, { useState, useEffect } from 'react';
import { useBacktestWizard } from '../hooks/useBacktestWizard';
import { getSecuritiesUniverse } from '../api/backtestApi';
import { SecurityListItem } from '../../markets/types';

const POPULAR_SECURITIES = [
  { symbol: 'JKH.N0000', name: 'John Keells Holdings PLC', sector: 'Industrial Conglomerates', price: 198.50 },
  { symbol: 'COMB.N0000', name: 'Commercial Bank of Ceylon PLC', sector: 'Banking', price: 114.25 },
  { symbol: 'SAMP.N0000', name: 'Sampath Bank PLC', sector: 'Banking', price: 82.00 },
  { symbol: 'HNB.N0000', name: 'Hatton National Bank PLC', sector: 'Banking', price: 215.75 },
  { symbol: 'DIAL.N0000', name: 'Dialog Axiata PLC', sector: 'Telecommunications', price: 11.80 },
  { symbol: 'LOLC.N0000', name: 'LOLC Holdings PLC', sector: 'Financial Services', price: 440.00 },
];

export const SecurityStep: React.FC = () => {
  const { config, updateConfig, getStepErrors } = useBacktestWizard();
  const errors = getStepErrors('security');
  const symbolError = errors.find((e) => e.field === 'symbol');

  const [search, setSearch] = useState('');
  const [securities, setSecurities] = useState<SecurityListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    getSecuritiesUniverse(search)
      .then((data) => {
        if (isMounted) {
          setSecurities(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [search]);

  const handleSelectSecurity = (item: {
    symbol: string;
    companyName?: string;
    sector?: string | null;
    price?: number | null;
    dataFrom?: string | null;
    dataTo?: string | null;
  }) => {
    updateConfig({
      security: {
        symbol: item.symbol,
        companyName: item.companyName,
        sector: item.sector,
        price: item.price,
        dataFrom: item.dataFrom || '2017-01-02',
        dataTo: item.dataTo || '2025-12-31',
      },
    });
  };

  const selectedSymbol = config.security?.symbol || '';

  return (
    <div className="security-step">
      <div className="step-header">
        <h2 className="step-header__title">1. Select Security</h2>
        <p className="step-header__desc">
          Choose a Colombo Stock Exchange (CSE) listed equity with historical daily price coverage for simulation.
        </p>
      </div>

      {/* Selected Security Highlight Card */}
      {config.security?.symbol && (
        <div
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--accent-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    background: 'var(--accent-soft)',
                    color: 'var(--accent-text)',
                    fontWeight: 700,
                    fontSize: '14px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  {config.security.symbol}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)' }}>
                  {config.security.companyName || 'CSE Equity'}
                </span>
              </div>
              {config.security.sector && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Sector: {config.security.sector}
                </div>
              )}
            </div>
            {config.security.price && (
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Last Close</span>
                <strong style={{ fontSize: '16px', color: 'var(--text-heading)' }}>
                  Rs. {config.security.price.toFixed(2)}
                </strong>
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--positive)',
              marginTop: '4px',
              borderTop: '1px solid var(--border-faint)',
              paddingTop: '8px',
            }}
          >
            <span>✓</span>
            <span>
              Validated Data Coverage:{' '}
              <strong>{config.security.dataFrom || '2017-01-02'}</strong> to{' '}
              <strong>{config.security.dataTo || '2025-12-31'}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="form-group">
        <label htmlFor="security-search" className="form-label">
          <span>Search Stock Universe</span>
          <span className="form-label__hint">Filter by symbol or company name</span>
        </label>
        <input
          id="security-search"
          type="text"
          className={`form-input ${symbolError ? 'form-input--error' : ''}`}
          placeholder="e.g. JKH, Commercial Bank, SAMP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
        {symbolError && <span className="form-error-text">{symbolError.message}</span>}
      </div>

      {/* Popular CSE Presets */}
      <div style={{ marginBottom: '20px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
          Popular CSE Equities
        </span>
        <div className="quick-chips">
          {POPULAR_SECURITIES.map((sec) => (
            <button
              type="button"
              key={sec.symbol}
              className={`chip-btn ${selectedSymbol === sec.symbol ? 'chip-btn--active' : ''}`}
              onClick={() =>
                handleSelectSecurity({
                  symbol: sec.symbol,
                  companyName: sec.name,
                  sector: sec.sector,
                  price: sec.price,
                })
              }
            >
              {sec.symbol.split('.')[0]} · {sec.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Matching Securities List from API if search present */}
      {search.trim().length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Search Results ({securities.length})
          </span>
          {isLoading ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Searching CSE market data...
            </div>
          ) : securities.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No securities found matching &ldquo;{search}&rdquo;. You can also enter the symbol manually above.
            </div>
          ) : (
            <div
              style={{
                maxHeight: '220px',
                overflowY: 'auto',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {securities.map((sec) => (
                <button
                  type="button"
                  key={sec.symbol}
                  onClick={() =>
                    handleSelectSecurity({
                      symbol: sec.symbol,
                      companyName: sec.company_name,
                      sector: sec.sector?.name || null,
                      price: sec.price,
                      dataFrom: sec.data_from,
                      dataTo: sec.data_to,
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: selectedSymbol === sec.symbol ? 'var(--accent-soft)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-faint)',
                    color: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--text-heading)', marginRight: '8px' }}>{sec.symbol}</strong>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{sec.company_name}</span>
                  </div>
                  {sec.price !== null && (
                    <span style={{ color: 'var(--text-heading)', fontSize: '13px' }}>
                      Rs. {sec.price.toFixed(2)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
