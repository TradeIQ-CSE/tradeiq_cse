import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../test/render';
import { DesignSystemPreview } from './DesignSystemPreview';

describe('DesignSystemPreview', () => {
  it('renders every representative component without crashing', () => {
    render(<DesignSystemPreview />);

    expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Danger' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Symbol', { selector: 'input' })).toHaveLength(2);
    expect(screen.getByRole('table', { name: 'Securities preview' })).toBeInTheDocument();
  });

  it('carries status meaning as text, not color alone, on the change chips', () => {
    render(<DesignSystemPreview />);

    const table = screen.getByRole('table', { name: 'Securities preview' });
    expect(within(table).getByText('+1.23%')).toBeInTheDocument();
    expect(within(table).getByText('-1.15%')).toBeInTheDocument();
  });

  it('shows an invalid input state with a specific hint message, not just a red border', () => {
    render(<DesignSystemPreview />);

    const invalidInput = screen.getByDisplayValue('NOT-A-SYMBOL');
    expect(invalidInput).toBeInvalid();
    expect(screen.getByText('Symbol not found')).toBeInTheDocument();
  });

  it('opens the row-actions menu on click and its items are reachable', async () => {
    const user = userEvent.setup();
    render(<DesignSystemPreview />);

    await user.click(screen.getByRole('button', { name: 'Row actions' }));

    const menu = await screen.findByRole('dialog', { name: 'Row actions menu' });
    expect(within(menu).getByRole('button', { name: 'Add to watchlist' })).toBeVisible();
  });

  it('opens the confirm dialog and closing it removes it from the document', async () => {
    const user = userEvent.setup();
    render(<DesignSystemPreview />);

    await user.click(screen.getByRole('button', { name: 'Confirm order' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm order' });
    expect(within(dialog).getByText(/Buy 100 shares of COMB.N0000/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reaches every button in the toolbar via keyboard tabbing alone, with focus visible', async () => {
    const user = userEvent.setup();
    render(<DesignSystemPreview />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Ghost' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Danger' })).toHaveFocus();
  });
});
