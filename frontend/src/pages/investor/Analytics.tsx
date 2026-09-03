import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Typography, Space, Card } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export const Analytics: React.FC = () => {
  const navigate = useNavigate();
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
          Configure a price-rule backtesting workflow across Sri Lanka Colombo Stock Exchange historical market data.
        </Paragraph>
        
        <div style={{ padding: '30px 0', display: 'flex', justifyContent: 'center', margin: '20px 0', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '6px' }}>
          <Space direction="vertical" align="center" size={12}>
            <Text style={{ color: '#a78bfa', fontSize: '13px', fontWeight: 500 }}>
              Ready to configure a v1 price-rule backtest strategy
            </Text>
            <Text style={{ color: '#64748b', fontSize: '12px' }}>
              Guided 7-step wizard: Security · Period · Rules · Execution · Portfolio · Metrics · Review
            </Text>
          </Space>
        </div>

        <Space size={12} wrap style={{ width: '100%' }}>
          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            style={{ backgroundColor: '#722ed1', borderColor: '#722ed1' }}
            onClick={() => navigate('/backtests/new/security')}
          >
            Start Strategy Backtest
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default Analytics;
