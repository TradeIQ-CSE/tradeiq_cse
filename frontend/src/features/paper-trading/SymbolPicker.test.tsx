import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { server } from '../../test/server';
import { fireEvent, renderWithProviders, screen } from '../../test/render';
import { securitiesFixture } from '../../test/fixtures/securities';
import { SymbolPicker } from './SymbolPicker';

const t = i18n.t.bind(i18n);

function ControlledPicker() {
  const [value, setValue] = useState('');
  return <SymbolPicker value={value} onChange={setValue} />;
}

function symbolInput() {
  return screen.getByRole('combobox', { name: t('paperTrading.ticket.symbol') });
}

describe('SymbolPicker', () => {
  // Issue #40, case 9a.
  it('renders the error state on a failed search, not "no matches"', async () => {
    server.use(http.get('*/securities', () => HttpResponse.error()));

    renderWithProviders(<ControlledPicker />);
    const user = userEvent.setup({ delay: null });
    await user.type(symbolInput(), 'COMB');

    expect(await screen.findByRole('alert')).toHaveTextContent(t('paperTrading.ticket.symbolError'));
    expect(screen.queryByText(t('paperTrading.ticket.symbolNoMatches'))).not.toBeInTheDocument();
  });

  // Issue #40, case 9b — this was broken (Enter did nothing, or submitted the
  // enclosing form) and fixed; keep it fixed.
  it('commits the highlighted result on ArrowDown then Enter', async () => {
    renderWithProviders(<ControlledPicker />);
    const user = userEvent.setup({ delay: null });
    const input = symbolInput();
    await user.type(input, 'J');

    // securitiesFixture[0] is JKH.N0000 — the default handler ignores the
    // search term and always returns the full fixture, so it is always the
    // first result.
    await screen.findByRole('option', { name: new RegExp(securitiesFixture[0].symbol) });

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: new RegExp(securitiesFixture[0].symbol) })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.keyboard('{Enter}');

    expect(input).toHaveValue(securitiesFixture[0].symbol);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  // Mutation target: removing the `relatedTarget` containment check in
  // handleBlur (i.e. always closing on blur, regardless of where focus went)
  // must be caught. Nothing inside the dropdown is separately focusable
  // today (see the component's own comment), so a real Tab/click can't probe
  // this branch — firing a raw blur with an in-container `relatedTarget` is
  // the only way to exercise the "focus moved to something else inside it"
  // path this check exists for.
  it('keeps the dropdown open when a blur reports a relatedTarget inside the picker', async () => {
    renderWithProviders(<ControlledPicker />);
    const user = userEvent.setup({ delay: null });
    const input = symbolInput();
    await user.type(input, 'J');

    const listbox = await screen.findByRole('listbox');
    fireEvent.blur(input, { relatedTarget: listbox });

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('closes the dropdown when a blur moves focus outside the picker', async () => {
    renderWithProviders(<ControlledPicker />);
    const user = userEvent.setup({ delay: null });
    const input = symbolInput();
    await user.type(input, 'J');

    await screen.findByRole('listbox');
    fireEvent.blur(input, { relatedTarget: document.body });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
