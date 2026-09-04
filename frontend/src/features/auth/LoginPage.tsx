import { useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { ApiError } from '../../lib/api';
import { AuthCard } from './auth-form';
import { fieldErrors } from './field-errors';

interface LoginFormValues {
  email: string;
  password: string;
}

interface LocationState {
  from?: { pathname?: string };
}

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm<LoginFormValues>();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Where the guard bounced the user from, if it did. Anything else lands on
  // /markets, the only screen wired to a live API.
  const from = (location.state as LocationState | null)?.from?.pathname ?? '/markets';

  async function onFinish(values: LoginFormValues) {
    setPending(true);
    setFormError(null);
    try {
      await login(values);
      navigate(from, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.body.code === 'VALIDATION_FAILED') {
        const mapped = fieldErrors(error, ['email', 'password'] as const);
        form.setFields(mapped.fields);
        if (mapped.unmatched.length > 0) setFormError(mapped.unmatched.join(' '));
      } else if (error instanceof ApiError && error.body.code === 'INVALID_CREDENTIALS') {
        // Deliberately one message for both. The API answers a wrong password
        // and an unknown account identically, and naming the field would leak
        // whether an address is registered.
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
          {t('auth.login.noAccount')} <Link to="/signup">{t('auth.login.createOne')}</Link>
        </>
      }
    >
      {formError && (
        <Alert type="error" message={formError} showIcon style={{ marginBottom: '16px' }} />
      )}

      <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
        <Form.Item
          name="email"
          label={t('auth.fields.email')}
          rules={[{ required: true, message: t('auth.validation.emailRequired') }]}
        >
          <Input type="email" autoComplete="email" size="large" />
        </Form.Item>

        <Form.Item
          name="password"
          label={t('auth.fields.password')}
          rules={[{ required: true, message: t('auth.validation.passwordRequired') }]}
        >
          <Input.Password autoComplete="current-password" size="large" />
        </Form.Item>

        <Button type="primary" htmlType="submit" size="large" block loading={pending} disabled={pending}>
          {t('auth.login.submit')}
        </Button>
      </Form>
    </AuthCard>
  );
}
