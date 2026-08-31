import React from 'react';
import { Button, Typography, Space, Card, Spin } from 'antd';
import { ReloadOutlined, ExperimentOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export const Analytics: React.FC = () => {
  return (
    <div style={{ color: '#e2e8f0' }}>
      <div style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ color: '#f1f5f9', margin: 0, fontWeight: 600 }}>
          Backtesting & Analytics
        </Title>
        <Text style={{ color: '#90a1b9', fontSize: '13px' }}>
          Evaluate historical strategy performance and run complex risk analytics models.
        </Text>
      </div>

      <Card
        style={{
          backgroundColor: '#0b0e13',
          borderColor: 'rgba(255,255,255,0.04)',
        }}
      >
        <Title level={4} style={{ color: '#e2e8f0', marginTop: 0 }}>
          Simulation Engine
        </Title>
        <Paragraph style={{ color: '#64748b' }}>
          Initialize a backtesting run using local parameters, or trigger pre-run scenario analyses.
        </Paragraph>
        
        <div style={{ padding: '30px 0', display: 'flex', justifyContent: 'center', margin: '20px 0', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '6px' }}>
          <Space direction="vertical" align="center" size={12}>
            <Spin size="small" />
            <Text style={{ color: '#64748b', fontSize: '12px' }}>Waiting for analytics parameter load...</Text>
          </Space>
        </div>

        <Space size={12} wrap style={{ width: '100%' }}>
          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            style={{ backgroundColor: '#722ed1', borderColor: '#722ed1' }}
            disabled
          >
            Start Strategy Backtest
          </Button>
          <Button
            type="dashed"
            icon={<ReloadOutlined />}
            style={{ color: '#e2e8f0', borderColor: 'rgba(255,255,255,0.1)' }}
            disabled
          >
            Reset Parameters
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default Analytics;
