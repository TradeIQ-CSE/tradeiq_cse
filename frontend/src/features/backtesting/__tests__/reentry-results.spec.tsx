import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { ResultsFooter, ResultsView } from '../components/StatusStep';
import { renderWithProviders } from '../../../test/render';
import { createDefaultBacktestConfig } from '../domain/defaults';
import { restoreBacktestDraft } from '../domain/draft';
import { mapToBacktestRequest } from '../domain/mapper';
import { validateBacktestConfig } from '../domain/validation';
import { backtestApiValidationFields } from '../domain/apiErrors';
import { loadBacktestPreview, storeBacktestPreview } from '../domain/preview';
import type { BacktestResultsResponse } from '../domain/types';

const results: BacktestResultsResponse = { initialCapital:1000, finalCash:1100, finalEquity:1100, equityCurve:[], trades:Array.from({length:52},(_,index)=>({id:index+1,date:'2025-01-02',type:index%2===0 ? 'BUY' : 'SELL', executionPrice:100,quantity:index+1,grossValue:100,fees:{brokerage:0,cse:0,cds:0,secCess:0,stl:0,total:0},netCashFlow:index%2===0 ? -100 : 100,reason:index%2===0 ? 'price_falls_pct_from_last_sell(7.5%)' : 'take_profit_pct(10%)'})) };

describe('Repeated strategy results and persistence',()=>{
  it('discloses close-based execution fallbacks and final-session exit ordering', () => {
    renderWithProviders(<ResultsFooter><span>Actions</span></ResultsFooter>);
    expect(screen.getByText(/Trades use daily opening, high, low and closing prices/)).toBeInTheDocument();
    expect(screen.getByText(/missing or zero opening price uses that day’s close/)).toBeInTheDocument();
    expect(screen.getByText(/only the known opening and closing prices are checked/)).toBeInTheDocument();
    expect(screen.getByText(/Any shares still held after these checks on the final day/)).toBeInTheDocument();
  });

  it('keeps the full transaction count while making every long-ledger execution reachable',()=>{
    renderWithProviders(<ResultsView results={results} gaps={[]} />);
    expect(screen.getByText('52 buys and sells')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(26);
    expect(screen.getByText('Showing 1–25 of 52 executions')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Next/}));
    expect(screen.getByText('Showing 26–50 of 52 executions')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Next/}));
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('Showing 51–52 of 52 executions')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Next/})).toBeDisabled();
  });

  it('preserves custom strategy values through draft restoration and preview storage',()=>{
    const config=createDefaultBacktestConfig(); config.security.symbol='CTC.N0000'; config.rules.reentry!.value=7.5;
    const restored=restoreBacktestDraft(JSON.parse(JSON.stringify(config)));
    expect(mapToBacktestRequest(restored.config)).toEqual(mapToBacktestRequest(config));
    storeBacktestPreview({config,results,ranAt:'2026-10-01T00:00:00Z'});
    expect(loadBacktestPreview()!.config.rules).toEqual(config.rules);
  });

  it('maps new and legacy API rule errors to the visible wizard fields',()=>{
    expect(backtestApiValidationFields(undefined,[{field:'reentryCondition',reason:'bad fall'},{field:'version',reason:'unsupported'},{field:'buyCondition.value',reason:'bad entry'},{field:'sellConditions[0].value',reason:'bad exit'}])).toEqual([
      {field:'reentry.value',reason:'bad fall',step:'rules'}, {field:'version',reason:'unsupported',step:'rules'}, {field:'buy.value',reason:'bad entry',step:'rules'}, {field:'sells[0].value',reason:'bad exit',step:'rules'},
    ]);
    expect(backtestApiValidationFields([{field:'rule.reentry.value',reason:'bad fall'}],undefined)).toEqual([{field:'reentry.value',reason:'bad fall',step:'rules'}]);
  });

  it.each([0,100,-1,NaN,Infinity])('rejects an invalid buy-again percentage %s',value=>{
    const config=createDefaultBacktestConfig(); config.rules.reentry!.value=value;
    expect(validateBacktestConfig(config,'rules').errors).toContainEqual(expect.objectContaining({field:'reentry.value'}));
  });
});
