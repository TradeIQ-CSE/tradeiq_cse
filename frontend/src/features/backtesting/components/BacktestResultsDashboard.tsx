import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getBacktestRunStatus, getBacktestRunResults } from '../api/backtestApi';
import { BacktestStatusResponse, BacktestResultResponse } from '../domain/types';
import { PerformanceMetricsGrid } from './PerformanceMetricsGrid';
import { EquityCurveChart } from './EquityCurveChart';
import { TradeLedgerTable } from './TradeLedgerTable';
import { formatLKR } from '../../../utils/format';

export const BacktestResultsDashboard: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();

  const [statusData, setStatusData] = useState<BacktestStatusResponse | null>(null);
  const [resultData, setResultData] = useState<BacktestResultResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState<number>(0);

  const fetchRunData = useCallback(async () => {
    if (!runId) {
      setError('No backtest run identifier provided.');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const status = await getBacktestRunStatus(runId);
      setStatusData(status);

      if (status.status === 'completed') {
        try {
          const res = await getBacktestRunResults(runId);
          setResultData(res);
        } catch (resErr: unknown) {
          const e = resErr as Error;
          setError(e?.message || 'Failed to retrieve backtest execution results.');
        }
      } else {
        setResultData(null);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setError(e?.message || 'Unable to retrieve backtest status.');
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    let isMounted = true;
    let timer: NodeJS.Timeout | null = null;

    const execute = async () => {
      await fetchRunData();
      if (!isMounted) return;

      // Auto-poll if run is queued or running
      if (statusData?.status === 'queued' || statusData?.status === 'running') {
        timer = setTimeout(() => {
          if (isMounted) setPollCount((c) => c + 1);
        }, 1500);
      }
    };

    execute();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [fetchRunData, pollCount, statusData?.status]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setPollCount((c) => c + 1);
  };

  const currentStatus = statusData?.status || 'queued';

  return (
    <div className="backtest-workflow" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header Banner */}
      <div
        className="backtest-card"
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '20px 24px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span
              style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '12px',
                background:
                  currentStatus === 'completed'
                    ? 'rgba(0, 212, 146, 0.15)'
                    : currentStatus === 'failed'
                    ? 'rgba(255, 100, 103, 0.15)'
                    : 'var(--accent-soft)',
                color:
                  currentStatus === 'completed'
                    ? 'var(--positive)'
                    : currentStatus === 'failed'
                    ? 'var(--negative)'
                    : 'var(--accent-text)',
              }}
            >
              {currentStatus.toUpperCase()}
            </span>
            <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text-heading)' }}>
              Backtest Results Dashboard
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            Run ID: <code style={{ color: 'var(--accent-text)' }}>{runId}</code>
            {statusData?.symbol && ` • Symbol: ${statusData.symbol}`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => navigate('/backtests/new/security')}
            style={{ fontSize: '13px' }}
          >
            + New Backtest
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => navigate('/analytics')}
            style={{ fontSize: '13px' }}
          >
            Analytics Page
          </button>
        </div>
      </div>

      {/* Loading Indicator */}
      {loading && !statusData && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading backtest results…
        </div>
      )}

      {/* Transient API Error / Unavailable Banner with Retry */}
      {error && (
        <div
          className="info-banner info-banner--warning"
          style={{
            background: 'rgba(255, 170, 0, 0.1)',
            border: '1px solid rgba(255, 170, 0, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: '14px' }}>
                Unable to retrieve backtest results
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{error}</div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleRetry}
            style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}
          >
            🔄 Retry Request
          </button>
        </div>
      )}

      {/* Queued or Running State */}
      {(currentStatus === 'queued' || currentStatus === 'running') && !error && (
        <div
          className="backtest-card"
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '32px',
            textAlign: 'center',
            marginBottom: '24px',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚙️</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 8px' }}>
            {currentStatus === 'queued' ? 'Simulation Queued' : 'Simulation in Progress…'}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto 20px' }}>
            {currentStatus === 'queued'
              ? 'Your strategy configuration is queued. Worker processes will begin evaluation shortly.'
              : 'Processing daily market bars and evaluating strategy entry/exit rules.'}
          </p>

          <div
            style={{
              background: 'var(--bg-elevated, #1e293b)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '16px',
              maxWidth: '400px',
              margin: '0 auto',
              textAlign: 'left',
              fontSize: '13px',
            }}
          >
            {statusData?.startDate && statusData?.endDate && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Effective Range:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {statusData.startDate} — {statusData.endDate}
                </span>
              </div>
            )}
            {statusData?.startingCapital !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Starting Capital:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formatLKR(statusData.startingCapital)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Failed State */}
      {currentStatus === 'failed' && (
        <div
          className="backtest-card"
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid rgba(255, 100, 103, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>✕</span>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--negative)', margin: '0 0 4px' }}>
                Backtest Execution Failed
              </h2>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
                {statusData?.failureReason || 'An error occurred during simulation processing.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Completed Results Dashboard */}
      {currentStatus === 'completed' && resultData && (
        <>
          {/* Performance Metrics Grid */}
          <PerformanceMetricsGrid result={resultData} />

          {/* Equity Curve Visualization */}
          <EquityCurveChart data={resultData.equityCurve || []} />

          {/* Trade Execution Ledger */}
          <TradeLedgerTable trades={resultData.trades || []} />
        </>
      )}
    </div>
  );
};
