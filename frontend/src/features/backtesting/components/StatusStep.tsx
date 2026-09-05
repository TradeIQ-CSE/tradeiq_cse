import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getBacktestRunStatus } from '../api/backtestApi';
import { BacktestStatusResponse } from '../domain/types';

export const StatusStep: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();

  const [statusData, setStatusData] = useState<BacktestStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (!runId) return;

    let isMounted = true;
    let timer: NodeJS.Timeout | null = null;

    const fetchStatus = async () => {
      try {
        const data = await getBacktestRunStatus(runId);
        if (!isMounted) return;

        setStatusData(data);
        setError(null);

        // Continue polling if status is queued or running
        if (data.status === 'queued' || data.status === 'running') {
          timer = setTimeout(() => {
            if (isMounted) setPollCount((c) => c + 1);
          }, 1500);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const e = err as Error;
        setError(e?.message || 'Failed to check backtest status.');
      }
    };

    fetchStatus();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [runId, pollCount]);

  const currentStatus = statusData?.status || 'queued';

  return (
    <div className="backtest-workflow">
      <div className="backtest-card status-container">
        <div className={`status-icon status-icon--${currentStatus}`}>
          {currentStatus === 'completed' && '✓'}
          {currentStatus === 'failed' && '✕'}
          {currentStatus === 'running' && '⚙'}
          {currentStatus === 'queued' && '⏳'}
        </div>

        <div>
          <span
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: '12px',
              display: 'inline-block',
              marginBottom: '10px',
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

          <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 8px' }}>
            {currentStatus === 'completed' && 'Backtest Simulation Complete!'}
            {currentStatus === 'running' && 'Simulation in Progress...'}
            {currentStatus === 'queued' && 'Simulation Queued'}
            {currentStatus === 'failed' && 'Simulation Failed'}
          </h2>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto', lineHeight: 1.5 }}>
            {currentStatus === 'queued' &&
              'Your strategy has been placed in the execution queue. The worker process will begin processing historical bars shortly.'}
            {currentStatus === 'running' &&
              'Processing daily price bars and checking price-rule conditions against historical trades.'}
            {currentStatus === 'completed' &&
              'The simulation engine has successfully computed trade ledger entries, equity curve, and performance metrics.'}
            {currentStatus === 'failed' &&
              (statusData?.failureReason || 'An error occurred during simulation processing.')}
          </p>
        </div>

        {/* Run Identifiers and Metadata */}
        <div
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 20px',
            width: '100%',
            maxWidth: '520px',
            textAlign: 'left',
          }}
        >
          <div className="review-item" style={{ marginBottom: '6px' }}>
            <span className="review-item__label">Run Identifier</span>
            <code style={{ fontSize: '12px', color: 'var(--accent-text)' }}>{runId}</code>
          </div>
          {statusData?.startedAt && (
            <div className="review-item" style={{ marginBottom: '6px' }}>
              <span className="review-item__label">Started At</span>
              <span className="review-item__value">{new Date(statusData.startedAt).toLocaleTimeString()}</span>
            </div>
          )}
          {statusData?.completedAt && (
            <div className="review-item">
              <span className="review-item__label">Completed At</span>
              <span className="review-item__value">{new Date(statusData.completedAt).toLocaleTimeString()}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="info-banner info-banner--warning" style={{ maxWidth: '520px' }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '12px' }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => navigate('/backtests/new/security')}
          >
            Configure New Backtest
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => navigate('/analytics')}
          >
            Go to Analytics Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
