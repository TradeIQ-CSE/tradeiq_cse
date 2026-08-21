import { Button, Space, Typography } from "antd";

const { Title } = Typography;

export function Watchlist() {
  return (
    <Space direction="vertical" size="middle">
      <Title level={3} style={{ color: "#ffffff", margin: 0 }}>
        Watchlist
      </Title>
      <Space size="small" style={{ marginTop: 12 }}>
        <Button>Add Stock</Button>
        <Button>Clear Watchlist</Button>
        <Button>Set Price Alerts</Button>
      </Space>
    </Space>
  );
}

export default Watchlist;
