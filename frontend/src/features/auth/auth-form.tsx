import { ReactNode } from 'react';
import { Typography } from 'antd';

const { Title, Text } = Typography;

/**
 * Shared frame for the two auth pages. There is no Figma frame for these
 * screens — the design file holds the eight app screens and no auth screen —
 * so this matches the console's dark surface rather than inventing a look.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backgroundColor: 'var(--bg-base, #070a0f)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          padding: '32px',
          borderRadius: '12px',
          backgroundColor: '#0b0e13',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Title level={3} style={{ color: '#f1f5f9', marginTop: 0, marginBottom: '4px' }}>
          {title}
        </Title>
        <Text style={{ color: '#90a1b9', fontSize: '13px' }}>{subtitle}</Text>

        <div style={{ marginTop: '24px' }}>{children}</div>

        <div style={{ marginTop: '16px', color: '#90a1b9', fontSize: '13px' }}>{footer}</div>
      </div>
    </div>
  );
}
