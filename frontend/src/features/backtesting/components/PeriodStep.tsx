import React from 'react';
import { useBacktestWizard } from '../hooks/useBacktestWizard';
import { CSE_DATASET_MIN_DATE, CSE_DATASET_MAX_DATE } from '../domain/defaults';

const PERIOD_PRESETS = [
  { label: '1 Year (2024)', start: '2024-01-01', end: '2024-12-31' },
  { label: '2 Years (2023–2024)', start: '2023-01-01', end: '2024-12-31' },
  { label: '3 Years (2022–2024)', start: '2022-01-01', end: '2024-12-31' },
  { label: '5 Years (2020–2024)', start: '2020-01-01', end: '2024-12-31' },
  { label: 'Max Validated (2017–2025)', start: '2017-01-02', end: '2025-12-31' },
];

export const PeriodStep: React.FC = () => {
  const { config, updateConfig, getStepErrors } = useBacktestWizard();
  const errors = getStepErrors('period');

  const startError = errors.find((e) => e.field === 'startDate');
  const endError = errors.find((e) => e.field === 'endDate');

  const { startDate, endDate } = config.period || { startDate: '', endDate: '' };

  const minAllowedDate = config.security?.dataFrom || CSE_DATASET_MIN_DATE;
  const maxAllowedDate = config.security?.dataTo || CSE_DATASET_MAX_DATE;

  const handleStartDateChange = (val: string) => {
    updateConfig((prev) => ({
      ...prev,
      period: {
        ...prev.period,
        startDate: val,
      },
    }));
  };

  const handleEndDateChange = (val: string) => {
    updateConfig((prev) => ({
      ...prev,
      period: {
        ...prev.period,
        endDate: val,
      },
    }));
  };

  const applyPreset = (start: string, end: string) => {
    updateConfig((prev) => ({
      ...prev,
      period: {
        startDate: start,
        endDate: end,
      },
    }));
  };

  return (
    <div className="period-step">
      <div className="step-header">
        <h2 className="step-header__title">2. Simulation Period</h2>
        <p className="step-header__desc">
          Specify the historical date range for evaluating rule performance against CSE market data.
        </p>
      </div>

      {/* Coverage Guidance Banner */}
      <div className="info-banner">
        <span>📅</span>
        <div>
          <strong>CSE Seed Dataset Coverage: {CSE_DATASET_MIN_DATE} to {CSE_DATASET_MAX_DATE}</strong>
          <div style={{ fontSize: '12px', marginTop: '2px' }}>
            Daily price bars are available within this validated window per ADR 0007. Dates outside this range cannot be simulated.
          </div>
        </div>
      </div>

      {/* Date Inputs */}
      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="period-start-date" className="form-label">
            <span>Start Date</span>
            <span className="form-label__hint">Min: {minAllowedDate}</span>
          </label>
          <input
            id="period-start-date"
            type="date"
            className={`form-input ${startError ? 'form-input--error' : ''}`}
            value={startDate}
            min={minAllowedDate}
            max={maxAllowedDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
          />
          {startError && <span className="form-error-text">{startError.message}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="period-end-date" className="form-label">
            <span>End Date</span>
            <span className="form-label__hint">Max: {maxAllowedDate}</span>
          </label>
          <input
            id="period-end-date"
            type="date"
            className={`form-input ${endError ? 'form-input--error' : ''}`}
            value={endDate}
            min={minAllowedDate}
            max={maxAllowedDate}
            onChange={(e) => handleEndDateChange(e.target.value)}
          />
          {endError && <span className="form-error-text">{endError.message}</span>}
        </div>
      </div>

      {/* Quick Period Presets */}
      <div style={{ marginTop: '12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
          Quick Range Presets
        </span>
        <div className="quick-chips">
          {PERIOD_PRESETS.map((preset) => {
            const isActive = startDate === preset.start && endDate === preset.end;
            return (
              <button
                type="button"
                key={preset.label}
                className={`chip-btn ${isActive ? 'chip-btn--active' : ''}`}
                onClick={() => applyPreset(preset.start, preset.end)}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
