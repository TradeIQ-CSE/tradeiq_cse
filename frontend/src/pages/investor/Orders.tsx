import React from 'react';
import { Button, Typography, Space, Card } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, CloseCircleOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export const Orders: React.FC = () => {
  return (
    <div style={{ color: '#e2e8f0' }}>
      <div style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ color: '#f1f5f9', margin: 0, fontWeight: 600 }}>
          Orders & Execution
        </Title>
        <Text style={{ color: '#90a1b9', fontSize: '13px' }}>
          Execute trades, set limit orders, and inspect your trading logs.
        </Text>
      </div>

      <Card
        style={{
          backgroundColor: '#0b0e13',
          borderColor: 'rgba(255,255,255,0.04)',
        }}
      >
        <Title level={4} style={{ color: '#e2e8f0', marginTop: 0 }}>
          Trade Desk
        </Title>
        <Paragraph style={{ color: '#64748b' }}>
          Place buy/sell orders or cancel active open orders matching your execution preferences.
        </Paragraph>
        <Space size={12} wrap style={{ width: '100%' }}>
          <Button
            type="primary"
            icon={<ArrowUpOutlined />}
            style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
            disabled
          >
            Buy Security
          </Button>
          <Button
            type="primary"
            icon={<ArrowDownOutlined />}
            style={{ backgroundColor: '#ff4d4f', borderColor: '#ff4d4f' }}
            disabled
          >
            Sell Security
          </Button>
          <Button
            type="dashed"
            danger
            icon={<CloseCircleOutlined />}
            style={{ display: 'flex', alignItems: 'center' }}
            disabled
          >
            Cancel Active Orders
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default Orders;
