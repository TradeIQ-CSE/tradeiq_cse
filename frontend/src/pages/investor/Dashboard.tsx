import React from 'react';
import { Button, Typography, Space, Card, Row, Col } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  StockOutlined,
  StarOutlined,
  PieChartOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ color: '#e2e8f0' }}>
      <div style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ color: '#f1f5f9', margin: 0, fontWeight: 600 }}>
          Dashboard
        </Title>
        <Text style={{ color: '#90a1b9', fontSize: '13px' }}>
          Welcome back to TradeIQ CSE console. Real-time overview of your CSE assets.
        </Text>
      </div>

      <Row gutter={[24, 24]}>
        <Col span={24}>
          <Card
            style={{
              backgroundColor: '#0b0e13',
              borderColor: 'rgba(255,255,255,0.04)',
            }}
          >
            <Title level={4} style={{ color: '#e2e8f0', marginTop: 0 }}>
              Quick Navigation
            </Title>
            <Paragraph style={{ color: '#64748b' }}>
              Access the strategy execution systems, portfolio analytics tools, and live market views from here.
            </Paragraph>
            <Space size={16} wrap>
              <Button
                type="primary"
                icon={<StockOutlined />}
                onClick={() => navigate('/markets')}
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1' }}
              >
                Browse Markets
              </Button>
              <Button
                type="dashed"
                icon={<StarOutlined />}
                onClick={() => navigate('/watchlist')}
                style={{ color: '#e2e8f0', borderColor: 'rgba(255,255,255,0.1)' }}
              >
                My Watchlist
              </Button>
              <Button
                type="dashed"
                icon={<PieChartOutlined />}
                onClick={() => navigate('/portfolio')}
                style={{ color: '#e2e8f0', borderColor: 'rgba(255,255,255,0.1)' }}
              >
                View Portfolio
              </Button>
              <Button
                type="dashed"
                icon={<ShoppingOutlined />}
                onClick={() => navigate('/orders')}
                style={{ color: '#e2e8f0', borderColor: 'rgba(255,255,255,0.1)' }}
              >
                Active Orders
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
