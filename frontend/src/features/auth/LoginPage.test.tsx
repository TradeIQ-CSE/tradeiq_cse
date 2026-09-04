import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '../../test/render';
import { ApiError } from '../../lib/api';
import { LoginPage } from './LoginPage';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

function apiError(code: string, extra: Record<string, unknown> = {}) {
  return new ApiError({ code, message: 'nope', trace_id: 't', ...extra });
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(t('auth.fields.email')), 'ama@example.lk');
  await user.type(screen.getByLabelText(t('auth.fields.password')), 'correct horse battery');
  await user.click(screen.getByRole('button', { name: t('auth.login.submit') }));
}

describe('LoginPage', () => {
  it('signs in and goes to /markets', async () => {
    navigate.mockClear();
    const user = userEvent.setup({ delay: null });
    const login = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(<LoginPage />, { auth: { status: 'anonymous', login } });
    await fillAndSubmit(user);

    await waitFor(() => expect(login).toHaveBeenCalledWith({
      email: 'ama@example.lk',
      password: 'correct horse battery',
    }));
    expect(navigate).toHaveBeenCalledWith({ pathname: '/markets' }, { replace: true });
  });

  it('returns to the page the guard bounced the user from', async () => {
    navigate.mockClear();
    const user = userEvent.setup({ delay: null });

    renderWithProviders(<LoginPage />, {
      auth: { status: 'anonymous', login: vi.fn().mockResolvedValue(undefined) },
      // RequireAuth sets this shape on the redirect.
      initialEntries: [{ pathname: '/login', state: { from: { pathname: '/portfolio' } } }],
    });
    await fillAndSubmit(user);

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ pathname: '/portfolio' }, { replace: true }),
    );
  });

  it('returns to the full URL, keeping its query and fragment', async () => {
    navigate.mockClear();
    const user = userEvent.setup({ delay: null });

    renderWithProviders(<LoginPage />, {
      auth: { status: 'anonymous', login: vi.fn().mockResolvedValue(undefined) },
      initialEntries: [
        {
          pathname: '/login',
          // RequireAuth stores the whole Location it bounced from. Keeping only
          // its pathname would drop the tab the user was actually looking at.
          state: { from: { pathname: '/portfolio', search: '?tab=fills', hash: '#row-3' } },
        },
      ],
    });
    await fillAndSubmit(user);

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        { pathname: '/portfolio', search: '?tab=fills', hash: '#row-3' },
        { replace: true },
      ),
    );
  });

  it('shows one message on a 401 that names neither field', async () => {
    const user = userEvent.setup({ delay: null });
    const login = vi.fn().mockRejectedValue(apiError('INVALID_CREDENTIALS'));

    renderWithProviders(<LoginPage />, { auth: { status: 'anonymous', login } });
    await fillAndSubmit(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t('auth.login.failed'));

    // The shared message names both fields on purpose. What must not happen is
    // singling one out: a field-level error on email would say whether the
    // address is registered, which is exactly what the API refuses to reveal
    // by answering 401 identically for a wrong password and an unknown account.
    expect(screen.getByLabelText(t('auth.fields.email'))).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText(t('auth.fields.password'))).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('disables submit while the request is in flight', async () => {
    const user = userEvent.setup({ delay: null });
    let release: () => void = () => {};
    const login = vi.fn().mockReturnValue(new Promise<void>((resolve) => {
      release = resolve;
    }));

    renderWithProviders(<LoginPage />, { auth: { status: 'anonymous', login } });
    await fillAndSubmit(user);

    const submit = screen.getByRole('button', { name: new RegExp(t('auth.login.submit')) });
    await waitFor(() => expect(submit).toBeDisabled());

    release();
    await waitFor(() => expect(submit).not.toBeDisabled());
  });
});
