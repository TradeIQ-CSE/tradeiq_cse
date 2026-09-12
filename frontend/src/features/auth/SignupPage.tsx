import { FormEvent, useState } from 'react';
import { Link, Location, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { ApiError } from '../../lib/api';
import { Button } from '../../components/base/buttons/button';
import { Input } from '../../components/base/input/input';
import { AuthCard, AuthFormError, FieldErrors } from './auth-form';
import { fieldErrors } from './field-errors';

// The service enforces this; stating it on the field means a user meets the
// rule before submitting rather than learning it from a rejected request.
const MIN_PASSWORD_LENGTH = 12;

const FIELDS = ['display_name', 'email', 'password'] as const;
type Field = (typeof FIELDS)[number];

// Deliberately permissive: this only catches an address with no @ at all, so
// the service stays the authority on what it will accept.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

interface LocationState {
  // RequireAuth stores the whole Location, so search and hash survive: a user
  // sent away from /portfolio?tab=fills comes back to that, not to /portfolio.
  from?: Partial<Location>;
}

export function SignupPage() {
  const { t } = useTranslation();
  const { signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Partial<Record<Field, string[]>>>({});

  const from = (location.state as LocationState | null)?.from ?? { pathname: '/markets' };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const invalid: Partial<Record<Field, string[]>> = {};
    if (!displayName) invalid.display_name = [t('auth.validation.displayNameRequired')];
    if (!email) invalid.email = [t('auth.validation.emailRequired')];
    else if (!EMAIL_PATTERN.test(email)) invalid.email = [t('auth.validation.emailInvalid')];
    if (!password) invalid.password = [t('auth.validation.passwordRequired')];
    else if (password.length < MIN_PASSWORD_LENGTH) {
      invalid.password = [t('auth.validation.passwordTooShort')];
    }
    setMessages(invalid);
    if (Object.keys(invalid).length > 0) return;

    setPending(true);
    try {
      await signup({ display_name: displayName, email, password });
      navigate(from, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.body.code === 'VALIDATION_FAILED') {
        const mapped = fieldErrors(error, FIELDS);
        const byField: Partial<Record<Field, string[]>> = {};
        for (const field of mapped.fields) byField[field.name] = field.errors;
        setMessages(byField);
        if (mapped.unmatched.length > 0) setFormError(mapped.unmatched.join(' '));
      } else if (error instanceof ApiError && error.body.code === 'EMAIL_ALREADY_REGISTERED') {
        setMessages({ email: [t('auth.signup.emailTaken')] });
      } else {
        setFormError(t('auth.unavailable'));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title={t('auth.signup.title')}
      subtitle={t('auth.signup.subtitle')}
      footer={
        <>
          {t('auth.signup.haveAccount')}{' '}
          <Link className="text-text-primary underline" to="/login" state={location.state}>
            {t('auth.signup.signIn')}
          </Link>
        </>
      }
    >
      {formError && <AuthFormError>{formError}</AuthFormError>}

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Input
          label={t('auth.fields.displayName')}
          autoComplete="name"
          value={displayName}
          onChange={setDisplayName}
          isInvalid={Boolean(messages.display_name?.length)}
          hint={
            messages.display_name?.length ? (
              <FieldErrors messages={messages.display_name} />
            ) : undefined
          }
        />

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
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            isInvalid={Boolean(messages.password?.length)}
            // The length rule shows before anything is submitted, so it is met
            // on the first attempt rather than learned from a rejection — and
            // it stays visible underneath an error, which is precisely when
            // the user is trying to satisfy it.
            hint={
              messages.password?.length ? (
                <>
                  <FieldErrors messages={messages.password} />
                  <span className="block text-text-tertiary">
                    {t('auth.fields.passwordHint')}
                  </span>
                </>
              ) : (
                t('auth.fields.passwordHint')
              )
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
          {t('auth.signup.submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
