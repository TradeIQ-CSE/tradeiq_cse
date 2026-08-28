import React from 'react';
import { Button, Typography, Space, Card } from 'antd';
import { SettingOutlined, DatabaseOutlined, SafetyCertificateOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export const AdminHome: React.FC = () => {
  return (
    <div style={{ color: '#e2e8f0' }}>
      <div style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ color: '#f1f5f9', margin: 0, fontWeight: 600 }}>
          Admin Panel
        </Title>
        <Text style={{ color: '#90a1b9', fontSize: '13px' }}>
          TradeIQ System Administrator control interface and diagnostics.
        </Text>
      </div>

      <Card
        style={{
          backgroundColor: '#0b0e13',
          borderColor: 'rgba(255,255,255,0.04)',
        }}
      >
        <Title level={4} style={{ color: '#e2e8f0', marginTop: 0 }}>
          System Maintenance Operations
        </Title>
        <Paragraph style={{ color: '#64748b' }}>
          Trigger data ingestion cron jobs, re-index databases, or review system health logs.
        </Paragraph>
        <Space size={12} wrap>
          <Button
            type="primary"
            icon={<DatabaseOutlined />}
            style={{ backgroundColor: '#722ed1', borderColor: '#722ed1' }}
            disabled
          >
            Force Seed Pipeline Run
          </Button>
          <Button
            type="dashed"
            icon={<SafetyCertificateOutlined />}
            style={{ color: '#e2e8f0', borderColor: 'rgba(255,255,255,0.1)' }}
            disabled
          >
            Verify API Signatures
          </Button>
          <Button
            type="text"
            icon={<SettingOutlined />}
            style={{ color: '#90a1b9' }}
            disabled
          >
            System Diagnostics
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default AdminHome;
