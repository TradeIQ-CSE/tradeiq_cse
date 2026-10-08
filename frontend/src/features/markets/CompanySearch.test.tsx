import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { CompanySearch } from './CompanySearch';
import { renderWithProviders, screen, waitFor } from '../../test/render';
import { server } from '../../test/server';
import { securitiesFixture } from '../../test/fixtures/securities';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);
function Search({ onSelect = vi.fn() }) {
  const [value, setValue] = useState('');
  return <><CompanySearch variant="topbar" placeholder="Search companies" value={value} onChange={setValue} onSelect={onSelect} /><button>Outside</button></>;
}
const input = () => screen.getByRole('combobox', { name: 'Search companies' });

describe('CompanySearch topbar', () => {
  it('searches company names without uppercasing or requiring a value and selects by click', async () => {
    const onSelect = vi.fn();
    const requests: URL[] = [];
    server.use(http.get('*/securities', ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({ data: securitiesFixture });
    }));
    renderWithProviders(<Search onSelect={onSelect} />);
    const user = userEvent.setup();
    await user.type(input(), 'John');
    expect(input()).toHaveValue('John');
    expect(input()).not.toBeRequired();
    await user.click(await screen.findByRole('option', { name: new RegExp(securitiesFixture[0].company_name) }));
    expect(onSelect).toHaveBeenCalledWith(securitiesFixture[0]);
    expect(requests.at(-1)?.searchParams.get('search')).toBe('John');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('hides old matches during debounce and prevents Enter selecting them', async () => {
    const onSelect = vi.fn();
    server.use(http.get('*/securities', async ({ request }) => {
      if (new URL(request.url).searchParams.get('search') === 'none') {
        await delay(100);
        return HttpResponse.json({ data: [] });
      }
      return HttpResponse.json({ data: securitiesFixture });
    }));
    renderWithProviders(<Search onSelect={onSelect} />);
    const user = userEvent.setup();
    await user.type(input(), 'John');
    await screen.findAllByRole('option');
    await user.keyboard('{ArrowDown}');
    await user.clear(input());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.type(input(), 'none');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(t('paperTrading.ticket.symbolSearching'))).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
    expect(await screen.findByText(t('paperTrading.ticket.symbolNoMatches'))).toBeInTheDocument();
  });

  it('selects using ArrowUp/Down and Enter while keeping focus in the search', async () => {
    const onSelect = vi.fn();
    renderWithProviders(<Search onSelect={onSelect} />);
    const user = userEvent.setup();
    await user.type(input(), 'J');
    const options = await screen.findAllByRole('option');
    await user.keyboard('{ArrowDown}{ArrowUp}');
    expect(options.at(-1)).toHaveAttribute('aria-selected', 'true');
    expect(input()).toHaveFocus();
    expect(input()).toHaveAttribute('aria-activedescendant', options.at(-1)?.id);
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(securitiesFixture.at(-1));
  });

  it('dismisses on Escape, outside click and Tab, and reopens on focus', async () => {
    renderWithProviders(<Search />);
    const user = userEvent.setup();
    await user.type(input(), 'J');
    await screen.findAllByRole('option');
    await user.keyboard('{Escape}');
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(input());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.tab();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows a failed lookup as an error instead of no matches', async () => {
    server.use(http.get('*/securities', () => HttpResponse.error()));
    renderWithProviders(<Search />);
    const user = userEvent.setup();
    await user.type(input(), 'J');
    expect(await screen.findByRole('alert')).toHaveTextContent(t('paperTrading.ticket.symbolError'));
    expect(screen.queryByText(t('paperTrading.ticket.symbolNoMatches'))).not.toBeInTheDocument();
  });

  it('does not request companies for empty or whitespace-only input', async () => {
    const request = vi.fn();
    server.use(http.get('*/securities', () => { request(); return HttpResponse.json({ data: [] }); }));
    renderWithProviders(<Search />);
    const user = userEvent.setup();
    await user.type(input(), '   ');
    await waitFor(() => expect(input()).toHaveValue('   '));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
});
