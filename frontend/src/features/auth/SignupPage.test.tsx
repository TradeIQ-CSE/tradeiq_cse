import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '../../test/render';
import { ApiError } from '../../lib/api';
import { SignupPage } from './SignupPage';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(t('auth.fields.displayName')), 'Ama Perera');
  await user.type(screen.getByLabelText(t('auth.fields.email')), 'ama@example.lk');
  await user.type(screen.getByLabelText(t('auth.fields.password')), 'correct horse battery');
  await user.click(screen.getByRole('button', { name: t('auth.signup.submit') }));
}

describe('SignupPage', () => {
  it('states the password length rule before anything is submitted', () => {
    renderWithProviders(<SignupPage />, { auth: { status: 'anonymous' } });

    // The service enforces 12 characters. Learning that from a rejected
    // request instead of the form is the failure this guards against.
    expect(screen.getByText(t('auth.fields.passwordHint'))).toBeInTheDocument();
  });

  it('shows a 409 on the email field', async () => {
    const user = userEvent.setup();
    const signup = vi
      .fn()
      .mockRejectedValue(
        new ApiError({ code: 'EMAIL_ALREADY_REGISTERED', message: 'taken', trace_id: 't' }),
      );

    renderWithProviders(<SignupPage />, { auth: { status: 'anonymous', signup } });
    await fillAndSubmit(user);

    expect(await screen.findByText(t('auth.signup.emailTaken'))).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText(t('auth.fields.email'))).toHaveAttribute('aria-invalid', 'true'),
    );
  });

  it('maps every entry of a 400, including two for the same field', async () => {
    const user = userEvent.setup();
    const signup = vi.fn().mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        // The envelope carries one entry per failed constraint, so a field
        // can legitimately appear twice.
        fields: [
          { field: 'email', reason: 'email must be an email' },
          { field: 'password', reason: 'password must be longer than or equal to 12 characters' },
          { field: 'password', reason: 'password must be a string' },
        ],
        trace_id: 't',
      }),
    );

    renderWithProviders(<SignupPage />, { auth: { status: 'anonymous', signup } });
    await fillAndSubmit(user);

    expect(await screen.findByText('email must be an email')).toBeInTheDocument();
    expect(
      screen.getByText('password must be longer than or equal to 12 characters'),
    ).toBeInTheDocument();
    expect(screen.getByText('password must be a string')).toBeInTheDocument();
  });
});
