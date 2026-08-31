import React from 'react';
import { Button, Typography, Space, Card } from 'antd';
import { PlusCircleOutlined, MinusCircleOutlined, HistoryOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export const Portfolio: React.FC = () => {
  return (
    <div style={{ color: '#e2e8f0' }}>
      <div style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ color: '#f1f5f9', margin: 0, fontWeight: 600 }}>
          My Portfolio
        </Title>
        <Text style={{ color: '#90a1b9', fontSize: '13px' }}>
          Overview of your cash holdings, equity allocations, and overall value.
        </Text>
      </div>

      <Card
        style={{
          backgroundColor: '#0b0e13',
          borderColor: 'rgba(255,255,255,0.04)',
        }}
      >
        <Title level={4} style={{ color: '#e2e8f0', marginTop: 0 }}>
          Capital Movements
        </Title>
        <Paragraph style={{ color: '#64748b' }}>
          Perform operations on your account cash balance or review deposits and withdrawals.
        </Paragraph>
        <Space size={12} wrap>
          <Button
            type="primary"
            icon={<PlusCircleOutlined />}
            style={{ backgroundColor: '#722ed1', borderColor: '#722ed1' }}
            disabled
          >
            Deposit Funds
          </Button>
          <Button
            type="dashed"
            icon={<MinusCircleOutlined />}
            style={{ color: '#e2e8f0', borderColor: 'rgba(255,255,255,0.1)' }}
            disabled
          >
            Withdraw Cash
          </Button>
          <Button
            type="text"
            icon={<HistoryOutlined />}
            style={{ color: '#90a1b9' }}
            disabled
          >
            View History
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default Portfolio;
