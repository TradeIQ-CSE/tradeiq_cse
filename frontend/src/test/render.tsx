import { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { darkTheme } from '../theme/theme';
import { AuthContext, AuthContextValue, AuthStatus } from '../auth/useAuth';
import { SessionUser } from '../lib/session';

// Mirrors main.tsx's provider stack (QueryClientProvider -> router ->
// ConfigProvider, plus AuthProvider's context) with deliberate differences
// from production:
//  - a fresh QueryClient per render with retry disabled, so error-path tests
//    don't wait out main.tsx's `retry: 1`.
//  - MemoryRouter instead of BrowserRouter, so a test can seed a path.
//  - auth state is seeded directly (no real AuthProvider mount, no network
//    call to /auth/refresh) unless a test explicitly opts into one — most
//    page tests just need to be "authenticated" or "anonymous" already.

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

const defaultAuthUser: SessionUser = { user_id: 'u1', display_name: 'Ada', role: 'trader' };

export interface AuthOverrides {
  status?: AuthStatus;
  user?: SessionUser | null;
  login?: AuthContextValue['login'];
  signup?: AuthContextValue['signup'];
  logout?: AuthContextValue['logout'];
}

function noopAsync(): Promise<void> {
  return Promise.resolve();
}

/**
 * Builds a stub AuthContextValue for tests. Defaults to 'authenticated' with
 * a stub user so a test that renders a guarded route (or any page) without
 * mentioning auth at all — including every pre-existing test written before
 * this context existed — still sees real content rather than a surprise
 * redirect to /login. Pass `{ status: 'anonymous' }` or `{ status:
 * 'restoring' }` for tests that specifically exercise those states.
 */
export function createTestAuthContext(overrides: AuthOverrides = {}): AuthContextValue {
  const status = overrides.status ?? 'authenticated';
  const user = overrides.user ?? (status === 'authenticated' ? defaultAuthUser : null);
  return {
    status,
    user,
    login: overrides.login ?? noopAsync,
    signup: overrides.signup ?? noopAsync,
    logout: overrides.logout ?? noopAsync,
  };
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
  queryClient?: QueryClient;
  auth?: AuthOverrides;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    initialEntries = ['/'],
    queryClient = createTestQueryClient(),
    auth,
    ...options
  }: RenderWithProvidersOptions = {},
) {
  const authValue = createTestAuthContext(auth);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <AuthContext.Provider value={authValue}>
            <ConfigProvider theme={darkTheme}>{children}</ConfigProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  };
}

export * from '@testing-library/react';
