import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import { clearSession, getToken, getUser, notifySessionLost } from '../lib/session';

const AUTH_ORIGIN = 'http://localhost:3002';

function sessionBody() {
  return {
    access_token: 'restored-token',
    token_type: 'Bearer' as const,
    expires_in: 300,
    user: { user_id: 'u1', display_name: 'Ada', role: 'trader' },
  };
}

function AuthProbe() {
  const { status, user, logout } = useAuth();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="user">{user?.display_name ?? 'none'}</div>
      <button onClick={() => logout()}>log out</button>
    </div>
  );
}

beforeEach(() => {
  clearSession();
});

describe('AuthProvider', () => {
  it('restores an authenticated session on mount when /auth/refresh succeeds', async () => {
    server.use(
      http.post(`${AUTH_ORIGIN}/auth/refresh`, () => HttpResponse.json({ data: sessionBody() })),
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    // Starts restoring, ends authenticated with the restored user.
    expect(screen.getByTestId('status')).toHaveTextContent('restoring');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('user')).toHaveTextContent('Ada');
    expect(getToken()).toBe('restored-token');
  });

  it('drops to anonymous, without throwing or rendering an error, when /auth/refresh 401s', async () => {
    server.use(
      http.post(`${AUTH_ORIGIN}/auth/refresh`, () =>
        HttpResponse.json(
          { error: { code: 'UNAUTHENTICATED', message: 'No session', trace_id: 't1' } },
          { status: 401 },
        ),
      ),
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it('clears local state on logout even when the request fails', async () => {
    server.use(
      http.post(`${AUTH_ORIGIN}/auth/refresh`, () => HttpResponse.json({ data: sessionBody() })),
      http.post(`${AUTH_ORIGIN}/auth/logout`, () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'boom', trace_id: 't2' } },
          { status: 500 },
        ),
      ),
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    screen.getByRole('button', { name: 'log out' }).click();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it('drops to anonymous when onSessionLost fires elsewhere (e.g. a failed background refresh)', async () => {
    server.use(
      http.post(`${AUTH_ORIGIN}/auth/refresh`, () => HttpResponse.json({ data: sessionBody() })),
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    notifySessionLost();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });
});
