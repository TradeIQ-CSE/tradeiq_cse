import React from 'react';
import { Button, Typography, Space, Card } from 'antd';
import { PlusOutlined, DeleteOutlined, ShareAltOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export const Watchlist: React.FC = () => {
  return (
    <div style={{ color: '#e2e8f0' }}>
      <div style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ color: '#f1f5f9', margin: 0, fontWeight: 600 }}>
          Watchlist
        </Title>
        <Text style={{ color: '#90a1b9', fontSize: '13px' }}>
          Monitor price movements and key events for your favorite securities.
        </Text>
      </div>

      <Card
        style={{
          backgroundColor: '#0b0e13',
          borderColor: 'rgba(255,255,255,0.04)',
        }}
      >
        <Title level={4} style={{ color: '#e2e8f0', marginTop: 0 }}>
          Manage Watchlist
        </Title>
        <Paragraph style={{ color: '#64748b' }}>
          Select custom items in the Markets page to add them to your watchlist. Use the actions below to manage lists.
        </Paragraph>
        <Space size={12} wrap block>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ backgroundColor: '#722ed1', borderColor: '#722ed1' }}
            disabled
          >
            Create New List
          </Button>
          <Button
            type="dashed"
            icon={<ShareAltOutlined />}
            style={{ color: '#e2e8f0', borderColor: 'rgba(255,255,255,0.1)' }}
            disabled
          >
            Share Watchlist
          </Button>
          <Button
            danger
            type="text"
            icon={<DeleteOutlined />}
            style={{ display: 'flex', alignItems: 'center' }}
            disabled
          >
            Clear Selected
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default Watchlist;
