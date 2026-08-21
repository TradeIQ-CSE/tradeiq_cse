import { Button, Space, Typography } from "antd";

const { Title } = Typography;

export function Dashboard() {
  return (
    <Space direction="vertical" size="middle">
      <Title level={3} style={{ color: "#ffffff", margin: 0 }}>
        Dashboard
      </Title>
      <Space size="small" style={{ marginTop: 12 }}>
        <Button>View Live Markets</Button>
        <Button>Check Analytics</Button>
        <Button>Refresh Summary</Button>
      </Space>
    </Space>
  );
}

export default Dashboard;
