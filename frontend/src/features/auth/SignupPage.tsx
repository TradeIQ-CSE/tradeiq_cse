import { useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { Link, Location, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { ApiError } from '../../lib/api';
import { AuthCard } from './auth-form';
import { fieldErrors } from './field-errors';

// The service enforces this; stating it on the field means a user meets the
// rule before submitting rather than learning it from a rejected request.
const MIN_PASSWORD_LENGTH = 12;

interface SignupFormValues {
  display_name: string;
  email: string;
  password: string;
}

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
  const [form] = Form.useForm<SignupFormValues>();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const from = (location.state as LocationState | null)?.from ?? { pathname: '/markets' };

  async function onFinish(values: SignupFormValues) {
    setPending(true);
    setFormError(null);
    try {
      await signup(values);
      navigate(from, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.body.code === 'VALIDATION_FAILED') {
        const mapped = fieldErrors(error, ['display_name', 'email', 'password'] as const);
        form.setFields(mapped.fields);
        if (mapped.unmatched.length > 0) setFormError(mapped.unmatched.join(' '));
      } else if (error instanceof ApiError && error.body.code === 'EMAIL_ALREADY_REGISTERED') {
        form.setFields([{ name: 'email', errors: [t('auth.signup.emailTaken')] }]);
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
          {t('auth.signup.haveAccount')} <Link to="/login" state={location.state}>{t('auth.signup.signIn')}</Link>
        </>
      }
    >
      {formError && (
        <Alert type="error" message={formError} showIcon style={{ marginBottom: '16px' }} />
      )}

      <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
        <Form.Item
          name="display_name"
          label={t('auth.fields.displayName')}
          rules={[{ required: true, message: t('auth.validation.displayNameRequired') }]}
        >
          <Input autoComplete="name" size="large" />
        </Form.Item>

        <Form.Item
          name="email"
          label={t('auth.fields.email')}
          rules={[
            { required: true, message: t('auth.validation.emailRequired') },
            { type: 'email', message: t('auth.validation.emailInvalid') },
          ]}
        >
          <Input type="email" autoComplete="email" size="large" />
        </Form.Item>

        <Form.Item
          name="password"
          label={t('auth.fields.password')}
          extra={t('auth.fields.passwordHint')}
          rules={[
            { required: true, message: t('auth.validation.passwordRequired') },
            { min: MIN_PASSWORD_LENGTH, message: t('auth.validation.passwordTooShort') },
          ]}
        >
          <Input.Password autoComplete="new-password" size="large" />
        </Form.Item>

        <Button type="primary" htmlType="submit" size="large" block loading={pending} disabled={pending}>
          {t('auth.signup.submit')}
        </Button>
      </Form>
    </AuthCard>
  );
}
