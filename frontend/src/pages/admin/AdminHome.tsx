import { Button, Space, Typography } from "antd";

const { Title } = Typography;

export function AdminHome() {
  return (
    <Space direction="vertical" size="middle">
      <Title level={3} style={{ color: "#ffffff", margin: 0 }}>
        Admin Portal
      </Title>
      <Space size="small" style={{ marginTop: 12 }}>
        <Button>Restart System Services</Button>
        <Button>Flush Log Caches</Button>
        <Button>Backup Databases</Button>
      </Space>
    </Space>
  );
}

export default AdminHome;
