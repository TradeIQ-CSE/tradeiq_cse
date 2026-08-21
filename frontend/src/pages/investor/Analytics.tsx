import { Button, Space, Typography } from "antd";

const { Title } = Typography;

export function Analytics() {
  return (
    <Space direction="vertical" size="middle">
      <Title level={3} style={{ color: "#ffffff", margin: 0 }}>
        Analytics
      </Title>
      <Space size="small" style={{ marginTop: 12 }}>
        <Button>Load Candlestick Chart</Button>
        <Button>Analyze Equity Curve</Button>
        <Button>Export Performance Data</Button>
      </Space>
    </Space>
  );
}

export default Analytics;
