import { FormEvent, useState } from 'react';
import { Link, Location, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { ApiError } from '../../lib/api';
import { Button } from '../../components/base/buttons/button';
import { Input } from '../../components/base/input/input';
import { AuthCard, AuthFormError, FieldErrors } from './auth-form';
import { fieldErrors } from './field-errors';

const FIELDS = ['email', 'password'] as const;
type Field = (typeof FIELDS)[number];

interface LocationState {
  // RequireAuth stores the whole Location, so search and hash survive: a user
  // sent away from /portfolio?tab=fills comes back to that, not to /portfolio.
  from?: Partial<Location>;
}

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Partial<Record<Field, string[]>>>({});

  // Where the guard bounced the user from, if it did. Anything else lands on
  // /markets, the only screen wired to a live API.
  const from = (location.state as LocationState | null)?.from ?? { pathname: '/markets' };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // Validated here rather than with native `required`, so the wording stays
    // ours and translated instead of the browser's own English bubble.
    const missing: Partial<Record<Field, string[]>> = {};
    if (!email) missing.email = [t('auth.validation.emailRequired')];
    if (!password) missing.password = [t('auth.validation.passwordRequired')];
    setMessages(missing);
    if (Object.keys(missing).length > 0) return;

    setPending(true);
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.body.code === 'VALIDATION_FAILED') {
        const mapped = fieldErrors(error, FIELDS);
        const byField: Partial<Record<Field, string[]>> = {};
        for (const field of mapped.fields) byField[field.name] = field.errors;
        setMessages(byField);
        if (mapped.unmatched.length > 0) setFormError(mapped.unmatched.join(' '));
      } else if (error instanceof ApiError && error.body.code === 'INVALID_CREDENTIALS') {
        // Deliberately one message for both, and deliberately not a field
        // error. The API answers a wrong password and an unknown account
        // identically, and marking the email field would leak whether an
        // address is registered.
        setFormError(t('auth.login.failed'));
      } else {
        setFormError(t('auth.unavailable'));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      footer={
        <>
          {t('auth.login.noAccount')}{' '}
          <Link className="text-text-primary underline" to="/signup" state={location.state}>
            {t('auth.login.createOne')}
          </Link>
        </>
      }
    >
      {formError && <AuthFormError>{formError}</AuthFormError>}

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Input
          label={t('auth.fields.email')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          isInvalid={Boolean(messages.email?.length)}
          hint={messages.email?.length ? <FieldErrors messages={messages.email} /> : undefined}
        />

        <div className="flex flex-col gap-1">
          <Input
            label={t('auth.fields.password')}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            isInvalid={Boolean(messages.password?.length)}
            hint={
              messages.password?.length ? <FieldErrors messages={messages.password} /> : undefined
            }
          />
          <button
            type="button"
            className="self-end text-body-2-medium text-text-secondary hover:text-text-primary"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((shown) => !shown)}
          >
            {t(showPassword ? 'auth.fields.hidePassword' : 'auth.fields.showPassword')}
          </button>
        </div>

        <Button type="submit" className="w-full" disabled={pending}>
          {t('auth.login.submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
